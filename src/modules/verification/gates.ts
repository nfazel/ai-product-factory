import "server-only";

import fs from "node:fs";

import { db } from "@/lib/db";
import { codingChecksReadyForVerification } from "@/modules/coding/check-identity";
import { parsePlannedCommands } from "@/modules/coding/commands";
import { commitExists } from "@/modules/coding/git";
import { reviewableDiffFiles } from "@/modules/coding/review";
import { productRepositoryReady, REPOSITORY_NOT_CONFIGURED, resolveProductRepository } from "@/modules/source-control/product-repository";
import { DomainError } from "@/modules/shared/errors";

const COMMIT_SHA = /^[0-9a-f]{40}$/;

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
    include: { contract: true, plan: true, evidence: { orderBy: { createdAt: "asc" } }, codeApprovals: { orderBy: { createdAt: "desc" } }, diff: true },
  });
  if (!workspace) {
    reasons.push("The coding workspace for this task was not found.");
  } else {
    if (workspace.executionContractStale || workspace.contract?.stale) {
      reasons.push("The execution contract is stale. Verification cannot start.");
    }
    const plan = workspace.plan;
    if (!plan || (plan.status !== "APPROVED" && plan.status !== "COMPLETED")) {
      reasons.push("An approved execution plan is required before verification.");
    } else {
      const decision = codingChecksReadyForVerification({
        planVersion: plan.version,
        planStatus: plan.status,
        planApprovedAt: plan.approvedAt,
        planHistory: plan.history,
        checks: parsePlannedCommands(plan.validationCommands),
        evidence: workspace.evidence.map((item) => ({
          command: item.command,
          description: item.description,
          result: item.result,
          exitCode: item.exitCode,
          at: item.completedAt ?? item.createdAt,
        })),
      });
      if (!decision.ready) reasons.push("Required coding checks did not pass.");
    }
    const approval = workspace.codeApprovals.find((item) => !item.stale) ?? null;
    if (!approval) {
      reasons.push("A human code approval is required before verification.");
    } else if (!COMMIT_SHA.test(approval.headCommit) || approval.headCommit !== workspace.headCommit) {
      reasons.push("Verification requires the approved commit SHA.");
    } else if (reviewableDiffFiles(workspace.diff?.files).length > 0 && approval.headCommit === workspace.baseCommit) {
      reasons.push("Verification requires the commit created from the approved code change, not the baseline.");
    } else if (!(await approvedCommitIsPresent(productId, workspace.workspacePath, approval.headCommit))) {
      reasons.push("The approved commit is not in the product repository.");
    }
  }
  if (!workspace) {
    const approval = await db.codeChangeApproval.findFirst({
      where: { productId, implementationTaskId: taskId, stale: false },
    });
    if (!approval) reasons.push("A human code approval is required before verification.");
  }
  if (!(await productRepositoryReady(productId))) {
    reasons.push(REPOSITORY_NOT_CONFIGURED);
  }
  return reasons;
}

async function approvedCommitIsPresent(productId: string, workspacePath: string, sha: string) {
  if (workspacePath && fs.existsSync(workspacePath) && (await commitExists(workspacePath, sha))) return true;
  try {
    const repository = await resolveProductRepository(productId);
    return commitExists(repository.localPath, sha);
  } catch {
    return false;
  }
}

export async function assertVerificationEntry(productId: string, taskId: string) {
  const reasons = await verificationEntryBlockers(productId, taskId);
  if (reasons.length > 0) throw new DomainError(reasons.join(" "));
}
