import "server-only";

import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";
import { factoryRoot } from "@/modules/coding/config";
import { runGit } from "@/modules/coding/git";
import { SourceControlFailure } from "@/modules/source-control/errors";
import {
  githubAppConfigured,
  githubRequest,
  installationContentsCanPush,
  resolveGitHubAccessToken,
  resolveInstallationAccess,
  type GitHubAccess,
  type InstallationPermissions,
} from "@/modules/source-control/github";
import { assertGitHubActor } from "@/modules/source-control/github-credentials";
import { resolveProductRepository } from "@/modules/source-control/product-repository";
import { redactSecrets } from "@/modules/source-control/redact";
import { DomainError } from "@/modules/shared/errors";

export type RepositoryAccess = {
  url: string;
  defaultBranch: string;
  canPush: boolean;
  empty: boolean;
  headSha: string;
};

export type InstallationRepository = { owner: string; name: string; canPush: boolean };

export type InstallationDirectory = {
  list(input: { installationId: string }): Promise<InstallationRepository[]>;
};

export type GitHubAccountClient = {
  identify(access: GitHubAccess): Promise<{ login: string }>;
  repositoryAccess(access: GitHubAccess, owner: string, name: string): Promise<RepositoryAccess>;
};

export const INSTALLATION_INACCESSIBLE =
  "The GitHub App installation cannot access this repository. Update the installation's repository access in GitHub, then choose the repository again. Nothing was published.";
export const INSTALLATION_PERMISSION =
  "Insufficient permissions. The GitHub App installation cannot push to this repository. Nothing was published.";
export const INSTALLATION_UNCONFIRMED =
  "GitHub could not confirm that the installation can still access this repository. Nothing was published.";

const FACTORY_REPOSITORY = "The AI Product Builder repository cannot be the destination for a generated product.";

const SHA = /^[0-9a-f]{40}$/i;

let clientOverride: GitHubAccountClient | null = null;
let directoryOverride: InstallationDirectory | null = null;

export function setGitHubAccountClientForTests(client: GitHubAccountClient | null) {
  clientOverride = client;
}

export function setInstallationDirectoryForTests(directory: InstallationDirectory | null) {
  directoryOverride = directory;
}

function accountClient() {
  return clientOverride ?? defaultClient;
}

export async function validateGitHubIdentity(actor: string) {
  assertGitHubActor(actor);
  const access = await resolveGitHubAccessToken();
  if (!access) throw new DomainError("GitHub is not configured. Save a credential before validating.");
  try {
    const identity = await accountClient().identify(access);
    const login = identity.login.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(login)) {
      throw new SourceControlFailure("GitHub authentication failed.", "AUTH");
    }
    await db.sourceControlConnection.upsert({
      where: { id: "factory" },
      create: {
        id: "factory",
        provider: "GITHUB",
        login,
        status: "CONNECTED",
        message: `Connected as ${login}. Choose a repository for each product.`,
        checkedAt: new Date(),
      },
      update: {
        login,
        status: "CONNECTED",
        message: `Connected as ${login}. Choose a repository for each product.`,
        checkedAt: new Date(),
      },
    });
    return { login };
  } catch (error) {
    const failure = connectionFailure(error);
    await rememberConnectionFailure(failure.message, failure.status);
    throw new DomainError(failure.message);
  }
}

export async function listInstallationRepositories(actor: string) {
  assertGitHubActor(actor);
  if (!(await githubAppActive())) {
    throw new DomainError("Repository selection uses the GitHub App installation. Save the GitHub App under Settings.");
  }
  return readInstallationRepositories();
}

export async function loadInstallationRepositoryChoices() {
  const method = await authenticationMethod();
  if (method !== "APP") return { method, repositories: [] as InstallationRepository[], error: "" };
  try {
    const repositories = await readInstallationRepositories();
    const factory = await factoryGitHubRepository();
    return {
      method,
      repositories: repositories.filter((repository) => !sameRepository(repository, factory)),
      error: "",
    };
  } catch (error) {
    return {
      method,
      repositories: [] as InstallationRepository[],
      error: error instanceof DomainError ? error.message : "GitHub could not list the installation repositories.",
    };
  }
}

