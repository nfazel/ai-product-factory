import "server-only";

import {
  ASSUMPTION_STATUS_LABEL,
  DEFINITION_SECTION_LABEL,
  OUTCOME_STATUS_LABEL,
  SLICE_STATUS_LABEL,
  type DefinitionSection,
  type ProductStage,
} from "@/domain/constants";
import { isAIConfigured } from "@/modules/ai/provider";
import { recordActivity } from "@/modules/activity/service";
import { executeAgent } from "@/modules/agent/service";
import { requestApproval, resolveApproval } from "@/modules/approval/service";
import { findCurrentBrief } from "@/modules/discovery/repository";
import { getCurrentActor } from "@/modules/identity/actor";
import { updateProduct } from "@/modules/product/service";
import { buildProgressionBlockers, definitionEntryBlockers } from "@/modules/requirements/gates";
import { acceptAll, editProposalItem, setReviewStatus } from "@/modules/requirements/proposal";
import {
  answerQuestion,
  approveSlice,
  commitAcceptedProposal,
  confirmOutcome,
  definitionSnapshot,
  ensureDefinition,
  findOpenProposal,
  findProposal,
  markDefinitionStatus,
  saveProposalPayload,
  setCapabilityStatus,
  setNfrStatus,
} from "@/modules/requirements/repository";
import { assessRequirementsReadiness, assessStoryReadiness, isTestableCriterion, hasUserValueStatement } from "@/modules/requirements/readiness";
import { storedProposalSchema } from "@/modules/requirements/schema";
import { assertProposalReferences } from "@/modules/requirements/validate";
import { DomainError } from "@/modules/shared/errors";

async function requireGate(productId: string) {
  const gate = await definitionEntryBlockers(productId);
  if (gate.reasons.length > 0) {
    throw new DomainError(gate.reasons.join(" "));
  }
  return gate;
}

export async function generateProductDefinition(productId: string) {
  await requireGate(productId);
  const run = await executeAgent({
    productId,
    agentType: "REQUIREMENTS",
    input: { mode: "generate" },
  });
  await recordActivity({
    productId,
    type: "DEFINITION_GENERATED",
    description: "Requirements Agent proposed a product definition. It is not approved and it is not on the backlog until a person commits it.",
    actor: "Requirements Agent",
  });
  return run;
}

export async function regenerateDefinitionSection(productId: string, section: DefinitionSection) {
  await requireGate(productId);
  const run = await executeAgent({
    productId,
    agentType: "REQUIREMENTS",
    input: { mode: "regenerate", section },
  });
  await recordActivity({
    productId,
    type: "DEFINITION_GENERATED",
    description: `Requirements Agent regenerated the ${DEFINITION_SECTION_LABEL[section].toLowerCase()} section of the open proposal.`,
    actor: "Requirements Agent",
  });
  return run;
}

export async function requestDefinitionReview(productId: string) {
  await requireGate(productId);
  const run = await executeAgent({
    productId,
    agentType: "REQUIREMENTS",
    input: { mode: "review" },
  });
  await recordActivity({
    productId,
    type: "DEFINITION_GENERATED",
    description: "Requirements Agent reviewed the definition. It did not approve the definition or change the product stage.",
    actor: "Requirements Agent",
  });
  return run;
}

async function withProposal(
  productId: string,
  proposalId: string,
  change: (payload: ReturnType<typeof storedProposalSchema.parse>) => ReturnType<typeof storedProposalSchema.parse>,
) {
  const proposal = await findProposal(productId, proposalId);
  if (!proposal || (proposal.status !== "OPEN" && proposal.status !== "PARTIALLY_COMMITTED")) {
    throw new DomainError("There is no open definition proposal to review.");
  }
  const next = change(proposal.payload);
  assertProposalReferences(next);
  await saveProposalPayload(proposal.id, next, proposal.status);
  return next;
}

export async function reviewProposalItem(input: {
  productId: string;
  proposalId: string;
  section: DefinitionSection;
  tempId: string;
  decision: "ACCEPTED" | "REJECTED";
}) {
  await withProposal(input.productId, input.proposalId, (payload) =>
    setReviewStatus(payload, input.section, input.tempId, input.decision),
  );
  await recordActivity({
    productId: input.productId,
    type: "REQUIREMENT_UPDATED",
    description: `${input.decision === "ACCEPTED" ? "Accepted" : "Rejected"} a proposed ${DEFINITION_SECTION_LABEL[input.section].toLowerCase()} item.`,
  });
}

