"use server";

import { z } from "zod";

import { invalidState, type ActionState } from "@/lib/action-state";
import {
  analyseReviewFeedback,
  createTaskPullRequest,
  initializeRemoteMain,
  publishTaskBranch,
  recordCiException,
  refreshPullRequest,
  sendCommentToCoding,
  updatePublishedBranch,
  validateGitHubConnection,
} from "@/modules/source-control/service";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";

function done(productId: string | undefined, message: string): ActionState {
  refreshWorkspace(productId);
  return { status: "success", message };
}

export async function validateConnectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productId = formValues(formData).productId || undefined;
  try {
    const connection = await validateGitHubConnection(productId);
    return done(productId, connection.message);
  } catch (error) {
    return actionFailure(error);
  }
}

const taskIds = z.object({
  productId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
});

export async function publishBranchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = taskIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  if (formValues(formData).confirmPublication !== "yes") {
    return { status: "error", message: "Publication requires explicit confirmation." };
  }
  try {
    await publishTaskBranch(parsed.data.productId, parsed.data.taskId, undefined, { confirmed: true });
    return done(parsed.data.productId, "Published the approved branch. No pull request was created, and nothing was merged or deployed.");
  } catch (error) {
    refreshWorkspace(parsed.data.productId);
    return actionFailure(error);
  }
}

export async function initializeRemoteMainAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().trim().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  if (formValues(formData).confirmRemoteMain !== "yes") {
    return { status: "error", message: "Initializing the remote main branch requires explicit confirmation." };
  }
  try {
    await initializeRemoteMain(parsed.data.productId, undefined, { confirmed: true });
    return done(parsed.data.productId, "Initialized the remote main branch from the baseline commit. The published task branch was not changed, and no pull request was created.");
  } catch (error) {
    refreshWorkspace(parsed.data.productId);
    return actionFailure(error);
  }
}

export async function createPullRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = taskIds.extend({ title: z.string().trim().max(200).optional() }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await createTaskPullRequest(parsed.data.productId, parsed.data.taskId, parsed.data.title);
    return done(parsed.data.productId, "Created the pull request.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function refreshPullRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), pullRequestId: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await refreshPullRequest(parsed.data.productId, parsed.data.pullRequestId);
    return done(parsed.data.productId, "Refreshed the pull request from GitHub. This did not approve or merge it.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function recordCiExceptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().min(1),
    rationale: z.string().trim().min(10, "Record why CI is not required."),
    confirmCiException: z.literal("yes"),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await recordCiException(parsed.data.productId, parsed.data.rationale, true);
    return done(parsed.data.productId, "Recorded the CI exception. The absence of CI is still shown and is not a pass.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function analyseFeedbackAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), pullRequestId: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await analyseReviewFeedback(parsed.data.productId, parsed.data.pullRequestId);
    return done(parsed.data.productId, "Classified the review comments. No code was changed.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function sendToCodingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), commentId: z.string().min(1) }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await sendCommentToCoding(parsed.data.productId, parsed.data.commentId);
    return done(parsed.data.productId, "Recorded the review decision. The Coding Agent was not started.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateBranchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = taskIds.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await updatePublishedBranch(parsed.data.productId, parsed.data.taskId);
    return done(parsed.data.productId, "Updated the published branch with another commit.");
  } catch (error) {
    return actionFailure(error);
  }
}
