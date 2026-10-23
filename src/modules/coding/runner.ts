import "server-only";

import fs from "node:fs";
import path from "node:path";

import { recordActivity } from "@/modules/activity/service";
import { aiRunEvidence } from "@/modules/ai/evidence";
import { AIFailure } from "@/modules/ai/failures";
import { getAIProvider } from "@/modules/ai/provider";
import type { AgentExecutionRequest, AgentRunner } from "@/modules/agent/types";
import { codingConfigurationGap } from "@/modules/coding/config";
import { productRepositoryReady, REPOSITORY_NOT_CONFIGURED } from "@/modules/source-control/product-repository";
import { persistenceEvidenceOutput, persistenceUserMessage } from "@/modules/coding/diff";
import { storeWorkspaceResult } from "@/modules/coding/diff-store";
import { captureWorkspaceDiff } from "@/modules/coding/git";
import {
  alignExecutionPlan,
  assessBootstrapCompleteness,
  designFactsFromSources,
  existingSchemaPlanningNote,
  planningBootstrapNote,
  trimRedundantSchemaScope,
  type DesignFacts,
} from "@/modules/coding/bootstrap";
import {
  assessImplementationCompleteness,
  commandsAfterImplementationRepair,
  containsDummyPrismaModel,
  implementationGapText,
  initialSchemaContext,
  readPlannedImplementationFiles,
} from "@/modules/coding/implementation";
import {
  compileExecutionContract,
  deriveExecutionCommands,
  executionCommandsForPlan,
  inspectWorkspacePackage,
  parsePlannedCommands,
  preflightExecutionPlan,
  stepsWithCommands,
  validationPlanText,
  type CompiledExecutionContract,
  type PlannedCommand,
} from "@/modules/coding/commands";
import { classifyWrite, isTestFile, outsideApprovedPlan } from "@/modules/coding/policy";
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
  repairRequestSchema,
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
    const phase = request.input.phase === "implement" ? "implement" : request.input.phase === "repair" ? "repair" : "plan";
    const workspace = await requireWorkspace(request.productId, text(request.input.workspaceId));
    if (phase === "plan") return runPlan(workspace);
    if (phase === "repair") return runRepair(workspace, request.input);
    return runImplement(workspace, text(request.input.revision), request.input);
  },
};

async function assertCodingRun(request: AgentExecutionRequest) {
  const workspaceId = text(request.input.workspaceId);
  if (!workspaceId) throw new DomainError("Coding execution requires an isolated workspace.");
  const workspace = await findWorkspace(request.productId, workspaceId);
  if (!workspace?.contract) throw new DomainError("Coding execution requires an isolated workspace.");
  const readiness = await assessCodingReadiness(request.productId);
  if (!readiness.ready) throw new DomainError(readiness.blockers.join(" "));
  if (!(await productRepositoryReady(request.productId))) {
    throw new DomainError(REPOSITORY_NOT_CONFIGURED);
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
  if (request.input.phase === "implement" || request.input.phase === "repair") {
    if (!workspace.plan || !["APPROVED", "COMPLETED"].includes(workspace.plan.status)) {
      throw new DomainError("Execution plan approval is required before Coding can start.");
    }
    if (!["ACTIVE", "FAILED", "CHECKING", "ABANDONED"].includes(workspace.status)) {
      throw new DomainError("This workspace cannot continue implementation.");
    }
    const flight = boundContract(workspace, request.input);
    if (!flight.ready) {
      throw new DomainError(
        flight.blockers[0]?.message
          ?? "Execution Plan cannot be approved because a required operation is not permitted by the current coding contract.",
      );
    }
  }
}

async function requireWorkspace(productId: string, workspaceId: string) {
  const workspace = await findWorkspace(productId, workspaceId);
  if (!workspace?.contract) throw new DomainError("Coding execution requires an isolated workspace.");
  return workspace;
}

export function boundContract(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  input: unknown,
) {
  const stored = input && typeof input === "object" && "executionContract" in input
    ? (input as { executionContract?: unknown }).executionContract
    : null;
  if (stored && typeof stored === "object") {
    const record = stored as Partial<CompiledExecutionContract>;
    return compileExecutionContract({
      planVersion: typeof record.planVersion === "number" ? record.planVersion : workspace.plan?.version ?? 0,
      files: record.allowedFiles ?? workspace.plan?.filesExpectedToChange,
      allowedPaths: workspace.contract?.allowedPaths,
      restrictedPaths: workspace.contract?.restrictedPaths,
      setupCommands: record.setupCommands,
      validationCommands: [...parsePlannedCommands(record.validationCommands), ...parsePlannedCommands(record.notApplicableChecks)],
    });
  }
  return compileExecutionContract({
    planVersion: workspace.plan?.version ?? 0,
    files: workspace.plan?.filesExpectedToChange,
    allowedPaths: workspace.contract?.allowedPaths,
    restrictedPaths: workspace.contract?.restrictedPaths,
    setupCommands: workspace.plan?.setupCommands,
    validationCommands: workspace.plan?.validationCommands,
  });
}

function toolContext(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  executableCommands: string[],
): ToolContext {
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
    policyCommands: executableCommands,
    stale: workspace.executionContractStale || contract.stale,
  };
}

