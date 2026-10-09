import "server-only";

import type { CodingExecutionModeName, CodingRiskLevelName, FindingStatusName, GovernanceSection } from "@/domain/constants";
import { AGENT_CATALOG } from "@/domain/constants";
import { recordActivity } from "@/modules/activity/service";
import { executeAgent } from "@/modules/agent/service";
import { requestApproval, resolveApproval } from "@/modules/approval/service";
import { db } from "@/lib/db";
import { assessCodingReadiness } from "@/modules/governance/coding-readiness";
import { governanceEntryBlockers } from "@/modules/governance/gates";
import { noteCodingPolicyReapproval } from "@/modules/governance/impact";
import { acceptAllGovernance, setGovernanceReviewStatus } from "@/modules/governance/proposal";
import {
  findOpenGovernanceProposal,
  latestGovernanceReview,
  persistCommittedGovernance,
  saveGovernanceProposal,
} from "@/modules/governance/repository";
import { findingDecisionError } from "@/modules/governance/finding-presentation";
import { assessGovernanceReadiness } from "@/modules/governance/readiness";
import { lines, type StoredGovernance } from "@/modules/governance/schema";
import { getCurrentActor } from "@/modules/identity/actor";
import { DomainError } from "@/modules/shared/errors";

const GOVERNANCE_ACTOR = AGENT_CATALOG.SECURITY.name;

function assertHuman(actorName: string, target: "review" | "policy") {
  if (actorName === GOVERNANCE_ACTOR || actorName === "Security Agent") {
    throw new DomainError(
      target === "review"
        ? "The Security & Engineering Governance Agent cannot approve a governance review."
        : "The Security & Engineering Governance Agent cannot approve a coding policy.",
    );
  }
}

async function requireGate(productId: string) {
  const gate = await governanceEntryBlockers(productId);
  if (gate.reasons.length > 0) throw new DomainError(gate.reasons.join(" "));
  return gate;
}

export async function generateGovernanceReview(productId: string) {
  await requireGate(productId);
  const run = await executeAgent({
    productId,
    agentType: "SECURITY",
    input: { mode: "generate" },
  });
  await recordActivity({
    productId,
    type: "GOVERNANCE_GENERATED",
    description:
      "Security & Engineering Governance Agent proposed a review. It is not approved until a person reviews and approves it.",
    actor: GOVERNANCE_ACTOR,
  });
  return run;
}

export async function regenerateGovernanceSection(
  productId: string,
  section: GovernanceSection,
  taskId = "",
) {
  await requireGate(productId);
  const run = await executeAgent({
    productId,
    agentType: "SECURITY",
    input: { mode: "regenerate", section, taskId },
  });
  await recordActivity({
    productId,
    type: "GOVERNANCE_GENERATED",
    description: `Security & Engineering Governance Agent re-reviewed ${section}. Human decisions were kept.`,
    actor: GOVERNANCE_ACTOR,
  });
  return run;
}

async function requireOpen(productId: string, proposalId: string) {
  const proposal = await findOpenGovernanceProposal(productId);
  if (!proposal || proposal.id !== proposalId) {
    throw new DomainError("That governance proposal is not open.");
  }
  return proposal;
}

export async function reviewGovernanceItem(input: {
  productId: string;
  proposalId: string;
  section: "findings" | "threats" | "codingRiskAssessments" | "governanceQuestions" | "evidence";
  tempId: string;
  status: "ACCEPTED" | "REJECTED";
}) {
  const proposal = await requireOpen(input.productId, input.proposalId);
  const next = setGovernanceReviewStatus(proposal.payload, input.section, input.tempId, input.status);
  await saveGovernanceProposal(proposal.id, next);
  return next;
}

export async function acceptEntireGovernanceProposal(productId: string, proposalId: string) {
  const proposal = await requireOpen(productId, proposalId);
  const next = acceptAllGovernance(proposal.payload);
  await saveGovernanceProposal(proposal.id, next);
  return next;
}

