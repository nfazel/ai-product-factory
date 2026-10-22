import "server-only";

import { db } from "@/lib/db";
import { isProviderFailureCategory, planStatusAfterProviderFailure } from "@/modules/ai/failures";

function implementInput(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const record = input as { phase?: unknown; workspaceId?: unknown };
  if (record.phase !== "implement" || typeof record.workspaceId !== "string") return null;
  return record;
}

/**
 * A provider failure leaves the execution plan executing. Approval is a property of the
 * plan, so the same approved version is restored. Commands, version, approver, and history stay as saved.
 */
export async function recoverApprovedPlansAfterProviderFailure(productId?: string) {
  const plans = await db.codingExecutionPlan.findMany({
    where: {
      status: "EXECUTING",
      approvedAt: { not: null },
      ...(productId ? { workspace: { productId } } : {}),
    },
    select: { workspaceId: true, status: true },
  });
  if (plans.length === 0) return;
  const workspaces = await db.repositoryWorkspace.findMany({
    where: { id: { in: plans.map((plan) => plan.workspaceId) } },
    select: { id: true, productId: true },
  });
  const productIds = [...new Set(workspaces.map((workspace) => workspace.productId))];
  const runs = await db.agentRun.findMany({
    where: { productId: { in: productIds }, agentType: "CODING" },
    orderBy: { createdAt: "desc" },
    select: { productId: true, status: true, input: true, output: true },
  });
  for (const plan of plans) {
    const workspace = workspaces.find((item) => item.id === plan.workspaceId);
    if (!workspace) continue;
    const run = runs.find((item) => item.productId === workspace.productId && implementInput(item.input)?.workspaceId === plan.workspaceId);
    if (!run || run.status !== "FAILED") continue;
    const output = run.output && typeof run.output === "object" ? run.output as { errorCategory?: unknown } : null;
    const errorCategory = typeof output?.errorCategory === "string" ? output.errorCategory : null;
    if (planStatusAfterProviderFailure({ planStatus: plan.status, errorCategory }) !== "APPROVED") continue;
    await db.codingExecutionPlan.update({
      where: { workspaceId: plan.workspaceId },
      data: { status: "APPROVED" },
    });
    await db.codingExecutionContract.updateMany({
      where: { workspaceId: plan.workspaceId, status: "EXECUTING" },
      data: { status: "APPROVED" },
    });
  }
}

/** A failed validation run is an implementation result. It does not retire the approved plan. */
export async function restoreApprovedPlanAfterValidationFailure(productId?: string) {
  const workspaces = await db.repositoryWorkspace.findMany({
    where: {
      status: "FAILED",
      ...(productId ? { productId } : {}),
      plan: { approvedAt: { not: null }, status: { in: ["COMPLETED", "EXECUTING"] } },
    },
    select: { id: true, productId: true, agentRunId: true },
  });
  if (workspaces.length === 0) return;
  const runs = await db.agentRun.findMany({
    where: { productId: { in: [...new Set(workspaces.map((workspace) => workspace.productId))] }, agentType: "CODING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, productId: true, status: true, input: true, output: true },
  });
  for (const workspace of workspaces) {
    const run = runs.find((item) => item.productId === workspace.productId && implementInput(item.input)?.workspaceId === workspace.id);
    if (!run) continue;
    const output = run.output && typeof run.output === "object" ? run.output as { outcome?: unknown; errorCategory?: unknown } : null;
    const category = typeof output?.errorCategory === "string" ? output.errorCategory : null;
    if (isProviderFailureCategory(category) || output?.outcome !== "FAILED") continue;
    await db.codingExecutionPlan.update({ where: { workspaceId: workspace.id }, data: { status: "APPROVED" } });
    await db.codingExecutionContract.updateMany({
      where: { workspaceId: workspace.id, status: { in: ["FAILED", "EXECUTING", "COMPLETED"] } },
      data: { status: "APPROVED" },
    });
  }
}