function contractText(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  compiled: CompiledExecutionContract,
) {
  const contract = workspace.contract;
  if (!contract) return "";
  return [
    `Allowed paths: ${asStrings(contract.allowedPaths).join(", ") || "none"}`,
    `Restricted paths: ${asStrings(contract.restrictedPaths).join(", ")}`,
    `Acceptance criteria: ${asStrings(contract.acceptanceCriteria).join(" | ") || "none"}`,
    `Architecture: ${contract.architectureConstraints}`,
    `Policy: ${contract.codingPolicyConstraints}`,
    `Execution plan version: ${compiled.planVersion}`,
    `Authorised setup commands: ${compiled.setupCommands.join(", ") || "none"}`,
    `Authorised validation commands: ${compiled.validationCommands.map((item) => item.command).join(", ") || "none"}`,
    `Not applicable: ${compiled.notApplicableChecks.map((item) => `${item.command} (${item.reason})`).join("; ") || "none"}`,
    "Run only authorised commands. Do not invent a command that is not listed.",
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
  const provider = await getAIProvider();
  const result = await provider.generate({
    systemPrompt: CODING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: codingUserMessage(input) }],
    responseSchema: schema,
    schemaName,
    temperature: 0.1,
  }).catch((error: unknown) => {
    if (error instanceof AIFailure && !error.diagnostics) {
      throw new AIFailure(error.message, error.category, {
        operation: schemaName,
        validationStage: "response schema",
        repairAttempted: false,
        issues: [],
      });
    }
    throw error;
  });
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new DomainError(refusal);
  return { data: parsed.data, ...aiRunEvidence(result) };
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
  const compiled = boundContract(workspace, null);
  const context = toolContext(workspace, compiled.contract.executableCommands);
  const contract = contractText(workspace, compiled.contract);
  const objective = workspace.contract?.objective ?? "";
  await recordActivity({
    productId: workspace.productId,
    type: "CODING_EXECUTION_STARTED",
    description: `Coding execution started for task ${workspace.implementationTaskId}.`,
    actor: "Coding Agent",
  });
  const inspected = await boundedContext(context);
  const design = await designFactsFor(workspace);
  const bootstrapNote = planningBootstrapNote(assessBootstrapCompleteness({
    files: [],
    validationCommands: [{ command: "npm run build", applicability: "REQUIRED" }],
    design,
    greenfield: true,
  }));
  const schemaPath = path.join(workspace.workspacePath, "prisma", "schema.prisma");
  const schemaContent = fs.existsSync(/*turbopackIgnore: true*/ schemaPath)
    ? fs.readFileSync(/*turbopackIgnore: true*/ schemaPath, "utf8")
    : null;
  const schemaNote = existingSchemaPlanningNote(schemaContent);
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
    context: [inspected, `Analysis: ${analysis.data.summary}`, bootstrapNote, schemaNote].filter(Boolean).join("\n\n"),
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
        provider: plan.provider,
        model: plan.model,
        usage: plan.usage,
      },
    };
  }
  const prepared = await preparePlanContract(workspace, plan.data.filesExpectedToChange, plan.data.steps, plan.data.validationPlan, design);
  const enriched = {
    ...plan.data,
    filesExpectedToChange: prepared.files,
    steps: prepared.steps,
    validationPlan: prepared.validationPlan,
    setupCommands: prepared.commands.setupCommands,
    validationCommands: prepared.commands.validationCommands,
  };
  const policyBlockers = prepared.flight.blockers.filter((item) => item.category !== "COMPLETENESS");
  const completenessBlockers = prepared.flight.blockers.filter((item) => item.category === "COMPLETENESS");
  if (policyBlockers.length === 0 && completenessBlockers.length > 0) {
    await db.codingExecutionPlan.upsert({
      where: { workspaceId: workspace.id },
      create: planData(workspace.id, enriched, analysis.data.summary, "PROPOSED"),
      update: planData(workspace.id, enriched, analysis.data.summary, "PROPOSED"),
    });
    return {
      output: {
        phase: "plan",
        workspaceId: workspace.id,
        autoContinue: false,
        escalated: false,
        outcome: "PROPOSED",
        summary: completenessBlockers[0]?.message ?? plan.data.summary,
        provider: plan.provider,
        model: plan.model,
        usage: plan.usage,
      },
    };
  }
  if (!prepared.flight.ready) {
    await escalate(
      workspace,
      "POLICY_CONFLICT",
      "The execution plan conflicts with the coding contract.",
      prepared.flight.blockers[0]?.message ?? "Execution Plan cannot be approved because a required operation is not permitted.",
      "Revise the execution plan before coding.",
    );
    await db.codingExecutionPlan.upsert({
      where: { workspaceId: workspace.id },
      create: planData(workspace.id, enriched, analysis.data.summary, "ESCALATED"),
      update: planData(workspace.id, enriched, analysis.data.summary, "ESCALATED"),
    });
    return {
      output: {
        phase: "plan",
        workspaceId: workspace.id,
        autoContinue: false,
        escalated: true,
        outcome: "ESCALATED",
        summary: plan.data.summary,
        provider: plan.provider,
        model: plan.model,
        usage: plan.usage,
      },
    };
  }
  const autonomous =
    workspace.contract?.executionMode === "AUTONOMOUS" && workspace.contract.riskLevel === "LOW";
  const existingPlan = workspace.plan;
  const revising = existingPlan?.status === "CHANGES_REQUESTED";
  const version = revising && existingPlan ? existingPlan.version + 1 : existingPlan?.version ?? 1;
  const approvedAt = autonomous && !revising ? existingPlan?.approvedAt ?? new Date() : revising ? null : existingPlan?.approvedAt ?? null;
  const approvedBy = autonomous && !revising ? existingPlan?.approvedBy || "Coding Agent" : revising ? "" : existingPlan?.approvedBy ?? "";
  await db.codingExecutionPlan.upsert({
    where: { workspaceId: workspace.id },
    create: {
      ...planData(workspace.id, enriched, analysis.data.summary, autonomous ? "APPROVED" : "PROPOSED"),
      version,
      approvedBy,
      approvedAt,
    },
    update: {
      ...planData(workspace.id, enriched, analysis.data.summary, autonomous ? "APPROVED" : "PROPOSED"),
      version,
      approvedBy,
      approvedAt,
      changeRequest: revising ? existingPlan?.changeRequest ?? "" : existingPlan?.changeRequest ?? "",
    },
  });
  return {
    output: {
      phase: "plan",
      workspaceId: workspace.id,
      autoContinue: autonomous,
      escalated: false,
      outcome: autonomous ? "APPROVED" : "PROPOSED",
      summary: plan.data.summary,
      provider: plan.provider,
      model: plan.model,
      usage: plan.usage,
    },
  };
}

