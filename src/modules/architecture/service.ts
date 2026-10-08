import "server-only";

import type { ArchitectureSection } from "@/domain/constants";
import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";
import { executeAgent } from "@/modules/agent/service";
import { requestApproval, resolveApproval } from "@/modules/approval/service";
import { analyseConfiguredRoot } from "@/modules/architecture/context";
import { architectureEntryBlockers, planEntryBlockers } from "@/modules/architecture/gates";
import { noteArchitectureChange } from "@/modules/architecture/impact";
import { noteGovernanceReviewRequired } from "@/modules/governance/impact";
import { assessCodingReadiness } from "@/modules/governance/coding-readiness";
import { getCodingView } from "@/modules/coding/service";
import { getGovernanceWorkspace } from "@/modules/governance/service";
import { acceptAll, included, setReviewStatus } from "@/modules/architecture/proposal";
import {
  architectureGraph,
  findProposal,
  latestArchitecture,
  persistCommittedArchitecture,
  persistCommittedPlan,
  planGraph,
  saveProposalPayload,
} from "@/modules/architecture/repository";
import { assessTechnicalReadiness } from "@/modules/architecture/readiness";
import { findDependencyCycle } from "@/modules/architecture/validate";
import { getCurrentActor } from "@/modules/identity/actor";
import { DomainError } from "@/modules/shared/errors";

function assertHuman(actorName: string, target: "architecture" | "plan") {
  if (actorName === "Architecture Agent") {
    throw new DomainError(
      target === "architecture"
        ? "The Architecture Agent cannot approve a solution architecture."
        : "The Architecture Agent cannot approve an implementation plan.",
    );
  }
}

