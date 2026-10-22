import "server-only";

import { db } from "@/lib/db";
import { runGit } from "@/modules/coding/git";
import { checkInstallationRepository } from "@/modules/source-control/github-account";
import { resolveProductRepository } from "@/modules/source-control/product-repository";
import { assertSafeRef } from "@/modules/source-control/push";
import { DomainError } from "@/modules/shared/errors";

const SHA = /^[0-9a-f]{40}$/i;

export type PublicationSource = {
  directory: string;
  branch: string;
  sha: string;
  destination: string;
  remoteUrl: string;
};

export async function publicationIssues(productId: string, taskId: string) {
  const reasons: string[] = [];
  const task = await db.implementationTask.findFirst({
    where: { id: taskId, plan: { productId } },
    include: {
      workspaces: { orderBy: { createdAt: "desc" }, include: { codeApprovals: true } },
    },
  });
  if (!task) return ["The implementation task was not found."];
  if (task.status !== "COMPLETED") reasons.push("The implementation task is not completed.");
  const workspace = task.workspaces[0];
  if (!workspace) reasons.push("The coding workspace for this task was not found.");
  const sha = workspace?.headCommit ?? "";
  const branch = workspace?.branchName ?? "";
  if (!SHA.test(sha)) reasons.push("Publication requires the approved commit SHA.");
  if (branch) {
    try {
      assertSafeRef(branch);
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : "The branch name is not safe to publish.");
    }
  } else {
    reasons.push("The task branch was not recorded.");
  }

  let repositoryOwner = "";
  let repositoryName = "";
  let repositoryConnection = "";
  let repositoryConnectionMessage = "";
  if (SHA.test(sha) && branch) {
    try {
      const repository = await resolveProductRepository(productId);
      repositoryOwner = repository.record?.owner ?? "";
      repositoryName = repository.record?.repositoryName ?? "";
      repositoryConnection = repository.record?.connectionStatus ?? "";
      repositoryConnectionMessage = repository.record?.connectionMessage ?? "";
      const commit = await runGit(repository.localPath, ["rev-parse", "--verify", `${sha}^{commit}`]);
      if (commit.code !== 0 || commit.stdout.trim().toLowerCase() !== sha.toLowerCase()) {
        reasons.push("The approved commit is not in the product repository.");
      }
      const tip = await runGit(repository.localPath, ["rev-parse", "--verify", `refs/heads/${branch}`]);
      if (tip.code !== 0) reasons.push("The task branch is not in the product repository.");
      else if (tip.stdout.trim().toLowerCase() !== sha.toLowerCase()) {
        reasons.push("The task branch does not point at the approved commit.");
      }
    } catch (error) {
      reasons.push(error instanceof DomainError ? error.message : "The product repository is not valid.");
    }
  }

  const approval = workspace?.codeApprovals.find((item) => !item.stale);
  if (!approval) reasons.push("A current human code approval is required before publication.");
  else if (approval.headCommit.toLowerCase() !== sha.toLowerCase()) {
    reasons.push("The code approval does not match the current commit.");
  }

  const verified = SHA.test(sha)
    ? await db.verificationSession.findFirst({
        where: {
          productId,
          implementationTaskId: taskId,
          commitSha: sha,
          demo: false,
          stale: false,
          overallVerdict: { in: ["PASS", "PASS_WITH_CONCERNS"] },
          approvals: { some: { stale: false, commitSha: sha } },
        },
      })
    : null;
  if (!verified) reasons.push("Independent Verification approval is required for this commit.");

  const connection = await db.sourceControlConnection.findUnique({ where: { id: "factory" } });
  const mapped = Boolean(repositoryOwner && repositoryName);
  if (connection?.status === "CONNECTED" && mapped) {
    const access = await checkInstallationRepository(repositoryOwner, repositoryName);
    if (!access.ok) {
      reasons.push(access.message);
      if (access.persist) {
        await db.repository.update({
          where: { productId },
          data: { connectionStatus: "UNAVAILABLE", connectionMessage: access.message },
        });
      }
    } else if (repositoryConnection !== "CONNECTED" && isInstallationAccessMessage(repositoryConnectionMessage)) {
      repositoryConnection = "CONNECTED";
      await db.repository.update({
        where: { productId },
        data: {
          status: "CONFIGURED",
          connectionStatus: "CONNECTED",
          connectionMessage: "Repository connected. Nothing was created, pushed, or merged.",
        },
      });
    }
  }
  if (!connection || connection.status !== "CONNECTED") {
    reasons.push("The GitHub connection is not valid.");
  } else if (!mapped && !(connection.owner && connection.repositoryName)) {
    reasons.push("The product GitHub repository is not configured.");
  } else if (mapped && repositoryConnection && repositoryConnection !== "CONNECTED" && !reasons.some((reason) => isInstallationAccessMessage(reason))) {
    reasons.push(repositoryConnectionMessage || "The product GitHub repository is not available.");
  }
  return reasons;
}

function isInstallationAccessMessage(message: string) {
  return (
    message.startsWith("The GitHub App installation cannot access this repository.") ||
    message.startsWith("Insufficient permissions. The GitHub App installation cannot push") ||
    message.startsWith("Insufficient permissions. The connection cannot push") ||
    message.startsWith("The AI Product Builder repository cannot be the destination") ||
    message.startsWith("GitHub could not confirm that the installation can still access")
  );
}

export async function resolvePublicationSource(productId: string, taskId: string): Promise<PublicationSource> {
  const issues = await publicationIssues(productId, taskId);
  if (issues.length > 0) throw new DomainError(issues.join(" "));
  const task = await db.implementationTask.findFirst({
    where: { id: taskId, plan: { productId } },
    include: { workspaces: { orderBy: { createdAt: "desc" } } },
  });
  const workspace = task?.workspaces[0];
  const repository = await resolveProductRepository(productId);
  const connection = await db.sourceControlConnection.findUnique({ where: { id: "factory" } });
  if (!workspace || !connection) throw new DomainError("The branch cannot be published.");
  const owner = repository.record?.owner || connection.owner;
  const repositoryName = repository.record?.repositoryName || connection.repositoryName;
  return {
    directory: repository.localPath,
    branch: workspace.branchName,
    sha: workspace.headCommit,
    destination: `${owner}/${repositoryName}`,
    remoteUrl: `https://github.com/${owner}/${repositoryName}.git`,
  };
}
