import "server-only";

import fs from "node:fs";
import path from "node:path";

import { recordActivity } from "@/modules/activity/service";
import { runProcess } from "@/modules/coding/git";
import { db } from "@/lib/db";
import {
  approveVerificationCommand,
  classifyVerificationRead,
  classifyVerificationWrite,
} from "@/modules/verification/policy";

export type VerificationToolRequest =
  | { action: "READ_FILE"; path: string }
  | { action: "WRITE_FILE"; path: string; content: string }
  | { action: "RUN_COMMAND"; command: string };

export async function executeVerificationTool(
  input: { sessionId: string; productId: string; workspacePath: string },
  request: VerificationToolRequest,
) {
  if (request.action === "RUN_COMMAND") {
    const approved = approveVerificationCommand(request.command);
    if (!approved.ok) {
      await deny(input, "RUN_COMMAND", approved.reason, "", request.command);
      return { allowed: false, reason: approved.reason, exitCode: null as number | null, output: "" };
    }
    const started = new Date();
    const result = await runProcess(approved.argv, input.workspacePath, 60_000);
    await db.verificationEvidence.create({
      data: {
        sessionId: input.sessionId,
        type: commandEvidenceType(approved.command),
        source: "COMMAND_RUNNER",
        description: approved.command,
        result: result.code === 0 ? "EXECUTED" : "FAILED",
        command: approved.command,
        exitCode: result.code,
      },
    });
    await recordActivity({
      productId: input.productId,
      type: "VERIFICATION_COMMAND_EXECUTED",
      description: `Verification command ${approved.command} exited ${result.code}.`,
      actor: "Testing & Verification Agent",
    });
    return {
      allowed: true,
      reason: "",
      exitCode: result.code,
      output: `${result.stdout}\n${result.stderr}`.trim().slice(0, 2000),
      started,
      completed: new Date(),
      command: approved.command,
    };
  }

  const located =
    request.action === "READ_FILE"
      ? classifyVerificationRead(input.workspacePath, request.path)
      : classifyVerificationWrite(input.workspacePath, request.path);
  if (!located.ok) {
    const type = located.reason.includes("Secret") ? "SECRET_ACCESS" : located.reason.includes("production") ? "IMPLEMENTATION_CHANGE" : "OTHER";
    await deny(input, request.action, located.reason, request.path, "");
    await db.verificationEscalation.create({
      data: {
        sessionId: input.sessionId,
        type,
        description: located.reason,
        reason: request.path,
      },
    });
    return { allowed: false, reason: located.reason, exitCode: null, output: "" };
  }
  if (request.action === "READ_FILE") {
    if (!fs.existsSync(located.absolute) || !fs.statSync(located.absolute).isFile()) {
      return { allowed: false, reason: "The file was not found.", exitCode: null, output: "" };
    }
    const content = fs.readFileSync(located.absolute, "utf8");
    await recordActivity({
      productId: input.productId,
      type: "VERIFICATION_FILE_READ",
      description: `Verification read ${located.relative}.`,
      actor: "Testing & Verification Agent",
    });
    return { allowed: true, reason: "", exitCode: null, output: content.slice(0, 8000) };
  }
  fs.mkdirSync(path.dirname(located.absolute), { recursive: true });
  fs.writeFileSync(located.absolute, request.content);
  await recordActivity({
    productId: input.productId,
    type: "VERIFICATION_TEST_CREATED",
    description: `Verification created ${located.relative}.`,
    actor: "Testing & Verification Agent",
  });
  return { allowed: true, reason: "", exitCode: null, output: located.relative };
}

function commandEvidenceType(command: string) {
  if (command.includes("typecheck")) return "TYPECHECK_RESULT" as const;
  if (command.includes("build")) return "BUILD_RESULT" as const;
  return "TEST_RESULT" as const;
}

async function deny(
  input: { sessionId: string; productId: string },
  action: string,
  reason: string,
  path: string,
  command: string,
) {
  await recordActivity({
    productId: input.productId,
    type: "VERIFICATION_POLICY_DENIED",
    description: `Denied ${action}${path ? ` ${path}` : ""}${command ? ` ${command}` : ""}. ${reason}`,
    actor: "Testing & Verification Agent",
  });
}
