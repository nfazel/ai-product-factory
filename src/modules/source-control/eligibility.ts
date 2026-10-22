import { runGit } from "@/modules/coding/git";
import { db } from "@/lib/db";
import { publicationIssues } from "@/modules/source-control/publication";

export async function pushBlockers(productId: string, taskId: string) {
  const reasons: string[] = [];
  const task = await db.implementationTask.findFirst({
    where: { id: taskId, plan: { productId } },
    include: {
      workspaces: { orderBy: { createdAt: "desc" }, include: { contract: true, escalations: true } },
    },
  });
  if (!task) return ["The implementation task was not found."];
  const workspace = task.workspaces[0];
  if (workspace?.executionContractStale || workspace?.contract?.stale) {
    reasons.push("The execution contract is stale. Publication cannot start.");
  }
  if (workspace?.escalations.some((item) => item.status === "OPEN")) {
    reasons.push("An unresolved coding escalation blocks publication.");
  }
  const review = await db.engineeringGovernanceReview.findFirst({
    where: { productId },
    orderBy: { createdAt: "desc" },
  });
  const governanceApproval = await db.approval.findFirst({
    where: { productId, approvalType: "ENGINEERING_GOVERNANCE", status: "APPROVED" },
  });
  if (!review || review.status !== "APPROVED" || review.reviewRequired || !governanceApproval) {
    reasons.push("Engineering Governance is not current.");
  }
  const policy = await db.codingPolicy.findFirst({
    where: { productId },
    orderBy: { createdAt: "desc" },
    include: { review: true },
  });
  const policyApproval = await db.approval.findFirst({
    where: { productId, approvalType: "CODING_POLICY", status: "APPROVED" },
  });
  if (!policy || policy.reapprovalRequired || policy.review.status !== "APPROVED" || !policyApproval) {
    reasons.push("Coding Policy is not current.");
  }
  reasons.push(...(await publicationIssues(productId, taskId)));
  return reasons;
}

export async function localRemoteUrl(directory: string) {
  if (!directory) return "";
  const result = await runGit(directory, ["remote", "get-url", "origin"]);
  return result.code === 0 ? result.stdout.trim() : "";
}

export function githubRemoteMatches(localUrl: string, owner: string, repository: string) {
  const value = localUrl.trim().replace(/\.git$/i, "").toLowerCase();
  const pair = `${owner}/${repository}`.toLowerCase();
  return value === `https://github.com/${pair}` || value === `git@github.com:${pair}`;
}

export async function commitIsDescendant(cwd: string, ancestor: string, descendant: string) {
  const result = await runGit(cwd, ["merge-base", "--is-ancestor", ancestor, descendant]);
  return result.code === 0;
}