export async function checkInstallationRepository(owner: string, name: string): Promise<
  { ok: true } | { ok: false; message: string; persist: boolean }
> {
  if (!(await githubAppActive()) || !owner || !name) return { ok: true };
  if (await isFactoryGitHubRepository(owner, name)) {
    return { ok: false, persist: true, message: `${FACTORY_REPOSITORY} Nothing was published.` };
  }
  try {
    const match = findRepository(await readInstallationRepositories(), owner, name);
    if (!match) return { ok: false, persist: true, message: INSTALLATION_INACCESSIBLE };
    if (!match.canPush) return { ok: false, persist: true, message: INSTALLATION_PERMISSION };
    return { ok: true };
  } catch {
    return { ok: false, persist: false, message: INSTALLATION_UNCONFIRMED };
  }
}

export async function revalidateProductRepositoryAccess(productId: string) {
  const row = await db.repository.findUnique({ where: { productId } });
  if (!row?.owner || !row.repositoryName || !(await githubAppActive())) {
    return { connectionStatus: row?.connectionStatus ?? "UNAVAILABLE", status: row?.status ?? "UNAVAILABLE" };
  }
  const access = await checkInstallationRepository(row.owner, row.repositoryName);
  if (!access.ok) {
    if (access.persist) {
      await db.repository.update({
        where: { productId },
        data: { connectionStatus: "UNAVAILABLE", connectionMessage: access.message },
      });
    }
    const current = await db.repository.findUnique({ where: { productId } });
    return { connectionStatus: current?.connectionStatus ?? row.connectionStatus, status: current?.status ?? row.status };
  }
  if (row.connectionStatus === "CONNECTED" || !recoverableInstallationMessage(row.connectionMessage)) {
    return { connectionStatus: row.connectionStatus, status: row.status };
  }
  const saved = await db.repository.update({
    where: { productId },
    data: {
      status: "CONFIGURED",
      connectionStatus: "CONNECTED",
      connectionMessage: "Repository connected. Nothing was created, pushed, or merged.",
    },
  });
  return { connectionStatus: saved.connectionStatus, status: saved.status };
}

function recoverableInstallationMessage(message: string) {
  return (
    message.startsWith("Insufficient permissions. The GitHub App installation cannot push") ||
    message.startsWith("Insufficient permissions. The connection cannot push")
  );
}