async function preparePlanContract(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  files: string[],
  steps: string[],
  validationPlan: string,
  design?: DesignFacts,
) {
  const product = await db.product.findUnique({
    where: { id: workspace.productId },
    select: { developmentContext: true },
  });
  const inspected = inspectWorkspacePackage(workspace.workspacePath);
  const greenfield = product?.developmentContext === "GREENFIELD";
  const schemaPath = path.join(workspace.workspacePath, "prisma", "schema.prisma");
  const schemaContent = fs.existsSync(/*turbopackIgnore: true*/ schemaPath)
    ? fs.readFileSync(/*turbopackIgnore: true*/ schemaPath, "utf8")
    : null;
  const trimmed = trimRedundantSchemaScope({ files, steps, schemaContent });
  const existingOnDisk = trimmed.files.filter((file) =>
    fs.existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ workspace.workspacePath, file)),
  );
  const derived = deriveExecutionCommands({
    greenfield,
    filesExpected: trimmed.files,
    packageJson: inspected.packageJson,
    nodeModulesPresent: inspected.nodeModulesPresent,
    requiredChecks: asStrings(workspace.contract?.requiredChecks),
    validationPlan,
  });
  const commands = executionCommandsForPlan(derived);
  const draftedSteps = stepsWithCommands(trimmed.steps, derived);
  const draftedValidation = validationPlanText(derived, validationPlan);
  const aligned = alignExecutionPlan({
    files: trimmed.files,
    steps: draftedSteps,
    validationCommands: commands.validationCommands,
    validationPlan: draftedValidation,
    existingFiles: existingOnDisk,
  });
  const flight = preflightExecutionPlan({
    files: trimmed.files,
    steps: aligned.steps,
    allowedPaths: asStrings(workspace.contract?.allowedPaths),
    restrictedPaths: asStrings(workspace.contract?.restrictedPaths),
    setupCommands: commands.setupCommands,
    validationCommands: commands.validationCommands,
    derived,
  });
  const completeness = assessBootstrapCompleteness({
    files: trimmed.files,
    steps: aligned.steps,
    validationCommands: commands.validationCommands,
    validationPlan: aligned.validationPlan,
    design: design ?? await designFactsFor(workspace),
    greenfield,
    existingFiles: existingEntryFiles(workspace.workspacePath),
  });
  return {
    flight: {
      ready: flight.ready && completeness.ready,
      blockers: [...completeness.blockers, ...flight.blockers],
    },
    commands,
    files: trimmed.files,
    steps: aligned.steps,
    validationPlan: aligned.validationPlan,
    completeness,
  };
}

