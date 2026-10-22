"use server";

import { z } from "zod";

import { invalidState, type ActionState } from "@/lib/action-state";
import {
  abandonWorkspace,
  approveCodeChanges,
  approveExecutionPlan,
  approveImplementationTask,
  createCodingCommit,
  regenerateCodingContract,
  rejectCodeChanges,
  requestCodingChanges,
  proposeCoherentExecutionPlan,
  requestExecutionPlanChanges,
  recordRepairResult,
  restoreUnapprovedChange,
  proposeOutOfScopePlan,
  repairCodingTask,
  resumeCodingTask,
  retryCodingTask,
  reviseExecutionPlan,
  startCodingTask,
} from "@/modules/coding/service";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";

const ids = z.object({
  productId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
});

const workspaceIds = z.object({
  productId: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
});

function done(productId: string, message: string): ActionState {
  refreshWorkspace(productId);
  return { status: "success", message };
}

export async function approveTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ids.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveImplementationTask(parsed.data.productId, parsed.data.taskId);
    return done(parsed.data.productId, "The implementation task is approved for coding.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function startCodingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ids.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await startCodingTask(parsed.data.productId, parsed.data.taskId);
    return done(parsed.data.productId, "The execution plan was generated. Review it before coding starts.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approvePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveExecutionPlan(parsed.data.productId, parsed.data.workspaceId);
    return done(parsed.data.productId, "Execution plan approved. Coding has not started.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function requestPlanChangesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.extend({ changeRequest: z.string().trim().min(12).max(2000) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await requestExecutionPlanChanges(parsed.data.productId, parsed.data.workspaceId, parsed.data.changeRequest);
    return done(parsed.data.productId, "Changes requested. The execution plan is not approved. Revise it to create the next version.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function proposeContractPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await proposeCoherentExecutionPlan(parsed.data.productId, parsed.data.workspaceId);
    return done(parsed.data.productId, "The next execution plan version is ready for review. It is not approved, and coding has not started.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function revisePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await reviseExecutionPlan(parsed.data.productId, parsed.data.workspaceId);
    return done(parsed.data.productId, "A new execution plan version is ready for review. It is not approved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function requestChangesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds
    .extend({
      feedback: z.string().trim().min(1).max(2000),
      requiredChanges: z.string().trim().min(1).max(2000),
      affectedFiles: z.string().trim().max(2000),
    })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await requestCodingChanges({
      productId: parsed.data.productId,
      workspaceId: parsed.data.workspaceId,
      feedback: parsed.data.feedback,
      requiredChanges: parsed.data.requiredChanges,
      affectedFiles: parsed.data.affectedFiles
        .split("\n")
        .map((file) => file.trim())
        .filter(Boolean),
    });
    return done(parsed.data.productId, "The requested changes were recorded against the same execution contract.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approveCodeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveCodeChanges(parsed.data.productId, parsed.data.workspaceId);
    return done(parsed.data.productId, "Code changes approved. Create a local commit to lock this approved source snapshot before Independent Verification.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function rejectCodeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.extend({ feedback: z.string().trim().min(1).max(2000) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await rejectCodeChanges(parsed.data.productId, parsed.data.workspaceId, parsed.data.feedback);
    return done(parsed.data.productId, "The code changes were rejected. The workspace was kept.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function abandonWorkspaceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await abandonWorkspace(parsed.data.productId, parsed.data.workspaceId);
    return done(parsed.data.productId, "The workspace was abandoned. Its files and evidence remain.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function commitCodingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    const result = await createCodingCommit(parsed.data.productId, parsed.data.workspaceId);
    return done(parsed.data.productId, `Approved source snapshot committed. Commit: ${result.sha.slice(0, 12)}. The implementation is now ready for Independent Verification.`);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function restoreUnapprovedChangeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.extend({ path: z.string().trim().min(1).max(240) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await restoreUnapprovedChange(parsed.data.productId, parsed.data.workspaceId, parsed.data.path);
    return done(parsed.data.productId, `${parsed.data.path} was restored from the baseline. The model was not called.`);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function proposeOutOfScopePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.extend({ path: z.string().trim().min(1).max(240) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await proposeOutOfScopePlan(parsed.data.productId, parsed.data.workspaceId, parsed.data.path);
    return done(parsed.data.productId, "A new execution plan version was proposed for that file. It is not approved, and the previous version remains in history.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function recordRepairResultAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await recordRepairResult(parsed.data.productId, parsed.data.workspaceId);
    return done(parsed.data.productId, "The existing repair result was recorded. The model was not called again.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function repairCodingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await repairCodingTask(parsed.data.productId, parsed.data.workspaceId);
    return done(parsed.data.productId, "Implementation repair used the approved execution plan. The original validation evidence was kept.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function retryCodingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await retryCodingTask(parsed.data.productId, parsed.data.workspaceId);
    return done(parsed.data.productId, "The coding task continued in the same workspace.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function resumeCodingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await resumeCodingTask(parsed.data.productId, parsed.data.workspaceId);
    return done(parsed.data.productId, "Coding resumed against the current execution contract.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function regenerateContractAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await regenerateCodingContract(parsed.data.productId, parsed.data.workspaceId);
    return done(parsed.data.productId, "The execution contract was regenerated. Review it before resuming.");
  } catch (error) {
    return actionFailure(error);
  }
}
