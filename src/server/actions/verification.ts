"use server";

import { z } from "zod";

import { invalidState, type ActionState } from "@/lib/action-state";
import {
  approveVerification,
  confirmNotApplicable,
  createIntegratedVerification,
  recordManualResult,
  rejectVerification,
  requestMoreTesting,
  rerunFailedTests,
  startVerification,
} from "@/modules/verification/service";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";

function done(productId: string, message: string): ActionState {
  refreshWorkspace(productId);
  return { status: "success", message };
}

const ids = z.object({
  productId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
});

export async function startVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ids.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await startVerification(parsed.data.productId, parsed.data.taskId);
    return done(parsed.data.productId, "Verification finished and is ready for a person to review.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approveVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), sessionId: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveVerification(parsed.data.productId, parsed.data.sessionId);
    return done(parsed.data.productId, "Verification approved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function requestTestingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ productId: z.string().min(1), sessionId: z.string().min(1), note: z.string().trim().min(1) })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await requestMoreTesting(parsed.data.productId, parsed.data.sessionId, parsed.data.note);
    return done(parsed.data.productId, "More testing was requested. Previous evidence was kept.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function rejectVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ productId: z.string().min(1), sessionId: z.string().min(1), note: z.string().trim().min(1) })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await rejectVerification(parsed.data.productId, parsed.data.sessionId, parsed.data.note);
    return done(parsed.data.productId, "Verification rejected. Evidence was kept.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function manualResultAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      productId: z.string().min(1),
      sessionId: z.string().min(1),
      testCaseId: z.string().min(1),
      result: z.enum(["PASS", "FAIL", "BLOCKED"]),
      comment: z.string().trim().min(1),
    })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await recordManualResult(parsed.data);
    return done(parsed.data.productId, "Manual result recorded.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function notApplicableAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ productId: z.string().min(1), sessionId: z.string().min(1), criterionId: z.string().min(1) })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await confirmNotApplicable(parsed.data.productId, parsed.data.sessionId, parsed.data.criterionId);
    return done(parsed.data.productId, "Criterion marked not applicable.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function rerunFailedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), sessionId: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await rerunFailedTests(parsed.data.productId, parsed.data.sessionId);
    return done(parsed.data.productId, "Failed tests were run again. Earlier evidence was kept.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function integratedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), sliceId: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await createIntegratedVerification(parsed.data.productId, parsed.data.sliceId);
    return done(parsed.data.productId, "Integrated verification plan recorded. End-to-end execution was not claimed.");
  } catch (error) {
    return actionFailure(error);
  }
}
