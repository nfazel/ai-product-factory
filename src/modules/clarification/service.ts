import "server-only";

import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";
import { noteCodingContractStale } from "@/modules/coding/impact";
import {
  CLARIFICATION_REVIEW_REASON,
  type ClarificationImpact,
  type ClarificationKindName,
  type ClarificationReviewTarget,
  answerMateriality,
  clarificationImpacts,
  earliestClarificationReview,
  isClarificationReview,
} from "@/modules/clarification/materiality";
import { getCurrentActor } from "@/modules/identity/actor";
import { DomainError } from "@/modules/shared/errors";

const FIRST_ACTIVITY = {
  INTAKE: "QUESTION_ANSWERED",
  REQUIREMENT: "QUESTION_ANSWERED",
  ARCHITECTURE: "ARCHITECTURE_QUESTION_ANSWERED",
  GOVERNANCE: "GOVERNANCE_QUESTION_ANSWERED",
  RELEASE: "QUESTION_ANSWERED",
} as const;

type LoadedQuestion = {
  id: string;
  question: string;
  answer: string;
  answeredBy: string;
  answeredAt: Date | null;
  solutionArchitectureId?: string | null;
  reviewId?: string | null;
  releaseCandidateId?: string | null;
  workItemId?: string | null;
};

export async function saveClarificationAnswer(input: {
  productId: string;
  kind: ClarificationKindName;
  questionId: string;
  answer: string;
}) {
  const next = input.answer.trim();
  if (next.length < 2) throw new DomainError("Write an answer before saving it.");
  const actor = getCurrentActor().name;
  const current = await loadQuestion(input.kind, input.productId, input.questionId);
  const previous = current.answer.trim();
  if (previous === next) {
    return { changed: false, material: false, impacts: [] as ClarificationImpact[] };
  }
  const editing = previous.length > 0;
  const material = editing && answerMateriality(previous, next) === "POTENTIALLY_MATERIAL";
  const answeredAt = current.answeredAt ?? new Date();
  const impacts = material
    ? await listImpacts(input.productId, input.kind, current, answeredAt)
    : [];

  if (editing) {
    const existing = await db.clarificationAnswerRevision.count({ where: { questionId: current.id, kind: input.kind } });
    if (existing === 0) {
      await db.clarificationAnswerRevision.create({
        data: {
          productId: input.productId,
          kind: input.kind,
          questionId: current.id,
          question: current.question,
          answer: previous,
          changedBy: current.answeredBy || actor,
          material: false,
          createdAt: answeredAt,
        },
      });
    }
  }

  await writeAnswer(input.kind, current.id, next, actor);
  await db.clarificationAnswerRevision.create({
    data: {
      productId: input.productId,
      kind: input.kind,
      questionId: current.id,
      question: current.question,
      answer: next,
      changedBy: actor,
      material,
    },
  });

  if (material && impacts.length > 0) {
    await flagImpacts(input.productId, impacts);
  }

  await recordActivity({
    productId: input.productId,
    type: editing ? "CLARIFICATION_ANSWER_REVISED" : FIRST_ACTIVITY[input.kind],
    description: editing
      ? `Revised a clarification answer. The previous answer remains in history. ${current.question}`
      : `Answered a clarification question. ${current.question}`,
    actor,
  });

  return { changed: true, material, impacts };
}