export async function acceptEntireProposal(productId: string, proposalId: string) {
  await withProposal(productId, proposalId, acceptAll);
  await recordActivity({
    productId,
    type: "REQUIREMENT_UPDATED",
    description: "Accepted the whole product definition proposal. It is still not on the backlog until it is committed.",
  });
}

export async function editProposedItem(input: {
  productId: string;
  proposalId: string;
  section: DefinitionSection;
  tempId: string;
  title: string;
  body: string;
}) {
  await withProposal(input.productId, input.proposalId, (payload) =>
    editProposalItem(payload, input.section, input.tempId, input.title, input.body),
  );
  await recordActivity({
    productId: input.productId,
    type: "REQUIREMENT_UPDATED",
    description: `Edited a proposed ${DEFINITION_SECTION_LABEL[input.section].toLowerCase()} item before commit.`,
  });
}

export async function commitProductDefinition(productId: string, proposalId: string) {
  const proposal = await findProposal(productId, proposalId);
  if (!proposal || (proposal.status !== "OPEN" && proposal.status !== "PARTIALLY_COMMITTED")) {
    throw new DomainError("There is no open definition proposal to commit.");
  }
  const accepted = [
    ...proposal.payload.outcomes,
    ...proposal.payload.capabilities,
    ...proposal.payload.epics,
    ...proposal.payload.features,
    ...proposal.payload.stories,
  ].some((item) => item.reviewStatus === "ACCEPTED" && !item.committedId);
  const sliceAccepted =
    proposal.payload.firstSlice?.reviewStatus === "ACCEPTED" &&
    !proposal.payload.firstSlice.committedId;
  if (!accepted && !sliceAccepted) {
    throw new DomainError("Accept at least one outcome, capability, backlog item, or the first slice before committing.");
  }
  const brief = await findCurrentBrief(productId);
  const result = await commitAcceptedProposal({
    productId,
    proposalId,
    payload: proposal.payload,
    sourceBriefId: brief?.status === "APPROVED" ? brief.id : brief?.id ?? null,
  });
  await recordActivity({
    productId,
    type: "DEFINITION_COMMITTED",
    description: result.skipped.length
      ? `Committed accepted definition items. ${result.skipped.join(" ")}`
      : "Committed accepted definition items onto the product definition and backlog.",
  });
  return result;
}

export async function confirmProductOutcome(productId: string, entityId: string) {
  const outcome = await confirmOutcome(entityId, productId);
  await recordActivity({
    productId,
    type: "OUTCOME_CONFIRMED",
    description: `Confirmed outcome "${outcome.title}". The Requirements Agent cannot overwrite it.`,
  });
  return outcome;
}

export async function confirmProductCapability(productId: string, entityId: string) {
  const capability = await setCapabilityStatus(entityId, productId, "CONFIRMED");
  await recordActivity({
    productId,
    type: "CAPABILITY_UPDATED",
    description: `Confirmed capability "${capability.name}".`,
  });
  return capability;
}

export async function rejectProductCapability(productId: string, entityId: string) {
  const capability = await setCapabilityStatus(entityId, productId, "REJECTED");
  await recordActivity({
    productId,
    type: "CAPABILITY_UPDATED",
    description: `Rejected capability "${capability.name}".`,
  });
  return capability;
}

export async function confirmNonFunctional(productId: string, entityId: string) {
  const nfr = await setNfrStatus(entityId, productId, "CONFIRMED");
  await recordActivity({
    productId,
    type: "REQUIREMENT_UPDATED",
    description: `Confirmed non-functional requirement "${nfr.title}".`,
  });
  return nfr;
}

export async function rejectNonFunctional(productId: string, entityId: string) {
  const nfr = await setNfrStatus(entityId, productId, "REJECTED");
  await recordActivity({
    productId,
    type: "REQUIREMENT_UPDATED",
    description: `Rejected non-functional requirement "${nfr.title}".`,
  });
  return nfr;
}

export async function approveFirstSlice(productId: string, entityId: string) {
  const slice = await approveSlice(entityId, productId);
  await recordActivity({
    productId,
    type: "SLICE_APPROVED",
    description: `Approved the first product slice "${slice.name}". The Requirements Agent did not approve it.`,
  });
  return slice;
}

export async function answerRequirementQuestion(input: {
  productId: string;
  entityId: string;
  answer: string;
}) {
  const saved = await answerQuestion({
    id: input.entityId,
    productId: input.productId,
    answer: input.answer,
    answeredBy: getCurrentActor().name,
  });
  await recordActivity({
    productId: input.productId,
    type: "QUESTION_ANSWERED",
    description: `Answered requirement question: ${saved.question}`,
  });
  return saved;
}

