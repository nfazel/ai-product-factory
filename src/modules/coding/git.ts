import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isSecretPath, PATCH_LIMIT } from "@/modules/coding/policy";

export type GitResult = { code: number; stdout: string; stderr: string };

const SAFE_ENV = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "SYSTEMROOT"];

export function childEnv() {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const key of SAFE_ENV) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

export function runProcess(argv: string[], cwd: string, timeoutMs = 120_000): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn(/*turbopackIgnore: true*/ argv[0] ?? "", argv.slice(1), {
      cwd,
      shell: false,
      env: {
        ...childEnv(),
        GIT_PAGER: "cat",
        PAGER: "cat",
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_COUNT: "3",
        GIT_CONFIG_KEY_0: "maintenance.auto",
        GIT_CONFIG_VALUE_0: "false",
        GIT_CONFIG_KEY_1: "commit.gpgsign",
        GIT_CONFIG_VALUE_1: "false",
        GIT_CONFIG_KEY_2: "core.fsmonitor",
        GIT_CONFIG_VALUE_2: "false",
      },
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      resolve({ code: 1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

const BLOCKED_GIT = new Set(["push", "merge", "rebase", "pull", "reset", "clean", "filter-branch"]);

export function runGit(cwd: string, args: string[]) {
  if (args.some((arg) => BLOCKED_GIT.has(arg) || arg === "--hard" || arg.startsWith("--force"))) {
    return Promise.resolve({
      code: 1,
      stdout: "",
      stderr: "That git operation is not permitted.",
    });
  }
  return runProcess(["git", "--no-pager", ...args], cwd);
}

export function worktreeRoot() {
  const configured = process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT?.trim();
  return configured || path.join(os.tmpdir(), "ai-product-factory-workspaces");
}

export function workspaceDirectory(id: string) {
  return path.join(worktreeRoot(), id);
}

export async function inspectGitRepository(directory: string) {
  const top = await runGit(directory, ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) {
    throw new Error("The path is not a Git repository.");
  }
  const branch = await runGit(directory, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = await runGit(directory, ["rev-parse", "HEAD"]);
  return {
    topLevel: fs.realpathSync(top.stdout.trim()),
    branch: branch.stdout.trim() || "main",
    head: head.stdout.trim(),
  };
}

export function branchNameFor(taskId: string, title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `ai-factory/task-${taskId}-${slug || "change"}`;
}

export async function createWorktree(input: {
  repositoryPath: string;
  workspacePath: string;
  branchName: string;
  baseCommit: string;
}) {
  fs.mkdirSync(path.dirname(input.workspacePath), { recursive: true });
  if (fs.existsSync(input.workspacePath)) {
    throw new Error("The workspace path already exists.");
  }
  const existing = await runGit(input.repositoryPath, ["rev-parse", "--verify", "--quiet", input.branchName]);
  const branch = existing.code === 0 ? `${input.branchName}-${Date.now().toString(36)}` : input.branchName;
  const created = await runGit(input.repositoryPath, [
    "worktree",
    "add",
    "-b",
    branch,
    input.workspacePath,
    input.baseCommit,
  ]);
  if (created.code !== 0) {
    throw new Error(created.stderr.trim() || "Git worktree creation failed.");
  }
  return { branchName: branch };
}

export async function assertWorktreeIsolated(workspacePath: string, repositoryPath: string) {
  const workspaceReal = fs.realpathSync(workspacePath);
  const repoReal = fs.realpathSync(repositoryPath);
  if (workspaceReal === repoReal) {
    throw new Error("The workspace is the main working tree.");
  }
  const relative = path.relative(repoReal, workspaceReal);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("The workspace must not sit inside the repository working tree.");
  }
  const top = await runGit(workspacePath, ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0 || fs.realpathSync(top.stdout.trim()) !== workspaceReal) {
    throw new Error("The workspace is not an isolated Git worktree.");
  }
}

export type DiffFile = {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
};

export async function captureWorkspaceDiff(workspacePath: string) {
  const nameStatus = await runGit(workspacePath, ["diff", "HEAD", "--name-status"]);
  const numstat = await runGit(workspacePath, ["diff", "HEAD", "--numstat"]);
  const patchResult = await runGit(workspacePath, ["diff", "HEAD", "--patch"]);
  const untracked = await runGit(workspacePath, ["ls-files", "--others", "--exclude-standard"]);
  const counts = new Map<string, { additions: number; deletions: number }>();
  for (const line of numstat.stdout.split("\n")) {
    if (!line.trim()) continue;
    const [added, removed, filePath] = line.split("\t");
    counts.set(filePath ?? "", {
      additions: Number(added) || 0,
      deletions: Number(removed) || 0,
    });
  }
  const files: DiffFile[] = [];
  for (const line of nameStatus.stdout.split("\n")) {
    if (!line.trim()) continue;
    const [status, filePath] = line.split("\t");
    const kind = status === "A" ? "added" : status === "D" ? "deleted" : "modified";
    const count = counts.get(filePath ?? "") ?? { additions: 0, deletions: 0 };
    files.push({ path: filePath ?? "", status: kind, ...count });
  }
  let fullPatch = patchResult.stdout;
  for (const filePath of untracked.stdout.split("\n").map((line) => line.trim()).filter(Boolean)) {
    if (files.some((file) => file.path === filePath)) continue;
    if (isSecretPath(filePath)) {
      files.push({ path: filePath, status: "added", additions: 0, deletions: 0 });
      continue;
    }
    let text = "";
    try {
      text = fs.readFileSync(path.join(workspacePath, filePath), "utf8");
    } catch {
      continue;
    }
    const additions = text.split("\n").length;
    files.push({ path: filePath, status: "added", additions, deletions: 0 });
    fullPatch += `\ndiff --git a/${filePath} b/${filePath}\n--- /dev/null\n+++ b/${filePath}\n${text}`;
  }
  const truncated = fullPatch.length > PATCH_LIMIT;
  return {
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    patch: truncated ? fullPatch.slice(0, PATCH_LIMIT) : fullPatch,
    fullPatch,
    truncated,
  };
}

export async function commitWorkspace(workspacePath: string, message: string) {
  const status = await runGit(workspacePath, ["status", "--porcelain"]);
  if (status.code !== 0) throw new Error(status.stderr.trim() || "Git status failed.");
  if (!status.stdout.trim()) throw new Error("There is nothing to commit.");
  const added = await runGit(workspacePath, ["add", "-A"]);
  if (added.code !== 0) throw new Error(added.stderr.trim() || "Git add failed.");
  const committed = await runGit(workspacePath, [
    "-c",
    "user.name=AI Product Factory",
    "-c",
    "user.email=coding-agent@localhost",
    "commit",
    "-m",
    message,
  ]);
  if (committed.code !== 0) throw new Error(committed.stderr.trim() || "Git commit failed.");
  const sha = await runGit(workspacePath, ["rev-parse", "HEAD"]);
  if (sha.code !== 0 || !/^[0-9a-f]{40}$/.test(sha.stdout.trim())) {
    throw new Error("The commit SHA could not be read.");
  }
  return sha.stdout.trim();
}

export async function repositoryStatus(workspacePath: string) {
  const status = await runGit(workspacePath, ["status", "--porcelain"]);
  const branch = await runGit(workspacePath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = await runGit(workspacePath, ["rev-parse", "HEAD"]);
  return {
    branch: branch.stdout.trim(),
    head: head.stdout.trim(),
    dirty: Boolean(status.stdout.trim()),
    entries: status.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  };
}