export async function assignProductRepository(input: {
  productId: string;
  owner: string;
  repositoryName: string;
  actor: string;
}) {
  assertGitHubActor(input.actor);
  const owner = input.owner.trim();
  const repositoryName = input.repositoryName.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repositoryName) || repositoryName.includes("..")) {
    throw new DomainError("Enter the repository owner and name. Nothing was changed.");
  }
  const local = await resolveProductRepository(input.productId);
  if (!local.record) throw new DomainError("Set up the local product repository before choosing a GitHub repository.");
  const connection = await db.sourceControlConnection.findUnique({ where: { id: "factory" } });
  if (!connection || connection.status !== "CONNECTED") {
    throw new DomainError("Connect GitHub under Settings before choosing a product repository.");
  }
  if (await isFactoryGitHubRepository(owner, repositoryName)) {
    throw new DomainError(`${FACTORY_REPOSITORY} Nothing was changed.`);
  }
  if (!(await githubAppActive())) {
    throw new DomainError("Repository selection uses the GitHub App installation. Save the GitHub App under Settings. Nothing was changed.");
  }
  let repositories: InstallationRepository[];
  try {
    repositories = await readInstallationRepositories();
  } catch (error) {
    if (error instanceof DomainError) throw new DomainError(`${error.message} Nothing was changed.`);
    throw new DomainError("GitHub could not list the installation repositories. Nothing was changed.");
  }
  const match = findRepository(repositories, owner, repositoryName);
  if (!match) {
    throw new DomainError("This repository is not accessible to the GitHub App installation. Nothing was changed.");
  }
  if (!match.canPush) {
    await rememberRepository(
      input.productId,
      owner,
      repositoryName,
      "",
      "",
      "MISCONFIGURED",
      "Insufficient permissions. The GitHub App installation cannot push to this repository.",
    );
    throw new DomainError("Insufficient permissions. The GitHub App installation cannot push to this repository. Nothing was published.");
  }
  const access = await currentInstallationAccess();
  if (!access) throw new DomainError("The GitHub App installation is not available. Nothing was changed.");
  let remote: RepositoryAccess;
  try {
    remote = await accountClient().repositoryAccess(access, owner, repositoryName);
  } catch (error) {
    const failure = connectionFailure(error);
    if (failure.message === "Invalid credentials.") {
      await rememberConnectionFailure(failure.message, failure.status);
      throw new DomainError("Invalid credentials. Nothing was published.");
    }
    if (failure.kind === "NOT_FOUND") {
      await rememberRepository(input.productId, owner, repositoryName, "", "", "UNAVAILABLE", "Repository inaccessible.");
      throw new DomainError("Repository inaccessible. Nothing was published.");
    }
    if (failure.message === "Insufficient permissions.") {
      await rememberRepository(
        input.productId,
        owner,
        repositoryName,
        "",
        "",
        "MISCONFIGURED",
        "Insufficient permissions. The connection cannot push to this repository.",
      );
      throw new DomainError("Insufficient permissions. The connection cannot push to this repository. Nothing was published.");
    }
    throw new DomainError("GitHub is unavailable. Nothing was published.");
  }
  if (!remote.canPush) {
    await rememberRepository(
      input.productId,
      owner,
      repositoryName,
      remote.url,
      remote.defaultBranch,
      "MISCONFIGURED",
      "Insufficient permissions. The connection cannot push to this repository.",
    );
    throw new DomainError("Insufficient permissions. The connection cannot push to this repository. Nothing was published.");
  }
  const conflict = await remoteHistoryConflict(local.localPath, remote);
  const message = conflict ?? "Repository connected. Nothing was created, pushed, or merged.";
  await rememberRepository(
    input.productId,
    owner,
    repositoryName,
    remote.url,
    remote.defaultBranch || local.defaultBranch,
    conflict ? "MISCONFIGURED" : "CONNECTED",
    message,
  );
  await recordActivity({
    productId: input.productId,
    type: "GITHUB_CONNECTED",
    description: redactSecrets(`${input.actor} associated ${owner}/${repositoryName}. Nothing was created or published.`),
    actor: input.actor,
  });
  return { owner, repositoryName, conflict: Boolean(conflict), message };
}

async function rememberRepository(
  productId: string,
  owner: string,
  repositoryName: string,
  repositoryUrl: string,
  defaultBranch: string,
  connectionStatus: "CONNECTED" | "MISCONFIGURED" | "UNAVAILABLE",
  connectionMessage: string,
) {
  await db.repository.update({
    where: { productId },
    data: {
      provider: "GITHUB",
      owner,
      repositoryName,
      repositoryUrl,
      ...(defaultBranch ? { defaultBranch } : {}),
      connectionStatus,
      connectionMessage: redactSecrets(connectionMessage),
    },
  });
}

async function remoteHistoryConflict(localPath: string, remote: RepositoryAccess) {
  if (remote.empty || !remote.headSha) return null;
  if (!SHA.test(remote.headSha)) {
    return "The remote repository has history that could not be compared. Publishing will not overwrite it.";
  }
  const known = await runGit(localPath, ["cat-file", "-e", `${remote.headSha}^{commit}`]);
  if (known.code === 0) return null;
  return "The remote repository already contains commits that are not in the local product history. Publishing will not overwrite that history.";
}

async function rememberConnectionFailure(message: string, status: "UNAVAILABLE" | "MISCONFIGURED") {
  await db.sourceControlConnection.upsert({
    where: { id: "factory" },
    create: {
      id: "factory",
      provider: "GITHUB",
      login: "",
      status,
      message,
      checkedAt: new Date(),
    },
    update: { login: "", status, message, checkedAt: new Date() },
  });
}