export async function keepClarificationVersion(productId: string, target: ClarificationReviewTarget) {
  const actor = getCurrentActor().name;
  if (target === "BRIEF") {
    await db.productBrief.updateMany({
      where: { productId, reviewRequired: true, reviewReason: { contains: "CLARIFICATION REVIEW." } },
      data: { reviewRequired: false, reviewReason: "" },
    });
  }
  if (target === "DEFINITION") {
    await db.productDefinition.updateMany({
      where: { productId, reviewRequired: true, reviewReason: { contains: "CLARIFICATION REVIEW." } },
      data: { reviewRequired: false, reviewReason: "" },
    });
  }
  if (target === "DESIGN") {
    await db.solutionArchitecture.updateMany({
      where: { productId, reviewRequired: true, reviewReason: { contains: "CLARIFICATION REVIEW." } },
      data: { reviewRequired: false, reviewReason: "" },
    });
  }
  if (target === "DELIVERY") {
    await db.implementationPlan.updateMany({
      where: { productId, reviewRequired: true, reviewReason: { contains: "CLARIFICATION REVIEW." } },
      data: { reviewRequired: false, reviewReason: "" },
    });
  }
  if (target === "GOVERNANCE") {
    await db.engineeringGovernanceReview.updateMany({
      where: { productId, reviewRequired: true, reviewReason: { contains: "CLARIFICATION REVIEW." } },
      data: { reviewRequired: false, reviewReason: "" },
    });
  }
  if (target === "RELEASE") {
    await db.releaseCandidate.updateMany({
      where: { productId, reviewRequired: true, reviewReason: { contains: "CLARIFICATION REVIEW." } },
      data: { reviewRequired: false, reviewReason: "" },
    });
  }
  if (target === "PLAN") {
    const workspaces = await db.repositoryWorkspace.findMany({
      where: { productId, OR: [{ staleReason: { contains: "CLARIFICATION REVIEW." } }, { contract: { staleReason: { contains: "CLARIFICATION REVIEW." } } }] },
    });
    for (const workspace of workspaces) {
      if (!isClarificationReview(workspace.staleReason)) continue;
      await db.repositoryWorkspace.update({
        where: { id: workspace.id },
        data: { executionContractStale: false, staleReason: "", staleFlaggedAt: null },
      });
      await db.codingExecutionContract.updateMany({
        where: { workspaceId: workspace.id, staleReason: { contains: "CLARIFICATION REVIEW." } },
        data: { stale: false, staleReason: "", staleFlaggedAt: null },
      });
    }
  }
  await recordActivity({
    productId,
    type: "CLARIFICATION_REVIEW_KEPT",
    description: `${actor} kept the current ${target.toLowerCase()} version after a clarification answer changed. Nothing was regenerated.`,
    actor,
  });
}

export async function loadClarificationPresentation(
  productId: string,
  questions: Array<{ id: string; kind: ClarificationKindName; answer: string; answeredAt: Date | null } & Partial<LoadedQuestion>>,
) {
  const [revisions, context] = await Promise.all([
    db.clarificationAnswerRevision.findMany({
      where: { productId, questionId: { in: questions.map((question) => question.id) } },
      orderBy: { createdAt: "asc" },
    }),
    questions.some((question) => question.answer.trim()) ? loadImpactContext(productId) : null,
  ]);
  const byQuestion: Record<string, { revisions: { answer: string; changedBy: string; createdAt: string }[]; impacts: string[] }> = {};
  for (const question of questions) {
    const history = revisions.filter((revision) => revision.questionId === question.id && revision.kind === question.kind);
    const impacts =
      context && question.answer.trim() && question.answeredAt
        ? listImpactsFromContext(context, question.kind, {
            id: question.id,
            question: "",
            answer: question.answer,
            answeredBy: "",
            answeredAt: question.answeredAt,
            solutionArchitectureId: question.solutionArchitectureId,
            reviewId: question.reviewId,
            releaseCandidateId: question.releaseCandidateId,
            workItemId: question.workItemId,
          }, question.answeredAt).map((impact) => impact.label)
        : [];
    byQuestion[question.id] = {
      revisions: history.map((revision) => ({
        answer: revision.answer,
        changedBy: revision.changedBy,
        createdAt: revision.createdAt.toISOString(),
      })),
      impacts,
    };
  }
  return byQuestion;
}

export function clarificationReviewFromRecords(input: {
  briefReason?: string | null;
  briefRequired?: boolean;
  definitionReason?: string | null;
  definitionRequired?: boolean;
  designReason?: string | null;
  designRequired?: boolean;
  deliveryReason?: string | null;
  deliveryRequired?: boolean;
  governanceReason?: string | null;
  governanceRequired?: boolean;
  planReason?: string | null;
  planRequired?: boolean;
  releaseReason?: string | null;
  releaseRequired?: boolean;
}) {
  return earliestClarificationReview({
    BRIEF: Boolean(input.briefRequired && input.briefReason && isClarificationReview(input.briefReason)),
    DEFINITION: Boolean(input.definitionRequired && input.definitionReason && isClarificationReview(input.definitionReason)),
    DESIGN: Boolean(input.designRequired && input.designReason && isClarificationReview(input.designReason)),
    DELIVERY: Boolean(input.deliveryRequired && input.deliveryReason && isClarificationReview(input.deliveryReason)),
    GOVERNANCE: Boolean(input.governanceRequired && input.governanceReason && isClarificationReview(input.governanceReason)),
    PLAN: Boolean(input.planRequired && input.planReason && isClarificationReview(input.planReason)),
    RELEASE: Boolean(input.releaseRequired && input.releaseReason && isClarificationReview(input.releaseReason)),
  });
}

