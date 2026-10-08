import fs from "node:fs";
import path from "node:path";

import { isAIConfigured } from "@/modules/ai/provider";
import { inspectGitRepository } from "@/modules/coding/git";

export function factoryRoot() {
  return fs.realpathSync(process.cwd());
}

export function pathsOverlap(left: string, right: string) {
  const fromLeft = path.relative(left, right);
  const fromRight = path.relative(right, left);
  const inside = (relative: string) =>
    relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  return inside(fromLeft) || inside(fromRight);
}

export function repositoryAllowsFactory() {
  return process.env.PRODUCT_REPOSITORY_ALLOW_FACTORY === "true";
}

export function configuredRepositoryRoot() {
  return process.env.PRODUCT_REPOSITORY_ROOT?.trim() ?? "";
}

export function repositoryRootConfigured() {
  const root = configuredRepositoryRoot();
  if (!root || !fs.existsSync(/*turbopackIgnore: true*/ root)) return false;
  const gitDir = path.join(root, ".git");
  if (!fs.existsSync(/*turbopackIgnore: true*/ gitDir)) return false;
  try {
    const real = fs.realpathSync(/*turbopackIgnore: true*/ root);
    if (!repositoryAllowsFactory() && pathsOverlap(real, factoryRoot())) return false;
    return true;
  } catch {
    return false;
  }
}

export function codingConfigurationGap(): "ai" | "repository" | null {
  if (!isAIConfigured()) return "ai";
  if (!repositoryRootConfigured()) return "repository";
  return null;
}

export async function resolveConfiguredRepository() {
  const root = configuredRepositoryRoot();
  if (!root) {
    throw new Error("No repository is configured. Set PRODUCT_REPOSITORY_ROOT to a local Git repository.");
  }
  if (!fs.existsSync(/*turbopackIgnore: true*/ root)) {
    throw new Error("PRODUCT_REPOSITORY_ROOT does not exist.");
  }
  const real = fs.realpathSync(/*turbopackIgnore: true*/ root);
  if (!repositoryAllowsFactory() && pathsOverlap(real, factoryRoot())) {
    throw new Error(
      "The Coding Agent cannot use the AI Product Factory source repository. Set PRODUCT_REPOSITORY_ROOT to a separate repository, or set PRODUCT_REPOSITORY_ALLOW_FACTORY=true for a local demo.",
    );
  }
  const git = await inspectGitRepository(real);
  if (git.topLevel !== real && pathsOverlap(git.topLevel, factoryRoot()) && !repositoryAllowsFactory()) {
    throw new Error("The Git repository resolves to the AI Product Factory source tree.");
  }
  return {
    localPath: git.topLevel,
    defaultBranch: git.branch,
    head: git.head,
    name: path.basename(git.topLevel),
  };
}