function connectionFailure(error: unknown) {
  if (error instanceof SourceControlFailure) {
    if (error.kind === "AUTH") return { message: "Invalid credentials.", status: "UNAVAILABLE" as const, kind: error.kind };
    if (error.kind === "PERMISSION") return { message: "Insufficient permissions.", status: "MISCONFIGURED" as const, kind: error.kind };
    if (error.kind === "NOT_FOUND") return { message: "Repository inaccessible.", status: "MISCONFIGURED" as const, kind: error.kind };
    return { message: "GitHub is unavailable.", status: "UNAVAILABLE" as const, kind: error.kind };
  }
  if (error instanceof DomainError) return { message: error.message, status: "UNAVAILABLE" as const, kind: "UNAVAILABLE" as const };
  return { message: "GitHub is unavailable.", status: "UNAVAILABLE" as const, kind: "UNAVAILABLE" as const };
}

const defaultClient: GitHubAccountClient = {
  async identify(access) {
    if (access.mode === "app" && access.app) {
      const { createAppJwt } = await import("@/modules/source-control/github");
      const jwt = await createAppJwt(access.app);
      const response = await githubRequest(`/app/installations/${access.app.installationId}`, jwt);
      const body = (await response.json()) as { account?: { login?: string } };
      if (!body.account?.login) throw new SourceControlFailure("GitHub authentication failed.", "AUTH");
      return { login: body.account.login };
    }
    const response = await githubRequest("/user", access.token);
    const body = (await response.json()) as { login?: string };
    if (!body.login) throw new SourceControlFailure("GitHub authentication failed.", "AUTH");
    return { login: body.login };
  },
  async repositoryAccess(access, owner, name) {
    const response = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, access.token);
    const body = (await response.json()) as {
      html_url?: string;
      default_branch?: string;
      permissions?: { push?: boolean };
      size?: number;
    };
    const defaultBranch = body.default_branch || "main";
    const head = body.size === 0 ? { empty: true, headSha: "" } : await remoteHead(access.token, owner, name, defaultBranch);
    return {
      url: body.html_url || `https://github.com/${owner}/${name}`,
      defaultBranch,
      canPush: access.mode === "app" ? installationContentsCanPush(access.permissions) : Boolean(body.permissions?.push),
      empty: head.empty,
      headSha: head.headSha,
    };
  },
};

export function assertInstallationRepositoryPath(path: string) {
  const pathname = path.split("?")[0];
  if (pathname !== "/installation/repositories") {
    throw new DomainError("Repository discovery only uses the GitHub App installation.");
  }
}

export function installationRepositoriesFrom(body: unknown, permissions: InstallationPermissions | null | undefined): InstallationRepository[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DomainError("Repository discovery only uses the GitHub App installation.");
  }
  const repositories = (body as { repositories?: unknown }).repositories;
  if (!Array.isArray(repositories)) return [];
  const canPush = installationContentsCanPush(permissions);
  return repositories.flatMap((item) => {
    const row = item as { full_name?: string };
    const parts = (row.full_name ?? "").split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return [];
    return [{ owner: parts[0], name: parts[1], canPush }];
  });
}