async function initialSchemaContextFor(workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>) {
  const architecture = await db.solutionArchitecture.findFirst({
    where: { productId: workspace.productId, status: "APPROVED" },
    orderBy: { version: "desc" },
    select: {
      dataApproach: true,
      dataEntities: { select: { name: true, description: true, relationships: true } },
    },
  });
  return initialSchemaContext({
    dataApproach: architecture?.dataApproach,
    entities: architecture?.dataEntities,
  });
}

async function recordCommandEvidence(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  context: ToolContext,
  command: string,
) {
  const startedAt = new Date();
  const result = await executeRepositoryTool(context, { action: "RUN_COMMAND", command });
  const exitCode = typeof result.metadata.exitCode === "number" ? result.metadata.exitCode : null;
  const passed = result.allowed && exitCode === 0;
  await recordEvidence({
    workspaceId: workspace.id,
    implementationTaskId: workspace.implementationTaskId,
    type: evidenceType(command),
    source: "COMMAND_RUNNER",
    description: command,
    result: passed ? "PASS" : "FAIL",
    command,
    output: commandOutput(result),
    exitCode,
    startedAt,
    completedAt: new Date(),
  });
  return passed;
}

async function designFactsFor(workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>): Promise<DesignFacts> {
  const architecture = await db.solutionArchitecture.findFirst({
    where: { productId: workspace.productId, status: "APPROVED" },
    orderBy: { version: "desc" },
    include: { technologies: { select: { choice: true } } },
  });
  return designFactsFromSources({
    architecture,
    task: workspace.task,
    fallbackSummary: workspace.contract?.architectureConstraints ?? "",
  });
}