async function requireArchitectureGate(productId: string) {
  const gate = await architectureEntryBlockers(productId);
  if (gate.reasons.length > 0) throw new DomainError(gate.reasons.join(" "));
  return gate;
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function generateArchitecture(productId: string) {
  await requireArchitectureGate(productId);
  const run = await executeAgent({
    productId,
    agentType: "ARCHITECTURE",
    input: { mode: "generate" },
  });
  await recordActivity({
    productId,
    type: "ARCHITECTURE_GENERATED",
    description:
      "Architecture Agent proposed a solution architecture. It is not approved until a person reviews and approves it.",
    actor: "Architecture Agent",
  });
  return run;
}

export async function regenerateArchitectureSection(
  productId: string,
  section: ArchitectureSection,
  featureTitle = "",
) {
  await requireArchitectureGate(productId);
  const run = await executeAgent({
    productId,
    agentType: "ARCHITECTURE",
    input: { mode: "regenerate", section, featureTitle },
  });
  await recordActivity({
    productId,
    type: "ARCHITECTURE_GENERATED",
    description: `Architecture Agent regenerated the ${section} section. Accepted human edits were kept.`,
    actor: "Architecture Agent",
  });
  return run;
}

export async function requestArchitectureReview(productId: string) {
  await requireArchitectureGate(productId);
  const run = await executeAgent({
    productId,
    agentType: "ARCHITECTURE",
    input: { mode: "review" },
  });
  await recordActivity({
    productId,
    type: "ARCHITECTURE_GENERATED",
    description: "Architecture Agent recorded a review. It did not approve the architecture.",
    actor: "Architecture Agent",
  });
  return run;
}

export async function generateImplementationPlan(productId: string) {
  const gate = await planEntryBlockers(productId);
  if (gate.reasons.length > 0) throw new DomainError(gate.reasons.join(" "));
  const run = await executeAgent({
    productId,
    agentType: "ARCHITECTURE",
    input: { mode: "plan" },
  });
  await recordActivity({
    productId,
    type: "PLAN_GENERATED",
    description:
      "Architecture Agent proposed an implementation plan. It is not approved until a person reviews and approves it.",
    actor: "Architecture Agent",
  });
  return run;
}

export async function reviewArchitectureItem(input: {
  productId: string;
  proposalId: string;
  section: string;
  tempId: string;
  status: "ACCEPTED" | "REJECTED";
}) {
  const proposal = await requireOpen(input.productId, input.proposalId);
  const next = setReviewStatus(proposal.payload, input.section, input.tempId, input.status);
  await saveProposalPayload(proposal.id, next);
  return next;
}

export async function acceptEntireArchitectureProposal(productId: string, proposalId: string) {
  const proposal = await requireOpen(productId, proposalId);
  const next = acceptAll(proposal.payload);
  await saveProposalPayload(proposal.id, next);
  return next;
}

export async function editProposalSummary(input: {
  productId: string;
  proposalId: string;
  architectureStyle: string;
  summary: string;
  rationale: string;
}) {
  const proposal = await requireOpen(input.productId, input.proposalId);
  const next = {
    ...proposal.payload,
    architectureStyle: input.architectureStyle,
    architectureSummary: input.summary,
    rationale: input.rationale,
    summaryEdited: true,
  };
  await saveProposalPayload(proposal.id, next);
  return next;
}

export async function commitArchitecture(productId: string, proposalId: string) {
  const proposal = await requireOpen(productId, proposalId);
  if (proposal.kind !== "ARCHITECTURE") {
    throw new DomainError("This proposal is an implementation plan, not a solution architecture.");
  }
  const gate = await architectureEntryBlockers(productId);
  const architecture = await persistCommittedArchitecture({
    productId,
    productSliceId: gate.slice?.id ?? null,
    payload: proposal.payload,
  });
  await saveProposalPayload(proposal.id, proposal.payload, "COMMITTED");
  await recordActivity({
    productId,
    type: "ARCHITECTURE_COMMITTED",
    description: "Committed the accepted architecture proposal as a draft. It is not approved.",
  });
  return architecture;
}

export async function commitImplementationPlan(productId: string, proposalId: string) {
  const gate = await planEntryBlockers(productId);
  if (gate.reasons.length > 0 || !gate.architecture) {
    throw new DomainError(gate.reasons.join(" ") || "An approved Solution Architecture is required.");
  }
  const proposal = await requireOpen(productId, proposalId);
  if (proposal.kind !== "IMPLEMENTATION_PLAN" && proposal.kind !== "ARCHITECTURE") {
    throw new DomainError("This proposal cannot be committed as an implementation plan.");
  }
  const tasks = proposal.payload.implementationPlanProposal.tasks.filter(included);
  if (tasks.length === 0) {
    throw new DomainError("Accept at least one implementation task before committing the plan.");
  }
  const plan = await persistCommittedPlan({
    productId,
    productSliceId: gate.slice?.id ?? null,
    solutionArchitectureId: gate.architecture.id,
    payload: proposal.payload,
  });
  await saveProposalPayload(proposal.id, proposal.payload, "COMMITTED");
  await recordActivity({
    productId,
    type: "PLAN_COMMITTED",
    description: "Committed the accepted implementation plan as a draft. It is not approved.",
  });
  return plan;
}

export async function markArchitectureReady(productId: string) {
  const architecture = await latestArchitecture(productId);
  if (!architecture) throw new DomainError("Commit an architecture proposal before marking it ready.");
  if (architecture.status === "APPROVED") {
    throw new DomainError("This solution architecture is already approved.");
  }
  const updated = await db.solutionArchitecture.update({
    where: { id: architecture.id },
    data: { status: "READY_FOR_REVIEW" },
  });
  await recordActivity({
    productId,
    type: "ARCHITECTURE_READY_FOR_REVIEW",
    description: "Solution architecture marked ready for review. It is not approved yet.",
  });
  return updated;
}

export async function approveSolutionArchitecture(
  productId: string,
  options?: { actorName?: string },
) {
  const actorName = options?.actorName ?? getCurrentActor().name;
  assertHuman(actorName, "architecture");
  const architecture = await latestArchitecture(productId);
  if (!architecture) throw new DomainError("There is no solution architecture to approve.");
  if (architecture.status === "APPROVED") {
    throw new DomainError("This solution architecture is already approved.", "CONFLICT");
  }
  if (architecture.status !== "READY_FOR_REVIEW") {
    throw new DomainError("Mark the architecture ready for review before approving it.");
  }
  const approval = await requestApproval({
    productId,
    approvalType: "SOLUTION_ARCHITECTURE",
    comments: "Human approval of the solution architecture.",
  });
  await resolveApproval(approval.id, "APPROVED", {
    comments: "Approved the solution architecture. The Architecture Agent did not approve its own work.",
    approvedBy: actorName,
  });
  const updated = await db.solutionArchitecture.update({
    where: { id: architecture.id },
    data: { status: "APPROVED" },
  });
  await recordActivity({
    productId,
    type: "ARCHITECTURE_APPROVED",
    description: "Solution architecture approved by a person. The product stage was not changed.",
    actor: actorName,
  });
  return updated;
}

export async function markPlanReady(productId: string) {
  const gate = await planEntryBlockers(productId);
  if (!gate.architecture) {
    throw new DomainError("An approved Solution Architecture is required before the plan can be reviewed.");
  }
  const plan = await db.implementationPlan.findFirst({
    where: { productId, status: { in: ["DRAFT", "READY_FOR_REVIEW"] } },
    orderBy: { version: "desc" },
  });
  if (!plan) throw new DomainError("Commit an implementation plan before marking it ready.");
  const updated = await db.implementationPlan.update({
    where: { id: plan.id },
    data: { status: "READY_FOR_REVIEW" },
  });
  await recordActivity({
    productId,
    type: "PLAN_COMMITTED",
    description: "Implementation plan marked ready for review. It is not approved yet.",
  });
  return updated;
}

export async function approveImplementationPlan(
  productId: string,
  options?: { actorName?: string },
) {
  const actorName = options?.actorName ?? getCurrentActor().name;
  assertHuman(actorName, "plan");
  const gate = await planEntryBlockers(productId);
  if (!gate.architecture) {
    throw new DomainError(
      "An approved Solution Architecture is required before an implementation plan can be approved.",
    );
  }
  const plan = await db.implementationPlan.findFirst({
    where: { productId, status: { not: "SUPERSEDED" } },
    orderBy: { version: "desc" },
  });
  if (!plan) throw new DomainError("There is no implementation plan to approve.");
  if (plan.status === "APPROVED") {
    throw new DomainError("This implementation plan is already approved.", "CONFLICT");
  }
  if (plan.status !== "READY_FOR_REVIEW") {
    throw new DomainError("Mark the implementation plan ready for review before approving it.");
  }
  const approval = await requestApproval({
    productId,
    approvalType: "IMPLEMENTATION_PLAN",
    comments: "Human approval of the implementation plan.",
  });
  await resolveApproval(approval.id, "APPROVED", {
    comments: "Approved the implementation plan. The Architecture Agent did not approve its own work.",
    approvedBy: actorName,
  });
  const updated = await db.implementationPlan.update({
    where: { id: plan.id },
    data: { status: "APPROVED" },
  });
  await recordActivity({
    productId,
    type: "PLAN_APPROVED",
    description: "Implementation plan approved by a person. Coding has not started.",
    actor: actorName,
  });
  return updated;
}

export async function acceptArchitectureDecision(productId: string, adrId: string) {
  const actor = getCurrentActor();
  if (actor.name === "Architecture Agent") {
    throw new DomainError("The Architecture Agent cannot accept an architecture decision.");
  }
  const adr = await db.architectureDecisionRecord.findFirst({
    where: { id: adrId, productId },
  });
  if (!adr) throw new DomainError("Architecture decision not found.", "NOT_FOUND");
  const updated = await db.architectureDecisionRecord.update({
    where: { id: adr.id },
    data: { status: "ACCEPTED", humanLocked: true },
  });
  await recordActivity({
    productId,
    type: "ADR_UPDATED",
    description: `Accepted architecture decision "${adr.title}".`,
  });
  const architecture = await db.solutionArchitecture.findUnique({
    where: { id: adr.solutionArchitectureId },
  });
  if (architecture?.status === "APPROVED") {
    await noteArchitectureChange(
      productId,
      "Implementation Plan review required. An architecture decision was accepted after the plan was approved.",
    );
  }
  await noteGovernanceReviewRequired(
    productId,
    "GOVERNANCE REVIEW REQUIRED. The solution architecture changed after governance was approved.",
  );
  return updated;
}

export async function updateArchitectureSummary(input: {
  productId: string;
  summary: string;
  rationale: string;
  architectureStyle: string;
}) {
  const architecture = await latestArchitecture(input.productId);
  if (!architecture) throw new DomainError("There is no solution architecture to edit.");
  const updated = await db.solutionArchitecture.update({
    where: { id: architecture.id },
    data: {
      summary: input.summary,
      rationale: input.rationale,
      architectureStyle: input.architectureStyle,
      humanLocked: true,
    },
  });
  if (architecture.status === "APPROVED") {
    await noteArchitectureChange(
      input.productId,
      "Implementation Plan review required. The approved architecture was edited by a person.",
    );
  }
  await noteGovernanceReviewRequired(
    input.productId,
    "GOVERNANCE REVIEW REQUIRED. The solution architecture changed after governance was approved.",
  );
  await recordActivity({
    productId: input.productId,
    type: "ARCHITECTURE_COMMITTED",
    description: "A person edited the architecture summary. The edit takes precedence over AI proposals.",
  });
  return updated;
}

export async function updateArchitectureComponent(input: {
  productId: string;
  componentId: string;
  name: string;
  responsibilities: string;
  technology: string;
}) {
  const component = await db.architectureComponent.findFirst({
    where: { id: input.componentId, architecture: { productId: input.productId } },
  });
  if (!component) throw new DomainError("Architecture component not found.", "NOT_FOUND");
  const updated = await db.architectureComponent.update({
    where: { id: component.id },
    data: {
      name: input.name,
      responsibilities: input.responsibilities,
      technology: input.technology,
      humanLocked: true,
    },
  });
  const architecture = await db.solutionArchitecture.findUnique({
    where: { id: component.solutionArchitectureId },
  });
  if (architecture?.status === "APPROVED") {
    await noteArchitectureChange(
      input.productId,
      "Implementation Plan review required. An architecture component changed after the plan was approved.",
    );
  }
  await noteGovernanceReviewRequired(
    input.productId,
    "GOVERNANCE REVIEW REQUIRED. The solution architecture changed after governance was approved.",
  );
  return updated;
}

export async function updateTechnologyChoice(input: {
  productId: string;
  choiceId: string;
  choice: string;
  reason: string;
  alternatives: string;
}) {
  const row = await db.technologyChoice.findFirst({
    where: { id: input.choiceId, architecture: { productId: input.productId } },
  });
  if (!row) throw new DomainError("Technology choice not found.", "NOT_FOUND");
  return db.technologyChoice.update({
    where: { id: row.id },
    data: {
      choice: input.choice,
      reason: input.reason,
      alternatives: input.alternatives,
      humanLocked: true,
    },
  });
}

export async function updateImplementationTask(input: {
  productId: string;
  taskId: string;
  title: string;
  objective: string;
  validation: string;
  guidance: string;
}) {
  const task = await db.implementationTask.findFirst({
    where: { id: input.taskId, plan: { productId: input.productId } },
  });
  if (!task) throw new DomainError("Implementation task not found.", "NOT_FOUND");
  const updated = await db.implementationTask.update({
    where: { id: task.id },
    data: {
      title: input.title,
      objective: input.objective,
      validation: input.validation,
      guidance: input.guidance,
      humanLocked: true,
    },
  });
  await noteGovernanceReviewRequired(
    input.productId,
    "GOVERNANCE REVIEW REQUIRED. The implementation plan changed after governance was approved.",
  );
  return updated;
}

export async function answerArchitectureQuestion(input: {
  productId: string;
  questionId: string;
  answer: string;
}) {
  const question = await db.architectureQuestion.findFirst({
    where: { id: input.questionId, productId: input.productId },
  });
  if (!question) throw new DomainError("Architecture question not found.", "NOT_FOUND");
  const updated = await db.architectureQuestion.update({
    where: { id: question.id },
    data: {
      answer: input.answer,
      status: "ANSWERED",
      answeredBy: getCurrentActor().name,
      resolvedAt: new Date(),
    },
  });
  await recordActivity({
    productId: input.productId,
    type: "ARCHITECTURE_QUESTION_ANSWERED",
    description: "Answered an architecture question.",
  });
  return updated;
}

export async function addImplementationDependency(input: {
  productId: string;
  taskId: string;
  dependsOnId: string;
}) {
  if (input.taskId === input.dependsOnId) {
    throw new DomainError("A task cannot depend on itself.");
  }
  const tasks = await db.implementationTask.findMany({
    where: { plan: { productId: input.productId } },
    include: { dependencies: true },
  });
  const current = tasks.find((task) => task.id === input.taskId);
  const target = tasks.find((task) => task.id === input.dependsOnId);
  if (!current || !target || current.implementationPlanId !== target.implementationPlanId) {
    throw new DomainError("Choose two tasks from the same implementation plan.");
  }
  const edges = tasks.map((task) => ({
    tempId: task.id,
    dependsOn: task.dependencies.map((dependency) => dependency.dependsOnId),
  }));
  const taskEdge = edges.find((edge) => edge.tempId === input.taskId);
  if (taskEdge) taskEdge.dependsOn = [...taskEdge.dependsOn, input.dependsOnId];
  const cycle = findDependencyCycle(edges);
  if (cycle) {
    throw new DomainError(`Implementation plan has a dependency cycle: ${cycle.join(" -> ")}.`);
  }
  await db.implementationTaskDependency.create({
    data: { taskId: input.taskId, dependsOnId: input.dependsOnId },
  });
  await db.implementationTask.update({
    where: { id: input.taskId },
    data: { dependenciesIdentified: true },
  });
  await noteGovernanceReviewRequired(
    input.productId,
    "GOVERNANCE REVIEW REQUIRED. The implementation plan changed after governance was approved.",
  );
}

export async function saveManualCodebaseContext(input: {
  productId: string;
  repositoryName: string;
  repositoryUrl: string;
  defaultBranch: string;
  systemKind: "GREENFIELD" | "EXISTING_SYSTEM";
  languages: string;
  frameworks: string;
  databaseTechnologies: string;
  infrastructure: string;
  deploymentPlatform: string;
  architectureSummary: string;
  keyDirectories: string;
  keyComponents: string;
  knownIntegrations: string;
  constraints: string;
  observations: string;
}) {
  const saved = await db.codebaseContext.upsert({
    where: { productId: input.productId },
    update: {
      ...mappedContext(input),
      source: "MANUAL",
    },
    create: {
      productId: input.productId,
      ...mappedContext(input),
      source: "MANUAL",
    },
  });
  await recordActivity({
    productId: input.productId,
    type: "CODEBASE_CONTEXT_UPDATED",
    description: "Updated codebase context from a manual entry.",
  });
  return saved;
}

export async function captureLocalCodebaseContext(productId: string) {
  const local = analyseConfiguredRoot();
  if (!local) {
    throw new DomainError(
      "No project directory is configured. Set CODEBASE_CONTEXT_ROOT or enter the context manually.",
    );
  }
  const saved = await db.codebaseContext.upsert({
    where: { productId },
    update: {
      repositoryName: local.repositoryName,
      languages: local.languages,
      frameworks: local.frameworks,
      keyDirectories: local.keyDirectories,
      architectureSummary: local.architectureSummary,
      source: "LOCAL_ANALYSIS",
      systemKind: "EXISTING_SYSTEM",
    },
    create: {
      productId,
      repositoryName: local.repositoryName,
      languages: local.languages,
      frameworks: local.frameworks,
      keyDirectories: local.keyDirectories,
      architectureSummary: local.architectureSummary,
      source: "LOCAL_ANALYSIS",
      systemKind: "EXISTING_SYSTEM",
    },
  });
  await recordActivity({
    productId,
    type: "CODEBASE_CONTEXT_UPDATED",
    description: "Read codebase context from the configured project directory. No repository was cloned.",
  });
  return saved;
}

export async function getCodingReadiness(productId: string) {
  return assessCodingReadiness(productId);
}

export async function getBuildWorkspace(productId: string) {
  const [gate, context, architecture, plan, proposal, planProposal, coding, nfrs, governance, codingExecution] =
    await Promise.all([
    architectureEntryBlockers(productId).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "NOT_FOUND") return null;
      throw error;
    }),
    db.codebaseContext.findUnique({ where: { productId } }),
    architectureGraph(productId),
    planGraph(productId),
    db.architectureProposal.findFirst({
      where: { productId, kind: "ARCHITECTURE", status: { in: ["OPEN", "PARTIALLY_COMMITTED"] } },
      orderBy: { createdAt: "desc" },
    }),
    db.architectureProposal.findFirst({
      where: {
        productId,
        kind: "IMPLEMENTATION_PLAN",
        status: { in: ["OPEN", "PARTIALLY_COMMITTED"] },
      },
      orderBy: { createdAt: "desc" },
    }),
    getCodingReadiness(productId),
    db.nonFunctionalRequirement.findMany({ where: { productId }, select: { id: true } }),
    getGovernanceWorkspace(productId).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "NOT_FOUND") return null;
      throw error;
    }),
    getCodingView(productId),
  ]);
  if (!gate || !governance) return null;
  const readiness = assessTechnicalReadiness(readinessInput(architecture, plan, nfrs.length));
  return {
    product: gate.product,
    entryReasons: gate.reasons,
    context,
    architecture,
    plan,
    proposal,
    planProposal,
    readiness,
    coding,
    codingExecution,
    governance,
    diagram: architecture ? diagram(architecture.components, architecture.relationships) : "",
  };
}

