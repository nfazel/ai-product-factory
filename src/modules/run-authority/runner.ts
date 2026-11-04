import "server-only";

import { db } from "@/lib/db";
import { runTaskUnderAuthority } from "@/modules/run-authority/orchestrator";
import { AuthorityStoppedError, recordRunStarted, requireAuthority } from "@/modules/run-authority/service";

/**
 * Runs a whole plan under an authority in the background, one task after another, so a page can show progress and answer Stop
 * while it works. It holds nothing the database does not: if the server restarts the run simply ends, and Continue picks up
 * from the real state of each task.
 */
type Running = { authorityId: string; currentTaskId: string | null; startedAt: number };

// Kept on globalThis so a hot reload in development cannot make the same run look idle and start a second one.
const KEY = Symbol.for("apf.runAuthority.runs");
const runs: Map<string, Running> = ((globalThis as Record<symbol, unknown>)[KEY] ??= new Map<string, Running>()) as Map<string, Running>;

export function runStateFor(authorityId: string): { running: boolean; currentTaskId: string | null } {
  const run = runs.get(authorityId);
  return { running: Boolean(run), currentTaskId: run?.currentTaskId ?? null };
}

/** Plan tasks in an order that respects their dependencies, ties broken by id so the order is stable. */
export async function orderedTaskIds(planId: string): Promise<string[]> {
  const tasks = await db.implementationTask.findMany({
    where: { implementationPlanId: planId },
    select: { id: true, dependencies: { select: { dependsOnId: true } } },
    orderBy: { id: "asc" },
  });
  const ids = new Set(tasks.map((task) => task.id));
  const done = new Set<string>();
  const ordered: string[] = [];
  while (ordered.length < tasks.length) {
    const ready = tasks.filter((task) => !done.has(task.id) && task.dependencies.every((dep) => done.has(dep.dependsOnId) || !ids.has(dep.dependsOnId)));
    // A dependency cycle cannot be ordered; the rest run in id order and the task that is blocked says so when it is reached.
    const next = ready.length > 0 ? ready : tasks.filter((task) => !done.has(task.id));
    for (const task of next) {
      done.add(task.id);
      ordered.push(task.id);
    }
  }
  return ordered;
}

/** Starts the run unless it is already going. Returns at once. */
export function startFeatureRun(input: { productId: string; authorityId: string }): "started" | "already-running" {
  if (runs.has(input.authorityId)) return "already-running";
  const run: Running = { authorityId: input.authorityId, currentTaskId: null, startedAt: Date.now() };
  runs.set(input.authorityId, run);
  void (async () => {
    try {
      const grant = await requireAuthority({ authorityId: input.authorityId, productId: input.productId, step: "APPROVE_TASK" });
      await recordRunStarted(input.authorityId);
      for (const taskId of await orderedTaskIds(grant.planId)) {
        run.currentTaskId = taskId;
        const outcome = await runTaskUnderAuthority({ productId: input.productId, taskId, authorityId: input.authorityId });
        // The first task that needs the person ends the run: the next one may depend on it, and only one workspace is open at a time.
        if (outcome.status !== "DONE") break;
      }
    } catch (error) {
      if (!(error instanceof AuthorityStoppedError)) console.error("[run-authority]", error instanceof Error ? error.message : "run failed");
    } finally {
      runs.delete(input.authorityId);
    }
  })();
  return "started";
}

/** For tests: wait until a run has finished. */
export async function waitForRun(authorityId: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (runs.has(authorityId)) {
    if (Date.now() > deadline) throw new Error("The run did not finish in time.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
