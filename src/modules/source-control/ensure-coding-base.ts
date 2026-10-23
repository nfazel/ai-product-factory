import "server-only";

import { db } from "@/lib/db";
import { DomainError } from "@/modules/shared/errors";
import { SourceControlFailure } from "@/modules/source-control/errors";
import { createGitHubProvider, loadCredentials, resolveInstallationAccess } from "@/modules/source-control/github";
import {
  createIntegrationSyncGit,
  decideIntegrationSync,
  observeIntegrationBranch,
  synchroniseIntegrationBranch,
  type IntegrationSyncResult,
} from "@/modules/source-control/integration-sync";
import { resolveProductRepository } from "@/modules/source-control/product-repository";

export type CodingBasePreparation = IntegrationSyncResult & {
  localPath: string;
  repositoryName: string;
};

/**
 * Resolves the product GitHub integration branch, synchronises when safe, and returns
 * the verified base commit for a new coding worktree.
 */
export async function prepareCodingBase(productId: string): Promise<CodingBasePreparation> {
  const configured = await resolveProductRepository(productId);
  const record = await db.repository.findUnique({ where: { productId } });
  const integrationBranch = (record?.defaultBranch || configured.defaultBranch || "main").trim() || "main";
  const owner = record?.owner?.trim() || "";
  const repository = record?.repositoryName?.trim() || "";
  const githubConfigured = Boolean(owner && repository && (record?.provider === "GITHUB" || record?.connectionStatus === "CONNECTED"));
  const git = createIntegrationSyncGit();

  if (!githubConfigured) {
    const observation = await observeIntegrationBranch({
      cwd: configured.localPath,
      integrationBranch,
      owner,
      repository,
      githubConfigured: false,
      token: null,
      remoteSha: null,
      git,
    });
    const decision = decideIntegrationSync(observation);
    if (decision.action === "stop" || !decision.baseCommit) {
      throw new DomainError(decision.message);
    }
    return {
      status: decision.status,
      message: decision.message,
      integrationBranch,
      baseCommit: decision.baseCommit,
      remoteCommit: "",
      synchronised: false,
      headWasOnIntegrationBranch: observation.headBranch === integrationBranch,
      localPath: configured.localPath,
      repositoryName: configured.name,
    };
  }

  let token: string | null = null;
  let remoteSha: string | null = null;
  let remoteError: "auth" | "missing" | "unavailable" | null = null;
  try {
    const access = await resolveInstallationAccess();
    if (!access?.token) {
      remoteError = "auth";
    } else {
      token = access.token;
      const credentials = await loadCredentials({ owner, repository });
      if (!credentials?.token) {
        remoteError = "auth";
        token = null;
      } else {
        token = credentials.token;
        try {
          const tip = await createGitHubProvider(credentials).getBranchTip(integrationBranch);
          if (!tip) remoteError = "missing";
          else remoteSha = tip;
        } catch (error) {
          if (error instanceof SourceControlFailure && error.kind === "AUTH") remoteError = "auth";
          else if (error instanceof SourceControlFailure && error.kind === "NOT_FOUND") remoteError = "missing";
          else remoteError = "unavailable";
        }
      }
    }
  } catch {
    remoteError = "auth";
    token = null;
  }

  const observation = await observeIntegrationBranch({
    cwd: configured.localPath,
    integrationBranch,
    owner,
    repository,
    githubConfigured: true,
    token,
    remoteSha,
    remoteError,
    git,
  });
  const decision = decideIntegrationSync(observation);
  if (decision.action === "stop" || !decision.baseCommit) {
    throw new DomainError(decision.message);
  }
  if (decision.action === "none") {
    return {
      status: decision.status,
      message: decision.message,
      integrationBranch,
      baseCommit: decision.baseCommit,
      remoteCommit: remoteSha?.toLowerCase() || decision.baseCommit,
      synchronised: false,
      headWasOnIntegrationBranch: observation.headBranch === integrationBranch,
      localPath: configured.localPath,
      repositoryName: configured.name,
    };
  }
  if (!token || !remoteSha) {
    throw new DomainError(decision.message || "GitHub authentication failed while reading the product integration branch. Nothing was changed locally.");
  }
  const synced = await synchroniseIntegrationBranch({
    cwd: configured.localPath,
    integrationBranch,
    owner,
    repository,
    token,
    remoteSha,
    git,
  });
  return {
    ...synced,
    localPath: configured.localPath,
    repositoryName: configured.name,
  };
}

export async function describeCodingBase(productId: string): Promise<{
  integrationBranch: string;
  localCommit: string;
  remoteCommit: string;
  status: string;
  message: string;
  githubConfigured: boolean;
} | null> {
  const record = await db.repository.findUnique({ where: { productId } });
  if (!record?.localPath.trim()) return null;
  let configured;
  try {
    configured = await resolveProductRepository(productId);
  } catch {
    return null;
  }
  const integrationBranch = (record.defaultBranch || configured.defaultBranch || "main").trim() || "main";
  const owner = record.owner.trim();
  const repository = record.repositoryName.trim();
  const githubConfigured = Boolean(owner && repository && (record.provider === "GITHUB" || record.connectionStatus === "CONNECTED"));
  const git = createIntegrationSyncGit();
  let remoteSha = "";
  let remoteError: "auth" | "missing" | "unavailable" | null = null;
  let token: string | null = null;
  if (githubConfigured) {
    try {
      const access = await resolveInstallationAccess();
      token = access?.token ?? null;
      if (!token) remoteError = "auth";
      else {
        const credentials = await loadCredentials({ owner, repository });
        if (!credentials?.token) {
          remoteError = "auth";
          token = null;
        } else {
          token = credentials.token;
          try {
            remoteSha = (await createGitHubProvider(credentials).getBranchTip(integrationBranch)) ?? "";
            if (!remoteSha) remoteError = "missing";
          } catch (error) {
            if (error instanceof SourceControlFailure && error.kind === "AUTH") remoteError = "auth";
            else if (error instanceof SourceControlFailure && error.kind === "NOT_FOUND") remoteError = "missing";
            else remoteError = "unavailable";
          }
        }
      }
    } catch {
      remoteError = "auth";
    }
  }
  const observation = await observeIntegrationBranch({
    cwd: configured.localPath,
    integrationBranch,
    owner,
    repository,
    githubConfigured,
    token,
    remoteSha: remoteSha || null,
    remoteError,
    git,
  });
  const decision = decideIntegrationSync(observation);
  return {
    integrationBranch,
    localCommit: observation.localSha,
    remoteCommit: observation.remoteSha,
    status: decision.status,
    message: decision.message,
    githubConfigured,
  };
}