function readinessInput(
  architecture: Awaited<ReturnType<typeof architectureGraph>>,
  plan: Awaited<ReturnType<typeof planGraph>>,
  nfrCount: number,
) {
  const tasks = plan?.tasks ?? [];
  const covered = new Set(
    (architecture?.nfrCoverages ?? []).map((coverage) => coverage.nfrId),
  );
  return {
    summary: architecture?.summary ?? "",
    architectureStyle: architecture?.architectureStyle ?? "",
    rationale: architecture?.rationale ?? "",
    integrationApproach: architecture?.integrationApproach ?? "",
    technologyCount: architecture?.technologies.length ?? 0,
    technologiesWithAlternatives:
      architecture?.technologies.filter((item) => item.reason && item.alternatives).length ?? 0,
    dataEntities: architecture?.dataEntities.length ?? 0,
    dataWithOwner: architecture?.dataEntities.filter((item) => item.owner).length ?? 0,
    integrations: architecture?.integrations.length ?? 0,
    integrationsComplete:
      architecture?.integrations.filter((item) => item.purpose && item.failureConsiderations).length ??
      0,
    securityAreas: new Set(architecture?.findings.map((item) => item.area) ?? []).size,
    nfrCount,
    coveredNfrs: covered.size,
    openQuestions: architecture?.questions.filter((item) => item.status === "OPEN").length ?? 0,
    highOpenQuestions:
      architecture?.questions.filter((item) => item.status === "OPEN" && item.impact === "HIGH")
        .length ?? 0,
    tasks: tasks.length,
    tasksWithObjective: tasks.filter((task) => task.objective.trim()).length,
    tasksWithSlice: tasks.filter((task) => task.verticalSlice.trim()).length,
    tasksWithValidation: tasks.filter((task) => task.validation.trim()).length,
    tasksWithDependenciesIdentified: tasks.filter((task) => task.dependenciesIdentified).length,
  };
}

