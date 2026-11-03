import "server-only";

import fs from "node:fs";

import { db } from "@/lib/db";
import { resolveInside, hashText } from "@/modules/coding/policy";
import { runGit } from "@/modules/coding/git";

type Operation = { action: "CREATE_FILE" | "WRITE_FILE" | "DELETE_FILE"; path: string; content: string };

/**
 * A rerun in a workspace that already holds the agent's earlier output would otherwise be blocked, because the agent
 * "creates" files that exist. A create of a file this very workspace created in an earlier run, and that is not part of
 * the baseline, is the agent replacing its own output, so it is treated as a write of that file, and the file's current
 * content counts as read because the system wrote it. It has no baseline content to preserve, so its removed exports are
 * not a violation. Every other existing file keeps its full protection.
 */
export async function adoptOwnEarlierOutput(
  workspace: { id: string; workspacePath: string; baseCommit: string },
  operations: Operation[],
  completeReads: Record<string, string>,
  ownOutput: Set<string>,
): Promise<Operation[]> {
  const creates = operations.filter((operation) => operation.action === "CREATE_FILE");
  if (!creates.length) return operations;
  const earlier = await db.codingToolEvent.findMany({ where: { workspaceId: workspace.id, allowed: true, action: "CREATE_FILE" }, select: { path: true } });
  const created = new Set(earlier.map((event) => event.path));
  const adopted = new Map<string, string>();
  for (const operation of creates) {
    if (!created.has(operation.path)) continue;
    const located = resolveInside(workspace.workspacePath, operation.path);
    if (!located.ok || !fs.existsSync(/*turbopackIgnore: true*/ located.absolute) || !fs.statSync(located.absolute).isFile()) continue;
    // The file must not exist in the baseline: only genuinely new files can be this workspace's own output.
    const inBaseline = await runGit(workspace.workspacePath, ["cat-file", "-e", `${workspace.baseCommit}:${located.relative}`]);
    if (inBaseline.code === 0) continue;
    adopted.set(operation.path, located.relative);
    completeReads[located.relative] = hashText(fs.readFileSync(located.absolute, "utf8"));
    ownOutput.add(located.relative);
  }
  return operations.map((operation) => (operation.action === "CREATE_FILE" && adopted.has(operation.path) ? { ...operation, action: "WRITE_FILE" as const } : operation));
}
