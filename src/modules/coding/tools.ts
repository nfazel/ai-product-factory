import {assertLegacyCodingWorkspace} from "@/modules/rework/guard";
import "server-only";

import fs from "node:fs";

import { recordActivity } from "@/modules/activity/service";
import { validationProcessEnvironment } from "@/modules/coding/bootstrap";
import { safeCommandOutput } from "@/modules/coding/command-output";
import { runProcess } from "@/modules/coding/git";
import {
  approveCommand,
  classifyRead,
  classifyWrite,
  ensureParentDirectory,
  isSecretPath,
  isTestFile,
  resolveInside,
  weakensChecks,
  hashText,
} from "@/modules/coding/policy";
import { unapprovedPreservationIssues } from "@/modules/coding/external-review";
import { preflightPreservation } from "@/modules/coding/preservation";
import { changedPaths, lastReadHash, recordToolEvent } from "@/modules/coding/repository";

export type ToolRequest =
  | { action: "READ_FILE"; path: string }
  | { action: "LIST_DIRECTORY"; path: string }
  | { action: "WRITE_FILE"; path: string; content: string }
  | { action: "CREATE_FILE"; path: string; content: string }
  | { action: "DELETE_FILE"; path: string }
  | { action: "RUN_COMMAND"; command: string }
  | { action: "GET_DIFF" }
  | { action: "GET_STATUS" };

export type ToolContext = {
  workspaceId: string;
  productId: string;
  workspacePath: string;
  allowedPaths: string[];
  restrictedPaths: string[];
  allowFileDelete: boolean;
  maxFiles: number;
  policyCommands: string[];
  stale: boolean;
  /** Only files supplied to the model in full qualify for a generated batch. */
  completeReads?: Record<string, string>;
  /** New files this workspace created in an earlier run; a rerun may replace them. */
  ownOutput?: Set<string>;
  /** Immutable task Git baseline; also used to inspect final script-induced changes. */
  baseCommit?: string;
};

export type ToolResult = {
  allowed: boolean;
  reason: string;
  kind: "ok" | "secret" | "restricted" | "scope" | "command" | "stale" | "limit" | "test" | "delete";
  content?: string;
  metadata: Record<string, string | number | boolean>;
};

const WRITE_ACTIONS = new Set(["WRITE_FILE", "CREATE_FILE", "DELETE_FILE"]);

export async function executeRepositoryTool(context: ToolContext, request: ToolRequest): Promise<ToolResult> {
  await assertLegacyCodingWorkspace(context.productId,context.workspaceId);
  const outcome = await apply(context, request);
  await recordToolEvent({
    workspaceId: context.workspaceId,
    action: request.action,
    allowed: outcome.allowed,
    reason: outcome.reason,
    path: "path" in request ? request.path : "",
    command: request.action === "RUN_COMMAND" ? request.command : "",
    metadata: outcome.metadata,
  });
  const activity = activityType(request.action, outcome.allowed);
  if (activity) {
    const target = "path" in request ? request.path : request.action === "RUN_COMMAND" ? request.command : request.action;
    await recordActivity({
      productId: context.productId,
      type: activity,
      description: outcome.allowed
        ? `${label(request.action)} ${target}`
        : `Denied ${label(request.action)} ${target}. ${outcome.reason}`,
      actor: "Coding Agent",
    });
  }
  return outcome;
}

function commandEnvironment(command: string, workspacePath: string) {
  return validationProcessEnvironment(command, process.env.DATABASE_URL, workspacePath);
}