function diagram(
  components: { id: string; name: string }[],
  relationships: { sourceComponentId: string; targetComponentId: string; relationshipType: string }[],
) {
  const ids = new Map(components.map((component, index) => [component.id, `c${index}`]));
  const lines = ["flowchart LR"];
  for (const component of components) {
    lines.push(`  ${ids.get(component.id)}["${component.name.replaceAll('"', "'")}"]`);
  }
  for (const relationship of relationships) {
    const source = ids.get(relationship.sourceComponentId);
    const target = ids.get(relationship.targetComponentId);
    if (!source || !target) continue;
    lines.push(`  ${source} -->|${relationship.relationshipType}| ${target}`);
  }
  return lines.join("\n");
}

function mappedContext(input: {
  repositoryName: string;
  repositoryUrl: string;
  defaultBranch: string;
  systemKind: "GREENFIELD" | "EXISTING_SYSTEM";
  languages: string;
  frameworks: string;
  databaseTechnologies: string;
  infrastructure: string;
  deploymentPlatform: string;
  architectureSummary: string;
  keyDirectories: string;
  keyComponents: string;
  knownIntegrations: string;
  constraints: string;
  observations: string;
}) {
  return {
    repositoryName: input.repositoryName,
    repositoryUrl: input.repositoryUrl,
    defaultBranch: input.defaultBranch,
    systemKind: input.systemKind,
    languages: splitList(input.languages),
    frameworks: splitList(input.frameworks),
    databaseTechnologies: splitList(input.databaseTechnologies),
    infrastructure: input.infrastructure,
    deploymentPlatform: input.deploymentPlatform,
    architectureSummary: input.architectureSummary,
    keyDirectories: splitList(input.keyDirectories),
    keyComponents: splitList(input.keyComponents),
    knownIntegrations: splitList(input.knownIntegrations),
    constraints: input.constraints,
    observations: input.observations,
  };
}

async function requireOpen(productId: string, proposalId: string) {
  const proposal = await findProposal(productId, proposalId);
  if (!proposal || (proposal.status !== "OPEN" && proposal.status !== "PARTIALLY_COMMITTED")) {
    throw new DomainError("That proposal is no longer open.");
  }
  return proposal;
}

export function buildDiagram(
  components: { id: string; name: string }[],
  relationships: { sourceComponentId: string; targetComponentId: string; relationshipType: string }[],
) {
  return diagram(components, relationships);
}
