import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { boundedDiffCount, sanitizeStoredPatch } from "@/modules/coding/diff";
import { hashText } from "@/modules/coding/policy";

export type StoredWorkspaceDiff = {
  files: unknown;
  additions: number;
  deletions: number;
  patch: string;
  fullPatch: string;
  truncated: boolean;
};

export async function storeWorkspaceResult(input: {
  workspaceId: string;
  implementationTaskId: string;
  hasPlan: boolean;
  approvedPlan: boolean;
  outcome: "COMPLETED" | "COMPLETED_WITH_CONCERNS" | "ESCALATED" | "FAILED";
  diff: StoredWorkspaceDiff | null;
}) {
  const ready = input.outcome === "COMPLETED" || input.outcome === "COMPLETED_WITH_CONCERNS";
  const validationFailed = input.outcome === "FAILED" && input.approvedPlan;
  const workspaceStatus = ready ? "READY_FOR_REVIEW" : input.outcome === "FAILED" ? "FAILED" : "ACTIVE";
  const contractStatus = ready ? "COMPLETED" : validationFailed ? "APPROVED" : input.outcome === "FAILED" ? "FAILED" : "ESCALATED";
  const planStatus = ready ? "COMPLETED" : validationFailed ? "APPROVED" : input.outcome === "FAILED" ? "COMPLETED" : "ESCALATED";
  const stored = input.diff ? sanitizeStoredPatch(input.diff.patch) : null;
  const digest = input.diff ? hashText(sanitizeStoredPatch(input.diff.fullPatch).patch) : null;
  await db.$transaction(async (tx) => {
    if (input.diff && stored) {
      const data = {
        files: input.diff.files as Prisma.InputJsonValue,
        additions: boundedDiffCount(input.diff.additions),
        deletions: boundedDiffCount(input.diff.deletions),
        patch: stored.patch,
        truncated: input.diff.truncated || stored.omittedNullBytes,
      };
      await tx.codingDiff.upsert({
        where: { workspaceId: input.workspaceId },
        create: { workspaceId: input.workspaceId, ...data },
        update: data,
      });
      if (digest) {
        await tx.codeChangeApproval.updateMany({
          where: { workspaceId: input.workspaceId, stale: false, diffHash: { not: digest } },
          data: {
            stale: true,
            staleReason: "The workspace changed after this approval.",
            staleFlaggedAt: new Date(),
          },
        });
      }
    }
    await tx.repositoryWorkspace.update({
      where: { id: input.workspaceId },
      data: { status: workspaceStatus },
    });
    await tx.codingExecutionContract.update({
      where: { workspaceId: input.workspaceId },
      data: { status: contractStatus },
    });
    if (input.hasPlan) {
      await tx.codingExecutionPlan.update({
        where: { workspaceId: input.workspaceId },
        data: { status: planStatus },
      });
    }
    await tx.implementationTask.update({
      where: { id: input.implementationTaskId },
      data: { status: ready ? "CODE_REVIEW" : "IN_PROGRESS" },
    });
  });
}
