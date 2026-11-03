import "server-only";

import fs from "node:fs";
import path from "node:path";

import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";
import { runGit, worktreeRoot } from "@/modules/coding/git";
import { getCurrentActor } from "@/modules/identity/actor";
import { DomainError } from "@/modules/shared/errors";
import { resolveProductRepository } from "@/modules/source-control/product-repository";

const SHA = /^[a-f0-9]{40}$/;
const inside = (root: string, target: string) => {
  const base = path.resolve(root), resolved = path.resolve(target);
  return resolved !== base && resolved.startsWith(base + path.sep);
};

/** Whether a finished task's working copy is gone, so the code cannot be read for review or verification. */
export function workingCopyMissing(workspace: { workspacePath: string }) {
  return !fs.existsSync(/*turbopackIgnore: true*/ workspace.workspacePath);
}

/**
 * Rebuilds the temporary working copy of a finished task from the commit a person approved. No AI is involved and the
 * approved commit is never changed: the copy is checked out detached at exactly that commit, and the result is refused
 * unless it is that commit with nothing else in it. An existing folder is never overwritten.
 */
export async function restoreCodingWorkspace(productId: string, workspaceId: string) {
  const workspace = await db.repositoryWorkspace.findFirst({ where: { id: workspaceId, productId }, include: { codeApprovals: { include: { approval: true } } } });
  if (!workspace) throw new DomainError("The coding workspace was not found.", "NOT_FOUND");
  if (workspace.status !== "COMPLETED") throw new DomainError("Only the working copy of a completed task can be restored.");
  if (!SHA.test(workspace.headCommit)) throw new DomainError("This task has no recorded commit to restore.");
  const approved = workspace.codeApprovals.some((item) => !item.stale && item.headCommit === workspace.headCommit && item.approval.status === "APPROVED");
  if (!approved) throw new DomainError("A current human code approval for this exact commit is required before the working copy is restored.");
  if (!inside(worktreeRoot(), workspace.workspacePath)) throw new DomainError("The recorded working copy is outside the folder the builder manages, so it will not be restored.");
  if (fs.existsSync(/*turbopackIgnore: true*/ workspace.workspacePath)) {
    throw new DomainError("A folder already exists at the recorded location. It was not changed. Remove it yourself if it is stale, then restore again.");
  }
  const repository = await resolveProductRepository(productId);
  const present = await runGit(repository.localPath, ["cat-file", "-t", workspace.headCommit]);
  if (present.code !== 0 || present.stdout.trim() !== "commit") throw new DomainError("The approved commit is not in the product repository, so the working copy cannot be restored.");
  await runGit(repository.localPath, ["worktree", "prune"]);
  fs.mkdirSync(path.dirname(workspace.workspacePath), { recursive: true });
  const added = await runGit(repository.localPath, ["worktree", "add", "--detach", workspace.workspacePath, workspace.headCommit]);
  const head = added.code === 0 ? await runGit(workspace.workspacePath, ["rev-parse", "HEAD"]) : null;
  const status = head ? await runGit(workspace.workspacePath, ["status", "--porcelain", "--untracked-files=all"]) : null;
  if (!head || head.stdout.trim() !== workspace.headCommit || !status || status.code !== 0 || status.stdout.trim()) {
    if (head) await runGit(repository.localPath, ["worktree", "remove", "--force", workspace.workspacePath]);
    throw new DomainError("The working copy could not be restored exactly at the approved commit. Nothing was kept.");
  }
  const actor = getCurrentActor().name;
  await recordActivity({
    productId,
    type: "CODING_WORKSPACE_RESTORED",
    description: `${actor} restored the working copy of a completed task at the approved commit ${workspace.headCommit.slice(0, 7)}.`,
    actor,
  });
  return { workspaceId, path: workspace.workspacePath, commit: workspace.headCommit };
}
