import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";
import {
  factoryRoot,
  pathsOverlap,
  resolveConfiguredRepository,
} from "@/modules/coding/config";
import { commitWorkspace, inspectGitRepository, runGit } from "@/modules/coding/git";
import { getCurrentActor } from "@/modules/identity/actor";
import { createInstallationRepository, githubAppConfigured } from "@/modules/source-control/github";
import { readStoredGitHubAccess } from "@/modules/source-control/github-credentials";
import { SourceControlFailure } from "@/modules/source-control/errors";
import { DomainError } from "@/modules/shared/errors";

export const REPOSITORY_NOT_CONFIGURED =
  "This product does not have a repository yet. Set up the product repository before starting Coding.";

const BASELINE_README = (name: string) =>
  `# ${name}\n\nLocal product repository created by AI Product Builder.\n\nThis baseline is a README and a gitignore. Generated application code is not committed to the default branch by repository setup.\n`;

const BASELINE_GITIGNORE = "node_modules/\n.env\n.env.*\n!.env.example\n";

function assertOutsideFactory(candidate: string) {
  const resolved = fs.existsSync(candidate) ? fs.realpathSync(candidate) : path.resolve(candidate);
  if (pathsOverlap(resolved, factoryRoot())) {
    throw new DomainError("A product repository cannot be the AI Product Builder source repository.");
  }
  return resolved;
}

export function assertSafeRepositoryPath(candidate: string) {
  const trimmed = candidate.trim();
  if (!trimmed || !path.isAbsolute(trimmed)) {
    throw new DomainError("Choose an absolute path to a Git repository on this machine.");
  }
  if (trimmed.includes("\0") || trimmed.split(/[/\\]/).includes("..")) {
    throw new DomainError("That repository path is not allowed.");
  }
  if (!fs.existsSync(trimmed)) {
    throw new DomainError("That folder was not found.");
  }
  return assertOutsideFactory(trimmed);
}

export function productRepositoryDirectory(productId: string) {
  if (!/^[a-z0-9]+$/i.test(productId)) {
    throw new DomainError("The product identifier cannot be used as a directory name.");
  }
  const configured = process.env.PRODUCT_WORKSPACE_ROOT?.trim();
  let root = path.resolve(configured || path.join(os.homedir(), ".ai-product-factory", "products"));
  if (root.split(/[/\\]/).includes("..")) {
    throw new DomainError("The product workspace location is not allowed.");
  }
  if (fs.existsSync(root)) root = fs.realpathSync(root);
  assertOutsideFactory(root);
  const target = path.resolve(root, productId);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new DomainError("The product workspace location is not allowed.");
  }
  assertOutsideFactory(target);
  return target;
}

async function usableGit(directory: string) {
  const safe = assertSafeRepositoryPath(directory);
  const git = await inspectGitRepository(safe);
  assertOutsideFactory(git.topLevel);
  if (!git.branch || git.branch === "HEAD") {
    throw new DomainError("The repository branch could not be resolved.");
  }
  if (!/^[0-9a-f]{40}$/.test(git.head)) {
    throw new DomainError("The repository has no commit the Coding Agent can use.");
  }
  return git;
}

export async function resolveProductRepository(productId: string) {
  const row = await db.repository.findUnique({ where: { productId } });
  if (row?.status === "CONFIGURED" && row.localPath.trim()) {
    const git = await usableGit(row.localPath);
    return {
      localPath: git.topLevel,
      defaultBranch: row.defaultBranch || git.branch,
      head: git.head,
      name: row.name || path.basename(git.topLevel),
      source: "product" as const,
      record: row,
    };
  }
  if (row) throw new DomainError(REPOSITORY_NOT_CONFIGURED);
  try {
    const legacy = await resolveConfiguredRepository();
    return { ...legacy, source: "legacy" as const, record: null };
  } catch (error) {
    if (error instanceof Error && /AI Product Factory source/.test(error.message)) {
      throw new DomainError(error.message);
    }
    throw new DomainError(REPOSITORY_NOT_CONFIGURED);
  }
}

export async function productRepositoryReady(productId: string) {
  try {
    await resolveProductRepository(productId);
    return true;
  } catch {
    return false;
  }
}

export function repositoryNameFrom(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "product";
}

