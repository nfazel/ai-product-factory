import "server-only";

import { runGit } from "@/modules/coding/git";
import { DomainError } from "@/modules/shared/errors";
import { isVerificationReservedPath } from "@/modules/coding/policy";

/**
 * Verification must judge the approved snapshot exactly as it was approved. These checks run before and after
 * execution. Before: the workspace HEAD must be the approved base commit. After: the only changes allowed are
 * files under verification/ and generated output that approved build or install commands create.
 */

const GENERATED_OUTPUT_PREFIXES = ["node_modules/", ".next/", ".turbo/", ".prisma/", "dist/", "build/", "out/", "coverage/"];
const GENERATED_OUTPUT_FILES = new Set(["next-env.d.ts"]);

export function isGeneratedOutputPath(relativePath: string) {
  const normalised = relativePath.replaceAll("\\", "/");
  if (GENERATED_OUTPUT_FILES.has(normalised)) return true;
  if (normalised.endsWith(".tsbuildinfo")) return true;
  return GENERATED_OUTPUT_PREFIXES.some((prefix) => normalised.startsWith(prefix));
}

export async function assertSnapshotUnchanged(workspacePath: string, baseCommit: string) {
  const head = await runGit(workspacePath, ["rev-parse", "HEAD"]);
  if (head.code !== 0 || head.stdout.trim() !== baseCommit) {
    throw new DomainError("The verification workspace is not at the approved snapshot. Verification was stopped without judging the product.");
  }
}

/**
 * Lists product paths the verification run changed. Tracked files that changed are always reported. Untracked
 * files are reported unless they are verification-only files or generated output of approved commands.
 */
export async function changedProductFiles(workspacePath: string): Promise<string[]> {
  const status = await runGit(workspacePath, ["-c", "core.quotepath=false", "status", "--porcelain", "--untracked-files=all"]);
  if (status.code !== 0) {
    throw new DomainError("The verification workspace status could not be read, so the snapshot could not be confirmed.");
  }
  const changed: string[] = [];
  for (const line of status.stdout.split("\n")) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    let filePath = line.slice(3).trim();
    if (filePath.includes(" -> ")) filePath = filePath.split(" -> ").pop() ?? "";
    filePath = filePath.replace(/^"(.*)"$/, "$1").replaceAll("\\", "/");
    if (!filePath || isVerificationReservedPath(filePath)) continue;
    if (code === "??" && isGeneratedOutputPath(filePath)) continue;
    changed.push(filePath);
  }
  return changed;
}
