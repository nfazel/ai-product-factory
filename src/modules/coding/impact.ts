import "server-only";

import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";

const OCCUPYING = ["CREATING", "ACTIVE", "CHECKING", "READY_FOR_REVIEW", "FAILED"] as const;

export async function noteCodingContractStale(productId: string, reason: string) {
  const workspaces = await db.repositoryWorkspace.findMany({
    where: { productId, status: { in: [...OCCUPYING] } },
  });
  if (workspaces.length === 0) return;
  const flaggedAt = new Date();
  const message = reason.startsWith("EXECUTION CONTRACT STALE")
    ? reason
    : `EXECUTION CONTRACT STALE. ${reason}`;
  for (const workspace of workspaces) {
    await db.repositoryWorkspace.update({
      where: { id: workspace.id },
      data: {
        executionContractStale: true,
        staleReason: message,
        staleFlaggedAt: flaggedAt,
      },
    });
    await db.codingExecutionContract.updateMany({
      where: { workspaceId: workspace.id },
      data: {
        stale: true,
        staleReason: message,
        staleFlaggedAt: flaggedAt,
      },
    });
  }
  await recordActivity({
    productId,
    type: "CODING_CONTRACT_STALE",
    description: message,
  });
}