export async function markDefinitionReady(productId: string) {
  await ensureDefinition(productId);
  await markDefinitionStatus(productId, "READY_FOR_REVIEW");
  await recordActivity({
    productId,
    type: "DEFINITION_READY_FOR_REVIEW",
    description: "Marked the product definition ready for a person to review.",
  });
}

export async function continueDefinition(productId: string) {
  const definition = await ensureDefinition(productId);
  if (definition.status === "APPROVED") {
    throw new DomainError("This product definition is already approved.");
  }
  await markDefinitionStatus(productId, "IN_PROGRESS");
  await recordActivity({
    productId,
    type: "REQUIREMENT_UPDATED",
    description: "Continued product definition. Approval has not been granted.",
  });
}

export async function approveProductDefinition(productId: string) {
  const actor = getCurrentActor();
  if (actor.name === "Requirements Agent") {
    throw new DomainError("The Requirements Agent cannot approve a product definition.");
  }
  const definition = await ensureDefinition(productId);
  if (definition.status === "APPROVED") {
    throw new DomainError("This product definition is already approved.", "CONFLICT");
  }
  const snapshot = await definitionSnapshot(productId);
  if (snapshot.outcomes.length === 0) {
    throw new DomainError("Confirm the shape of the definition before approving it. There are no outcomes yet.");
  }
  const stageBefore = (await definitionEntryBlockers(productId)).product.currentStage;
  const approval = await requestApproval({
    productId,
    approvalType: "PRODUCT_DEFINITION",
    comments: "Human approval of the product definition.",
  });
  await resolveApproval(approval.id, "APPROVED", {
    comments: "Approved the product definition. The Requirements Agent did not approve its own work.",
  });
  await markDefinitionStatus(productId, "APPROVED");
  await recordActivity({
    productId,
    type: "DEFINITION_APPROVED",
    description: "Product definition approved. The product is ready for architecture and delivery planning. The stage was not changed.",
  });
  const after = (await definitionEntryBlockers(productId)).product.currentStage;
  if (after !== stageBefore) {
    throw new DomainError("Product stage changed during definition approval.");
  }
  return { stage: stageBefore };
}

export async function moveDefinitionToBuild(productId: string) {
  const gate = await buildProgressionBlockers(productId);
  if (gate.reasons.length > 0) {
    throw new DomainError(gate.reasons.join(" "));
  }
  return updateProduct({
    id: gate.product.id,
    name: gate.product.name,
    description: gate.product.description,
    vision: gate.product.vision,
    problemStatement: gate.product.problemStatement,
    targetUsers: gate.product.targetUsers,
    status: gate.product.status,
    currentStage: "BUILD" satisfies ProductStage,
  });
}

export async function getStoryTraceability(workItemId: string) {
  const snapshotWork = await import("@/lib/db").then(({ db }) =>
    db.workItem.findUnique({
      where: { id: workItemId },
      include: {
        parent: {
          include: {
            capability: { include: { outcome: true } },
            parent: { include: { capability: { include: { outcome: true } } } },
          },
        },
        capability: { include: { outcome: true } },
        acceptanceCriteria: true,
      },
    }),
  );
  if (!snapshotWork) return null;
  const feature = snapshotWork.parent?.type === "FEATURE" ? snapshotWork.parent : snapshotWork.type === "FEATURE" ? snapshotWork : null;
  const epic =
    feature && "parent" in feature && feature.parent?.type === "EPIC"
      ? feature.parent
      : snapshotWork.parent?.type === "EPIC"
        ? snapshotWork.parent
        : snapshotWork.type === "EPIC"
          ? snapshotWork
          : null;
  const capability =
    snapshotWork.capability ??
    (feature && "capability" in feature ? feature.capability : null) ??
    (epic && "capability" in epic ? epic.capability : null);
  const outcome = capability?.outcome ?? null;
  return {
    story: snapshotWork.type === "STORY" ? { id: snapshotWork.id, title: snapshotWork.title } : null,
    feature: feature ? { id: feature.id, title: feature.title } : null,
    epic: epic ? { id: epic.id, title: epic.title } : null,
    capability: capability ? { id: capability.id, name: capability.name } : null,
    outcome: outcome ? { id: outcome.id, title: outcome.title, sourceBriefId: outcome.sourceBriefId } : null,
    criteria: snapshotWork.acceptanceCriteria.map((criterion) => ({
      id: criterion.id,
      description: criterion.description,
    })),
  };
}