async function loadQuestion(kind: ClarificationKindName, productId: string, questionId: string): Promise<LoadedQuestion> {
  if (kind === "INTAKE") {
    const row = await db.intakeQuestion.findFirst({ where: { id: questionId, productId } });
    if (!row) throw new DomainError("Question not found.", "NOT_FOUND");
    return { id: row.id, question: row.question, answer: row.answer, answeredBy: row.answeredBy, answeredAt: row.answeredAt };
  }
  if (kind === "REQUIREMENT") {
    const row = await db.requirementQuestion.findFirst({ where: { id: questionId, productId } });
    if (!row) throw new DomainError("Question not found.", "NOT_FOUND");
    return {
      id: row.id,
      question: row.question,
      answer: row.answer,
      answeredBy: row.answeredBy,
      answeredAt: row.resolvedAt,
      workItemId: row.workItemId,
    };
  }
  if (kind === "ARCHITECTURE") {
    const row = await db.architectureQuestion.findFirst({ where: { id: questionId, productId } });
    if (!row) throw new DomainError("Architecture question not found.", "NOT_FOUND");
    return {
      id: row.id,
      question: row.question,
      answer: row.answer,
      answeredBy: row.answeredBy,
      answeredAt: row.resolvedAt,
      solutionArchitectureId: row.solutionArchitectureId,
    };
  }
  if (kind === "GOVERNANCE") {
    const row = await db.governanceQuestion.findFirst({
      where: { id: questionId, review: { productId } },
    });
    if (!row) throw new DomainError("Governance question not found.", "NOT_FOUND");
    return {
      id: row.id,
      question: row.question,
      answer: row.answer,
      answeredBy: row.answeredBy,
      answeredAt: row.resolvedAt,
      reviewId: row.reviewId,
    };
  }
  const row = await db.releaseQuestion.findFirst({
    where: { id: questionId, releaseCandidate: { productId } },
  });
  if (!row) throw new DomainError("The release question was not found.", "NOT_FOUND");
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    answeredBy: row.answeredBy,
    answeredAt: row.resolvedAt,
    releaseCandidateId: row.releaseCandidateId,
  };
}

async function writeAnswer(kind: ClarificationKindName, id: string, answer: string, actor: string) {
  const answeredAt = new Date();
  if (kind === "INTAKE") {
    await db.intakeQuestion.update({
      where: { id },
      data: { answer, status: "ANSWERED", answeredBy: actor, answeredAt },
    });
    return;
  }
  if (kind === "REQUIREMENT") {
    await db.requirementQuestion.update({
      where: { id },
      data: { answer, status: "ANSWERED", answeredBy: actor, resolvedAt: answeredAt },
    });
    return;
  }
  if (kind === "ARCHITECTURE") {
    await db.architectureQuestion.update({
      where: { id },
      data: { answer, status: "ANSWERED", answeredBy: actor, resolvedAt: answeredAt },
    });
    return;
  }
  if (kind === "GOVERNANCE") {
    await db.governanceQuestion.update({
      where: { id },
      data: { answer, status: "ANSWERED", answeredBy: actor, resolvedAt: answeredAt, humanLocked: true },
    });
    return;
  }
  await db.releaseQuestion.update({
    where: { id },
    data: { answer, status: "ANSWERED", answeredBy: actor, resolvedAt: answeredAt },
  });
}

type ImpactContext = {
  brief: { id: string; version: number; updatedAt: Date } | null;
  definition: { id: string; updatedAt: Date } | null;
  designs: { id: string; version: number; updatedAt: Date }[];
  deliveryPlans: { id: string; version: number; updatedAt: Date }[];
  reviews: { id: string; version: number; updatedAt: Date }[];
  executionPlans: { id: string; version: number; updatedAt: Date }[];
  releases: { id: string; version: string; updatedAt: Date }[];
};

async function loadImpactContext(productId: string): Promise<ImpactContext> {
  const [brief, definition, designs, deliveryPlans, reviews, workspaces, releases] = await Promise.all([
    db.productBrief.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } }),
    db.productDefinition.findUnique({ where: { productId } }),
    db.solutionArchitecture.findMany({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } }),
    db.implementationPlan.findMany({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } }),
    db.engineeringGovernanceReview.findMany({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } }),
    db.repositoryWorkspace.findMany({ where: { productId }, include: { plan: true } }),
    db.releaseCandidate.findMany({ where: { productId, demo: false }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    brief: brief ? { id: brief.id, version: brief.version, updatedAt: brief.updatedAt } : null,
    definition: definition ? { id: definition.id, updatedAt: definition.updatedAt } : null,
    designs: designs.map((item) => ({ id: item.id, version: item.version, updatedAt: item.updatedAt })),
    deliveryPlans: deliveryPlans.map((item) => ({ id: item.id, version: item.version, updatedAt: item.updatedAt })),
    reviews: reviews.map((item) => ({ id: item.id, version: item.version, updatedAt: item.updatedAt })),
    executionPlans: workspaces.flatMap((workspace) =>
      workspace.plan ? [{ id: workspace.plan.id, version: workspace.plan.version, updatedAt: workspace.plan.updatedAt }] : [],
    ),
    releases: releases.map((item) => ({ id: item.id, version: item.version, updatedAt: item.updatedAt })),
  };
}

