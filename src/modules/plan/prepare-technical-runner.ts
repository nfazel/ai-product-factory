import "server-only";

import { prepareTechnical, type TechnicalOutcome } from "@/modules/plan/prepare-technical";

/** Drafts the technical chain in the background, the same way the feature drafting runs. Nothing is held that the database does not hold. */
const KEY = Symbol.for("apf.plan.technical-preparations");
const runs: Map<string, number> = ((globalThis as Record<symbol, unknown>)[KEY] ??= new Map<string, number>()) as Map<string, number>;
const finished: Map<string, TechnicalOutcome> = new Map();

export function technicalPreparationState(productId: string): { running: boolean; last: TechnicalOutcome | null } {
  return { running: runs.has(productId), last: finished.get(productId) ?? null };
}

export function startTechnicalPreparation(productId: string): "started" | "already-running" {
  if (runs.has(productId)) return "already-running";
  runs.set(productId, Date.now());
  finished.delete(productId);
  void (async () => {
    try {
      finished.set(productId, await prepareTechnical(productId));
    } catch (error) {
      console.error("[plan]", error instanceof Error ? error.message : "technical drafting failed");
      finished.set(productId, { status: "NEEDS_YOU", step: "run", reason: "Drafting the technical plan stopped unexpectedly. Nothing was changed by the failed step." });
    } finally {
      runs.delete(productId);
    }
  })();
  return "started";
}

/** For tests: wait until a run has finished. */
export async function waitForTechnicalPreparation(productId: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (runs.has(productId)) {
    if (Date.now() > deadline) throw new Error("The technical drafting did not finish in time.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
