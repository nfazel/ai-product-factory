import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { binaryPatchNote, boundedDiffCount, sanitizeStoredPatch } from "@/modules/coding/diff";
import { isGeneratedReviewPath } from "@/modules/coding/generated-paths";
import { isSecretPath, PATCH_LIMIT } from "@/modules/coding/policy";

/**
 * `signal` is set when the process was terminated by a signal, for example when the timeout fired.
 * Callers use it to tell an interrupted run from a run that reported a failing result.
 */
export type GitResult = { code: number; stdout: string; stderr: string; signal?: string | null };

const SAFE_ENV = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "SYSTEMROOT"];

export function childEnv() {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const key of SAFE_ENV) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

export function runProcess(
  argv: string[],
  cwd: string,
  timeoutMs = 120_000,
  extraEnv?: Record<string, string>,
): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn(/*turbopackIgnore: true*/ argv[0] ?? "", argv.slice(1), {
      cwd,
      shell: false,
      env: {
        ...childEnv(),
        ...extraEnv,
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
    child.on("close", (code, signal) => {
      resolve({ code: code ?? 1, stdout, stderr, signal: signal ?? null });
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

export async function pruneMissingWorktrees(repositoryPath: string) {
  const result = await runGit(repositoryPath, ["worktree", "prune"]);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "Stale Git worktree metadata could not be pruned.");
  }
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
  await pruneMissingWorktrees(input.repositoryPath);
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

export function ensureWorktreeLink(workspacePath: string, repositoryPath: string) {
  const link = path.join(workspacePath, ".git");
  if (fs.existsSync(link)) return false;
  const worktrees = path.join(repositoryPath, ".git", "worktrees");
  if (!fs.existsSync(worktrees)) return false;
  const expected = path.join(fs.realpathSync(workspacePath), ".git");
  for (const name of fs.readdirSync(worktrees)) {
    const pointer = path.join(worktrees, name, "gitdir");
    if (!fs.existsSync(pointer)) continue;
    const recorded = fs.readFileSync(pointer, "utf8").trim();
    if (recorded !== expected && recorded !== link) continue;
    fs.writeFileSync(link, `gitdir: ${path.join(worktrees, name)}\n`);
    return true;
  }
  return false;
}

export type WorkspaceDiff = {
  files: DiffFile[];
  additions: number;
  deletions: number;
  patch: string;
  fullPatch: string;
  truncated: boolean;
  /** When set, the diff includes committed changes from baseCommit..HEAD. */
  comparedToBase?: string | null;
  headCommit?: string | null;
};

export const BASELINE_UNRESOLVED =
  "The coding baseline commit is missing or cannot be resolved. Reconcile the workspace baseline before code review can continue.";

export type CaptureWorkspaceDiffOptions = {
  /** Task coding baseline (workspace.baseCommit). Required to surface already-committed implementation changes. */
  baseCommit?: string | null;
  /**
   * When the working tree is clean, refuse an empty reviewable diff if the baseline cannot be used.
   * Review and approval paths should set this so a missing baseline is a blocker, not a silent empty review.
   */
  requireBaselineWhenClean?: boolean;
};

export async function captureWorkspaceDiff(
  workspacePath: string,
  repositoryPath?: string,
  options: CaptureWorkspaceDiffOptions = {},
): Promise<WorkspaceDiff> {
  if (repositoryPath) ensureWorktreeLink(workspacePath, repositoryPath);
  const working = await readWorkingTreeDiff(workspacePath);
  const head = await runGit(workspacePath, ["rev-parse", "HEAD"]);
  if (head.code !== 0 || !/^[0-9a-f]{40}$/.test(head.stdout.trim())) {
    throw new Error(head.stderr.trim() || "The workspace HEAD commit could not be read.");
  }
  const headCommit = head.stdout.trim();
  const base = typeof options.baseCommit === "string" ? options.baseCommit.trim() : "";

  let committed: WorkspaceDiff = emptyDiff();
  if (base) {
    if (!/^[0-9a-f]{40}$/.test(base)) throw new Error(BASELINE_UNRESOLVED);
    if (!(await commitExists(workspacePath, base))) throw new Error(BASELINE_UNRESOLVED);
    if (base !== headCommit) {
      committed = await readCommitRangeDiff(workspacePath, base, headCommit);
    }
  } else if (options.requireBaselineWhenClean && working.files.length === 0) {
    throw new Error(BASELINE_UNRESOLVED);
  }

  const merged = mergeWorkspaceDiffs(committed, working);
  return {
    ...merged,
    comparedToBase: base || null,
    headCommit,
  };
}

function emptyDiff(): WorkspaceDiff {
  return { files: [], additions: 0, deletions: 0, patch: "", fullPatch: "", truncated: false };
}

async function readWorkingTreeDiff(workspacePath: string): Promise<WorkspaceDiff> {
  const nameStatus = await runGit(workspacePath, ["diff", "--no-renames", "HEAD", "--name-status"]);
  const numstat = await runGit(workspacePath, ["diff", "--no-renames", "HEAD", "--numstat"]);
  const patchResult = await runGit(workspacePath, ["diff", "--no-renames", "HEAD", "--patch"]);
  const untracked = await runGit(workspacePath, ["ls-files", "--others", "--exclude-standard"]);
  if (nameStatus.code !== 0 || untracked.code !== 0) {
    throw new Error(nameStatus.stderr.trim() || untracked.stderr.trim() || "The workspace diff could not be read because the worktree is not a Git repository.");
  }
  const files = parseNameStatus(nameStatus.stdout, numstat.stdout);
  let fullPatch = patchResult.stdout;
  for (const filePath of untracked.stdout.split("\n").map((line) => line.trim()).filter(Boolean)) {
    if (files.some((file) => file.path === filePath) || isGeneratedReviewPath(filePath)) continue;
    if (isSecretPath(filePath)) {
      files.push({ path: filePath, status: "added", additions: 0, deletions: 0 });
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(/*turbopackIgnore: true*/ path.join(workspacePath, filePath));
    } catch {
      continue;
    }
    if (bytes.includes(0)) {
      files.push({ path: filePath, status: "added", additions: 0, deletions: 0 });
      fullPatch += binaryPatchNote(filePath);
      continue;
    }
    const text = bytes.toString("utf8");
    const additions = text.split("\n").length;
    files.push({ path: filePath, status: "added", additions, deletions: 0 });
    fullPatch += `\ndiff --git a/${filePath} b/${filePath}\n--- /dev/null\n+++ b/${filePath}\n${text}`;
  }
  return finaliseDiff(files, fullPatch);
}

async function readCommitRangeDiff(workspacePath: string, baseCommit: string, headCommit: string): Promise<WorkspaceDiff> {
  const nameStatus = await runGit(workspacePath, ["diff", "--no-renames", "--name-status", baseCommit, headCommit]);
  const numstat = await runGit(workspacePath, ["diff", "--no-renames", "--numstat", baseCommit, headCommit]);
  const patchResult = await runGit(workspacePath, ["diff", "--no-renames", "--patch", baseCommit, headCommit]);
  if (nameStatus.code !== 0 || numstat.code !== 0 || patchResult.code !== 0) {
    throw new Error(
      nameStatus.stderr.trim()
        || numstat.stderr.trim()
        || patchResult.stderr.trim()
        || "The committed implementation diff could not be read.",
    );
  }
  return finaliseDiff(parseNameStatus(nameStatus.stdout, numstat.stdout), patchResult.stdout);
}

function parseNameStatus(nameStatus: string, numstat: string): DiffFile[] {
  const counts = new Map<string, { additions: number; deletions: number }>();
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [added, removed, filePath] = line.split("\t");
    counts.set(filePath ?? "", {
      additions: Number(added) || 0,
      deletions: Number(removed) || 0,
    });
  }
  const files: DiffFile[] = [];
  for (const line of nameStatus.split("\n")) {
    if (!line.trim()) continue;
    const [status, filePath] = line.split("\t");
    const kind = status === "A" ? "added" : status === "D" ? "deleted" : "modified";
    const count = counts.get(filePath ?? "") ?? { additions: 0, deletions: 0 };
    if (isGeneratedReviewPath(filePath ?? "") || !filePath) continue;
    files.push({ path: filePath, status: kind, ...count });
  }
  return files;
}

function mergeWorkspaceDiffs(committed: WorkspaceDiff, working: WorkspaceDiff): WorkspaceDiff {
  const byPath = new Map<string, DiffFile>();
  for (const file of committed.files) byPath.set(file.path, file);
  for (const file of working.files) byPath.set(file.path, file);
  const files = [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  const fullPatch = [committed.fullPatch, working.fullPatch].filter(Boolean).join("\n");
  return finaliseDiff(files, fullPatch);
}

function finaliseDiff(files: DiffFile[], fullPatch: string): WorkspaceDiff {
  const safe = sanitizeStoredPatch(fullPatch);
  const truncated = safe.patch.length > PATCH_LIMIT;
  const patch = truncated ? safe.patch.slice(0, PATCH_LIMIT) : safe.patch;
  return {
    files,
    additions: boundedDiffCount(files.reduce((sum, file) => sum + file.additions, 0)),
    deletions: boundedDiffCount(files.reduce((sum, file) => sum + file.deletions, 0)),
    patch: sanitizeStoredPatch(patch).patch,
    fullPatch: safe.patch,
    truncated,
  };
}

function approvedCommitPath(filePath: string) {
  const normalized = filePath.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..") || isGeneratedReviewPath(normalized) || isSecretPath(normalized)) {
    throw new Error(`The approved snapshot includes a path that cannot be committed: ${filePath}`);
  }
  return normalized;
}

function snapshotStatus(status: string) {
  if (status === "deleted" || status === "removed" || status === "D") return "deleted";
  if (status === "modified" || status === "changed" || status === "M") return "modified";
  if (status === "added" || status === "A") return "added";
  throw new Error("The staged commit does not match the approved snapshot.");
}

function parseCachedNameStatus(stdout: string) {
  const files: { path: string; status: string }[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const [status, filePath] = line.split("\t");
    if (!status || !filePath) throw new Error("The staged commit does not match the approved snapshot.");
    files.push({ path: filePath, status: snapshotStatus(status) });
  }
  return files;
}

async function unstageApproved(workspacePath: string, paths: string[]) {
  if (paths.length === 0) return;
  await runGit(workspacePath, ["restore", "--staged", "--", ...paths]);
}

async function assertStagedSnapshot(
  workspacePath: string,
  expected: { path: string; status: string }[],
  captured: Map<string, Buffer>,
) {
  const staged = await runGit(workspacePath, ["-c", "core.quotepath=false", "diff", "--cached", "--name-status"]);
  if (staged.code !== 0) throw new Error(staged.stderr.trim() || "The staged commit does not match the approved snapshot.");
  const actual = parseCachedNameStatus(staged.stdout);
  const key = (file: { path: string; status: string }) => `${snapshotStatus(file.status)}:${file.path}`;
  const left = actual.map(key).sort();
  const right = expected.map(key).sort();
  if (left.length !== right.length || left.some((item, index) => item !== right[index])) {
    throw new Error("The staged commit does not match the approved snapshot.");
  }
  for (const file of expected) {
    if (file.status === "deleted") continue;
    const absolute = path.resolve(workspacePath, file.path);
    const current = fs.readFileSync(absolute);
    const previous = captured.get(file.path);
    if (!previous || !current.equals(previous)) throw new Error("The staged commit does not match the approved snapshot.");
    const index = await runGit(workspacePath, ["rev-parse", "--verify", `:${file.path}`]);
    const work = await runGit(workspacePath, ["hash-object", "--", file.path]);
    if (index.code !== 0 || work.code !== 0 || index.stdout.trim() !== work.stdout.trim()) {
      throw new Error("The staged commit does not match the approved snapshot.");
    }
  }
}

export async function commitApprovedSnapshot(
  workspacePath: string,
  files: { path: string; status: string }[],
  message: string,
) {
  const expected = files.map((file) => ({ path: approvedCommitPath(file.path), status: snapshotStatus(file.status) }));
  if (expected.length === 0) throw new Error("The approved snapshot has no files to commit.");
  const captured = new Map<string, Buffer>();
  for (const file of expected) {
    if (file.status === "deleted") continue;
    const absolute = path.resolve(workspacePath, file.path);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error("The staged commit does not match the approved snapshot.");
    }
    captured.set(file.path, fs.readFileSync(absolute));
  }
  const already = await runGit(workspacePath, ["-c", "core.quotepath=false", "diff", "--cached", "--name-only"]);
  if (already.code !== 0) throw new Error(already.stderr.trim() || "The staged commit could not be read.");
  const stagedNames = already.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  if (stagedNames.length > 0) {
    const cleared = await runGit(workspacePath, ["restore", "--staged", "--", ...stagedNames]);
    if (cleared.code !== 0) throw new Error(cleared.stderr.trim() || "Staged files could not be cleared before the approved commit.");
  }
  const added = await runGit(workspacePath, ["add", "--", ...expected.map((file) => file.path)]);
  if (added.code !== 0) {
    await unstageApproved(workspacePath, expected.map((file) => file.path));
    throw new Error(added.stderr.trim() || "The approved files could not be staged.");
  }
  try {
    await assertStagedSnapshot(workspacePath, expected, captured);
  } catch (error) {
    await unstageApproved(workspacePath, expected.map((file) => file.path));
    throw error;
  }
  const committed = await runGit(workspacePath, [
    "-c",
    "user.name=AI Product Factory",
    "-c",
    "user.email=coding-agent@localhost",
    "commit",
    "-m",
    message,
  ]);
  if (committed.code !== 0) {
    await unstageApproved(workspacePath, expected.map((file) => file.path));
    throw new Error(committed.stderr.trim() || "Git commit failed.");
  }
  const sha = await runGit(workspacePath, ["rev-parse", "HEAD"]);
  if (sha.code !== 0 || !/^[0-9a-f]{40}$/.test(sha.stdout.trim())) {
    throw new Error("The commit SHA could not be read.");
  }
  return sha.stdout.trim();
}

export async function commitExists(directory: string, sha: string) {
  if (!/^[0-9a-f]{40}$/.test(sha)) return false;
  const result = await runGit(directory, ["cat-file", "-e", `${sha}^{commit}`]);
  return result.code === 0;
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

export async function restoreBaselineFile(workspacePath: string, baseCommit: string, relativePath: string, status: string) {
  if (!/^[0-9a-f]{40}$/.test(baseCommit)) throw new Error("The baseline commit is not a commit SHA.");
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error("The file path is not inside the workspace.");
  }
  const absolute = path.resolve(workspacePath, normalized);
  const relative = path.relative(workspacePath, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("The file path is not inside the workspace.");
  }
  if (status === "added") {
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) fs.rmSync(absolute);
    return;
  }
  const restored = await runGit(workspacePath, ["restore", `--source=${baseCommit}`, "--worktree", "--", normalized]);
  if (restored.code !== 0) throw new Error(restored.stderr.trim() || "The baseline file could not be restored.");
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