async function listImpacts(
  productId: string,
  kind: ClarificationKindName,
  question: LoadedQuestion,
  answeredAt: Date,
) {
  return listImpactsFromContext(await loadImpactContext(productId), kind, question, answeredAt);
}

function listImpactsFromContext(
  context: ImpactContext,
  kind: ClarificationKindName,
  question: LoadedQuestion,
  answeredAt: Date,
) {
  const currentDesign = context.designs[0] ?? null;
  const currentDelivery = context.deliveryPlans[0] ?? null;
  const currentReview = context.reviews[0] ?? null;
  const currentPlan = context.executionPlans[0] ?? null;
  const currentRelease = context.releases[0] ?? null;
  return clarificationImpacts({
    kind,
    answeredAt,
    brief: context.brief ? { id: context.brief.id, label: `Product Brief v${context.brief.version}`, updatedAt: context.brief.updatedAt } : null,
    definition: context.definition ? { id: context.definition.id, label: "Product Definition", updatedAt: context.definition.updatedAt } : null,
    designs: currentDesign
      ? [{
          id: currentDesign.id,
          label: `Design v${currentDesign.version}`,
          updatedAt: currentDesign.updatedAt,
          direct: question.solutionArchitectureId === currentDesign.id,
        }]
      : [],
    deliveryPlans: currentDelivery
      ? [{ id: currentDelivery.id, label: `Delivery plan v${currentDelivery.version}`, updatedAt: currentDelivery.updatedAt }]
      : [],
    reviews: currentReview
      ? [{
          id: currentReview.id,
          label: `Governance review v${currentReview.version}`,
          updatedAt: currentReview.updatedAt,
          direct: question.reviewId === currentReview.id,
        }]
      : [],
    executionPlans: currentPlan
      ? [{ id: currentPlan.id, label: `Execution Plan v${currentPlan.version}`, updatedAt: currentPlan.updatedAt }]
      : [],
    releases: currentRelease
      ? [{
          id: currentRelease.id,
          label: `Release ${currentRelease.version}`,
          updatedAt: currentRelease.updatedAt,
          direct: question.releaseCandidateId === currentRelease.id,
        }]
      : [],
  });
}

async function flagImpacts(productId: string, impacts: ClarificationImpact[]) {
  const targets = new Set(impacts.map((impact) => impact.target));
  const reason = CLARIFICATION_REVIEW_REASON;
  if (targets.has("BRIEF")) {
    const brief = await db.productBrief.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } });
    if (brief) {
      await db.productBrief.update({ where: { id: brief.id }, data: { reviewRequired: true, reviewReason: reason } });
    }
  }
  if (targets.has("DEFINITION")) {
    await db.productDefinition.updateMany({
      where: { productId },
      data: { reviewRequired: true, reviewReason: reason },
    });
  }
  if (targets.has("DESIGN")) {
    const design = await db.solutionArchitecture.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } });
    if (design) {
      await db.solutionArchitecture.update({
        where: { id: design.id },
        data: { reviewRequired: true, reviewReason: reason },
      });
    }
  }
  if (targets.has("DELIVERY")) {
    const plan = await db.implementationPlan.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } });
    if (plan) {
      await db.implementationPlan.update({
        where: { id: plan.id },
        data: { reviewRequired: true, reviewReason: reason },
      });
    }
  }
  if (targets.has("GOVERNANCE")) {
    const review = await db.engineeringGovernanceReview.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } });
    if (review) {
      await db.engineeringGovernanceReview.update({
        where: { id: review.id },
        data: { reviewRequired: true, reviewReason: reason, reviewFlaggedAt: new Date() },
      });
    }
  }
  if (targets.has("RELEASE")) {
    const release = await db.releaseCandidate.findFirst({ where: { productId, demo: false }, orderBy: { createdAt: "desc" } });
    if (release) {
      await db.releaseCandidate.update({
        where: { id: release.id },
        data: { reviewRequired: true, reviewReason: reason },
      });
    }
  }
  if (targets.has("PLAN")) {
    await noteCodingContractStale(productId, reason);
  }
}