export async function initializeGreenfieldRepository(productId: string) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new DomainError("The product was not found.", "NOT_FOUND");
  if (product.developmentContext === "EXISTING_SYSTEM") {
    throw new DomainError("Connect the existing repository for this product.");
  }
  if (product.developmentContext !== "GREENFIELD") {
    throw new DomainError("Choose whether this is a new application before setting up a repository.");
  }
  const existing = await db.repository.findUnique({ where: { productId } });
  if (existing?.status === "CONFIGURED" && existing.localPath && fs.existsSync(path.join(existing.localPath, ".git"))) {
    await usableGit(existing.localPath);
    return existing;
  }
  const directory = productRepositoryDirectory(productId);
  fs.mkdirSync(directory, { recursive: true });
  const createdNow = !fs.existsSync(path.join(directory, ".git"));
  if (createdNow) {
    const entries = fs.readdirSync(directory);
    if (entries.length > 0) {
      throw new DomainError("The product workspace already contains files and is not a Git repository.");
    }
    const init = await runGit(directory, ["init", "-b", "main"]);
    if (init.code !== 0) throw new DomainError("The local repository could not be initialised.");
    fs.writeFileSync(path.join(directory, "README.md"), BASELINE_README(product.name));
    fs.writeFileSync(path.join(directory, ".gitignore"), BASELINE_GITIGNORE);
    await commitWorkspace(
      directory,
      "Initial product repository baseline.\n\nREADME and gitignore only. Application code is not included.",
    );
  }
  const git = await usableGit(directory);
  const saved = await db.repository.upsert({
    where: { productId },
    create: {
      productId,
      name: product.name,
      provider: "LOCAL",
      localPath: git.topLevel,
      defaultBranch: "main",
      status: "CONFIGURED",
      connectionStatus: "UNAVAILABLE",
      connectionMessage: "Local repository is ready. No remote repository is connected.",
    },
    update: {
      name: product.name,
      provider: existing?.provider === "GITHUB" ? "GITHUB" : "LOCAL",
      localPath: git.topLevel,
      defaultBranch: existing?.defaultBranch || "main",
      status: "CONFIGURED",
      connectionMessage: existing?.connectionMessage || "Local repository is ready. No remote repository is connected.",
    },
  });
  if (createdNow) {
    await recordActivity({
      productId,
      type: "REPOSITORY_INITIALISED",
      description: `${getCurrentActor().name} initialised the local product repository on branch main. No remote repository was created and no code was published.`,
      actor: getCurrentActor().name,
    });
  }
  return saved;
}

export async function connectExistingRepository(productId: string, localPath: string) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new DomainError("The product was not found.", "NOT_FOUND");
  if (product.developmentContext !== "EXISTING_SYSTEM") {
    throw new DomainError("Connecting an existing repository is for an existing application.");
  }
  const git = await usableGit(localPath);
  const saved = await db.repository.upsert({
    where: { productId },
    create: {
      productId,
      name: path.basename(git.topLevel),
      provider: "LOCAL",
      localPath: git.topLevel,
      defaultBranch: git.branch,
      status: "CONFIGURED",
      connectionStatus: "UNAVAILABLE",
      connectionMessage: "Existing local repository connected. No remote repository is connected.",
    },
    update: {
      name: path.basename(git.topLevel),
      localPath: git.topLevel,
      defaultBranch: git.branch,
      status: "CONFIGURED",
      connectionMessage: "Existing local repository connected.",
    },
  });
  await recordActivity({
    productId,
    type: "REPOSITORY_CONNECTED",
    description: `${getCurrentActor().name} connected an existing local Git repository on branch ${git.branch}.`,
    actor: getCurrentActor().name,
  });
  return saved;
}

