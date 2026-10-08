import "server-only";

import fs from "node:fs";
import path from "node:path";

import { recordActivity } from "@/modules/activity/service";
import { getAIProvider } from "@/modules/ai/provider";
import type { AgentExecutionRequest, AgentRunner } from "@/modules/agent/types";
import { commandForCheck } from "@/modules/coding/checks";
import { codingConfigurationGap } from "@/modules/coding/config";
import { captureWorkspaceDiff } from "@/modules/coding/git";
import { hashText, classifyWrite } from "@/modules/coding/policy";
import { CODING_SYSTEM_PROMPT, codingUserMessage } from "@/modules/coding/prompt";
import {
  findWorkspace,
  openEscalationCount,
  recordEscalation,
  recordEvidence,
  saveWorkspace,
} from "@/modules/coding/repository";
import {
  changeRequestSchema,
  completionAssessmentSchema,
  executionPlanSchema,
  repositoryAnalysisSchema,
  selfReviewSchema,
  type ChangeRequest,
} from "@/modules/coding/schema";
import { asStrings, clip } from "@/modules/coding/strings";
import { executeRepositoryTool, type ToolContext, type ToolResult } from "@/modules/coding/tools";
import { db } from "@/lib/db";
import { assessCodingReadiness } from "@/modules/governance/coding-readiness";
import { DomainError } from "@/modules/shared/errors";
import type { ZodType } from "zod";

const refusal =
  "The Coding Agent returned a response that did not match the required structure. Nothing further was written.";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export const codingRunner: AgentRunner = {
  agentType: "CODING",
  isConfigured() {
    return codingConfigurationGap() === null;
  },
  async assertCanRun(request) {
    await assertCodingRun(request);
  },
  async execute(request) {
    const phase = request.input.phase === "implement" ? "implement" : "plan";
    const workspace = await requireWorkspace(request.productId, text(request.input.workspaceId));
    if (phase === "plan") return runPlan(workspace);
    return runImplement(workspace, text(request.input.revision));
  },
};

async function assertCodingRun(request: AgentExecutionRequest) {
  const workspaceId = text(request.input.workspaceId);
  if (!workspaceId) throw new DomainError("Coding execution requires an isolated workspace.");
  const workspace = await findWorkspace(request.productId, workspaceId);
  if (!workspace?.contract) throw new DomainError("Coding execution requires an isolated workspace.");
  const readiness = await assessCodingReadiness(request.productId);
  if (!readiness.ready) throw new DomainError(readiness.blockers.join(" "));
  if (codingConfigurationGap() === "repository") {
    throw new DomainError("No repository is configured. Set PRODUCT_REPOSITORY_ROOT to a local Git repository.");
  }
  if (workspace.executionContractStale || workspace.contract.stale) {
    throw new DomainError(
      workspace.staleReason || "EXECUTION CONTRACT STALE. Review the contract before continuing.",
    );
  }
  const task = await db.implementationTask.findUnique({
    where: { id: workspace.implementationTaskId },
    include: { dependencies: { include: { dependsOn: true } }, codingRisks: true },
  });
  if (!task) throw new DomainError("The implementation task was not found.");
  if (!["APPROVED", "IN_PROGRESS", "CODE_REVIEW"].includes(task.status)) {
    throw new DomainError(`The implementation task is ${task.status}. Approve the task before coding.`);
  }
  const risk = task.codingRisks[0];
  const mode = risk ? (risk.overrideExecutionMode ?? risk.recommendedExecutionMode) : "HUMAN_ONLY";
  if (mode === "HUMAN_ONLY") {
    throw new DomainError("This task is HUMAN_ONLY and cannot be executed by the Coding Agent.");
  }
  for (const dependency of task.dependencies) {
    if (dependency.dependsOn.status !== "COMPLETED") {
      throw new DomainError(`Task is blocked by unresolved dependency ${dependency.dependsOn.title}.`);
    }
  }
  if (request.input.phase === "implement") {
    if (!workspace.plan || !["APPROVED", "COMPLETED"].includes(workspace.plan.status)) {
      throw new DomainError("Approve the execution plan before changing files.");
    }
    if (!["ACTIVE", "FAILED", "CHECKING"].includes(workspace.status)) {
      throw new DomainError("This workspace cannot continue implementation.");
    }
  }
}

