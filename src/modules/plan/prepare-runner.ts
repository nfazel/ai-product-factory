import "server-only";

import { prepareFeatures, type PrepareOutcome } from "@/modules/plan/prepare";

/**
 * Runs the drafting in the background so the Plan page can show progress and the person can leave. It holds nothing the database
 * does not: if the server restarts the run just ends, and starting it again carries on from the real state.
 */
type Running = { startedAt: number; last: PrepareOutcome | null };

// On globalThis so a hot reload in development cannot make a running draft look idle and start a second one.
const KEY = Symbol.for("apf.plan.preparations");
const runs: Map<string, Running> = ((globalThis as Record<symbol, unknown>)[KEY] ??= new Map<string, Running>()) as Map<string, Running>;
const finished: Map<string, PrepareOutcome> = new Map();

export function preparationState(productId: string): { running: boolean; last: PrepareOutcome | null } {
  return { running: runs.has(productId), last: finished.get(productId) ?? null };
}

export function startPreparation(productId: string): "started" | "already-running" {
  if (runs.has(productId)) return "already-running";
  runs.set(productId, { startedAt: Date.now(), last: null });
  finished.delete(productId);
  void (async () => {
    try {
      finished.set(productId, await prepareFeatures(productId));
    } catch (error) {
      console.error("[plan]", error instanceof Error ? error.message : "preparation failed");
      finished.set(productId, { status: "NEEDS_YOU", step: "run", reason: "Drafting the features stopped unexpectedly. Nothing was changed by the failed step." });
    } finally {
      runs.delete(productId);
    }
  })();
  return "started";
}

/** For tests: wait until a preparation has finished. */
export async function waitForPreparation(productId: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (runs.has(productId)) {
    if (Date.now() > deadline) throw new Error("The preparation did not finish in time.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