export async function commitGovernanceReview(productId: string, proposalId: string) {
  const gate = await requireGate(productId);
  if (!gate.architecture || !gate.plan) {
    throw new DomainError(gate.reasons.join(" ") || "Approved architecture and an approved plan are required.");
  }
  const proposal = await requireOpen(productId, proposalId);
  const section =
    proposal.section === "FULL"
      ? "FULL"
      : proposal.section === "SECURITY"
        ? "security"
        : proposal.section === "PRIVACY"
          ? "privacy"
          : proposal.section === "PLAN"
            ? "plan"
            : proposal.section === "ARCHITECTURE"
              ? "architecture"
              : "task";
  const review = await persistCommittedGovernance({
    productId,
    solutionArchitectureId: gate.architecture.id,
    implementationPlanId: gate.plan.id,
    section,
    taskRef: proposal.taskRef,
    payload: proposal.payload,
  });
  await saveGovernanceProposal(proposal.id, proposal.payload, "COMMITTED");
  await recordActivity({
    productId,
    type: "GOVERNANCE_COMMITTED",
    description: "Committed the accepted governance proposal as a draft. It is not approved.",
  });
  return review;
}

export async function markGovernanceReady(productId: string) {
  const review = await latestGovernanceReview(productId);
  if (!review) throw new DomainError("Commit a governance proposal before marking it ready.");
  if (review.status === "APPROVED") {
    throw new DomainError("This governance review is already approved.");
  }
  const updated = await db.engineeringGovernanceReview.update({
    where: { id: review.id },
    data: { status: "READY_FOR_REVIEW" },
  });
  await recordActivity({
    productId,
    type: "GOVERNANCE_READY_FOR_REVIEW",
    description: "Governance review marked ready for review. It is not approved yet.",
  });
  return updated;
}

export async function approveGovernanceReview(productId: string, options?: { actorName?: string }) {
  const actorName = options?.actorName ?? getCurrentActor().name;
  assertHuman(actorName, "review");
  const review = await latestGovernanceReview(productId);
  if (!review) throw new DomainError("There is no governance review to approve.");
  if (review.status === "APPROVED" && !review.reviewRequired) {
    throw new DomainError("This governance review is already approved.", "CONFLICT");
  }
  if (review.status !== "READY_FOR_REVIEW" && !(review.status === "APPROVED" && review.reviewRequired)) {
    throw new DomainError("Mark the governance review ready for review before approving it.");
  }
  const approval = await requestApproval({
    productId,
    approvalType: "ENGINEERING_GOVERNANCE",
    comments: "Human approval of the engineering governance review.",
  });
  await resolveApproval(approval.id, "APPROVED", {
    comments: "Approved the governance review. The Security & Engineering Governance Agent did not approve its own work.",
    approvedBy: actorName,
  });
  const updated = await db.engineeringGovernanceReview.update({
    where: { id: review.id },
    data: {
      status: "APPROVED",
      reviewRequired: false,
      reviewReason: "",
      reviewFlaggedAt: null,
    },
  });
  await recordActivity({
    productId,
    type: "GOVERNANCE_APPROVED",
    description: "Engineering governance approved by a person. Coding has not started.",
    actor: actorName,
  });
  return updated;
}