function existingEntryFiles(workspacePath: string) {
  return ["src/app/layout.tsx", "src/app/page.tsx", "app/layout.tsx", "app/page.tsx", "src/pages/index.tsx", "pages/index.tsx"]
    .filter((file) => fs.existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ workspacePath, file)));
}

function planData(
  workspaceId: string,
  plan: {
    summary: string;
    filesExpectedToChange: string[];
    steps: string[];
    risks: string;
    validationPlan: string;
    setupCommands?: string[];
    validationCommands?: PlannedCommand[];
  },
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
    setupCommands: plan.setupCommands ?? [],
    validationCommands: plan.validationCommands ?? [],
    status,
  };
}

async function runImplement(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  revision: string,
  input: unknown,
) {
  const compiled = boundContract(workspace, input);
  const context = toolContext(workspace, compiled.contract.executableCommands);
  const contract = contractText(workspace, compiled.contract);
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
  const expected = asStrings(workspace.plan?.filesExpectedToChange);
  const approvedPlan = workspace.plan
    ? [
        `Approved execution plan version ${workspace.plan.version}: ${workspace.plan.summary}`,
        `Steps: ${asStrings(workspace.plan.steps).join(" | ")}`,
        `Files in the approved plan: ${expected.join(", ") || "none listed"}`,
        `Validation: ${workspace.plan.validationPlan}`,
        `Risks: ${workspace.plan.risks}`,
        "Do not change a file that is not in the approved plan.",
      ].join("\n")
    : "";
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
    context: `${approvedPlan}\n\n${inspected}`,
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
    return output(workspace.id, "ESCALATED", true, change.data.summary, change.provider, change.model, change.usage, compiled.contract);
  }

  let denied = false;
  for (const operation of change.data.operations) {
    if (!isTestFile(operation.path) && outsideApprovedPlan(operation.path, expected)) {
      denied = true;
      await escalate(
        workspace,
        "SCOPE_EXPANSION",
        "The change is outside the approved execution plan.",
        `File not in the approved plan: ${operation.path}`,
        "Request a revised execution plan before changing that file.",
      );
      break;
    }
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
  const steps = asStrings(workspace.plan?.steps);
  const implementation = assessImplementationCompleteness({
    steps,
    files: readPlannedImplementationFiles(context.workspacePath, steps),
  });
  if (!implementation.complete) {
    for (const gap of implementation.gaps) {
      await recordEvidence({
        workspaceId: workspace.id,
        implementationTaskId: workspace.implementationTaskId,
        type: "STATIC_ANALYSIS",
        source: "REPOSITORY",
        description: implementationGapText(gap),
        result: "FAIL",
      });
    }
    await recordSkippedCommands(workspace, [
      ...compiled.contract.setupCommands,
      ...compiled.contract.validationCommands.map((item) => item.command),
    ], "Not run because the implementation is incomplete.");
    await finish(workspace, context, "FAILED", change.data.summary, true);
    return output(workspace.id, "FAILED", false, change.data.summary, change.provider, change.model, change.usage, compiled.contract);
  }
  const contractCommands = new Set([
    ...compiled.contract.setupCommands,
    ...compiled.contract.validationCommands.map((item) => item.command),
    ...compiled.contract.notApplicableChecks.map((item) => item.command),
  ]);
  for (const command of change.data.commands) {
    if (contractCommands.has(command)) continue;
    const skipped = compiled.contract.notApplicableChecks.find((item) => item.command === command);
    if (skipped) {
      await recordEvidence({
        workspaceId: workspace.id,
        implementationTaskId: workspace.implementationTaskId,
        type: evidenceType(command),
        source: "COMMAND_RUNNER",
        description: `NOT APPLICABLE. ${skipped.command}. ${skipped.reason}`,
        result: "NOT APPLICABLE",
        command: "",
        exitCode: null,
        startedAt: new Date(),
        completedAt: new Date(),
      });
      continue;
    }
    const result = await executeRepositoryTool(context, { action: "RUN_COMMAND", command });
    if (!result.allowed) {
      denied = true;
      await escalate(workspace, "POLICY_CONFLICT", result.reason, result.reason, "Use a command from the approved execution contract.");
    }
  }

  const setup = await runSetupCommands(workspace, context, compiled.contract.setupCommands);
  if (setup.denied) denied = true;
  await saveWorkspace(workspace.id, { status: "CHECKING" });
  const checksOk = setup.ok ? await runChecks(workspace, context, compiled.contract) : false;
  if (!setup.ok) await recordSkippedChecks(workspace, compiled.contract, "Not run because a setup command failed.");
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
  return output(workspace.id, outcome, outcome === "ESCALATED", change.data.summary, completion.provider, completion.model, completion.usage, compiled.contract);
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

async function runSetupCommands(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  context: ToolContext,
  commands: string[],
) {
  let ok = true;
  let denied = false;
  for (const command of commands) {
    const startedAt = new Date();
    const result = await executeRepositoryTool(context, { action: "RUN_COMMAND", command });
    const exitCode = typeof result.metadata.exitCode === "number" ? result.metadata.exitCode : null;
    const passed = result.allowed && exitCode === 0;
    if (!passed) ok = false;
    if (!result.allowed) denied = true;
    await recordEvidence({
      workspaceId: workspace.id,
      implementationTaskId: workspace.implementationTaskId,
      type: evidenceType(command),
      source: "COMMAND_RUNNER",
      description: command,
      result: passed ? "PASS" : "FAIL",
      command,
      output: commandOutput(result),
      exitCode,
      startedAt,
      completedAt: new Date(),
    });
    if (!passed) {
      if (!result.allowed) {
        await escalate(workspace, "POLICY_CONFLICT", `${command} is not authorised.`, result.reason, "Revise the execution plan before coding continues.");
      }
      break;
    }
  }
  return { ok, denied };
}

async function recordSkippedChecks(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  compiled: CompiledExecutionContract,
  reason: string,
) {
  await recordSkippedCommands(workspace, compiled.validationCommands.map((item) => item.command), reason);
}

async function recordSkippedCommands(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  commands: string[],
  reason: string,
) {
  for (const command of commands) {
    await recordEvidence({
      workspaceId: workspace.id,
      implementationTaskId: workspace.implementationTaskId,
      type: evidenceType(command),
      source: "COMMAND_RUNNER",
      description: `${command}. ${reason}`,
      result: "NOT RUN",
      command,
      exitCode: null,
      startedAt: new Date(),
      completedAt: new Date(),
    });
  }
}

function commandOutput(result: ToolResult) {
  return typeof result.metadata.output === "string" ? result.metadata.output : "";
}

async function runRepair(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  input: unknown,
) {
  const compiled = boundContract(workspace, input);
  const context = toolContext(workspace, compiled.contract.executableCommands);
  const record = input && typeof input === "object" ? input as { failures?: unknown; attempt?: unknown } : {};
  const failures = Array.isArray(record.failures)
    ? record.failures.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const failure = item as { command?: unknown; output?: unknown };
        return typeof failure.command === "string" ? [{ command: failure.command, output: typeof failure.output === "string" ? failure.output : "" }] : [];
      })
    : [];
  const steps = asStrings(workspace.plan?.steps);
  const gaps = assessImplementationCompleteness({
    steps,
    files: readPlannedImplementationFiles(context.workspacePath, steps),
  }).gaps;
  const validationCommands = compiled.contract.validationCommands
    .filter((item) => item.applicability !== "NOT_APPLICABLE")
    .map((item) => item.command);
  const commandPlan = commandsAfterImplementationRepair({
    failed: failures.map((item) => item.command),
    setupCommands: compiled.contract.setupCommands,
    validationCommands,
    gaps,
  });
  const expected = asStrings(workspace.plan?.filesExpectedToChange);
  const schemaContext = await initialSchemaContextFor(workspace);
  const modelWork = steps.filter((step) => /prisma\/schema\.prisma/i.test(step) && /\bmodels?\b/i.test(step));
  const schemaPath = path.join(context.workspacePath, "prisma/schema.prisma");
  const currentSchema = fs.existsSync(/*turbopackIgnore: true*/ schemaPath)
    ? fs.readFileSync(/*turbopackIgnore: true*/ schemaPath, "utf8")
    : "";
  const repair = await ask(repairRequestSchema, "coding_repair", {
    phase: "change",
    objective: workspace.contract?.objective ?? "",
    contract: contractText(workspace, compiled.contract),
    context: [
      `Repair attempt ${typeof record.attempt === "number" ? record.attempt : 1}.`,
      `Approved execution plan version ${workspace.plan?.version ?? "unknown"}.`,
      "Fix the implementation inside the approved files. Do not add commands. Do not change the execution plan.",
      `Approved files: ${expected.join(", ") || "none"}.`,
      modelWork.length ? `Work item requiring initial Prisma models:\n${modelWork.join("\n")}` : "",
      currentSchema ? `Current prisma/schema.prisma:\n${currentSchema}` : "",
      schemaContext.named ? schemaContext.text : "The approved design does not name an initial schema model. Do not invent one.",
      "Do not add a model named Example, Test, or Placeholder.",
      "Do not add application behaviour beyond the initial schema models named by the approved design.",
      ...failures.map((item) => `Failed command ${item.command}\n${item.output}`),
    ].filter(Boolean).join("\n\n"),
  });
  let blocked = false;
  for (const operation of repair.data.operations) {
    if (!isTestFile(operation.path) && outsideApprovedPlan(operation.path, expected)) {
      blocked = true;
      await escalate(
        workspace,
        "SCOPE_EXPANSION",
        "The repair is outside the approved execution plan.",
        `File not in the approved plan: ${operation.path}`,
        "Keep the repair inside the approved files, or review the execution plan if the scope is insufficient.",
      );
      break;
    }
    if (operation.path.replaceAll("\\", "/") === "prisma/schema.prisma" && containsDummyPrismaModel(operation.content ?? "")) {
      blocked = true;
      await escalate(
        workspace,
        "REQUIREMENT_AMBIGUITY",
        "The repair proposed a placeholder Prisma model.",
        "Example, Test, and Placeholder are not approved schema models.",
        "Use the initial model named by the approved design.",
      );
      break;
    }
    const result = await executeRepositoryTool(context, operation);
    if (!result.allowed) {
      blocked = true;
      await escalate(workspace, escalationKind(result), result.reason, result.reason, "Stay inside the execution contract.");
      break;
    }
    if (result.reason === "unchanged") continue;
    await recordEvidence({
      workspaceId: workspace.id,
      implementationTaskId: workspace.implementationTaskId,
      type: "FILE_CHANGE",
      source: "REPOSITORY",
      description: `REPAIR ${operation.action} ${operation.path}`,
      result: "CHANGED",
    });
  }
  let ok = !blocked && (commandPlan.rerun.length > 0 || commandPlan.continueValidation.length > 0);
  if (!blocked) {
    let setupOk = true;
    for (const command of commandPlan.rerun) {
      const passed = await recordCommandEvidence(workspace, context, command);
      if (!passed) {
        ok = false;
        if (compiled.contract.setupCommands.includes(command)) setupOk = false;
      }
    }
    if (setupOk) {
      for (const command of commandPlan.continueValidation) {
        const passed = await recordCommandEvidence(workspace, context, command);
        if (!passed) ok = false;
      }
    }
  }
  const outcome = ok ? "COMPLETED" : "FAILED";
  await finish(workspace, context, outcome, repair.data.summary, true, "repair");
  return output(workspace.id, outcome, !ok && blocked, repair.data.summary, repair.provider, repair.model, repair.usage, compiled.contract);
}

