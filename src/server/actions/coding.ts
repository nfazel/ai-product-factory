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
  resumeCodingTask,
  retryCodingTask,
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
    return done(parsed.data.productId, "The coding task started in an isolated workspace.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approvePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveExecutionPlan(parsed.data.productId, parsed.data.workspaceId);
    return done(parsed.data.productId, "The execution plan is approved. Implementation continued in the same workspace.");
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
    return done(parsed.data.productId, "The code change is approved. It has not been merged.");
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
    return done(parsed.data.productId, `Created commit ${result.sha.slice(0, 12)}. It was not pushed.`);
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