async function requireWorkspace(productId: string, workspaceId: string) {
  const workspace = await findWorkspace(productId, workspaceId);
  if (!workspace?.contract) throw new DomainError("Coding execution requires an isolated workspace.");
  return workspace;
}

function toolContext(workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>): ToolContext {
  const contract = workspace.contract;
  if (!contract) throw new DomainError("Coding execution requires an execution contract.");
  return {
    workspaceId: workspace.id,
    productId: workspace.productId,
    workspacePath: workspace.workspacePath,
    allowedPaths: asStrings(contract.allowedPaths),
    restrictedPaths: asStrings(contract.restrictedPaths),
    allowFileDelete: contract.allowFileDelete,
    maxFiles: contract.maxFiles ?? 8,
    policyCommands: asStrings(contract.requiredChecks).filter((check) => check.startsWith("npm ")),
    stale: workspace.executionContractStale || contract.stale,
  };
}

function contractText(workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>) {
  const contract = workspace.contract;
  if (!contract) return "";
  return [
    `Allowed paths: ${asStrings(contract.allowedPaths).join(", ") || "none"}`,
    `Restricted paths: ${asStrings(contract.restrictedPaths).join(", ")}`,
    `Acceptance criteria: ${asStrings(contract.acceptanceCriteria).join(" | ") || "none"}`,
    `Architecture: ${contract.architectureConstraints}`,
    `Policy: ${contract.codingPolicyConstraints}`,
    `Checks: ${asStrings(contract.requiredChecks).join(", ")}`,
    `File limit: ${contract.maxFiles ?? 8}`,
    `Mode: ${contract.executionMode}`,
    `Dependencies: ${asStrings(contract.dependencies).join(", ") || "none"}`,
  ].join("\n");
}

async function ask<T>(schema: ZodType<T>, schemaName: string, input: {
  phase: "analysis" | "plan" | "change" | "review" | "completion";
  objective: string;
  contract: string;
  context: string;
  revision?: string;
}) {
  const provider = getAIProvider();
  const result = await provider.generate({
    systemPrompt: CODING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: codingUserMessage(input) }],
    responseSchema: schema,
    schemaName,
    temperature: 0.1,
  });
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new DomainError(refusal);
  return { data: parsed.data, model: result.model, usage: result.usage };
}

async function boundedContext(context: ToolContext) {
  const chunks: string[] = [];
  let budget = 40_000;
  let files = 0;
  const listed = await executeRepositoryTool(context, { action: "LIST_DIRECTORY", path: "." });
  if (listed.allowed && listed.content) chunks.push(`Directory .\n${listed.content}`);
  const candidates = ["package.json", "README.md", "tsconfig.json", ".env.example"];
  const roots = context.allowedPaths
    .map((pattern) => pattern.replace(/\/\*\*$/, "").replace(/\/\*$/, ""))
    .filter((pattern) => pattern.length > 0 && !pattern.includes("*"));
  const walk = (relative: string, depth: number) => {
    if (depth > 3) return;
    const absolute = path.join(context.workspacePath, relative);
    if (!fs.existsSync(absolute)) return;
    if (fs.statSync(absolute).isDirectory()) {
      for (const name of fs.readdirSync(absolute)) {
        if (name === "node_modules" || name === ".git") continue;
        walk(path.posix.join(relative, name), depth + 1);
      }
      return;
    }
    candidates.push(relative);
  };
  for (const root of roots) walk(root, 0);
  for (const file of [...new Set(candidates)]) {
    if (files >= 8 || budget <= 0) break;
    const read = await executeRepositoryTool(context, { action: "READ_FILE", path: file });
    if (!read.allowed || read.content == null) continue;
    const slice = read.content.slice(0, Math.min(4_000, budget));
    budget -= slice.length;
    files += 1;
    chunks.push(`File ${file}\n${slice}`);
  }
  return chunks.join("\n\n") || "No readable project files were found inside the contract.";
}