export function nextInstallationPage(link: string | null) {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (!match) continue;
    try {
      const url = new URL(match[1]);
      if (url.origin !== "https://api.github.com") return null;
      const path = `${url.pathname}${url.search}`;
      assertInstallationRepositoryPath(path);
      return path;
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchInstallationRepositories(token: string, permissions: InstallationPermissions | null) {
  const collected: InstallationRepository[] = [];
  const seen = new Set<string>();
  let path: string | null = "/installation/repositories?per_page=100";
  while (path && seen.size < 10) {
    if (seen.has(path)) break;
    seen.add(path);
    assertInstallationRepositoryPath(path);
    const response = await githubRequest(path, token);
    collected.push(...installationRepositoriesFrom(await response.json(), permissions));
    path = nextInstallationPage(response.headers.get("link"));
  }
  return collected;
}

async function readInstallationRepositories() {
  const installationId = await installationIdForDiscovery();
  if (!installationId) {
    throw new DomainError("Repository selection uses the GitHub App installation. Save the GitHub App under Settings.");
  }
  if (directoryOverride) return directoryOverride.list({ installationId });
  const material = await resolveInstallationAccess();
  if (!material?.app || material.app.installationId !== installationId) {
    throw new DomainError("Repository selection uses the GitHub App installation. Save the GitHub App under Settings.");
  }
  return fetchInstallationRepositories(material.token, material.permissions);
}

async function currentInstallationAccess(): Promise<GitHubAccess | null> {
  if (directoryOverride) {
    const installationId = await installationIdForDiscovery();
    if (!installationId) return null;
    return {
      token: "installation",
      mode: "app",
      app: { appId: "0", installationId, privateKey: "" },
      permissions: { contents: "write" },
    };
  }
  return resolveInstallationAccess();
}

export async function githubAppActive() {
  if (githubAppConfigured()) return true;
  const row = await db.sourceControlConnection.findUnique({ where: { id: "factory" }, select: { authMode: true } });
  return row?.authMode === "APP";
}

async function authenticationMethod(): Promise<"APP" | "TOKEN" | "NONE"> {
  if (await githubAppActive()) return "APP";
  const row = await db.sourceControlConnection.findUnique({ where: { id: "factory" }, select: { authMode: true } });
  return row?.authMode === "TOKEN" ? "TOKEN" : "NONE";
}

async function installationIdForDiscovery() {
  const material = await resolveInstallationAccessMaterial();
  if (material) return material;
  const row = await db.sourceControlConnection.findUnique({
    where: { id: "factory" },
    select: { authMode: true, installationId: true },
  });
  if (row?.authMode === "APP" && row.installationId.trim()) return row.installationId.trim();
  return "";
}

async function resolveInstallationAccessMaterial() {
  const { resolveAppMaterial } = await import("@/modules/source-control/github");
  const material = await resolveAppMaterial();
  return material?.installationId.trim() ?? "";
}

function findRepository(repositories: InstallationRepository[], owner: string, name: string) {
  return repositories.find((repository) => sameRepository(repository, { owner, name }));
}

function sameRepository(
  repository: { owner: string; name: string },
  other: { owner: string; name: string } | null,
) {
  if (!other) return false;
  return repository.owner.toLowerCase() === other.owner.toLowerCase() && repository.name.toLowerCase() === other.name.toLowerCase();
}

export function parseGitHubRemote(url: string) {
  const match = url.trim().replace(/\.git$/i, "").match(/github\.com[:/]([^/]+)\/([^/]+)$/i);
  if (!match) return null;
  return { owner: match[1], name: match[2] };
}

async function factoryGitHubRepository() {
  const remote = await runGit(factoryRoot(), ["remote", "get-url", "origin"]);
  if (remote.code !== 0) return null;
  return parseGitHubRemote(remote.stdout.trim());
}

async function isFactoryGitHubRepository(owner: string, name: string) {
  return sameRepository({ owner, name }, await factoryGitHubRepository());
}

async function remoteHead(token: string, owner: string, name: string, branch: string) {
  let response: Response;
  try {
    response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits?sha=${encodeURIComponent(branch)}&per_page=1`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ai-product-factory",
        },
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch {
    throw new SourceControlFailure("GitHub is unavailable.", "UNAVAILABLE");
  }
  if (response.status === 409) return { empty: true, headSha: "" };
  if (response.status === 401) throw new SourceControlFailure("GitHub authentication failed.", "AUTH");
  if (response.status === 403) throw new SourceControlFailure("GitHub denied access to the repository.", "PERMISSION");
  if (response.status === 404) throw new SourceControlFailure("The configured repository was not found.", "NOT_FOUND");
  if (!response.ok) throw new SourceControlFailure("GitHub is unavailable.", "UNAVAILABLE");
  const body = (await response.json()) as { sha?: string }[];
  return { empty: false, headSha: body[0]?.sha ?? "" };
}
