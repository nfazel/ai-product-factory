import "server-only";

import { db } from "@/lib/db";
import { operatorConfirmationAvailable } from "@/modules/feature-review/authorization";
import { authorityStatus, presentTasks, runHeadline, type AuthorityStatus, type RunTaskView } from "@/modules/run-authority/presentation";
import { runStateFor } from "@/modules/run-authority/runner";

export type RunView = {
  planId: string | null;
  /** Whether a person can hand the plan to the Builder now, and if not, why. */
  grant: { available: boolean; reasons: string[] };
  authority: null | { id: string; status: AuthorityStatus; expiresAt: string; maxRetries: number; operatorName: string; running: boolean };
  tasks: RunTaskView[];
  headline: string;
};

/** Cheap reads only. */
export async function getRunView(productId: string, now = new Date()): Promise<RunView> {
  const plan = await db.implementationPlan.findFirst({
    where: { productId, status: "APPROVED" },
    orderBy: { version: "desc" },
    select: { id: true, tasks: { select: { id: true, title: true, status: true }, orderBy: { id: "asc" } } },
  });
  if (!plan) return { planId: null, grant: { available: false, reasons: ["Approve the delivery plan first."] }, authority: null, tasks: [], headline: "" };

  const authority = await db.runAuthority.findFirst({
    where: { planId: plan.id },
    orderBy: { createdAt: "desc" },
    include: { events: { select: { type: true, subjectId: true, detail: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
  });

  const sessions = await db.verificationSession.findMany({
    where: { productId, implementationTaskId: { in: plan.tasks.map((task) => task.id) }, demo: false },
    orderBy: { createdAt: "desc" },
    select: { implementationTaskId: true, overallVerdict: true },
  });
  const verdictFor = (taskId: string) => sessions.find((session) => session.implementationTaskId === taskId)?.overallVerdict ?? null;

  const events = authority?.events ?? [];
  const lastRunStartedAt = events.filter((event) => event.type === "RUN_STARTED").at(-1)?.createdAt ?? null;
  const run = authority ? runStateFor(authority.id) : { running: false, currentTaskId: null };
  const tasks = presentTasks({
    running: run.running,
    currentTaskId: run.currentTaskId,
    lastRunStartedAt,
    tasks: plan.tasks.map((task) => {
      const handed = events.filter((event) => event.type === "HANDED_BACK" && event.subjectId === task.id).at(-1);
      const reason = handed && typeof handed.detail === "object" && handed.detail && "reason" in handed.detail ? String((handed.detail as { reason: unknown }).reason) : "";
      return { id: task.id, title: task.title, status: task.status, verdict: verdictFor(task.id), handedBack: handed ? { at: handed.createdAt, reason } : null };
    }),
  });

  const status = authority ? authorityStatus({ revoked: events.some((event) => event.type === "REVOKED"), expiresAt: authority.expiresAt, now }) : null;
  const reasons: string[] = [];
  if (plan.tasks.length === 0) reasons.push("This plan has no tasks to build.");
  if (!operatorConfirmationAvailable()) reasons.push("Protected operator confirmation is not set up, so the Builder cannot be given authority yet.");
  if (status === "ACTIVE") reasons.push("The Builder already has authority for this plan.");

  const manifest = authority?.manifest as { operator?: { name?: string } } | undefined;
  return {
    planId: plan.id,
    grant: { available: reasons.length === 0, reasons },
    authority: authority && status ? { id: authority.id, status, expiresAt: authority.expiresAt.toISOString(), maxRetries: authority.maxRetries, operatorName: manifest?.operator?.name ?? "Local operator", running: run.running } : null,
    tasks,
    headline: status ? runHeadline({ status, running: run.running, tasks }) : "",
  };
}