async function runPlan(workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>) {
  const context = toolContext(workspace);
  const contract = contractText(workspace);
  const objective = workspace.contract?.objective ?? "";
  await recordActivity({
    productId: workspace.productId,
    type: "CODING_EXECUTION_STARTED",
    description: `Coding execution started for task ${workspace.implementationTaskId}.`,
    actor: "Coding Agent",
  });
  const inspected = await boundedContext(context);
  const analysis = await ask(repositoryAnalysisSchema, "coding_repository_analysis", {
    phase: "analysis",
    objective,
    contract,
    context: inspected,
  });
  const plan = await ask(executionPlanSchema, "coding_execution_plan", {
    phase: "plan",
    objective,
    contract,
    context: `${inspected}\n\nAnalysis: ${analysis.data.summary}`,
  });
  const outside = plan.data.filesExpectedToChange.filter(
    (file) => !classifyWrite(file, context.allowedPaths, context.restrictedPaths).ok,
  );
  const overLimit = plan.data.filesExpectedToChange.length > context.maxFiles;
  if (outside.length > 0 || overLimit) {
    await escalate(workspace, "SCOPE_EXPANSION", "The execution plan leaves the contract.", outside.length > 0
      ? `Files outside the contract: ${outside.join(", ")}`
      : `The plan names more than ${context.maxFiles} files.`, "Revise the task or the coding policy before coding.");
    await db.codingExecutionPlan.upsert({
      where: { workspaceId: workspace.id },
      create: planData(workspace.id, plan.data, analysis.data.summary, "ESCALATED"),
      update: planData(workspace.id, plan.data, analysis.data.summary, "ESCALATED"),
    });
    await db.codingExecutionContract.update({
      where: { workspaceId: workspace.id },
      data: { status: "ESCALATED" },
    });
    return {
      output: {
        phase: "plan",
        workspaceId: workspace.id,
        autoContinue: false,
        escalated: true,
        outcome: "ESCALATED",
        summary: plan.data.summary,
        model: plan.model,
        usage: plan.usage,
      },
    };
  }
  const autonomous =
    workspace.contract?.executionMode === "AUTONOMOUS" && workspace.contract.riskLevel === "LOW";
  await db.codingExecutionPlan.upsert({
    where: { workspaceId: workspace.id },
    create: planData(workspace.id, plan.data, analysis.data.summary, autonomous ? "APPROVED" : "PROPOSED"),
    update: planData(workspace.id, plan.data, analysis.data.summary, autonomous ? "APPROVED" : "PROPOSED"),
  });
  return {
    output: {
      phase: "plan",
      workspaceId: workspace.id,
      autoContinue: autonomous,
      escalated: false,
      outcome: autonomous ? "APPROVED" : "PROPOSED",
      summary: plan.data.summary,
      model: plan.model,
      usage: plan.usage,
    },
  };
}

function planData(
  workspaceId: string,
  plan: { summary: string; filesExpectedToChange: string[]; steps: string[]; risks: string; validationPlan: string },
  analysisNote: string,
  status: "PROPOSED" | "APPROVED" | "ESCALATED",
) {
  return {
    workspaceId,
    summary: plan.summary,
    analysisNote,
    filesExpectedToChange: plan.filesExpectedToChange,
    steps: plan.steps,
    risks: plan.risks,
    validationPlan: plan.validationPlan,
    status,
  };
}

