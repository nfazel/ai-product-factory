import "server-only";

import { db } from "@/lib/db";
import { AIFailure } from "@/modules/ai/failures";
import {
  abandonWorkspace,
  approveCodeChanges,
  approveExecutionPlan,
  approveImplementationTask,
  createCodingCommit,
  resumeCodingTask,
  retryCodingTask,
  startCodingTask,
} from "@/modules/coding/service";
import { AuthorityStoppedError, recordAuthorityStep, recordHandedBack, requireAuthority } from "@/modules/run-authority/service";
import { startNewVerificationAttempt, startVerification, failedOnlyForEnvironment } from "@/modules/verification/service";
import { approveRuntimeReviewUnderAuthority, requireRuntimeReview } from "@/modules/verification/runtime-review";
import { DomainError } from "@/modules/shared/errors";

/**
 * Takes one task from "proposed" to "verified" under a run authority, one step at a time, with no clicks. After each step it
 * looks at the real state again, so it can be stopped and started again at any point without repeating or skipping anything.
 *
 * It never decides anything that is a person's. Whatever the authority does not cover, any guardrail, and anything it cannot
 * do after the allowed retries, comes back as NEEDS_YOU with the reason. Acceptance and shipping are not here at all.
 */
export type RunOutcome =
  | { status: "DONE"; verdict: string }
  | { status: "NEEDS_YOU"; step: string; reason: string }
  | { status: "RUNNING"; reason: string }
  | { status: "STOPPED"; reason: string };

type Action =
  | "approve-task" | "draft-plan" | "restart-plan" | "approve-plan" | "code" | "retry-code" | "approve-code" | "snapshot"
  | "sign-review" | "verify" | "verify-again";

type Next = { kind: Action } | { kind: "done"; verdict: string } | { kind: "needs-you"; step: string; reason: string } | { kind: "running"; reason: string };

const PASSING = new Set(["PASS", "PASS_WITH_CONCERNS"]);
const MAX_TURNS = 40;

/** What to do next, read from the database each time. */
export async function nextAction(productId: string, taskId: string): Promise<Next> {
  const task = await db.implementationTask.findFirst({ where: { id: taskId, plan: { productId } }, select: { status: true } });
  if (!task) return { kind: "needs-you", step: "task", reason: "The task was not found." };
  if (task.status === "PROPOSED" || task.status === "BLOCKED") return { kind: "approve-task" };

  const workspace = await db.repositoryWorkspace.findFirst({
    where: { productId, implementationTaskId: taskId },
    orderBy: { createdAt: "desc" },
    include: { plan: { select: { status: true } }, codeApprovals: { where: { stale: false }, select: { id: true } } },
  });

  if (task.status !== "COMPLETED") {
    if (!workspace || workspace.status === "ABANDONED") return { kind: "draft-plan" };
    const plan = workspace.plan?.status;
    if (workspace.status === "ACTIVE") {
      if (plan === "PROPOSED") return { kind: "approve-plan" };
      if (plan === "APPROVED" || plan === "EXECUTING") return { kind: "code" };
      return { kind: "needs-you", step: "plan", reason: "The execution plan needs changes before it can go on." };
    }
    if (workspace.status === "READY_FOR_REVIEW") return workspace.codeApprovals.length === 0 ? { kind: "approve-code" } : { kind: "snapshot" };
    if (workspace.status === "FAILED") {
      // A failure before any plan was approved (usually the model being unavailable while drafting it) starts again from the plan:
      // the failed workspace is set aside, as the Abandon button does, with its evidence kept, and the plan is drafted again.
      const planApproved = ["APPROVED", "EXECUTING", "COMPLETED"].includes(plan ?? "");
      return { kind: planApproved ? "retry-code" : "restart-plan" };
    }
    return { kind: "needs-you", step: "coding", reason: `Coding is ${workspace.status.toLowerCase().replaceAll("_", " ")}.` };
  }

  if (!workspace) return { kind: "needs-you", step: "coding", reason: "The completed task has no workspace." };
  const reviewed = await requireRuntimeReview(productId, workspace.id).then(() => true, () => false);
  if (!reviewed) return { kind: "sign-review" };

  const session = await db.verificationSession.findFirst({
    where: { productId, implementationTaskId: taskId, demo: false },
    orderBy: { createdAt: "desc" },
    include: { executions: { select: { status: true, outputSummary: true } } },
  });
  if (!session || session.commitSha !== workspace.headCommit) return { kind: "verify" };
  if (["PLANNING", "READY", "EXECUTING"].includes(session.status)) return { kind: "running", reason: "Verification is running." };
  if (session.overallVerdict && PASSING.has(session.overallVerdict)) return { kind: "done", verdict: session.overallVerdict };
  // A real product failure is the person's to judge. A result caused by the test environment, or an inconclusive one, is retried.
  if (session.overallVerdict === "INCONCLUSIVE" || failedOnlyForEnvironment(session.executions)) return { kind: "verify-again" };
  return { kind: "needs-you", step: "verification", reason: session.verdictReason || `Verification returned ${session.overallVerdict ?? session.status}.` };
}