export async function updateGovernanceFinding(input: {
  productId: string;
  findingId: string;
  status: FindingStatusName;
  rationale?: string;
}) {
  const finding = await db.governanceFinding.findFirst({
    where: { id: input.findingId, review: { productId: input.productId } },
    include: { review: { select: { id: true, version: true, solutionArchitectureId: true } } },
  });
  if (!finding) throw new DomainError("Governance finding not found.", "NOT_FOUND");
  const rationale = input.rationale?.trim() ?? "";
  const rejected = findingDecisionError(finding, input.status, rationale);
  if (rejected) throw new DomainError(rejected);
  const actor = getCurrentActor().name;
  const architecture = await db.solutionArchitecture.findUnique({
    where: { id: finding.review.solutionArchitectureId },
    select: { version: true },
  });
  const versions = `Governance review v${finding.review.version}. Design v${architecture?.version ?? "unknown"}.`;
  const decision =
    input.status === "RISK_ACCEPTED"
      ? `${actor} accepted the residual risk for "${finding.title}". ${versions} The issue is not resolved.`
      : input.status === "MITIGATED"
        ? `${actor} marked "${finding.title}" resolved. ${versions}`
        : input.status === "OPEN"
          ? `${actor} reopened "${finding.title}". ${versions}`
          : `${actor} set "${finding.title}" to ${input.status}. ${versions}`;
  const updated = await db.governanceFinding.update({
    where: { id: finding.id },
    data: {
      status: input.status,
      rationale: rationale || finding.rationale,
      owner: actor,
      humanLocked: true,
    },
  });
  await db.governanceEvidence.create({
    data: {
      reviewId: finding.reviewId,
      findingId: finding.id,
      type: "HUMAN_CONFIRMATION",
      source: actor,
      description: decision,
      result: rationale || "Human confirmation",
    },
  });
  await recordActivity({
    productId: input.productId,
    type: "FINDING_UPDATED",
    description: `${decision}${rationale ? ` ${rationale}` : ""}`,
    actor,
  });
  return updated;
}

export async function commentOnFinding(input: {
  productId: string;
  findingId: string;
  rationale: string;
}) {
  const finding = await db.governanceFinding.findFirst({
    where: { id: input.findingId, review: { productId: input.productId } },
  });
  if (!finding) throw new DomainError("Governance finding not found.", "NOT_FOUND");
  const rationale = input.rationale.trim();
  if (!rationale) throw new DomainError("A comment needs a rationale.");
  const updated = await db.governanceFinding.update({
    where: { id: finding.id },
    data: {
      rationale: finding.rationale ? `${finding.rationale}\n${rationale}` : rationale,
      humanLocked: true,
    },
  });
  await recordActivity({
    productId: input.productId,
    type: "FINDING_UPDATED",
    description: `Commented on governance finding "${finding.title}". ${rationale}`,
  });
  return updated;
}

export async function overrideCodingRisk(input: {
  productId: string;
  assessmentId: string;
  riskLevel: CodingRiskLevelName;
  executionMode: CodingExecutionModeName;
  rationale: string;
}) {
  const rationale = input.rationale.trim();
  if (!rationale) {
    throw new DomainError("A rationale is required to override an AI coding risk.");
  }
  const assessment = await db.codingRiskAssessment.findFirst({
    where: { id: input.assessmentId, review: { productId: input.productId } },
    include: { task: true },
  });
  if (!assessment) throw new DomainError("Coding risk assessment not found.", "NOT_FOUND");
  const actor = getCurrentActor().name;
  const updated = await db.codingRiskAssessment.update({
    where: { id: assessment.id },
    data: {
      overrideRiskLevel: input.riskLevel,
      overrideExecutionMode: input.executionMode,
      overrideReason: rationale,
      overriddenBy: actor,
      overriddenAt: new Date(),
    },
  });
  await recordActivity({
    productId: input.productId,
    type: "CODING_RISK_OVERRIDDEN",
    description: `${actor} overrode the coding risk for "${assessment.task.title}" to ${input.riskLevel} / ${input.executionMode}. ${rationale}`,
    actor,
  });
  return updated;
}