async function runImplement(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  revision: string,
) {
  const context = toolContext(workspace);
  const contract = contractText(workspace);
  const objective = workspace.contract?.objective ?? "";
  await saveWorkspace(workspace.id, { status: "ACTIVE" });
  await db.codingExecutionContract.update({
    where: { workspaceId: workspace.id },
    data: { status: "EXECUTING" },
  });
  await db.codingExecutionPlan.update({
    where: { workspaceId: workspace.id },
    data: { status: "EXECUTING" },
  });
  const inspected = await boundedContext(context);
  const revisionNote = revision
    ? await db.codingRevision.findFirst({ where: { id: revision, workspaceId: workspace.id } })
    : workspace.revisions.at(-1) ?? null;
  const revisionText = revisionNote
    ? `Feedback: ${revisionNote.feedback}\nRequired changes: ${revisionNote.requiredChanges}\nAffected files: ${asStrings(revisionNote.affectedFiles).join(", ")}`
    : "";
  const change = await ask(changeRequestSchema, "coding_change_request", {
    phase: "change",
    objective,
    contract,
    context: inspected,
    revision: revisionText,
  });
  if (change.data.escalation) {
    await escalate(
      workspace,
      change.data.escalation.type,
      change.data.escalation.description,
      change.data.escalation.reason,
      change.data.escalation.recommendedAction,
    );
    await finish(workspace, context, "ESCALATED", change.data.summary, false);
    return output(workspace.id, "ESCALATED", true, change.data.summary, change.model, change.usage);
  }

  let denied = false;
  for (const operation of change.data.operations) {
    const result = await executeRepositoryTool(context, operation);
    if (!result.allowed) {
      denied = true;
      await escalate(workspace, escalationKind(result), result.reason, result.reason, "Stay inside the execution contract.");
      break;
    }
    if (result.reason === "unchanged") continue;
    await recordEvidence({
      workspaceId: workspace.id,
      implementationTaskId: workspace.implementationTaskId,
      type: "FILE_CHANGE",
      source: "REPOSITORY",
      description: `${operation.action} ${operation.path}`,
      result: "CHANGED",
    });
  }
  for (const command of change.data.commands) {
    const result = await executeRepositoryTool(context, { action: "RUN_COMMAND", command });
    if (!result.allowed) {
      denied = true;
      await escalate(workspace, "POLICY_CONFLICT", result.reason, result.reason, "Use an approved check.");
    }
  }

  await saveWorkspace(workspace.id, { status: "CHECKING" });
  const checksOk = await runChecks(workspace, context);
  const review = await ask(selfReviewSchema, "coding_self_review", {
    phase: "review",
    objective,
    contract,
    context: clip(inspected, 2000),
  });
  await db.codingSelfReview.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, summary: review.data.summary, findings: review.data },
    update: { summary: review.data.summary, findings: review.data },
  });
  await recordEvidence({
    workspaceId: workspace.id,
    implementationTaskId: workspace.implementationTaskId,
    type: "AGENT_ANALYSIS",
    source: "AI_ANALYSIS",
    description: review.data.summary,
    result: "AI ANALYSIS",
  });
  const completion = await ask(completionAssessmentSchema, "coding_completion", {
    phase: "completion",
    objective,
    contract,
    context: `Checks passed: ${checksOk}. Policy denial: ${denied}.`,
  });
  const open = await openEscalationCount(workspace.id);
  const outcome = decide(completion.data.proposal, checksOk, denied, open > 0);
  await finish(workspace, context, outcome, change.data.summary, true);
  return output(workspace.id, outcome, outcome === "ESCALATED", change.data.summary, completion.model, completion.usage);
}

function decide(
  proposal: ChangeRequest["completionProposal"],
  checksOk: boolean,
  denied: boolean,
  escalated: boolean,
) {
  if (escalated || denied) return "ESCALATED" as const;
  if (!checksOk) return "FAILED" as const;
  if (proposal === "FAILED") return "FAILED" as const;
  if (proposal === "ESCALATED") return "ESCALATED" as const;
  if (proposal === "COMPLETED_WITH_CONCERNS") return "COMPLETED_WITH_CONCERNS" as const;
  return "COMPLETED" as const;
}

function escalationKind(result: ToolResult) {
  if (result.kind === "secret" || result.kind === "restricted") return "SECURITY_CONCERN" as const;
  if (result.kind === "test") return "TEST_FAILURE" as const;
  if (result.kind === "limit" || result.kind === "scope") return "SCOPE_EXPANSION" as const;
  if (result.kind === "command" || result.kind === "delete" || result.kind === "stale") return "POLICY_CONFLICT" as const;
  return "OTHER" as const;
}

