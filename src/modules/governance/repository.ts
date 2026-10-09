import "server-only";

import { FINDING_CATEGORIES, type FindingCategoryName, type GovernanceSection } from "@/domain/constants";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { SECTION_CATEGORIES, SECTION_TOPICS } from "@/modules/governance/proposal";
import { included, type StoredGovernance, storedGovernanceSchema } from "@/modules/governance/schema";
import { assertEvidenceIsNotFabricated } from "@/modules/governance/validate";
import { DomainError } from "@/modules/shared/errors";

function parsePayload(value: unknown): StoredGovernance {
  const parsed = storedGovernanceSchema.safeParse(value);
  if (!parsed.success) throw new DomainError("The stored governance proposal is not readable.");
  return parsed.data;
}

export async function findOpenGovernanceProposal(productId: string) {
  const row = await db.governanceProposal.findFirst({
    where: { productId, status: { in: ["OPEN", "PARTIALLY_COMMITTED"] } },
    orderBy: { createdAt: "desc" },
  });
  return row ? { ...row, payload: parsePayload(row.payload) } : null;
}

export async function insertGovernanceProposal(input: {
  productId: string;
  section: "FULL" | "SECURITY" | "PRIVACY" | "PLAN" | "ARCHITECTURE" | "TASK";
  taskRef?: string;
  summary: string;
  payload: StoredGovernance;
}) {
  await db.governanceProposal.updateMany({
    where: { productId: input.productId, status: "OPEN" },
    data: { status: "SUPERSEDED" },
  });
  const row = await db.governanceProposal.create({
    data: {
      productId: input.productId,
      section: input.section,
      taskRef: input.taskRef ?? "",
      summary: input.summary,
      payload: input.payload as Prisma.InputJsonValue,
    },
  });
  return { ...row, payload: parsePayload(row.payload) };
}

export async function saveGovernanceProposal(
  id: string,
  payload: StoredGovernance,
  status?: "OPEN" | "COMMITTED" | "SUPERSEDED",
) {
  const row = await db.governanceProposal.update({
    where: { id },
    data: {
      payload: payload as Prisma.InputJsonValue,
      summary: payload.assistantSummary,
      ...(status ? { status } : {}),
    },
  });
  return { ...row, payload: parsePayload(row.payload) };
}

function categoriesFor(section: "FULL" | GovernanceSection): FindingCategoryName[] {
  if (section === "FULL") return [...FINDING_CATEGORIES];
  return SECTION_CATEGORIES[section];
}

function blank(id: string) {
  return id.trim().length > 0 ? id : null;
}