async function apply(context: ToolContext, request: ToolRequest): Promise<ToolResult> {
  if (request.action === "GET_STATUS" || request.action === "GET_DIFF") {
    return { allowed: true, reason: "", kind: "ok", metadata: { action: request.action } };
  }
  if (WRITE_ACTIONS.has(request.action) && context.stale) {
    return {
      allowed: false,
      reason: "EXECUTION CONTRACT STALE. Further code changes are paused.",
      kind: "stale",
      metadata: {},
    };
  }
  if (request.action === "RUN_COMMAND") {
    const approved = approveCommand(request.command, context.policyCommands);
    if (!approved.ok) {
      return { allowed: false, reason: approved.reason, kind: "command", metadata: {} };
    }
    const started = Date.now();
    const environment = commandEnvironment(request.command, context.workspacePath);
    const result = await runProcess(approved.argv, context.workspacePath, 120_000, environment.env);
    const output = [environment.note, safeCommandOutput(result.stdout, result.stderr)].filter(Boolean).join("\n\n");
    if (context.baseCommit) {
      const issues = await unapprovedPreservationIssues(context.workspaceId, context.workspacePath, context.baseCommit);
      if (issues.length) return { allowed: false, reason: issues.map(issue => `${issue.path}: ${issue.reason}`).join("\n"), kind: "restricted", content: output, metadata: { exitCode: result.code, output: `${output}\n\nPreservation control blocked: ${issues.map(issue => `${issue.path}: ${issue.reason}`).join("\n")}`, preservationBlocked: true, failureClass: "PRESERVATION_POLICY_BLOCKED" } };
    }
    return {
      allowed: true,
      reason: "",
      kind: "ok",
      content: output,
      metadata: {
        exitCode: result.code,
        durationMs: Date.now() - started,
        output,
        ...(environment.note ? { validationEnvironment: environment.note } : {}),
      },
    };
  }

  const writing = request.action === "CREATE_FILE" || request.action === "WRITE_FILE";
  const located = resolveInside(context.workspacePath, request.path, { allowMissingParents: writing });
  if (!located.ok) {
    const kind = located.reason.includes("Symbolic") ? "restricted" : "scope";
    return { allowed: false, reason: located.reason, kind, metadata: {} };
  }
  if (isSecretPath(located.relative)) {
    return { allowed: false, reason: "Secret files cannot be read or modified.", kind: "secret", metadata: {} };
  }

  if (request.action === "LIST_DIRECTORY") {
    const read = classifyRead(located.relative || ".", context.allowedPaths, context.restrictedPaths);
    if (located.relative && !read.ok && read.kind !== "scope") {
      return { allowed: false, reason: read.reason, kind: read.kind, metadata: {} };
    }
    if (!fs.existsSync(located.absolute) || !fs.statSync(located.absolute).isDirectory()) {
      return { allowed: false, reason: "The directory does not exist inside the workspace.", kind: "scope", metadata: {} };
    }
    const names = fs.readdirSync(located.absolute).filter((name) => name !== ".git");
    return {
      allowed: true,
      reason: "",
      kind: "ok",
      content: names.join("\n"),
      metadata: { entries: names.length },
    };
  }

  if (request.action === "READ_FILE") {
    const read = classifyRead(located.relative, context.allowedPaths, context.restrictedPaths);
    if (!read.ok) return { allowed: false, reason: read.reason, kind: read.kind, metadata: {} };
    if (!fs.existsSync(located.absolute) || !fs.statSync(located.absolute).isFile()) {
      return { allowed: false, reason: "The file does not exist inside the workspace.", kind: "scope", metadata: {} };
    }
    const content = fs.readFileSync(located.absolute, "utf8");
    if (context.completeReads) context.completeReads[located.relative] = hashText(content);
    return { allowed: true, reason: "", kind: "ok", content, metadata: { bytes: Buffer.byteLength(content), contentHash: hashText(content) } };
  }

  if (WRITE_ACTIONS.has(request.action)) {
    const reads = context.completeReads ?? {};
    if (!context.completeReads) {
      const recorded = await lastReadHash(context.workspaceId, located.relative);
      if (recorded) reads[located.relative] = recorded;
    }
    const issues = preflightPreservation(context.workspacePath, [request as { path: string; action: string; content?: string }], reads, context.ownOutput);
    if (issues.length) return { allowed: false, reason: issues.map(issue => issue.reason).join(" "), kind: "restricted", metadata: { preservationBlocked: true } };
  }

  if (request.action === "DELETE_FILE") {
    const removal = classifyWrite(located.relative, context.allowedPaths, context.restrictedPaths);
    if (!removal.ok) return { allowed: false, reason: removal.reason, kind: removal.kind, metadata: {} };
    if (!context.allowFileDelete) {
      return {
        allowed: false,
        reason: "File deletion is not permitted for this task.",
        kind: isTestFile(located.relative) ? "test" : "delete",
        metadata: {},
      };
    }
    if (isTestFile(located.relative)) {
      return { allowed: false, reason: "Deleting a test is not permitted.", kind: "test", metadata: {} };
    }
    if (!fs.existsSync(located.absolute)) {
      return { allowed: false, reason: "The file does not exist inside the workspace.", kind: "scope", metadata: {} };
    }
    fs.rmSync(located.absolute);
    return { allowed: true, reason: "", kind: "ok", metadata: { bytes: 0 } };
  }

  const prepared = ensureParentDirectory(context.workspacePath, located.relative, context.allowedPaths, context.restrictedPaths);
  if (!prepared.ok) return { allowed: false, reason: prepared.reason, kind: prepared.kind, metadata: {} };
  const writeTarget = prepared.absolute;
  const before = fs.existsSync(writeTarget) && fs.statSync(writeTarget).isFile()
    ? fs.readFileSync(writeTarget, "utf8")
    : "";
  const weakening = weakensChecks(located.relative, before, request.content);
  if (weakening) {
    return { allowed: false, reason: weakening, kind: "test", metadata: {} };
  }
  if (before === request.content && request.action === "WRITE_FILE") {
    return { allowed: true, reason: "unchanged", kind: "ok", metadata: { skipped: true } };
  }
  const touched = await changedPaths(context.workspaceId);
  if (!touched.has(prepared.relative) && touched.size >= context.maxFiles) {
    return {
      allowed: false,
      reason: `The file limit of ${context.maxFiles} has been reached.`,
      kind: "limit",
      metadata: {},
    };
  }
  fs.writeFileSync(writeTarget, request.content);
  return {
    allowed: true,
    reason: "",
    kind: "ok",
    metadata: { bytes: Buffer.byteLength(request.content) },
  };
}

