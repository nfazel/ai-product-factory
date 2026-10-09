"use server";

import { invalidState, type ActionState } from "@/lib/action-state";
import {
  acceptEntireGovernanceProposal,
  answerGovernanceQuestion,
  approveCodingPolicy,
  approveGovernanceReview,
  commentOnFinding,
  commitGovernanceReview,
  generateGovernanceReview,
  markGovernanceReady,
  overrideCodingRisk,
  regenerateGovernanceSection,
  updateCodingPolicy,
  updateGovernanceFinding,
} from "@/modules/governance/service";
import {
  codingPolicySchema,
  codingRiskOverrideSchema,
  findingCommentSchema,
  findingUpdateSchema,
  governanceProductSchema,
  governanceSectionSchema,
  lines,
  questionAnswerSchema,
} from "@/modules/governance/schema";
import { findingDecisionConfirmation } from "@/modules/governance/finding-presentation";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";

function done(productId: string, message: string): ActionState {
  refreshWorkspace(productId);
  return { status: "success", message };
}

export async function generateGovernanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = governanceProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await generateGovernanceReview(parsed.data.productId);
    return done(parsed.data.productId, "A governance proposal is ready for review. Nothing is approved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function regenerateGovernanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = governanceSectionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await regenerateGovernanceSection(
      parsed.data.productId,
      parsed.data.section,
      parsed.data.taskId ?? "",
    );
    return done(parsed.data.productId, "That part of the review was regenerated. Human decisions were kept.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function acceptGovernanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = governanceProductSchema
    .extend({ proposalId: governanceProductSchema.shape.productId })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await acceptEntireGovernanceProposal(parsed.data.productId, parsed.data.proposalId);
    return done(parsed.data.productId, "The governance proposal is accepted. Commit it to keep a draft review.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function commitGovernanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = governanceProductSchema
    .extend({ proposalId: governanceProductSchema.shape.productId })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await commitGovernanceReview(parsed.data.productId, parsed.data.proposalId);
    return done(parsed.data.productId, "The governance review is a draft. A person still has to approve it.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function markGovernanceReadyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = governanceProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await markGovernanceReady(parsed.data.productId);
    return done(parsed.data.productId, "The governance review is ready for a person to approve.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approveGovernanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = governanceProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveGovernanceReview(parsed.data.productId);
    return done(parsed.data.productId, "Engineering governance is approved. Coding stays closed until every other gate is clear.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateFindingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = findingUpdateSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    const updated = await updateGovernanceFinding(parsed.data);
    return done(parsed.data.productId, findingDecisionConfirmation(updated));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function commentFindingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = findingCommentSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await commentOnFinding(parsed.data);
    return done(parsed.data.productId, "The comment was recorded.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function overrideCodingRiskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = codingRiskOverrideSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await overrideCodingRisk(parsed.data);
    return done(parsed.data.productId, "The coding-risk recommendation was overridden.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateCodingPolicyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = codingPolicySchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  const max = parsed.data.maxFilesPerTask?.trim();
  const maxFiles = max ? Number(max) : null;
  if (maxFiles != null && (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 100)) {
    return { status: "error", message: "Maximum files per task must be a whole number from 1 to 100, or left empty." };
  }
  try {
    await updateCodingPolicy({
      productId: parsed.data.productId,
      policyId: parsed.data.policyId,
      allowedPaths: lines(parsed.data.allowedPaths),
      restrictedPaths: lines(parsed.data.restrictedPaths),
      prohibitedActions: lines(parsed.data.prohibitedActions),
      requiredChecks: lines(parsed.data.requiredChecks),
      maxFilesPerTask: maxFiles,
      requireTests: parsed.data.requireTests === "on",
      requireHumanReview: parsed.data.requireHumanReview === "on",
    });
    return done(parsed.data.productId, "The coding policy was saved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approveCodingPolicyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = governanceProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveCodingPolicy(parsed.data.productId);
    return done(parsed.data.productId, "The coding policy is approved by a person.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function answerGovernanceQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = questionAnswerSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await answerGovernanceQuestion(parsed.data);
    return done(parsed.data.productId, "The governance question was answered.");
  } catch (error) {
    return actionFailure(error);
  }
}