function evidenceType(command: string) {
  const lower = command.toLowerCase();
  if (lower.includes("typecheck")) return "TYPECHECK" as const;
  if (lower.includes("lint")) return "LINT" as const;
  if (lower.includes("build")) return "BUILD" as const;
  if (lower.includes("test")) return "TEST_RESULT" as const;
  return "STATIC_ANALYSIS" as const;
}

async function runChecks(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  context: ToolContext,
  compiled: CompiledExecutionContract,
) {
  let ok = true;
  for (const check of compiled.notApplicableChecks) {
    await recordEvidence({
      workspaceId: workspace.id,
      implementationTaskId: workspace.implementationTaskId,
      type: evidenceType(check.command),
      source: "COMMAND_RUNNER",
      description: `NOT APPLICABLE. ${check.command}. ${check.reason}`,
      result: "NOT APPLICABLE",
      command: "",
      exitCode: null,
      startedAt: new Date(),
      completedAt: new Date(),
    });
  }
  for (const check of compiled.validationCommands) {
    const startedAt = new Date();
    const result = await executeRepositoryTool(context, { action: "RUN_COMMAND", command: check.command });
    const exitCode = typeof result.metadata.exitCode === "number" ? result.metadata.exitCode : null;
    const passed = result.allowed && exitCode === 0;
    if (!passed && check.applicability === "REQUIRED") ok = false;
    await recordEvidence({
      workspaceId: workspace.id,
      implementationTaskId: workspace.implementationTaskId,
      type: evidenceType(check.command),
      source: "COMMAND_RUNNER",
      description: check.command,
      result: passed ? "PASS" : "FAIL",
      command: check.command,
      output: commandOutput(result),
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
  phase: "implement" | "repair" = "implement",
) {
  const diff = storeDiff ? await captureWorkspaceDiff(context.workspacePath) : null;
  try {
    await storeWorkspaceResult({
      workspaceId: workspace.id,
      implementationTaskId: workspace.implementationTaskId,
      hasPlan: Boolean(workspace.plan),
      approvedPlan: Boolean(workspace.plan?.approvedAt) || workspace.plan?.status === "APPROVED",
      outcome,
      diff,
    });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    await recordEvidence({
      workspaceId: workspace.id,
      implementationTaskId: workspace.implementationTaskId,
      type: "AGENT_ANALYSIS",
      source: "REPOSITORY",
      description: phase === "repair" ? "Repair result was not fully recorded." : "Coding result was not fully recorded.",
      result: "UNRECORDED",
      output: persistenceEvidenceOutput(error),
    });
    throw new DomainError(persistenceUserMessage(phase));
  }
  const ready = outcome === "COMPLETED" || outcome === "COMPLETED_WITH_CONCERNS";
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
  provider: string,
  model: string,
  usage: { inputTokens: number | null; outputTokens: number | null },
  compiled: CompiledExecutionContract,
) {
  return {
    output: {
      phase: "implement",
      workspaceId,
      planVersion: compiled.planVersion,
      executionContract: {
        planVersion: compiled.planVersion,
        setupCommands: compiled.setupCommands,
        validationCommands: compiled.validationCommands.map((item) => item.command),
        notApplicableChecks: compiled.notApplicableChecks.map((item) => ({ command: item.command, reason: item.reason })),
      },
      autoContinue: false,
      escalated,
      outcome,
      summary,
      provider,
      model,
      usage,
    },
  };
}
