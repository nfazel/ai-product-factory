import "server-only";

import { createCodingCommit, resumeCodingTask, startCodingTask } from "@/modules/coding/service";
import { DomainError } from "@/modules/shared/errors";

/**
 * After a person makes a decision, the procedural step that follows it runs by itself: drafting the plan after the task is
 * approved, starting coding after the plan is approved, recording the snapshot after the code is approved. The decisions
 * stay human and are never made here. Each step is the same service call its button makes, so every rule and refusal is
 * unchanged. If the next step cannot run, the decision stands, the reason is returned, and the button is still there.
 */
export type Advance = { ok: true } | { ok: false; reason: string };

async function attempt(work: () => Promise<unknown>): Promise<Advance> {
  try {
    await work();
    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, reason: error.message };
    console.error(error);
    return { ok: false, reason: "Something went wrong. Nothing was changed by that step." };
  }
}

/** The task was approved: draft its execution plan. The person still reads and approves it. */
export function afterTaskApproved(productId: string, taskId: string) {
  return attempt(() => startCodingTask(productId, taskId));
}

/** The plan was approved: start coding. The person still reviews the result. */
export function afterPlanApproved(productId: string, workspaceId: string) {
  return attempt(() => resumeCodingTask(productId, workspaceId));
}

/** The code was approved: record the approved snapshot, which locks what verification will check. */
export async function afterCodeApproved(productId: string, workspaceId: string): Promise<Advance & { sha?: string }> {
  try {
    const result = await createCodingCommit(productId, workspaceId);
    return { ok: true, sha: result.sha };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, reason: error.message };
    console.error(error);
    return { ok: false, reason: "Something went wrong. Nothing was changed by that step." };
  }
}