export async function persistCommittedGovernance(input: {
  productId: string;
  solutionArchitectureId: string;
  implementationPlanId: string;
  section: "FULL" | GovernanceSection;
  taskRef?: string;
  payload: StoredGovernance;
}) {
  const acceptedFindings = input.payload.findings.filter(included);
  const acceptedThreats = input.payload.threats.filter(included);
  const acceptedRisks = input.payload.codingRiskAssessments.filter(included);
  const acceptedQuestions = input.payload.governanceQuestions.filter(included);
  const acceptedEvidence = input.payload.evidence.filter(included);
  if (
    input.section === "FULL" &&
    input.payload.findings.length > 0 &&
    acceptedFindings.length === 0
  ) {
    throw new DomainError("Accept at least one governance finding before committing the review.");
  }

  return db.$transaction(async (tx) => {
    const [components, decisions, tasks, nfrs, workItems, assumptions] = await Promise.all([
      tx.architectureComponent.findMany({
        where: { solutionArchitectureId: input.solutionArchitectureId },
        select: { id: true },
      }),
      tx.architectureDecisionRecord.findMany({
        where: { solutionArchitectureId: input.solutionArchitectureId },
        select: { id: true },
      }),
      tx.implementationTask.findMany({
        where: { implementationPlanId: input.implementationPlanId },
        select: { id: true },
      }),
      tx.nonFunctionalRequirement.findMany({
        where: { productId: input.productId },
        select: { id: true },
      }),
      tx.workItem.findMany({ where: { productId: input.productId }, select: { id: true } }),
      tx.requirementAssumption.findMany({
        where: { productId: input.productId },
        select: { id: true },
      }),
    ]);
    const componentIds = new Set(components.map((item) => item.id));
    const adrIds = new Set(decisions.map((item) => item.id));
    const taskIds = new Set(tasks.map((item) => item.id));
    const nfrIds = new Set(nfrs.map((item) => item.id));
    const workItemIds = new Set(workItems.map((item) => item.id));
    const assumptionIds = new Set(assumptions.map((item) => item.id));

    const approved = await tx.engineeringGovernanceReview.findFirst({
      where: { productId: input.productId, status: "APPROVED" },
    });
    if (approved && input.section === "FULL") {
      throw new DomainError(
        "An approved governance review cannot be overwritten. Re-review one section instead.",
      );
    }

    const existing = await tx.engineeringGovernanceReview.findFirst({
      where: { productId: input.productId, status: { not: "SUPERSEDED" } },
      orderBy: { version: "desc" },
      include: {
        findings: true,
        threats: true,
        codingRisks: true,
        questions: true,
        policy: true,
      },
    });
    if (!existing && input.section !== "FULL") {
      throw new DomainError("Commit a full governance review before re-reviewing a section.");
    }

    const review =
      existing ??
      (await tx.engineeringGovernanceReview.create({
        data: {
          productId: input.productId,
          solutionArchitectureId: input.solutionArchitectureId,
          implementationPlanId: input.implementationPlanId,
          version: 1,
          status: "DRAFT",
          overallAssessment: input.payload.overallAssessment,
          summary: input.payload.assistantSummary,
          assistantSummary: input.payload.assistantSummary,
          securityAssessment: input.payload.securityAssessment,
          privacyAssessment: input.payload.privacyAssessment,
          engineeringAssessment: input.payload.engineeringAssessment,
          implementationPlanAssessment: input.payload.implementationPlanAssessment,
          dependencyReview: input.payload.dependencyReview,
          readinessNote: input.payload.readinessNote,
        },
        include: {
          findings: true,
          threats: true,
          codingRisks: true,
          questions: true,
          policy: true,
        },
      }));

    const know = (id: string, set: Set<string>, label: string) => {
      if (!id.trim()) return;
      if (!set.has(id)) throw new DomainError(`Unknown ${label} reference ${id}.`);
    };
    for (const finding of input.payload.findings) {
      know(finding.componentId, componentIds, "architecture component");
      know(finding.adrId, adrIds, "architecture decision");
      know(finding.taskId, taskIds, "implementation task");
      know(finding.nfrId, nfrIds, "non-functional requirement");
      know(finding.workItemId, workItemIds, "work item");
      know(finding.assumptionId, assumptionIds, "assumption");
    }
    for (const threat of input.payload.threats) {
      know(threat.affectedComponentId, componentIds, "architecture component");
    }
    for (const risk of input.payload.codingRiskAssessments) {
      know(risk.taskId, taskIds, "implementation task");
    }
    for (const item of input.payload.evidence) {
      assertEvidenceIsNotFabricated(item);
    }

    const categories = new Set(categoriesFor(input.section));
    const topics = input.section === "FULL" ? null : new Set(SECTION_TOPICS[input.section]);
    const removeFindings = review.findings.filter(
      (finding) =>
        !finding.humanLocked &&
        finding.status === "OPEN" &&
        categories.has(finding.category),
    );
    if (removeFindings.length > 0) {
      await tx.governanceFinding.deleteMany({
        where: { id: { in: removeFindings.map((finding) => finding.id) } },
      });
    }

    const findingIds = new Map<string, string>();
    for (const finding of acceptedFindings.filter((item) => categories.has(item.category))) {
      const created = await tx.governanceFinding.create({
        data: {
          reviewId: review.id,
          category: finding.category,
          severity: finding.severity,
          title: finding.title,
          description: finding.description,
          evidence: finding.evidence,
          recommendation: finding.recommendation,
          dueBeforeCoding: finding.dueBeforeCoding,
          owner: finding.owner,
          status: "OPEN",
        },
      });
      findingIds.set(finding.tempId, created.id);
      if (
        finding.componentId ||
        finding.adrId ||
        finding.taskId ||
        finding.nfrId ||
        finding.workItemId ||
        finding.assumptionId
      ) {
        await tx.governanceFindingLink.create({
          data: {
            findingId: created.id,
            componentId: blank(finding.componentId),
            adrId: blank(finding.adrId),
            taskId: blank(finding.taskId),
            nfrId: blank(finding.nfrId),
            workItemId: blank(finding.workItemId),
            assumptionId: blank(finding.assumptionId),
          },
        });
      }
    }

    const replaceThreats = input.section === "FULL" || input.section === "security";
    if (replaceThreats) {
      await tx.threat.deleteMany({
        where: { reviewId: review.id, humanLocked: false, status: "OPEN" },
      });
      for (const threat of acceptedThreats) {
        await tx.threat.create({
          data: {
            reviewId: review.id,
            title: threat.title,
            description: threat.description,
            affectedComponentId: blank(threat.affectedComponentId),
            attackSurface: threat.attackSurface,
            likelihood: threat.likelihood,
            impact: threat.impact,
            mitigation: threat.mitigation,
            status: "OPEN",
          },
        });
      }
    }

    const replaceQuestions = input.section === "FULL" || topics !== null;
    if (replaceQuestions) {
      await tx.governanceQuestion.deleteMany({
        where: {
          reviewId: review.id,
          humanLocked: false,
          status: "OPEN",
          ...(topics ? { topic: { in: [...topics] } } : {}),
        },
      });
      for (const question of acceptedQuestions.filter((item) => !topics || topics.has(item.topic))) {
        await tx.governanceQuestion.create({
          data: {
            reviewId: review.id,
            question: question.question,
            reason: question.reason,
            impact: question.impact,
            topic: question.topic,
            blocking: question.blocking,
            status: "OPEN",
          },
        });
      }
    }

    const replaceRisks =
      input.section === "FULL" || input.section === "plan" || input.section === "task";
    if (replaceRisks) {
      const overridden = new Set(
        review.codingRisks
          .filter((risk) => risk.overriddenBy.trim().length > 0)
          .map((risk) => risk.implementationTaskId),
      );
      await tx.codingRiskAssessment.deleteMany({
        where: {
          reviewId: review.id,
          overriddenBy: "",
          ...(input.section === "task" ? { implementationTaskId: input.taskRef ?? "" } : {}),
        },
      });
      for (const risk of acceptedRisks) {
        if (overridden.has(risk.taskId)) continue;
        if (input.section === "task" && risk.taskId !== input.taskRef) continue;
        await tx.codingRiskAssessment.create({
          data: {
            reviewId: review.id,
            implementationTaskId: risk.taskId,
            riskLevel: risk.riskLevel,
            reason: risk.reason,
            recommendedExecutionMode: risk.recommendedExecutionMode,
            requiredHumanReview: risk.requiredHumanReview,
          },
        });
      }
    }

    const replacePolicy =
      (input.section === "FULL" || input.section === "plan") && !review.policy?.humanLocked;
    if (replacePolicy) {
      const policyData = {
        allowedPaths: input.payload.proposedCodingPolicy.allowedPaths,
        restrictedPaths: input.payload.proposedCodingPolicy.restrictedPaths,
        prohibitedActions: input.payload.proposedCodingPolicy.prohibitedActions,
        requiredChecks: input.payload.proposedCodingPolicy.requiredChecks,
        maxFilesPerTask:
          input.payload.proposedCodingPolicy.maxFilesPerTask > 0
            ? input.payload.proposedCodingPolicy.maxFilesPerTask
            : null,
        requireTests: input.payload.proposedCodingPolicy.requireTests,
        requireHumanReview: input.payload.proposedCodingPolicy.requireHumanReview,
      };
      if (review.policy) {
        await tx.codingPolicy.update({ where: { id: review.policy.id }, data: policyData });
      } else {
        await tx.codingPolicy.create({
          data: { ...policyData, productId: input.productId, reviewId: review.id },
        });
      }
    }

    await tx.governanceEvidence.deleteMany({
      where: { reviewId: review.id, type: "AI_ANALYSIS" },
    });
    for (const item of acceptedEvidence) {
      await tx.governanceEvidence.create({
        data: {
          reviewId: review.id,
          findingId: item.findingTempId ? (findingIds.get(item.findingTempId) ?? null) : null,
          type: "AI_ANALYSIS",
          source: item.source,
          description: item.description,
          result: item.result,
        },
      });
    }

    const text: Prisma.EngineeringGovernanceReviewUpdateInput = {
      overallAssessment: input.payload.overallAssessment,
      summary: input.payload.assistantSummary,
      assistantSummary: input.payload.assistantSummary,
      readinessNote: input.payload.readinessNote,
    };
    if (input.section === "FULL" || input.section === "security") {
      text.securityAssessment = input.payload.securityAssessment;
      text.dependencyReview = input.payload.dependencyReview;
    }
    if (input.section === "FULL" || input.section === "privacy") {
      text.privacyAssessment = input.payload.privacyAssessment;
    }
    if (input.section === "FULL" || input.section === "architecture") {
      text.engineeringAssessment = input.payload.engineeringAssessment;
    }
    if (input.section === "FULL" || input.section === "plan") {
      text.implementationPlanAssessment = input.payload.implementationPlanAssessment;
    }
    if (review.status === "APPROVED" && input.section !== "FULL") {
      text.reviewRequired = true;
      text.reviewReason =
        "GOVERNANCE REVIEW REQUIRED. A selective re-review was committed after the governance review was approved.";
      text.reviewFlaggedAt = new Date();
    }

    return tx.engineeringGovernanceReview.update({
      where: { id: review.id },
      data: text,
    });
  });
}

const reviewInclude = {
  findings: {
    orderBy: { createdAt: "asc" as const },
    include: {
      links: {
        include: {
          component: true,
          adr: true,
          task: true,
          nfr: true,
          workItem: true,
          assumption: true,
        },
      },
    },
  },
  threats: { orderBy: { createdAt: "asc" as const }, include: { component: true } },
  codingRisks: { orderBy: { createdAt: "asc" as const }, include: { task: true } },
  questions: { orderBy: { createdAt: "asc" as const } },
  evidence: { orderBy: { createdAt: "asc" as const } },
  policy: true,
  architecture: { select: { version: true } },
  plan: { select: { version: true } },
} satisfies Prisma.EngineeringGovernanceReviewInclude;

export async function latestGovernanceReview(productId: string) {
  return db.engineeringGovernanceReview.findFirst({
    where: { productId, status: { not: "SUPERSEDED" } },
    orderBy: { version: "desc" },
    include: reviewInclude,
  });
}

export type GovernanceReviewGraph = NonNullable<Awaited<ReturnType<typeof latestGovernanceReview>>>;