async function runChecks(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  context: ToolContext,
) {
  const labels = asStrings(workspace.contract?.requiredChecks);
  let ok = labels.length > 0;
  for (const label of labels) {
    const mapped = commandForCheck(label, context.policyCommands);
    const startedAt = new Date();
    if (!mapped) {
      ok = false;
      await recordEvidence({
        workspaceId: workspace.id,
        implementationTaskId: workspace.implementationTaskId,
        type: "STATIC_ANALYSIS",
        source: "COMMAND_RUNNER",
        description: label,
        result: "NOT RUN",
        command: label,
        exitCode: null,
        startedAt,
        completedAt: new Date(),
      });
      continue;
    }
    const result = await executeRepositoryTool(context, { action: "RUN_COMMAND", command: mapped.command });
    const exitCode = typeof result.metadata.exitCode === "number" ? result.metadata.exitCode : null;
    const passed = result.allowed && exitCode === 0;
    if (!passed) ok = false;
    await recordEvidence({
      workspaceId: workspace.id,
      implementationTaskId: workspace.implementationTaskId,
      type: mapped.type,
      source: "COMMAND_RUNNER",
      description: label,
      result: passed ? "PASS" : "FAIL",
      command: mapped.command,
      exitCode,
      startedAt,
      completedAt: new Date(),
    });
  }
  await recordActivity({
    productId: workspace.productId,
    type: "CODING_CHECKS_COMPLETED",
    description: ok ? "Required checks passed." : "Required checks did not pass.",
    actor: "Coding Agent",
  });
  return ok;
}

async function finish(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  context: ToolContext,
  outcome: "COMPLETED" | "COMPLETED_WITH_CONCERNS" | "ESCALATED" | "FAILED",
  summary: string,
  storeDiff: boolean,
) {
  if (storeDiff) {
    const diff = await captureWorkspaceDiff(context.workspacePath);
    await db.codingDiff.upsert({
      where: { workspaceId: workspace.id },
      create: {
        workspaceId: workspace.id,
        files: diff.files,
        additions: diff.additions,
        deletions: diff.deletions,
        patch: diff.patch,
        truncated: diff.truncated,
      },
      update: {
        files: diff.files,
        additions: diff.additions,
        deletions: diff.deletions,
        patch: diff.patch,
        truncated: diff.truncated,
      },
    });
    const digest = hashText(diff.fullPatch);
    await db.codeChangeApproval.updateMany({
      where: { workspaceId: workspace.id, stale: false, diffHash: { not: digest } },
      data: {
        stale: true,
        staleReason: "The workspace changed after this approval.",
        staleFlaggedAt: new Date(),
      },
    });
  }
  const ready = outcome === "COMPLETED" || outcome === "COMPLETED_WITH_CONCERNS";
  await saveWorkspace(workspace.id, {
    status: ready ? "READY_FOR_REVIEW" : outcome === "FAILED" ? "FAILED" : "ACTIVE",
  });
  await db.codingExecutionContract.update({
    where: { workspaceId: workspace.id },
    data: { status: ready ? "COMPLETED" : outcome === "FAILED" ? "FAILED" : "ESCALATED" },
  });
  if (workspace.plan) {
    await db.codingExecutionPlan.update({
      where: { workspaceId: workspace.id },
      data: { status: ready ? "COMPLETED" : outcome === "FAILED" ? "COMPLETED" : "ESCALATED" },
    });
  }
  await db.implementationTask.update({
    where: { id: workspace.implementationTaskId },
    data: { status: ready ? "CODE_REVIEW" : "IN_PROGRESS" },
  });
  if (ready) {
    await recordActivity({
      productId: workspace.productId,
      type: "CODING_READY_FOR_REVIEW",
      description: `Coding changes are ready for human review. ${summary}`,
      actor: "Coding Agent",
    });
  }
}

async function escalate(
  workspace: { id: string; productId: string },
  type: "REQUIREMENT_AMBIGUITY" | "ARCHITECTURE_CONFLICT" | "MISSING_DEPENDENCY" | "POLICY_CONFLICT" | "SCOPE_EXPANSION" | "TEST_FAILURE" | "SECURITY_CONCERN" | "UNEXPECTED_CODEBASE" | "OTHER",
  description: string,
  reason: string,
  recommendedAction: string,
) {
  await recordEscalation({ workspaceId: workspace.id, type, description, reason, recommendedAction });
  await recordActivity({
    productId: workspace.productId,
    type: "CODING_ESCALATION_CREATED",
    description: `${type}: ${description}`,
    actor: "Coding Agent",
  });
}

function output(
  workspaceId: string,
  outcome: string,
  escalated: boolean,
  summary: string,
  model: string,
  usage: { inputTokens: number | null; outputTokens: number | null },
) {
  return {
    output: {
      phase: "implement",
      workspaceId,
      autoContinue: false,
      escalated,
      outcome,
      summary,
      model,
      usage,
    },
  };
}