export async function createRemoteRepository(
  productId: string,
  input: { name: string; visibility: "private" | "public"; defaultBranch: string; confirmed: boolean },
) {
  if (!input.confirmed) {
    throw new DomainError("Creating a GitHub repository needs explicit confirmation. Generated code is not published by this action.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(input.name) || input.name === "." || input.name === "..") {
    throw new DomainError("Choose a repository name using letters, numbers, dots, underscores, or hyphens.");
  }
  const local = await resolveProductRepository(productId);
  if (!local.record) {
    throw new DomainError("Set up the local product repository before creating a remote repository.");
  }
  if (local.record.provider === "GITHUB" && local.record.repositoryName && local.record.connectionStatus === "CONNECTED") {
    throw new DomainError("A remote repository is already connected. This action does not publish code.");
  }
  const stored = await readStoredGitHubAccess();
  if (!githubAppConfigured() && stored?.mode !== "app") {
    throw new DomainError(
      "Creating a repository needs a GitHub App. Connect the App under Settings. A personal access token can use an existing repository. Nothing was created.",
    );
  }
  const connection = await db.sourceControlConnection.findUnique({ where: { id: "factory" } });
  const owner = process.env.GITHUB_OWNER?.trim() || connection?.login || "";
  if (!owner || owner.includes("..") || owner.includes("/")) {
    throw new DomainError("Validate the GitHub App connection before creating a repository. Nothing was created.");
  }
  let created: { fullName: string; url: string; defaultBranch: string };
  try {
    created = await createInstallationRepository({
      owner,
      name: input.name,
      isPrivate: input.visibility !== "public",
    });
  } catch (error) {
    if (error instanceof SourceControlFailure) {
      throw new DomainError(
        error.kind === "REJECTED"
          ? "GitHub rejected the repository name. Choose a different name. No code was published."
          : `${error.message} No code was published.`,
      );
    }
    throw new DomainError("GitHub is unavailable. No code was published.");
  }
  const [remoteOwner, remoteName] = created.fullName.split("/");
  const branch = created.defaultBranch || input.defaultBranch || "main";
  const saved = await db.repository.update({
    where: { productId },
    data: {
      provider: "GITHUB",
      owner: remoteOwner || owner,
      repositoryName: remoteName || input.name,
      repositoryUrl: created.url,
      defaultBranch: branch,
      installationId: process.env.GITHUB_APP_INSTALLATION_ID?.trim() || (stored?.mode === "app" ? stored.installationId : ""),
      connectionStatus: "CONNECTED",
      connectionMessage: "Remote repository created. Generated code has not been published.",
    },
  });
  const remote = await runGit(local.localPath, ["remote"]);
  if (remote.code === 0 && !remote.stdout.split("\n").includes("origin")) {
    await runGit(local.localPath, ["remote", "add", "origin", created.url]);
  }
  await recordActivity({
    productId,
    type: "REMOTE_REPOSITORY_CREATED",
    description: `${getCurrentActor().name} created GitHub repository ${created.fullName} (${input.visibility}). Generated code was not published.`,
    actor: getCurrentActor().name,
  });
  return saved;
}

export async function getProductRepositoryView(productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, developmentContext: true },
  });
  if (!product) return null;
  const row = await db.repository.findUnique({ where: { productId } });
  let gitInitialised = false;
  if (row?.status === "CONFIGURED" && row.localPath) {
    try {
      const git = await usableGit(row.localPath);
      gitInitialised = /^[0-9a-f]{40}$/.test(git.head);
    } catch {
      gitInitialised = false;
    }
  }
  const remote = row?.owner && row.repositoryName ? `${row.owner}/${row.repositoryName}` : "";
  const connection = await db.sourceControlConnection.findUnique({ where: { id: "factory" } });
  const stored = await readStoredGitHubAccess();
  return {
    developmentContext: product.developmentContext,
    typeLabel:
      product.developmentContext === "EXISTING_SYSTEM"
        ? "Existing application"
        : product.developmentContext === "GREENFIELD"
          ? "New application"
          : "Not chosen",
    localLabel: gitInitialised ? "Ready" : "Not created",
    gitLabel: gitInitialised ? "Initialised" : "Not initialised",
    remoteLabel: remote || "Not connected",
    defaultBranch: row?.defaultBranch || "main",
    suggestedName: repositoryNameFrom(product.name),
    githubAppReady: githubAppConfigured() || stored?.mode === "app",
    githubOwner: process.env.GITHUB_OWNER?.trim() || connection?.login || "",
    githubAccountConnected: connection?.status === "CONNECTED",
    mappedOwner: row?.owner ?? "",
    mappedRepository: row?.repositoryName ?? "",
    mappedUrl: row?.repositoryUrl ?? "",
    mappingStatus: repositoryMappingStatus(row),
    mappingMessage: row?.connectionMessage || "Repository not configured. Choose an existing GitHub repository for this product.",
    localPath: row?.localPath ?? "",
    localReady: gitInitialised,
    remoteConnected: Boolean(remote && row?.connectionStatus === "CONNECTED"),
  };
}

function repositoryMappingStatus(row: { owner: string; repositoryName: string; connectionStatus: string; connectionMessage: string } | null) {
  if (!row?.owner || !row.repositoryName) return "Repository not configured";
  if (row.connectionStatus === "CONNECTED") return "Connected";
  if (/inaccessible/i.test(row.connectionMessage)) return "Repository inaccessible";
  if (/insufficient permissions/i.test(row.connectionMessage)) return "Insufficient permissions";
  if (/already contains commits|will not overwrite/i.test(row.connectionMessage)) return "Existing remote history";
  if (row.connectionStatus === "MISCONFIGURED") return "Insufficient permissions";
  return "Repository not configured";
}