export async function updateCodingPolicy(input: {
  productId: string;
  policyId: string;
  allowedPaths: string[];
  restrictedPaths: string[];
  prohibitedActions: string[];
  requiredChecks: string[];
  maxFilesPerTask: number | null;
  requireTests: boolean;
  requireHumanReview: boolean;
}) {
  const policy = await db.codingPolicy.findFirst({
    where: { id: input.policyId, productId: input.productId },
  });
  if (!policy) throw new DomainError("Coding policy not found.", "NOT_FOUND");
  const updated = await db.codingPolicy.update({
    where: { id: policy.id },
    data: {
      allowedPaths: input.allowedPaths,
      restrictedPaths: input.restrictedPaths,
      prohibitedActions: input.prohibitedActions,
      requiredChecks: input.requiredChecks,
      maxFilesPerTask: input.maxFilesPerTask,
      requireTests: input.requireTests,
      requireHumanReview: input.requireHumanReview,
      humanLocked: true,
    },
  });
  await recordActivity({
    productId: input.productId,
    type: "CODING_POLICY_UPDATED",
    description: "A person edited the coding policy.",
  });
  await noteCodingPolicyReapproval(
    input.productId,
    policy.id,
    "CODING POLICY REAPPROVAL REQUIRED. The coding policy changed after it was approved.",
  );
  return updated;
}

export async function approveCodingPolicy(productId: string, options?: { actorName?: string }) {
  const actorName = options?.actorName ?? getCurrentActor().name;
  assertHuman(actorName, "policy");
  const review = await latestGovernanceReview(productId);
  if (!review?.policy) throw new DomainError("There is no coding policy to approve.");
  const approval = await requestApproval({
    productId,
    approvalType: "CODING_POLICY",
    comments: "Human approval of the coding policy.",
  });
  await resolveApproval(approval.id, "APPROVED", {
    comments: "Approved the coding policy. The Security & Engineering Governance Agent did not approve it.",
    approvedBy: actorName,
  });
  await db.codingPolicy.update({
    where: { id: review.policy.id },
    data: {
      reapprovalRequired: false,
      reapprovalReason: "",
      reapprovalFlaggedAt: null,
    },
  });
  await recordActivity({
    productId,
    type: "CODING_POLICY_APPROVED",
    description: "Coding policy approved by a person.",
    actor: actorName,
  });
  return review.policy;
}

export async function answerGovernanceQuestion(input: {
  productId: string;
  questionId: string;
  answer: string;
}) {
  const question = await db.governanceQuestion.findFirst({
    where: { id: input.questionId, review: { productId: input.productId } },
  });
  if (!question) throw new DomainError("Governance question not found.", "NOT_FOUND");
  const actor = getCurrentActor().name;
  const updated = await db.governanceQuestion.update({
    where: { id: question.id },
    data: {
      answer: input.answer,
      status: "ANSWERED",
      answeredBy: actor,
      resolvedAt: new Date(),
      humanLocked: true,
    },
  });
  await recordActivity({
    productId: input.productId,
    type: "GOVERNANCE_QUESTION_ANSWERED",
    description: "Answered a governance question.",
    actor,
  });
  return updated;
}

export async function getGovernanceWorkspace(productId: string) {
  const gate = await governanceEntryBlockers(productId);
  const [review, proposal, plan] = await Promise.all([
    latestGovernanceReview(productId),
    findOpenGovernanceProposal(productId),
    db.implementationPlan.findFirst({
      where: { productId, status: { not: "SUPERSEDED" } },
      orderBy: { version: "desc" },
      include: { tasks: { select: { id: true } } },
    }),
  ]);
  const unresolvedProhibited =
    review?.codingRisks.filter((risk) => {
      const level = risk.overrideRiskLevel ?? risk.riskLevel;
      return level === "PROHIBITED" && risk.overriddenBy.trim().length === 0;
    }).length ?? 0;
  const readiness = assessGovernanceReadiness({
    securityAssessment: review?.securityAssessment ?? "",
    privacyAssessment: review?.privacyAssessment ?? "",
    engineeringAssessment: review?.engineeringAssessment ?? "",
    implementationPlanAssessment: review?.implementationPlanAssessment ?? "",
    findings: review?.findings ?? [],
    questions: review?.questions ?? [],
    taskCount: plan?.tasks.length ?? 0,
    assessedTaskCount: review?.codingRisks.length ?? 0,
    unresolvedProhibited,
  });
  return {
    entryReasons: gate.reasons,
    review,
    proposal,
    readiness,
  };
}

export { assessCodingReadiness, lines };
export type { StoredGovernance };