function activityType(action: ToolRequest["action"], allowed: boolean) {
  if (!allowed) return "CODING_POLICY_DENIED" as const;
  if (action === "READ_FILE" || action === "LIST_DIRECTORY") return "CODING_FILE_READ" as const;
  if (action === "WRITE_FILE") return "CODING_FILE_MODIFIED" as const;
  if (action === "CREATE_FILE") return "CODING_FILE_CREATED" as const;
  if (action === "DELETE_FILE") return "CODING_FILE_DELETED" as const;
  if (action === "RUN_COMMAND") return "CODING_COMMAND_EXECUTED" as const;
  return null;
}

function label(action: ToolRequest["action"]) {
  return action.toLowerCase().replaceAll("_", " ");
}

/** Validate the full generated batch before the first mutation. */
export function preflightRepositoryBatch(context: ToolContext, requests: ToolRequest[], previouslyTouched: Iterable<string> = []) {
  const writes = requests.filter((request): request is Extract<ToolRequest, { path: string }> => WRITE_ACTIONS.has(request.action) && "path" in request);
  const issues = preflightPreservation(context.workspacePath, writes, context.completeReads ?? {}, context.ownOutput);
  if (context.stale && writes.length) issues.push({ path: ".", reason: "EXECUTION CONTRACT STALE. Further code changes are paused." });
  if (new Set([...previouslyTouched, ...writes.map(item => item.path)]).size > context.maxFiles) issues.push({ path: ".", reason: "The change batch exceeds the task file limit." });
  for (const request of writes) {
    const located = resolveInside(context.workspacePath, request.path, { allowMissingParents: true });
    if (!located.ok) continue;
    const permission = classifyWrite(located.relative, context.allowedPaths, context.restrictedPaths);
    if (!permission.ok) issues.push({ path: request.path, reason: permission.reason });
    if (request.action === "DELETE_FILE" && !context.allowFileDelete) issues.push({ path: request.path, reason: "File deletion is not permitted for this task." });
  }
  return issues;
}
