import "server-only";

import { assessCodingReadiness } from "@/modules/governance/coding-readiness";
import { repositoryRootConfigured } from "@/modules/coding/config";
import { findOccupyingWorkspace, latestPolicy, loadTaskGraph } from "@/modules/coding/repository";
import { DomainError } from "@/modules/shared/errors";

export async function codingEntryBlockers(productId: string, taskId: string) {
  const readiness = await assessCodingReadiness(productId);
  const reasons = [...readiness.blockers];
  const task = await loadTaskGraph(productId, taskId);
  if (!task) {
    reasons.push("The implementation task was not found.");
    return { reasons, task: null, readiness };
  }
  if (task.status !== "APPROVED") {
    reasons.push(
      `The implementation task is ${task.status}. Approve the task before coding.`,
    );
  }
  const risk = task.codingRisks[0];
  if (!risk) {
    reasons.push("This task has no coding-risk assessment.");
  } else {
    const mode = risk.overrideExecutionMode ?? risk.recommendedExecutionMode;
    if (mode === "HUMAN_ONLY") {
      reasons.push("This task is HUMAN_ONLY and cannot be executed by the Coding Agent.");
    }
  }
  const blocked = task.dependencies.filter((dependency) => dependency.dependsOn.status !== "COMPLETED");
  for (const dependency of blocked) {
    reasons.push(`Task is blocked by unresolved dependency ${dependency.dependsOn.title}.`);
  }
  if (!repositoryRootConfigured()) {
    reasons.push("No repository is configured. Set PRODUCT_REPOSITORY_ROOT to a local Git repository.");
  }
  const occupying = await findOccupyingWorkspace(productId);
  if (occupying) {
    reasons.push(
      "A coding workspace is already open for this product. Finish or abandon it before starting another task.",
    );
  }
  return { reasons, task, readiness };
}

export async function assertCodingEntry(productId: string, taskId: string) {
  const gate = await codingEntryBlockers(productId, taskId);
  if (gate.reasons.length > 0) throw new DomainError(gate.reasons.join(" "));
  const policy = await latestPolicy(productId);
  if (!policy) throw new DomainError("Coding Policy is not approved.");
  if (!gate.task) throw new DomainError("The implementation task was not found.");
  return { task: gate.task, policy, readiness: gate.readiness };
}