/** Transient trouble worth another try: the model or the sandbox, never a refusal or a guardrail. */
function retryable(error: unknown) {
  return error instanceof AIFailure;
}

/** Runs the task and, when it has to stop for the person, writes down why, so the screen can show it after a reload. */
export async function runTaskUnderAuthority(input: { productId: string; taskId: string; authorityId: string }): Promise<RunOutcome> {
  const outcome = await advanceTask(input);
  if (outcome.status === "NEEDS_YOU") await recordHandedBack(input.authorityId, input.taskId, outcome.step, outcome.reason).catch(() => undefined);
  return outcome;
}

async function advanceTask(input: { productId: string; taskId: string; authorityId: string }): Promise<RunOutcome> {
  const { productId, taskId, authorityId } = input;
  const underAuthority = { authorityId };
  const attempts = new Map<Action, number>();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let grant;
    try {
      grant = await requireAuthority({ authorityId, productId, step: "APPROVE_TASK", taskId });
    } catch (error) {
      if (error instanceof AuthorityStoppedError) return { status: "STOPPED", reason: error.message };
      return { status: "NEEDS_YOU", step: "authority", reason: error instanceof Error ? error.message : "The authority could not be used." };
    }

    const next = await nextAction(productId, taskId);
    if (next.kind === "done") return { status: "DONE", verdict: next.verdict };
    if (next.kind === "needs-you") return { status: "NEEDS_YOU", step: next.step, reason: next.reason };
    if (next.kind === "running") return { status: "RUNNING", reason: next.reason };

    const action = next.kind;
    // Drafting the plan and starting it again are the same step as far as the retry limit goes.
    const key: Action = action === "restart-plan" ? "draft-plan" : action;
    try {
      await perform(action, { productId, taskId, authorityId, underAuthority });
      attempts.delete(key);
    } catch (error) {
      if (error instanceof AuthorityStoppedError) return { status: "STOPPED", reason: error.message };
      const used = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, used);
      if (retryable(error) && used <= grant.maxRetries) continue;
      const reason = error instanceof DomainError ? error.message : "Something went wrong. Nothing was changed by that step.";
      if (!(error instanceof DomainError)) console.error(error);
      return { status: "NEEDS_YOU", step: action, reason: retryable(error) ? `${reason} It was tried ${used} times.` : reason };
    }
  }
  return { status: "NEEDS_YOU", step: "run", reason: "The run did not finish within its step limit." };
}

async function perform(action: Action, ctx: { productId: string; taskId: string; authorityId: string; underAuthority: { authorityId: string } }) {
  const { productId, taskId, authorityId, underAuthority } = ctx;
  const workspaceId = async () => {
    const workspace = await db.repositoryWorkspace.findFirstOrThrow({ where: { productId, implementationTaskId: taskId }, orderBy: { createdAt: "desc" }, select: { id: true } });
    return workspace.id;
  };
  switch (action) {
    case "approve-task":
      return approveImplementationTask(productId, taskId, { underAuthority });
    case "draft-plan":
      return startCodingTask(productId, taskId);
    case "restart-plan": {
      await abandonWorkspace(productId, await workspaceId());
      return startCodingTask(productId, taskId);
    }
    case "approve-plan":
      return approveExecutionPlan(productId, await workspaceId(), { underAuthority });
    case "code":
      return resumeCodingTask(productId, await workspaceId());
    case "retry-code":
      return retryCodingTask(productId, await workspaceId());
    case "approve-code":
      return approveCodeChanges(productId, await workspaceId(), { underAuthority });
    case "snapshot": {
      await requireAuthority({ authorityId, productId, step: "RECORD_SNAPSHOT", taskId });
      const id = await workspaceId();
      const result = await createCodingCommit(productId, id);
      await recordAuthorityStep(authorityId, "RECORD_SNAPSHOT", id, { sha: result.sha });
      return;
    }
    case "sign-review":
      return approveRuntimeReviewUnderAuthority({ productId, workspaceId: await workspaceId(), authorityId });
    case "verify":
    case "verify-again": {
      await requireAuthority({ authorityId, productId, step: "START_VERIFICATION", taskId });
      const session = action === "verify" ? await startVerification(productId, taskId) : await startNewVerificationAttempt(productId, taskId);
      await recordAuthorityStep(authorityId, "START_VERIFICATION", taskId, { sessionId: session?.id ?? null });
      return;
    }
  }
}