export async function getDefinitionWorkspace(productId: string) {
  const gate = await definitionEntryBlockers(productId).catch((error) => {
    if (error instanceof DomainError && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (!gate) return null;
  await ensureDefinition(productId);
  const [snapshot, proposal, brief, blockers] = await Promise.all([
    definitionSnapshot(productId),
    findOpenProposal(productId),
    findCurrentBrief(productId),
    buildProgressionBlockers(productId),
  ]);

  const byId = new Map(snapshot.workItems.map((item) => [item.id, item]));
  const highQuestions = snapshot.questions.filter(
    (question) => question.status === "OPEN" && question.impact === "HIGH",
  );
  const stories = snapshot.workItems.filter((item) => item.type === "STORY");
  const storyReports = stories.map((story) => {
    const feature = story.parentId ? byId.get(story.parentId) : undefined;
    const epic = feature?.parentId ? byId.get(feature.parentId) : undefined;
    const capability = story.capability ?? epic?.capability ?? feature?.capability ?? null;
    const traced = Boolean(
      feature?.type === "FEATURE" &&
        epic?.type === "EPIC" &&
        capability?.outcome &&
        capability.outcome.sourceBriefId,
    );
    const criteria = snapshot.criteria
      .filter((criterion) => criterion.workItemId === story.id)
      .map((criterion) => criterion.description);
    const questionCount = highQuestions.filter(
      (question) => question.workItemId === story.id || question.workItemId === null,
    ).length;
    const readiness = assessStoryReadiness({
      title: story.title,
      description: story.description,
      persona: story.persona,
      userNeed: story.userNeed,
      userValue: story.userValue,
      priorityAssigned: story.priorityAssigned,
      dependenciesIdentified: story.dependenciesIdentified,
      dependencyCount: snapshot.dependencyLinks.filter((link) => link.workItemId === story.id).length,
      assumptionsNoted: story.assumptionsNoted,
      criteria,
      highImpactOpenQuestions: questionCount,
      traced,
    });
    return {
      id: story.id,
      title: story.title,
      readiness,
      userValue: hasUserValueStatement(story),
      criteriaCount: criteria.length,
      testable: criteria.length > 0 && criteria.every(isTestableCriterion),
      dependenciesIdentified: story.dependenciesIdentified,
    };
  });

  const briefAssumptions = brief?.assumptions ?? [];
  const highUnvalidated =
    briefAssumptions.filter((item) => item.impact === "HIGH" && item.status === "UNVALIDATED").length +
    snapshot.assumptions.filter((item) => item.impact === "HIGH" && item.status === "UNVALIDATED").length;
  const slice = snapshot.slices[0] ?? null;
  const readiness = assessRequirementsReadiness({
    outcomes: snapshot.outcomes.map((outcome) => ({
      id: outcome.id,
      status: outcome.status,
      successMeasure: outcome.successMeasure,
    })),
    capabilities: snapshot.capabilities.map((capability) => ({
      outcomeId: capability.outcomeId,
      status: capability.status,
    })),
    inScopeCount: brief?.inScope.length ?? 0,
    outOfScopeCount: brief?.outOfScope.length ?? 0,
    stories: storyReports,
    openQuestionCount: snapshot.questions.filter((question) => question.status === "OPEN").length,
    highImpactOpenQuestions: highQuestions.length,
    assumptionCount: briefAssumptions.length + snapshot.assumptions.length,
    highUnvalidatedAssumptions: highUnvalidated,
    confirmedNfrs: snapshot.nfrs.filter((item) => item.status === "CONFIRMED").length,
    proposedNfrs: snapshot.nfrs.filter((item) => item.status === "PROPOSED").length,
    sliceStatus: slice?.status ?? null,
    sliceStoryCount: snapshot.workItems.filter((item) => item.type === "STORY" && item.sliceId).length,
  });

  const sufficientlyDeveloped =
    readiness.sufficient >= 7 &&
    snapshot.outcomes.length > 0 &&
    Boolean(slice) &&
    highQuestions.length === 0;
  return {
    product: gate.product,
    configured: isAIConfigured(),
    entryReasons: gate.reasons,
    brief,
    definition: snapshot.definition,
    outcomes: snapshot.outcomes,
    capabilities: snapshot.capabilities,
    slices: snapshot.slices,
    nfrs: snapshot.nfrs,
    questions: snapshot.questions,
    assumptions: snapshot.assumptions,
    briefAssumptions,
    workItems: snapshot.workItems,
    criteria: snapshot.criteria,
    proposal,
    storyReports,
    readiness,
    sufficientlyDeveloped,
    buildBlockers: blockers.reasons,
    labels: {
      outcome: OUTCOME_STATUS_LABEL,
      assumption: ASSUMPTION_STATUS_LABEL,
      slice: SLICE_STATUS_LABEL,
    },
  };
}
