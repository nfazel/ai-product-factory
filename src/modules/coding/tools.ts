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
} from "@/modules/coding/policy";
import { changedPaths, recordToolEvent } from "@/modules/coding/repository";

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
    return { allowed: true, reason: "", kind: "ok", content, metadata: { bytes: Buffer.byteLength(content) } };
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
