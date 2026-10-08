import "server-only";

import { db } from "@/lib/db";
import { codingConfigurationGap } from "@/modules/coding/config";
import { asStrings } from "@/modules/coding/strings";
import { DomainError } from "@/modules/shared/errors";

export async function verificationEntryBlockers(productId: string, taskId: string) {
  const reasons: string[] = [];
  const task = await db.implementationTask.findFirst({
    where: { id: taskId, plan: { productId } },
  });
  if (!task) {
    reasons.push("The implementation task was not found.");
    return reasons;
  }
  if (task.status !== "COMPLETED") {
    reasons.push(`The implementation task is ${task.status}. Verification requires a completed task.`);
  }
  const workspace = await db.repositoryWorkspace.findFirst({
    where: { productId, implementationTaskId: taskId },
    orderBy: { createdAt: "desc" },
    include: { contract: true, evidence: true, codeApprovals: true },
  });
  if (!workspace) {
    reasons.push("The coding workspace for this task was not found.");
  } else {
    if (!/^[0-9a-f]{40}$/.test(workspace.headCommit)) {
      reasons.push("Verification requires the approved commit SHA.");
    }
    if (workspace.executionContractStale || workspace.contract?.stale) {
      reasons.push("The execution contract is stale. Verification cannot start.");
    }
    const checks = asStrings(workspace.contract?.requiredChecks);
    const passed = workspace.evidence.filter((item) => item.result === "PASS" && item.exitCode === 0);
    if (checks.length === 0 || checks.some((check) => !passed.some((item) => item.description === check || item.command === check))) {
      reasons.push("Required coding checks did not pass.");
    }
  }
  const approval = await db.codeChangeApproval.findFirst({
    where: { productId, implementationTaskId: taskId, stale: false },
  });
  if (!approval) reasons.push("A human code approval is required before verification.");
  if (codingConfigurationGap() === "repository") {
    reasons.push("No repository is configured. Set PRODUCT_REPOSITORY_ROOT to a local Git repository.");
  }
  return reasons;
}

export async function assertVerificationEntry(productId: string, taskId: string) {
  const reasons = await verificationEntryBlockers(productId, taskId);
  if (reasons.length > 0) throw new DomainError(reasons.join(" "));
}
