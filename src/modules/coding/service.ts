import "server-only";

import fs from "node:fs";
import path from "node:path";

import { AGENT_CATALOG } from "@/domain/constants";
import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";
import { noteVerificationCommitChanged } from "@/modules/verification/impact";
import { AgentNotConfiguredError, executeAgent } from "@/modules/agent/service";
import { requestApproval, resolveApproval } from "@/modules/approval/service";
import {
  assessExecutionContract,
  compileExecutionContract,
  executionCommandsForPlan,
  parsePlannedCommands,
  stepsWithCommands,
  validationPlanText,
} from "@/modules/coding/commands";
import { buildContractDraft, type ContractDraft } from "@/modules/coding/contract";
import {
  alignExecutionPlan,
  assessBootstrapCompleteness,
  designFactsFromSources,
  executionPlanRevisionText,
  healPlanCommandSteps,
  NEXT_ENTRY_CANDIDATES,
  planScopeDelta,
  recoveryForFailures,
  trimRedundantSchemaScope,
  validationFailureDisposition,
} from "@/modules/coding/bootstrap";
import { commandOutputFromMetadata } from "@/modules/coding/command-output";
import { recoverApprovedPlansAfterProviderFailure, restoreApprovedPlanAfterValidationFailure } from "@/modules/coding/restore-approval";
import {
  assessImplementationCompleteness,
  classifyCodingFailure,
  initialSchemaContext,
  readPlannedImplementationFiles,
  repairsForCurrentImplementation,
} from "@/modules/coding/implementation";
import { REPAIR_RECORD_MESSAGE, repairResultNeedsRecording } from "@/modules/coding/diff";
import { storeWorkspaceResult } from "@/modules/coding/diff-store";
import { MAX_VALIDATION_REPAIRS, requiredValidationCommands, validationRepairDecision } from "@/modules/coding/repair";
import {
  classifyPlanDiff,
  codeApprovalDecision,
  effectiveCommandResults,
  executionPlanScopeRevision,
  OUT_OF_SCOPE_BLOCK,
  reviewableDiffFiles,
} from "@/modules/coding/review";
import { codingRetryDecision } from "@/modules/coding/retry";
import { isAIConfigured, prepareAI } from "@/modules/ai/provider";
import { assertAIReady } from "@/modules/ai/surface";
import { describeCodingBase, prepareCodingBase } from "@/modules/source-control/ensure-coding-base";
import { resolveProductRepository, productRepositoryReady, REPOSITORY_NOT_CONFIGURED } from "@/modules/source-control/product-repository";
import { assertCodingEntry, codingEntryBlockers } from "@/modules/coding/gates";
import {
  assertWorktreeIsolated,
  branchNameFor,
  commitApprovedSnapshot,
  createWorktree,
  captureWorkspaceDiff,
  ensureWorktreeLink,
  restoreBaselineFile,
  workspaceDirectory,
} from "@/modules/coding/git";
import { classifyWrite, filesOutsideContract, hashText } from "@/modules/coding/policy";
import {
  findOccupyingWorkspace,
  findWorkspace,
  insertContract,
  insertWorkspace,
  latestPolicy,
  listProductTasks,
  loadTaskGraph,
  recordEscalation,
  recordEvidence,
  replaceContract,
  saveWorkspace,
  upsertRepository,
} from "@/modules/coding/repository";
import { asStrings } from "@/modules/coding/strings";
import { executeRepositoryTool } from "@/modules/coding/tools";
import { assessCodingReadiness } from "@/modules/governance/coding-readiness";
import { getCurrentActor } from "@/modules/identity/actor";
import { DomainError } from "@/modules/shared/errors";

const CODING_ACTOR = AGENT_CATALOG.CODING.name;

function assertHuman(actorName: string) {
  if (actorName === CODING_ACTOR || actorName === "Coding Agent") {
    throw new DomainError("The Coding Agent cannot approve its own code changes.");
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Workspace creation failed.";
}

type TaskGraph = NonNullable<Awaited<ReturnType<typeof loadTaskGraph>>>;

function draftFor(task: TaskGraph, policy: NonNullable<Awaited<ReturnType<typeof latestPolicy>>>): ContractDraft {
  const risk = task.codingRisks[0];
  if (!risk) throw new DomainError("This task has no coding-risk assessment.");
  return buildContractDraft({
    taskTitle: task.title,
    objective: task.objective,
    validation: task.validation,
    filesLikely: task.filesLikely,
    allowedPaths: policy.allowedPaths,
    restrictedPaths: policy.restrictedPaths,
    prohibitedActions: policy.prohibitedActions,
    requiredChecks: policy.requiredChecks,
    maxFilesPerTask: policy.maxFilesPerTask,
    riskLevel: risk.overrideRiskLevel ?? risk.riskLevel,
    executionMode: risk.overrideExecutionMode ?? risk.recommendedExecutionMode,
    acceptanceCriteria: task.workItem?.acceptanceCriteria.map((item) => item.description) ?? [],
    dependencies: task.dependencies.map((dependency) => dependency.dependsOn.title),
    architectureSummary: task.plan.architecture.summary,
    componentNotes: task.components.map(
      (link) => `${link.component.name}: ${link.component.responsibilities}`,
    ),
  });
}

export async function approveImplementationTask(productId: string, taskId: string, options?: { actorName?: string }) {
  const actor = options?.actorName ?? getCurrentActor().name;
  assertHuman(actor);
  const task = await loadTaskGraph(productId, taskId);
  if (!task) throw new DomainError("The implementation task was not found.", "NOT_FOUND");
  if (task.plan.status !== "APPROVED") {
    throw new DomainError("Approve the implementation plan before approving a task for coding.");
  }
  if (!["PROPOSED", "BLOCKED"].includes(task.status)) {
    throw new DomainError(`The implementation task is ${task.status}. Approve the task before coding.`);
  }
  const updated = await db.implementationTask.update({
    where: { id: task.id },
    data: { status: "APPROVED" },
  });
  await recordActivity({
    productId,
    type: "CODING_TASK_APPROVED",
    description: `${actor} approved implementation task "${task.title}" for coding.`,
    actor,
  });
  return updated;
}

export async function startCodingTask(productId: string, taskId: string) {
  const gate = await assertCodingEntry(productId, taskId);
  await prepareAI();
  if (!isAIConfigured()) throw new AgentNotConfiguredError("CODING");
  await assertAIReady("coding", "No code was changed.");
  const base = await prepareCodingBase(productId);
  const configured = await resolveProductRepository(productId);
  const repository =
    configured.record ??
    (await upsertRepository({
      productId,
      name: configured.name,
      localPath: configured.localPath,
      defaultBranch: configured.defaultBranch,
      status: "CONFIGURED",
    }));
  const baseCommit = base.baseCommit;
  const draft = draftFor(gate.task, gate.policy);
  const created = await insertWorkspace({
    repositoryId: repository.id,
    productId,
    implementationTaskId: taskId,
    workspacePath: "pending",
    branchName: "pending",
    baseCommit: "",
  });
  const directory = workspaceDirectory(created.id);
  let branch = branchNameFor(taskId, gate.task.title);
  try {
    const worktree = await createWorktree({
      repositoryPath: configured.localPath,
      workspacePath: directory,
      branchName: branch,
      baseCommit,
    });
    branch = worktree.branchName;
    await assertWorktreeIsolated(directory, configured.localPath);
  } catch (error) {
    await saveWorkspace(created.id, {
      status: "FAILED",
      workspacePath: directory,
      branchName: branch,
      baseCommit,
      headCommit: baseCommit,
    });
    throw new DomainError(
      `The isolated workspace could not be created. The main working tree was not modified. ${messageOf(error)}`,
    );
  }
  await saveWorkspace(created.id, {
    status: "ACTIVE",
    workspacePath: directory,
    branchName: branch,
    baseCommit,
    headCommit: baseCommit,
  });
  await insertContract({
    implementationTaskId: taskId,
    workspaceId: created.id,
    ...draft,
  });
  await db.implementationTask.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
  await recordActivity({
    productId,
    type: "CODING_WORKSPACE_CREATED",
    description: base.synchronised
      ? `Synchronised ${base.integrationBranch} to ${baseCommit.slice(0, 12)}, then created isolated workspace ${branch}.`
      : `Created isolated workspace ${branch} from ${base.integrationBranch} at ${baseCommit.slice(0, 12)}. ${base.message}`,
  });
  try {
    const planRun = await executeAgent({
      productId,
      workItemId: gate.task.workItemId ?? undefined,
      agentType: "CODING",
      input: { phase: "plan", workspaceId: created.id, taskId },
    });
    await saveWorkspace(created.id, { agentRunId: planRun.id });
    if (planRun.output && typeof planRun.output === "object" && (planRun.output as { autoContinue?: boolean }).autoContinue) {
      const current = await findWorkspace(productId, created.id);
      const implementRun = await executeAgent({
        productId,
        workItemId: gate.task.workItemId ?? undefined,
        agentType: "CODING",
        input: current
          ? withCompiledContract(current, { phase: "implement", workspaceId: created.id, taskId })
          : { phase: "implement", workspaceId: created.id, taskId },
      });
      await saveWorkspace(created.id, { agentRunId: implementRun.id });
    }
  } catch (error) {
    await settleFailedImplementRun(productId, created.id);
    throw error;
  }
  return findWorkspace(productId, created.id);
}

export async function approveExecutionPlan(productId: string, workspaceId: string, options?: { actorName?: string }) {
  const actor = options?.actorName ?? getCurrentActor().name;
  assertHuman(actor);
  const workspace = await requireActiveContract(productId, workspaceId);
  if (!workspace.plan || !["PROPOSED", "ESCALATED"].includes(workspace.plan.status)) {
    throw new DomainError("There is no execution plan waiting for approval.");
  }
  const outside = filesOutsideContract(
    asStrings(workspace.plan.filesExpectedToChange),
    asStrings(workspace.contract?.allowedPaths),
    asStrings(workspace.contract?.restrictedPaths),
  );
  if (outside.length > 0) {
    throw new DomainError(
      `This execution plan names files outside the coding rules: ${outside.join(", ")}. Request changes before it can be approved. Coding has not started.`,
    );
  }
  const maxFiles = workspace.contract?.maxFiles ?? 8;
  if (asStrings(workspace.plan.filesExpectedToChange).length > maxFiles) {
    throw new DomainError(
      `This execution plan names more than ${maxFiles} files. Request changes before it can be approved. Coding has not started.`,
    );
  }
  const planSteps = asStrings(workspace.plan.steps);
  const healedSteps = healPlanCommandSteps(planSteps);
  if (healedSteps.some((step, index) => step !== planSteps[index])) {
    await db.codingExecutionPlan.update({
      where: { workspaceId },
      data: { steps: healedSteps },
    });
    workspace.plan = { ...workspace.plan, steps: healedSteps };
  }
  const flight = compileExecutionContract({
    planVersion: workspace.plan.version,
    files: workspace.plan.filesExpectedToChange,
    allowedPaths: workspace.contract?.allowedPaths,
    restrictedPaths: workspace.contract?.restrictedPaths,
    setupCommands: workspace.plan.setupCommands,
    validationCommands: workspace.plan.validationCommands,
  });
  if (!flight.ready) {
    throw new DomainError(flight.blockers[0]?.message ?? "Execution Plan cannot be approved because a required operation is not permitted by the current coding contract.");
  }
  const completeness = await assessmentForWorkspace(productId, workspace);
  if (!completeness.ready) {
    throw new DomainError(completeness.blockers[0]?.message ?? "Execution Plan cannot be approved because it is incomplete.");
  }
  const approvedAt = new Date();
  await db.codingExecutionPlan.update({
    where: { workspaceId },
    data: { status: "APPROVED", approvedBy: actor, approvedAt },
  });
  await db.codingEscalation.updateMany({
    where: { workspaceId, status: "OPEN", type: { in: ["SCOPE_EXPANSION", "POLICY_CONFLICT"] } },
    data: { status: "RESOLVED", resolvedAt: approvedAt },
  });
  if (workspace.status === "ABANDONED") {
    await saveWorkspace(workspaceId, { status: "ACTIVE", completedAt: null });
  }
  await recordActivity({
    productId,
    type: "CODING_PLAN_APPROVED",
    description: `${actor} approved execution plan version ${workspace.plan.version}. Coding has not started.`,
    actor,
  });
  return findWorkspace(productId, workspaceId);
}

export async function requestExecutionPlanChanges(productId: string, workspaceId: string, changeRequest: string, actorName?: string) {
  const actor = actorName ?? getCurrentActor().name;
  assertHuman(actor);
  const note = changeRequest.trim();
  if (note.length < 12) throw new DomainError("Explain what should change. Use at least 12 characters.");
  const workspace = await requireActiveContract(productId, workspaceId);
  const plan = workspace.plan;
  if (!plan || !["PROPOSED", "ESCALATED", "APPROVED"].includes(plan.status)) {
    throw new DomainError("Request changes while the execution plan is still open for review.");
  }
  if (plan.status === "APPROVED" && workspace.status !== "ACTIVE") {
    throw new DomainError("This execution plan has already been used for coding. It cannot be revised in place.");
  }
  const history = Array.isArray(plan.history) ? plan.history : [];
  await db.codingExecutionPlan.update({
    where: { workspaceId },
    data: {
      status: "CHANGES_REQUESTED",
      changeRequest: note,
      approvedBy: "",
      approvedAt: null,
      history: [
        ...history,
        {
          version: plan.version,
          status: plan.status,
          summary: plan.summary,
          analysisNote: plan.analysisNote,
          filesExpectedToChange: plan.filesExpectedToChange,
          steps: plan.steps,
          risks: plan.risks,
          validationPlan: plan.validationPlan,
          changeRequest: plan.changeRequest,
          approvedBy: plan.approvedBy,
          approvedAt: plan.approvedAt?.toISOString() ?? null,
          recordedAt: new Date().toISOString(),
        },
      ],
    },
  });
  await recordActivity({
    productId,
    type: "CODING_PLAN_CHANGES_REQUESTED",
    description: `${actor} requested changes to execution plan version ${plan.version}. ${note}`,
    actor,
  });
  return findWorkspace(productId, workspaceId);
}

export async function proposeCoherentExecutionPlan(productId: string, workspaceId: string) {
  const workspace = await requireActiveContract(productId, workspaceId);
  const plan = workspace.plan;
  if (!plan || !["APPROVED", "ESCALATED"].includes(plan.status)) {
    throw new DomainError("Revise an approved execution plan that cannot be executed.");
  }
  const flight = await executionFlight(productId, workspace);
  const completeness = await assessmentForWorkspace(productId, workspace);
  if (flight.ready && completeness.ready) {
    throw new DomainError("This execution plan can already be executed. A new version was not created.");
  }
  if (!completeness.ready) {
    const currentFiles = asStrings(plan.filesExpectedToChange);
    const added = completeness.missingFiles.filter((file) => !currentFiles.includes(file));
    for (const file of added) {
      const write = classifyWrite(file, asStrings(workspace.contract?.allowedPaths), asStrings(workspace.contract?.restrictedPaths));
      if (!write.ok) {
        throw new DomainError(`The required application entry point ${file} is outside the coding contract. The contract was not widened.`);
      }
    }
    const nextFiles = [...currentFiles, ...added];
    const maxFiles = workspace.contract?.maxFiles ?? 8;
    if (nextFiles.length > maxFiles) {
      throw new DomainError(`Adding the required application entry point would exceed the file limit of ${maxFiles}. The execution plan was not changed.`);
    }
    const delta = planScopeDelta(currentFiles, nextFiles);
    const existingOnDisk = nextFiles.filter((file) =>
      fs.existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ workspace.workspacePath, file)),
    );
    const aligned = alignExecutionPlan({
      files: nextFiles,
      steps: asStrings(plan.steps),
      validationCommands: parsePlannedCommands(plan.validationCommands),
      validationPlan: plan.validationPlan,
      existingFiles: existingOnDisk,
    });
    const validation = completenessRequiredCommands(plan.validationCommands);
    const history = Array.isArray(plan.history) ? plan.history : [];
    const nextVersion = plan.version + 1;
    await db.codingExecutionPlan.update({
      where: { workspaceId },
      data: {
        version: nextVersion,
        status: "PROPOSED",
        approvedBy: "",
        approvedAt: null,
        filesExpectedToChange: nextFiles,
        steps: aligned.steps,
        validationPlan: aligned.validationPlan,
        changeRequest: executionPlanRevisionText({
          reason: "The latest coding run proved that the approved scope cannot satisfy npm run build.",
          added: delta.added,
          removed: delta.removed,
          unchanged: delta.unchanged,
          validation,
        }),
        history: [
          ...history,
          {
            version: plan.version,
            status: plan.status,
            summary: plan.summary,
            analysisNote: plan.analysisNote,
            filesExpectedToChange: plan.filesExpectedToChange,
            steps: plan.steps,
            risks: plan.risks,
            validationPlan: plan.validationPlan,
            setupCommands: plan.setupCommands,
            validationCommands: plan.validationCommands,
            changeRequest: plan.changeRequest,
            approvedBy: plan.approvedBy,
            approvedAt: plan.approvedAt?.toISOString() ?? null,
            recordedAt: new Date().toISOString(),
          },
        ],
      },
    });
    await recordActivity({
      productId,
      type: "CODING_PLAN_REVISED",
      description: `Execution plan version ${nextVersion} was proposed from version ${plan.version}. It adds the application entry point required by npm run build. It is not approved. Earlier coding runs were kept.`,
    });
    return findWorkspace(productId, workspaceId);
  }
  const stored = executionCommandsForPlan(flight.derived);
  const history = Array.isArray(plan.history) ? plan.history : [];
  const nextVersion = plan.version + 1;
  await db.codingExecutionPlan.update({
    where: { workspaceId },
    data: {
      version: nextVersion,
      status: "PROPOSED",
      approvedBy: "",
      approvedAt: null,
      steps: stepsWithCommands(asStrings(plan.steps), flight.derived),
      validationPlan: validationPlanText(flight.derived, plan.validationPlan),
      setupCommands: stored.setupCommands,
      validationCommands: stored.validationCommands,
      changeRequest: "The approved plan required operations the coding contract did not authorise. This version authorises those operations. It is not approved.",
      history: [
        ...history,
        {
          version: plan.version,
          status: plan.status,
          summary: plan.summary,
          analysisNote: plan.analysisNote,
          filesExpectedToChange: plan.filesExpectedToChange,
          steps: plan.steps,
          risks: plan.risks,
          validationPlan: plan.validationPlan,
          setupCommands: plan.setupCommands,
          validationCommands: plan.validationCommands,
          changeRequest: plan.changeRequest,
          approvedBy: plan.approvedBy,
          approvedAt: plan.approvedAt?.toISOString() ?? null,
          recordedAt: new Date().toISOString(),
        },
      ],
    },
  });
  await recordActivity({
    productId,
    type: "CODING_PLAN_REVISED",
    description: `Execution plan version ${nextVersion} was prepared from version ${plan.version}. It is not approved. The earlier coding run and its evidence were kept.`,
  });
  return findWorkspace(productId, workspaceId);
}

async function executionFlight(
  productId: string,
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
) {
  const product = await db.product.findUnique({ where: { id: productId }, select: { developmentContext: true } });
  return assessExecutionContract({
    greenfield: product?.developmentContext === "GREENFIELD",
    workspacePath: workspace.workspacePath,
    files: workspace.plan?.filesExpectedToChange,
    steps: workspace.plan?.steps,
    allowedPaths: workspace.contract?.allowedPaths,
    restrictedPaths: workspace.contract?.restrictedPaths,
    requiredChecks: workspace.contract?.requiredChecks,
    validationPlan: workspace.plan?.validationPlan ?? "",
    setupCommands: workspace.plan?.setupCommands,
    validationCommands: workspace.plan?.validationCommands,
  });
}

export async function reviseExecutionPlan(productId: string, workspaceId: string) {
  const workspace = await requireActiveContract(productId, workspaceId);
  const plan = workspace.plan;
  if (plan?.status !== "CHANGES_REQUESTED") {
    throw new DomainError("Request changes before revising the execution plan.");
  }
  const files = asStrings(plan.filesExpectedToChange);
  const commands = parsePlannedCommands(plan.validationCommands);
  const schemaPath = path.join(workspace.workspacePath, "prisma", "schema.prisma");
  const schemaContent = fs.existsSync(/*turbopackIgnore: true*/ schemaPath)
    ? fs.readFileSync(/*turbopackIgnore: true*/ schemaPath, "utf8")
    : null;
  const trimmed = trimRedundantSchemaScope({ files, steps: asStrings(plan.steps), schemaContent });
  const existingOnDisk = trimmed.files.filter((file) =>
    fs.existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ workspace.workspacePath, file)),
  );
  const before = await assessmentForWorkspace(productId, workspace);
  const aligned = alignExecutionPlan({
    files: trimmed.files,
    steps: trimmed.steps,
    validationCommands: commands,
    validationPlan: plan.validationPlan,
    existingFiles: existingOnDisk,
  });
  const after = await assessmentForWorkspace(productId, workspace, {
    files: trimmed.files,
    steps: aligned.steps,
    validationPlan: aligned.validationPlan,
  });
  if (!before.ready && after.ready) {
    const addedWork = aligned.steps.filter((step) => !asStrings(plan.steps).includes(step));
    const nextVersion = plan.version + 1;
    await db.codingExecutionPlan.update({
      where: { workspaceId },
      data: {
        version: nextVersion,
        status: "PROPOSED",
        approvedBy: "",
        approvedAt: null,
        filesExpectedToChange: trimmed.files,
        steps: aligned.steps,
        validationPlan: aligned.validationPlan,
        changeRequest: executionPlanRevisionText({
          reason: trimmed.removedSchema
            ? `Execution Plan v${plan.version} named prisma/schema.prisma although existing models already satisfy the task, and/or used install wording that blocked approval. This version corrects that. It is not approved.`
            : `Execution Plan v${plan.version} authorised files that no work item creates. This version adds that work and keeps the verification commands consistent. It is not approved.`,
          added: [],
          removed: trimmed.removedSchema ? ["prisma/schema.prisma"] : [],
          unchanged: trimmed.files,
          addedWork,
          validation: commands.filter((item) => item.applicability !== "NOT_APPLICABLE").map((item) => item.command),
        }),
      },
    });
    await recordActivity({
      productId,
      type: "CODING_PLAN_REVISED",
      description: `Execution plan version ${nextVersion} was proposed from version ${plan.version}. It adds the missing work items. It is not approved and coding has not started.`,
    });
    return findWorkspace(productId, workspaceId);
  }
  await prepareAI();
  if (!isAIConfigured()) throw new AgentNotConfiguredError("CODING");
  const run = await executeAgent({
    productId,
    workItemId: workspace.task.workItemId ?? undefined,
    agentType: "CODING",
    input: { phase: "plan", workspaceId, taskId: workspace.implementationTaskId },
  });
  await saveWorkspace(workspaceId, { agentRunId: run.id, status: "ACTIVE" });
  const updated = await findWorkspace(productId, workspaceId);
  await recordActivity({
    productId,
    type: "CODING_PLAN_REVISED",
    description: `Execution plan version ${updated?.plan?.version ?? ""} was generated after requested changes. It is not approved.`,
  });
  return updated;
}

export async function requestCodingChanges(input: {
  productId: string;
  workspaceId: string;
  feedback: string;
  requiredChanges: string;
  affectedFiles: string[];
  actorName?: string;
}) {
  const actor = input.actorName ?? getCurrentActor().name;
  assertHuman(actor);
  const workspace = await requireActiveContract(input.productId, input.workspaceId);
  if (workspace.status !== "READY_FOR_REVIEW") {
    throw new DomainError("Request changes when the workspace is ready for review.");
  }
  const allowed = asStrings(workspace.contract?.allowedPaths);
  const restricted = asStrings(workspace.contract?.restrictedPaths);
  const outside = input.affectedFiles.filter(
    (file) => file.includes("..") || file.startsWith("/") || !classifyWrite(file, allowed, restricted).ok,
  );
  const revision = await db.codingRevision.create({
    data: {
      workspaceId: workspace.id,
      feedback: input.feedback,
      requiredChanges: input.requiredChanges,
      affectedFiles: input.affectedFiles,
    },
  });
  await recordActivity({
    productId: input.productId,
    type: "CODING_CHANGES_REQUESTED",
    description: `${actor} requested coding changes. ${input.requiredChanges}`,
    actor,
  });
  if (outside.length > 0) {
    await recordEscalation({
      workspaceId: workspace.id,
      type: "SCOPE_EXPANSION",
      description: "The requested changes leave the execution contract.",
      reason: `Files outside the contract: ${outside.join(", ")}`,
      recommendedAction: "Keep the request inside the approved paths or change the coding policy through governance.",
    });
    await recordActivity({
      productId: input.productId,
      type: "CODING_ESCALATION_CREATED",
      description: "SCOPE_EXPANSION: requested changes leave the execution contract.",
      actor,
    });
    return findWorkspace(input.productId, workspace.id);
  }
  await saveWorkspace(workspace.id, { status: "ACTIVE" });
  await db.implementationTask.update({
    where: { id: workspace.implementationTaskId },
    data: { status: "IN_PROGRESS" },
  });
  try {
    const run = await executeAgent({
      productId: input.productId,
      workItemId: workspace.task.workItemId ?? undefined,
      agentType: "CODING",
      input: withCompiledContract(workspace, { phase: "implement", workspaceId: workspace.id, taskId: workspace.implementationTaskId, revision: revision.id }),
    });
    await saveWorkspace(workspace.id, { agentRunId: run.id });
  } catch (error) {
    await settleFailedImplementRun(input.productId, workspace.id);
    throw error;
  }
  return findWorkspace(input.productId, workspace.id);
}

function requireActiveContract(productId: string, workspaceId: string) {
  return findWorkspace(productId, workspaceId).then((workspace) => {
    if (!workspace?.contract) throw new DomainError("Coding workspace not found.", "NOT_FOUND");
    if (workspace.executionContractStale || workspace.contract.stale) {
      throw new DomainError(
        workspace.staleReason || "EXECUTION CONTRACT STALE. Review the contract, regenerate it, or abandon the workspace.",
      );
    }
    return workspace;
  });
}

function reviewFiles(files: unknown) {
  return reviewableDiffFiles(files);
}

function planAuthorised(status: string | null | undefined) {
  return status === "APPROVED" || status === "COMPLETED";
}

function codeReviewFor(workspace: {
  workspacePath: string;
  plan: { status?: string; version?: number; setupCommands: unknown; validationCommands: unknown; filesExpectedToChange?: unknown; steps?: unknown } | null;
  evidence: { command: string; result: string; exitCode: number | null; createdAt: Date; completedAt: Date | null }[];
  diff: { files: unknown } | null;
}) {
  const files = reviewFiles(workspace.diff?.files);
  const coverage = classifyPlanDiff({
    files,
    approvedFiles: asStrings(workspace.plan?.filesExpectedToChange),
    setupCommands: asStrings(workspace.plan?.setupCommands),
    steps: asStrings(workspace.plan?.steps),
  });
  const commands = effectiveCommandResults({
    setupCommands: asStrings(workspace.plan?.setupCommands),
    validationCommands: parsePlannedCommands(workspace.plan?.validationCommands).map((item) => ({ command: item.command, applicability: item.applicability })),
    evidence: workspace.evidence.map((item) => ({ command: item.command, result: item.result, exitCode: item.exitCode, at: item.completedAt ?? item.createdAt })),
    sourceFiles: sourceStamps(workspace.workspacePath, files),
  });
  const decision = codeApprovalDecision({
    sourceFileCount: files.length,
    checksPassed: commands.passed,
    checksStale: commands.stale,
    outOfScope: coverage.filter((file) => file.classification === "OUT_OF_SCOPE"),
    planAuthorised: planAuthorised(workspace.plan?.status),
  });
  return {
    ...decision,
    created: files.filter((file) => file.status !== "modified" && file.status !== "deleted").map((file) => file.path),
    modified: files.filter((file) => file.status === "modified").map((file) => file.path),
    deleted: files.filter((file) => file.status === "deleted").map((file) => file.path),
    approved: coverage.filter((file) => file.classification === "APPROVED"),
    derived: coverage.filter((file) => file.classification === "DERIVED"),
    outOfScope: coverage.filter((file) => file.classification === "OUT_OF_SCOPE"),
    planVersion: workspace.plan?.version ?? null,
    setup: commands.setup,
    checks: commands.required,
    notApplicable: commands.notApplicable,
  };
}

function sourceStamps(root: string, files: { path: string }[]) {
  const stamps = [];
  for (const file of files) {
    const absolute = path.resolve(root, file.path);
    const relative = path.relative(root, absolute);
    if (!file.path || relative.startsWith("..") || path.isAbsolute(relative)) continue;
    try {
      stamps.push({ path: file.path, changedAt: new Date(fs.statSync(/*turbopackIgnore: true*/ absolute).mtimeMs) });
    } catch {
      stamps.push({ path: file.path, changedAt: new Date() });
    }
  }
  return stamps;
}

export async function approveCodeChanges(productId: string, workspaceId: string, options?: { actorName?: string }) {
  const actor = options?.actorName ?? getCurrentActor().name;
  assertHuman(actor);
  const workspace = await requireActiveContract(productId, workspaceId);
  if (workspace.status !== "READY_FOR_REVIEW") {
    throw new DomainError("Code review is available after the required checks pass.");
  }
  if (workspace.escalations.some((item) => item.status === "OPEN")) {
    throw new DomainError("Resolve open escalations before approving code changes.");
  }
  const repository = await db.repository.findUnique({ where: { productId }, select: { localPath: true } });
  const diff = await captureWorkspaceDiff(workspace.workspacePath, repository?.localPath);
  const files = reviewFiles(diff.files);
  const coverage = classifyPlanDiff({
    files,
    approvedFiles: asStrings(workspace.plan?.filesExpectedToChange),
    setupCommands: asStrings(workspace.plan?.setupCommands),
    steps: asStrings(workspace.plan?.steps),
  });
  const commands = effectiveCommandResults({
    setupCommands: asStrings(workspace.plan?.setupCommands),
    validationCommands: parsePlannedCommands(workspace.plan?.validationCommands).map((item) => ({ command: item.command, applicability: item.applicability })),
    evidence: workspace.evidence.map((item) => ({ command: item.command, result: item.result, exitCode: item.exitCode, at: item.completedAt ?? item.createdAt })),
    sourceFiles: sourceStamps(workspace.workspacePath, files),
  });
  const decision = codeApprovalDecision({
    sourceFileCount: files.length,
    checksPassed: commands.passed,
    checksStale: commands.stale,
    outOfScope: coverage.filter((file) => file.classification === "OUT_OF_SCOPE"),
    planAuthorised: planAuthorised(workspace.plan?.status),
  });
  if (!decision.approvable) throw new DomainError(decision.reason);
  const digest = hashText(diff.fullPatch);
  const approval = await requestApproval({
    productId,
    workItemId: workspace.task.workItemId ?? undefined,
    approvalType: "CODE_CHANGE",
    comments: `Code change for implementation task ${workspace.implementationTaskId}.`,
  });
  await resolveApproval(approval.id, "APPROVED", {
    approvedBy: actor,
    comments: "Approved the code change. The Coding Agent did not approve it.",
  });
  await db.codeChangeApproval.create({
    data: {
      productId,
      approvalId: approval.id,
      implementationTaskId: workspace.implementationTaskId,
      workspaceId,
      baseCommit: workspace.baseCommit,
      headCommit: "",
      diffHash: digest,
    },
  });
  await recordEvidence({
    workspaceId,
    implementationTaskId: workspace.implementationTaskId,
    type: "HUMAN_CONFIRMATION",
    source: "HUMAN",
    description: `${actor} approved the code change.`,
    result: "APPROVED",
  });
  await recordActivity({
    productId,
    type: "CODING_APPROVED",
    description: `${actor} approved the code change for task ${workspace.implementationTaskId}.`,
    actor,
  });
  return findWorkspace(productId, workspaceId);
}

export async function restoreUnapprovedChange(productId: string, workspaceId: string, filePath: string) {
  const actor = getCurrentActor().name;
  assertHuman(actor);
  const workspace = await requireActiveContract(productId, workspaceId);
  if (workspace.status !== "READY_FOR_REVIEW") {
    throw new DomainError("Restore an unapproved change while the workspace is ready for review.");
  }
  const repository = await db.repository.findUnique({ where: { productId }, select: { localPath: true } });
  if (repository?.localPath) ensureWorktreeLink(workspace.workspacePath, repository.localPath);
  const before = await captureWorkspaceDiff(workspace.workspacePath, repository?.localPath);
  const coverage = classifyPlanDiff({
    files: reviewFiles(before.files),
    approvedFiles: asStrings(workspace.plan?.filesExpectedToChange),
    setupCommands: asStrings(workspace.plan?.setupCommands),
    steps: asStrings(workspace.plan?.steps),
  });
  const target = coverage.find((file) => file.path === filePath && file.classification === "OUT_OF_SCOPE");
  if (!target) throw new DomainError("That file is not an unapproved change in the current source diff.");
  const oldHash = hashText(before.fullPatch);
  await restoreBaselineFile(workspace.workspacePath, workspace.baseCommit, target.path, target.status);
  const diff = await captureWorkspaceDiff(workspace.workspacePath, repository?.localPath);
  await db.codingDiff.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
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
  const newHash = hashText(diff.fullPatch);
  const recordedAt = new Date();
  await db.codeChangeApproval.updateMany({
    where: { workspaceId, stale: false, diffHash: { not: newHash } },
    data: {
      stale: true,
      staleReason: "The workspace changed after this approval.",
      staleFlaggedAt: recordedAt,
    },
  });
  await recordEvidence({
    workspaceId,
    implementationTaskId: workspace.implementationTaskId,
    type: "HUMAN_CONFIRMATION",
    source: "HUMAN",
    description: `${actor} restored ${target.path} from baseline ${workspace.baseCommit}. Old snapshot ${oldHash}. New snapshot ${newHash}.`,
    result: "RESTORED",
    completedAt: recordedAt,
  });
  await recordActivity({
    productId,
    type: target.verb === "created" ? "CODING_FILE_DELETED" : "CODING_FILE_CREATED",
    description: `${actor} restored unapproved ${target.verb} ${target.path} from baseline ${workspace.baseCommit} at ${recordedAt.toISOString()}. Old snapshot ${oldHash}. New snapshot ${newHash}.`,
    actor,
  });
  return findWorkspace(productId, workspaceId);
}

export async function proposeOutOfScopePlan(productId: string, workspaceId: string, filePath: string) {
  const actor = getCurrentActor().name;
  assertHuman(actor);
  const workspace = await requireActiveContract(productId, workspaceId);
  const plan = workspace.plan;
  if (!plan) throw new DomainError("An execution plan is required before its scope can be revised.");
  const review = codeReviewFor(workspace);
  const target = review.outOfScope.find((file) => file.path === filePath);
  if (!target) throw new DomainError("That file is inside the approved execution plan.");
  const revision = executionPlanScopeRevision({
    version: plan.version,
    files: asStrings(plan.filesExpectedToChange),
    steps: asStrings(plan.steps),
    path: target.path,
    status: target.status,
  });
  const history = Array.isArray(plan.history) ? plan.history : [];
  await db.codingExecutionPlan.update({
    where: { workspaceId },
    data: {
      version: revision.version,
      status: "PROPOSED",
      approvedBy: "",
      approvedAt: null,
      filesExpectedToChange: revision.files,
      steps: revision.steps,
      changeRequest: `Authorise the unapproved ${target.verb} of ${target.path}. This version is not approved. Execution plan v${plan.version} remains in history.`,
      history: [
        ...history,
        {
          version: plan.version,
          status: plan.status,
          summary: plan.summary,
          analysisNote: plan.analysisNote,
          filesExpectedToChange: plan.filesExpectedToChange,
          steps: plan.steps,
          risks: plan.risks,
          validationPlan: plan.validationPlan,
          setupCommands: plan.setupCommands,
          validationCommands: plan.validationCommands,
          changeRequest: plan.changeRequest,
          approvedBy: plan.approvedBy,
          approvedAt: plan.approvedAt?.toISOString() ?? null,
          recordedAt: new Date().toISOString(),
        },
      ],
    },
  });
  await recordActivity({
    productId,
    type: "CODING_PLAN_REVISED",
    description: `${actor} proposed execution plan version ${revision.version} to authorise ${target.verb} ${target.path}. Version ${plan.version} was kept in history and was not edited. The new version is not approved.`,
    actor,
  });
  return findWorkspace(productId, workspaceId);
}

async function recordOutOfScopeFindings(productId: string, workspace: {
  id: string;
  status: string;
  productId?: string;
  workspacePath: string;
  implementationTaskId: string;
  plan: { status?: string; version?: number; setupCommands: unknown; validationCommands: unknown; filesExpectedToChange?: unknown; steps?: unknown } | null;
  evidence: { command: string; result: string; exitCode: number | null; createdAt: Date; completedAt: Date | null; description?: string }[];
  diff: { files: unknown; patch?: string } | null;
}) {
  if (workspace.status !== "READY_FOR_REVIEW") return;
  const review = codeReviewFor(workspace);
  const hash = hashText(workspace.diff?.patch ?? "");
  const actor = getCurrentActor().name;
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "RepositoryWorkspace" WHERE id = ${workspace.id} FOR UPDATE`;
    for (const file of review.outOfScope) {
      const marker = `OUT_OF_SCOPE_CHANGE ${file.path} ${file.verb}`;
      if (workspace.evidence.some((item) => item.description?.startsWith(marker))) continue;
      const existing = await tx.codingEvidence.findFirst({
        where: { workspaceId: workspace.id, description: { startsWith: marker } },
        select: { id: true },
      });
      if (existing) {
        workspace.evidence.push({
          command: "",
          result: "OUT_OF_SCOPE",
          exitCode: null,
          createdAt: new Date(),
          completedAt: new Date(),
          description: marker,
        });
        continue;
      }
      const recordedAt = new Date();
      await tx.codingEvidence.create({
        data: {
          workspaceId: workspace.id,
          implementationTaskId: workspace.implementationTaskId,
          type: "STATIC_ANALYSIS",
          source: "REPOSITORY",
          description: `${marker}. Snapshot ${hash}.`,
          result: "OUT_OF_SCOPE",
          completedAt: recordedAt,
        },
      });
      await tx.activity.create({
        data: {
          productId,
          type: "CODING_POLICY_DENIED",
          description: `${marker} on execution plan v${workspace.plan?.version ?? "unknown"}. Snapshot ${hash}.`,
          actor,
          createdAt: recordedAt,
        },
      });
      workspace.evidence.push({
        command: "",
        result: "OUT_OF_SCOPE",
        exitCode: null,
        createdAt: recordedAt,
        completedAt: recordedAt,
        description: marker,
      });
    }
  });
}

export async function rejectCodeChanges(productId: string, workspaceId: string, feedback: string) {
  const actor = getCurrentActor().name;
  assertHuman(actor);
  const workspace = await findWorkspace(productId, workspaceId);
  if (!workspace) throw new DomainError("Coding workspace not found.", "NOT_FOUND");
  await saveWorkspace(workspaceId, { status: "FAILED" });
  await db.implementationTask.update({
    where: { id: workspace.implementationTaskId },
    data: { status: "BLOCKED" },
  });
  await recordActivity({
    productId,
    type: "CODING_CHANGES_REQUESTED",
    description: `${actor} rejected the code changes. ${feedback}`,
    actor,
  });
  return findWorkspace(productId, workspaceId);
}

export async function abandonWorkspace(productId: string, workspaceId: string) {
  const workspace = await findWorkspace(productId, workspaceId);
  if (!workspace) throw new DomainError("Coding workspace not found.", "NOT_FOUND");
  await saveWorkspace(workspaceId, { status: "ABANDONED", completedAt: new Date() });
  if (workspace.task.status !== "COMPLETED") {
    await db.implementationTask.update({
      where: { id: workspace.implementationTaskId },
      data: { status: "APPROVED" },
    });
  }
  await recordActivity({
    productId,
    type: "CODING_WORKSPACE_ABANDONED",
    description: "Abandoned the coding workspace. The worktree and evidence were kept.",
  });
  return findWorkspace(productId, workspaceId);
}

export async function createCodingCommit(productId: string, workspaceId: string) {
  const workspace = await requireActiveContract(productId, workspaceId);
  if (workspace.status !== "READY_FOR_REVIEW") {
    throw new DomainError("Create the approved commit while the workspace is ready for review.");
  }
  const repository = await db.repository.findUnique({ where: { productId }, select: { localPath: true } });
  const diff = await captureWorkspaceDiff(workspace.workspacePath, repository?.localPath);
  const files = reviewFiles(diff.files);
  const coverage = classifyPlanDiff({
    files,
    approvedFiles: asStrings(workspace.plan?.filesExpectedToChange),
    setupCommands: asStrings(workspace.plan?.setupCommands),
    steps: asStrings(workspace.plan?.steps),
  });
  const commands = effectiveCommandResults({
    setupCommands: asStrings(workspace.plan?.setupCommands),
    validationCommands: parsePlannedCommands(workspace.plan?.validationCommands).map((item) => ({ command: item.command, applicability: item.applicability })),
    evidence: workspace.evidence.map((item) => ({ command: item.command, result: item.result, exitCode: item.exitCode, at: item.completedAt ?? item.createdAt })),
    sourceFiles: sourceStamps(workspace.workspacePath, files),
  });
  const digest = hashText(diff.fullPatch);
  const approval = workspace.codeApprovals.find((item) => !item.stale && item.diffHash === digest);
  if (!approval) {
    const hadApproval = workspace.codeApprovals.some((item) => !item.stale);
    await db.codeChangeApproval.updateMany({
      where: { workspaceId, stale: false, diffHash: { not: digest } },
      data: { stale: true },
    });
    if (coverage.some((file) => file.classification === "OUT_OF_SCOPE")) throw new DomainError(OUT_OF_SCOPE_BLOCK);
    throw new DomainError(hadApproval
      ? "The approved snapshot no longer matches the source. Review the code changes and approve them again."
      : "Code changes must be approved by a person before a commit.");
  }
  const decision = codeApprovalDecision({
    sourceFileCount: files.length,
    checksPassed: commands.passed,
    checksStale: commands.stale,
    outOfScope: coverage.filter((file) => file.classification === "OUT_OF_SCOPE"),
    planAuthorised: planAuthorised(workspace.plan?.status),
  });
  if (!decision.approvable) throw new DomainError(decision.reason);
  const snapshot = coverage
    .filter((file) => file.classification === "APPROVED" || file.classification === "DERIVED")
    .map((file) => ({ path: file.path, status: file.status }));
  let sha: string;
  try {
    sha = await commitApprovedSnapshot(
      workspace.workspacePath,
      snapshot,
      `feat: ${workspace.task.title.replace(/\s+/g, " ").trim()}\n\nAI Product Factory Task: ${workspace.implementationTaskId}`,
    );
  } catch (error) {
    throw new DomainError(error instanceof Error ? error.message : "The approved snapshot could not be committed.");
  }
  await saveWorkspace(workspaceId, {
    headCommit: sha,
    status: "COMPLETED",
    completedAt: new Date(),
  });
  await db.implementationTask.update({
    where: { id: workspace.implementationTaskId },
    data: { status: "COMPLETED" },
  });
  await db.codeChangeApproval.update({
    where: { id: approval.id },
    data: { headCommit: sha },
  });
  await noteVerificationCommitChanged(workspace.implementationTaskId, sha);
  const description = `Local commit ${sha} locks approved snapshot ${digest} for execution plan v${workspace.plan?.version ?? "unknown"}. Code change approval ${approval.id}.${workspace.agentRunId ? ` Coding run ${workspace.agentRunId}.` : ""} The commit was not pushed.`;
  await recordEvidence({
    workspaceId,
    implementationTaskId: workspace.implementationTaskId,
    type: "HUMAN_CONFIRMATION",
    source: "HUMAN",
    description,
    result: "COMMITTED",
  });
  await recordActivity({
    productId,
    type: "CODING_COMMIT_CREATED",
    description,
    actor: getCurrentActor().name,
  });
  return { sha, workspace: await findWorkspace(productId, workspaceId) };
}

export async function retryCodingTask(productId: string, workspaceId: string) {
  return continueCoding(productId, workspaceId, "retry");
}

export async function repairCodingTask(productId: string, workspaceId: string) {
  await recoverApprovedPlansAfterProviderFailure(productId);
  await restoreApprovedPlanAfterValidationFailure(productId);
  const initial = await requireActiveContract(productId, workspaceId);
  if (await unrecordedRepairResult(productId, initial)) throw new DomainError(REPAIR_RECORD_MESSAGE);
  for (let started = 0; started < MAX_VALIDATION_REPAIRS; started += 1) {
    const workspace = await requireActiveContract(productId, workspaceId);
    const decision = await repairInputs(productId, workspace);
    if (!decision.offer) {
      if (started === 0) throw new DomainError(decision.reason);
      break;
    }
    const marked = new Date();
    const claimed = await db.repositoryWorkspace.updateMany({
      where: { id: workspaceId, status: { not: "ACTIVE" } },
      data: { status: "ACTIVE" },
    });
    if (claimed.count === 0) throw new DomainError("A repair is already running. No further repair has been started.");
    try {
      const run = await executeAgent({
        productId,
        workItemId: workspace.task.workItemId ?? undefined,
        agentType: "CODING",
        input: withCompiledContract(workspace, {
          phase: "repair",
          workspaceId,
          taskId: workspace.implementationTaskId,
          attempt: decision.attempt,
          failures: decision.failures,
        }),
      });
      await saveWorkspace(workspaceId, { agentRunId: run.id });
    } catch (error) {
      const latest = await db.agentRun.findFirst({
        where: { productId, agentType: "CODING" },
        orderBy: { createdAt: "desc" },
        select: { id: true, input: true },
      });
      const input = latest?.input && typeof latest.input === "object" ? latest.input as { phase?: unknown; workspaceId?: unknown } : null;
      const repairRun = input?.phase === "repair" && input.workspaceId === workspaceId ? latest?.id : null;
      await saveWorkspace(workspaceId, { status: "FAILED", ...(repairRun ? { agentRunId: repairRun } : {}) });
      throw error;
    }
    const latest = await db.agentRun.findFirst({
      where: { productId, agentType: "CODING" },
      orderBy: { createdAt: "desc" },
      select: { output: true },
    });
    const output = latest?.output && typeof latest.output === "object" ? latest.output as { outcome?: unknown } : null;
    const open = await db.codingEvidence.count({
      where: {
        workspaceId,
        result: "FAIL",
        command: { in: decision.failures.map((item) => item.command) },
        createdAt: { gte: marked },
      },
    });
    if (output?.outcome === "COMPLETED" && open === 0) break;
  }
  return findWorkspace(productId, workspaceId);
}

export async function resumeCodingTask(productId: string, workspaceId: string) {
  return continueCoding(productId, workspaceId, "start");
}

function withCompiledContract(
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  input: Record<string, unknown>,
) {
  const compiled = compileExecutionContract({
    planVersion: workspace.plan?.version ?? 0,
    files: workspace.plan?.filesExpectedToChange,
    allowedPaths: workspace.contract?.allowedPaths,
    restrictedPaths: workspace.contract?.restrictedPaths,
    setupCommands: workspace.plan?.setupCommands,
    validationCommands: workspace.plan?.validationCommands,
  });
  return {
    ...input,
    planVersion: workspace.plan?.version ?? null,
    executionContract: compiled.contract,
  };
}

export async function recordRepairResult(productId: string, workspaceId: string) {
  const workspace = await requireActiveContract(productId, workspaceId);
  if (workspace.status === "ACTIVE") throw new DomainError("A repair is already running. No further repair has been started.");
  if (!(await unrecordedRepairResult(productId, workspace))) throw new DomainError("There is no unrecorded repair result to save.");
  const repository = await db.repository.findUnique({ where: { productId }, select: { localPath: true } });
  const diff = await captureWorkspaceDiff(workspace.workspacePath, repository?.localPath);
  await storeWorkspaceResult({
    workspaceId,
    implementationTaskId: workspace.implementationTaskId,
    hasPlan: Boolean(workspace.plan),
    approvedPlan: Boolean(workspace.plan?.approvedAt) || workspace.plan?.status === "APPROVED",
    outcome: "COMPLETED",
    diff,
  });
  await recordEvidence({
    workspaceId,
    implementationTaskId: workspace.implementationTaskId,
    type: "HUMAN_CONFIRMATION",
    source: "HUMAN",
    description: "Recorded the repair result already in the workspace. The model was not called again.",
    result: "PASS",
  });
  await recordActivity({
    productId,
    type: "CODING_READY_FOR_REVIEW",
    description: "Recorded the existing repair result. The model was not called again.",
    actor: getCurrentActor().name,
  });
  return findWorkspace(productId, workspaceId);
}

async function unrecordedRepairResult(
  productId: string,
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
) {
  const runs = await db.agentRun.findMany({
    where: { productId, agentType: "CODING" },
    orderBy: { createdAt: "asc" },
    select: { input: true, output: true, createdAt: true },
  });
  return repairResultNeedsRecording({
    runs,
    workspaceId: workspace.id,
    planVersion: workspace.plan?.version ?? null,
    diffUpdatedAt: workspace.diff?.updatedAt ?? null,
    commands: workspace.evidence.map((item) => ({ command: item.command, result: item.result, createdAt: item.createdAt })),
    requiredCommands: requiredValidationCommands(workspace.plan?.validationCommands),
    gaps: implementationGapsFor(workspace).length,
  });
}

async function continueCoding(productId: string, workspaceId: string, mode: "retry" | "start") {
  await recoverApprovedPlansAfterProviderFailure(productId);
  const workspace = await requireActiveContract(productId, workspaceId);
  if (await unrecordedRepairResult(productId, workspace)) throw new DomainError(REPAIR_RECORD_MESSAGE);
  if (!["FAILED", "ACTIVE", "ABANDONED"].includes(workspace.status)) {
    throw new DomainError("Retry or resume a failed or paused coding workspace.");
  }
  const bound = withCompiledContract(workspace, { phase: "implement", workspaceId, taskId: workspace.implementationTaskId, continue: true });
  if (mode === "retry") {
    const decision = codingRetryDecision(await retryInputs(productId, workspace, bound.executionContract));
    if (!decision.offer) throw new DomainError(decision.reason);
  } else if (workspace.plan?.status !== "APPROVED") {
    throw new DomainError("Execution plan approval is required before Coding can start.");
  } else {
    const repair = await repairInputs(productId, workspace);
    if (repair.superseded) {
      // The failed run belongs to an earlier plan version. A new implementation run may use the current approved plan.
    } else if (repair.reason === "The approved execution plan cannot satisfy a required validation. Revise the execution plan.") {
      throw new DomainError(repair.reason);
    } else if (repair.failures.length > 0 && repair.reason !== "This run failed before implementation validation.") {
      throw new DomainError(repair.offer
        ? "This implementation failed validation. Repair it inside the approved execution plan."
        : repair.reason);
    }
  }
  await saveWorkspace(workspaceId, { status: "ACTIVE" });
  try {
    const run = await executeAgent({
      productId,
      workItemId: workspace.task.workItemId ?? undefined,
      agentType: "CODING",
      input: bound,
    });
    await saveWorkspace(workspaceId, { agentRunId: run.id });
  } catch (error) {
    await settleFailedImplementRun(productId, workspaceId);
    throw error;
  }
  return findWorkspace(productId, workspaceId);
}

async function repairInputs(
  productId: string,
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
) {
  const runs = await db.agentRun.findMany({
    where: { productId, agentType: "CODING" },
    orderBy: { createdAt: "asc" },
    select: { input: true, output: true, createdAt: true },
  });
  const repairs = repairsForCurrentImplementation(runs, workspace.id, workspace.plan?.version ?? null);
  const latest = runs.filter((run) => {
    const input = run.input && typeof run.input === "object" ? run.input as { phase?: unknown; workspaceId?: unknown } : null;
    return input?.phase === "implement" && input.workspaceId === workspace.id;
  }).at(-1) ?? null;
  const output = latest?.output && typeof latest.output === "object" ? latest.output as { errorCategory?: unknown; outcome?: unknown } : null;
  const evidence = await db.codingEvidence.findMany({
    where: { workspaceId: workspace.id, command: { not: "" } },
    orderBy: { createdAt: "asc" },
  });
  const latestByCommand = new Map<string, (typeof evidence)[number]>();
  for (const item of evidence) latestByCommand.set(item.command, item);
  const required = new Set(requiredValidationCommands(workspace.plan?.validationCommands));
  const setup = new Set(asStrings(workspace.plan?.setupCommands));
  const steps = asStrings(workspace.plan?.steps);
  const gaps = assessImplementationCompleteness({
    steps,
    files: readPlannedImplementationFiles(workspace.workspacePath, steps),
  }).gaps;
  const failures = [...latestByCommand.values()].filter((item) => item.result === "FAIL" && (required.has(item.command) || setup.has(item.command))).map((item) => ({
    id: item.id,
    command: item.command,
    output: item.output,
    exitCode: item.exitCode,
  }));
  const schemaContext = await approvedInitialSchemaContext(productId);
  if (gaps.some((gap) => gap.kind === "MISSING_PRISMA_MODEL") && !schemaContext.named) {
    return {
      offer: false,
      reason: "The approved design does not name an initial schema model. Repair cannot invent one.",
      superseded: false,
      attempt: repairs.length + 1,
      failures,
    };
  }
  const assessment = await assessmentForWorkspace(productId, workspace);
  const implementedVersion = planVersionOf(latest?.input);
  const superseded = assessment.ready && implementedVersion != null && (workspace.plan?.version ?? 0) > implementedVersion;
  if (superseded) {
    return {
      offer: false,
      reason: "A newer execution plan is approved. Start a new coding run.",
      superseded: true,
      attempt: repairs.length + 1,
      failures,
    };
  }
  const decision = validationRepairDecision({
    planStatus: workspace.plan?.status ?? null,
    approvedAt: workspace.plan?.approvedAt?.toISOString() ?? null,
    providerFailure: typeof output?.errorCategory === "string" || output?.outcome !== "FAILED",
    failures,
    repairAttempts: repairs.length,
    scopeInsufficient: recoveryForFailures(failures.map((item) => validationFailureDisposition(item.command, assessment))) === "revise" || !assessment.ready,
  });
  return { ...decision, superseded: false, attempt: repairs.length + 1, failures };
}

async function retryInputs(
  productId: string,
  workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>,
  currentContract: ReturnType<typeof compileExecutionContract>["contract"],
) {
  const runs = await db.agentRun.findMany({
    where: { productId, agentType: "CODING" },
    orderBy: { createdAt: "asc" },
    select: { status: true, input: true, output: true },
  });
  const latest = runs.filter((run) => {
    const input = run.input && typeof run.input === "object" ? run.input as { phase?: unknown; workspaceId?: unknown } : null;
    return input?.phase === "implement" && input.workspaceId === workspace.id;
  }).at(-1) ?? null;
  const output = latest?.output && typeof latest.output === "object" ? latest.output as { errorCategory?: unknown } : null;
  const stored = latest?.input && typeof latest.input === "object" ? (latest.input as { executionContract?: unknown }).executionContract : null;
  const flight = compileExecutionContract({
    planVersion: workspace.plan?.version ?? 0,
    files: workspace.plan?.filesExpectedToChange,
    allowedPaths: workspace.contract?.allowedPaths,
    restrictedPaths: workspace.contract?.restrictedPaths,
    setupCommands: workspace.plan?.setupCommands,
    validationCommands: workspace.plan?.validationCommands,
  });
  return {
    stale: workspace.executionContractStale || Boolean(workspace.contract?.stale),
    workspaceStatus: workspace.status,
    planStatus: workspace.plan?.status ?? null,
    approvedAt: workspace.plan?.approvedAt?.toISOString() ?? null,
    contractReady: flight.ready,
    contractBlocker: flight.blockers[0]?.message ?? null,
    runStatus: latest?.status ?? null,
    errorCategory: typeof output?.errorCategory === "string" ? output.errorCategory : null,
    storedContract: stored ?? null,
    currentContract,
  };
}

async function settleFailedImplementRun(productId: string, workspaceId: string) {
  const run = await db.agentRun.findFirst({
    where: { productId, agentType: "CODING" },
    orderBy: { createdAt: "desc" },
  });
  const input = run?.input && typeof run.input === "object" ? run.input as { phase?: unknown; workspaceId?: unknown } : null;
  const matched = run && input?.phase === "implement" && input.workspaceId === workspaceId ? run : null;
  await saveWorkspace(workspaceId, {
    status: "FAILED",
    ...(matched ? { agentRunId: matched.id } : {}),
  });
  await recoverApprovedPlansAfterProviderFailure(productId);
}

export async function regenerateCodingContract(productId: string, workspaceId: string) {
  const workspace = await findWorkspace(productId, workspaceId);
  if (!workspace) throw new DomainError("Coding workspace not found.", "NOT_FOUND");
  const task = await loadTaskGraph(productId, workspace.implementationTaskId);
  const policy = await latestPolicy(productId);
  if (!task || !policy) throw new DomainError("The execution contract cannot be regenerated from the current approvals.");
  const draft = draftFor(task, policy);
  const previous = workspace.contract?.sourceFingerprint;
  await replaceContract(workspaceId, {
    ...draft,
    status: "APPROVED",
    stale: false,
    staleReason: "",
    staleFlaggedAt: null,
  });
  await saveWorkspace(workspaceId, {
    executionContractStale: false,
    staleReason: "",
    staleFlaggedAt: null,
    status: workspace.status === "FAILED" ? "ACTIVE" : workspace.status,
  });
  if (previous && previous !== draft.sourceFingerprint && workspace.plan) {
    await db.codingExecutionPlan.update({
      where: { workspaceId },
      data: { status: "PROPOSED" },
    });
  }
  await recordActivity({
    productId,
    type: "CODING_CONTRACT_STALE",
    description: "A person regenerated the coding execution contract from the current approved artifacts.",
  });
  return findWorkspace(productId, workspaceId);
}

export async function applyCodingTool(productId: string, workspaceId: string, request: Parameters<typeof executeRepositoryTool>[1]) {
  const workspace = await findWorkspace(productId, workspaceId);
  if (!workspace?.contract) throw new DomainError("Coding workspace not found.", "NOT_FOUND");
  return executeRepositoryTool(
    {
      workspaceId,
      productId,
      workspacePath: workspace.workspacePath,
      allowedPaths: asStrings(workspace.contract.allowedPaths),
      restrictedPaths: asStrings(workspace.contract.restrictedPaths),
      allowFileDelete: workspace.contract.allowFileDelete,
      maxFiles: workspace.contract.maxFiles ?? 8,
      policyCommands: compileExecutionContract({
        planVersion: workspace.plan?.version ?? 0,
        files: workspace.plan?.filesExpectedToChange,
        allowedPaths: workspace.contract.allowedPaths,
        restrictedPaths: workspace.contract.restrictedPaths,
        setupCommands: workspace.plan?.setupCommands,
        validationCommands: workspace.plan?.validationCommands,
      }).contract.executableCommands,
      stale: workspace.executionContractStale || workspace.contract.stale,
    },
    request,
  );
}

export async function getCodingView(productId: string) {
  await recoverApprovedPlansAfterProviderFailure(productId);
  await restoreApprovedPlanAfterValidationFailure(productId);
  await backfillEvidenceOutput(productId);
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return null;
  const [readiness, occupying, tasks, policy, workspaces, architecture] = await Promise.all([
    assessCodingReadiness(productId),
    findOccupyingWorkspace(productId),
    listProductTasks(productId),
    latestPolicy(productId),
    db.repositoryWorkspace.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
      include: {
        contract: true,
        plan: true,
        escalations: { orderBy: { createdAt: "asc" } },
        evidence: { orderBy: { createdAt: "asc" } },
        toolEvents: { orderBy: { createdAt: "asc" } },
        selfReview: true,
        diff: true,
        revisions: { orderBy: { createdAt: "asc" } },
        codeApprovals: { orderBy: { createdAt: "desc" } },
      },
    }),
    db.solutionArchitecture.findFirst({
      where: { productId, status: "APPROVED" },
      orderBy: { version: "desc" },
      include: {
        technologies: { select: { choice: true } },
        dataEntities: { select: { name: true, description: true, relationships: true } },
      },
    }),
  ]);
  const agentRuns = await db.agentRun.findMany({
    where: { productId, agentType: "CODING" },
    orderBy: { createdAt: "asc" },
  });
  const repository = await db.repository.findUnique({ where: { productId }, select: { localPath: true } });
  for (const workspace of workspaces) {
    if (workspace.status !== "READY_FOR_REVIEW" || !repository?.localPath) continue;
    const storedCount = Array.isArray(workspace.diff?.files) ? workspace.diff.files.length : 0;
    if (storedCount === 0) {
      ensureWorktreeLink(workspace.workspacePath, repository.localPath);
      try {
        const diff = await captureWorkspaceDiff(workspace.workspacePath, repository.localPath);
        if (diff.files.length > 0) {
          workspace.diff = await db.codingDiff.upsert({
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
        }
      } catch {
        // The review stays closed until the worktree diff can be read.
      }
    }
    await recordOutOfScopeFindings(productId, workspace);
  }
  const repositoryConfigured = await productRepositoryReady(productId);
  const integrationBase = repositoryConfigured ? await describeCodingBase(productId) : null;
  return {
    readiness,
    repositoryConfigured,
    integrationBase,
    occupyingWorkspaceId: occupying?.id ?? null,
    tasks: tasks.map((task) => {
      const workspace = workspaces.find((item) => item.implementationTaskId === task.id) ?? null;
      const agentRun = agentRuns.find((run) => run.id === workspace?.agentRunId) ?? null;
      const risk = [...task.codingRisks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const blockers = taskBlockers(
        task,
        readiness.blockers,
        occupying?.implementationTaskId ?? null,
        repositoryConfigured,
        integrationBase,
      );
      const preview = policy
        ? buildContractDraft({
            taskTitle: task.title,
            objective: task.objective,
            validation: task.validation,
            filesLikely: task.filesLikely,
            allowedPaths: policy.allowedPaths,
            restrictedPaths: policy.restrictedPaths,
            prohibitedActions: policy.prohibitedActions,
            requiredChecks: policy.requiredChecks,
            maxFilesPerTask: policy.maxFilesPerTask,
            riskLevel: risk ? (risk.overrideRiskLevel ?? risk.riskLevel) : "HIGH",
            executionMode: risk ? (risk.overrideExecutionMode ?? risk.recommendedExecutionMode) : "HUMAN_ONLY",
            acceptanceCriteria: task.workItem?.acceptanceCriteria.map((item) => item.description) ?? [],
            dependencies: task.dependencies.map((dependency) => dependency.dependsOn.title),
            architectureSummary: architecture?.summary ?? "",
            componentNotes: task.components.map((link) => link.component.name),
          })
        : null;
      const story = task.workItem;
      const assessment = workspace?.plan ? assessBootstrapCompleteness({
        files: asStrings(workspace.plan.filesExpectedToChange),
        steps: asStrings(workspace.plan.steps),
        validationCommands: parsePlannedCommands(workspace.plan.validationCommands),
        validationPlan: workspace.plan.validationPlan,
        design: designFactsFromSources({
          architecture,
          task,
          fallbackSummary: workspace.contract?.architectureConstraints ?? "",
        }),
        greenfield: product.developmentContext === "GREENFIELD",
        existingFiles: existingEntryFiles(workspace.workspacePath),
      }) : null;
      const implementedVersion = workspace ? planVersionOf(agentRuns.filter((run) => {
        const input = run.input && typeof run.input === "object" ? run.input as { phase?: unknown; workspaceId?: unknown } : null;
        return input?.phase === "implement" && input.workspaceId === workspace.id;
      }).at(-1)?.input) : null;
      const revisedPlanReady = Boolean(
        workspace?.plan?.status === "APPROVED"
        && assessment?.ready
        && planSupersedes(workspace.plan.version, implementedVersion),
      );
      const codeReview = workspace ? codeReviewFor(workspace) : null;
      const policyFlight = workspace?.plan ? compileExecutionContract({
        planVersion: workspace.plan.version,
        files: workspace.plan.filesExpectedToChange,
        allowedPaths: workspace.contract?.allowedPaths,
        restrictedPaths: workspace.contract?.restrictedPaths,
        setupCommands: workspace.plan.setupCommands,
        validationCommands: workspace.plan.validationCommands,
      }) : null;
      return {
        id: task.id,
        title: task.title,
        objective: task.objective,
        status: task.status,
        riskLevel: risk ? (risk.overrideRiskLevel ?? risk.riskLevel) : null,
        executionMode: risk ? (risk.overrideExecutionMode ?? risk.recommendedExecutionMode) : null,
        blockers,
        canStart: blockers.length === 0 && task.status === "APPROVED" && !occupying,
        preview,
        workspace: workspace
          ? {
              id: workspace.id,
              status: workspace.status,
              branchName: workspace.branchName,
              baseCommit: workspace.baseCommit,
              headCommit: workspace.headCommit,
              stale: workspace.executionContractStale || Boolean(workspace.contract?.stale),
              staleReason: workspace.staleReason || workspace.contract?.staleReason || "",
              contract: workspace.contract,
              plan: workspace.plan,
              diff: workspace.diff,
              evidence: workspace.evidence,
              toolEvents: workspace.toolEvents,
              agentRun: agentRun ? { status: agentRun.status, input: agentRun.input, output: agentRun.output, startedAt: agentRun.startedAt, completedAt: agentRun.completedAt } : null,
              repairRuns: agentRuns.flatMap((run) => {
                const input = run.input && typeof run.input === "object" ? run.input as { phase?: unknown; workspaceId?: unknown; planVersion?: unknown; attempt?: unknown } : null;
                if (input?.workspaceId !== workspace.id || input.phase !== "repair") return [];
                return [{
                  id: run.id,
                  status: run.status,
                  attempt: typeof input.attempt === "number" ? input.attempt : null,
                  planVersion: typeof input.planVersion === "number" ? input.planVersion : null,
                  startedAt: run.startedAt,
                }];
              }),
              codeReview: codeReview ?? undefined,
              commitOffer: Boolean(
                codeReview
                && workspace.status === "READY_FOR_REVIEW"
                && workspace.codeApprovals.some((item) => !item.stale)
                && codeReview.approvable
                && codeReview.outOfScope.length === 0,
              ),
              implementRuns: agentRuns.flatMap((run) => {
                const input = run.input && typeof run.input === "object" ? run.input as { phase?: unknown; workspaceId?: unknown; planVersion?: unknown } : null;
                if (input?.workspaceId !== workspace.id || input.phase !== "implement") return [];
                const output = run.output && typeof run.output === "object" ? run.output as { outcome?: unknown; error?: unknown; errorCategory?: unknown; provider?: unknown; model?: unknown } : null;
                return [{
                  id: run.id,
                  status: run.status,
                  outcome: typeof output?.outcome === "string" ? output.outcome : run.status,
                  startedAt: run.startedAt,
                  completedAt: run.completedAt,
                  planVersion: typeof input.planVersion === "number" ? input.planVersion : null,
                  error: typeof output?.error === "string" ? output.error : "",
                  errorCategory: typeof output?.errorCategory === "string" ? output.errorCategory : "",
                  provider: typeof output?.provider === "string" ? output.provider : "",
                  model: typeof output?.model === "string" ? output.model : "",
                }];
              }),
              contractFlight: policyFlight ? {
                ...policyFlight,
                ready: policyFlight.ready && (assessment?.ready ?? true),
                blockers: [...(assessment?.blockers ?? []), ...policyFlight.blockers],
              } : null,
              planIncomplete: Boolean(assessment && !assessment.ready && workspace.plan?.status === "APPROVED"),
              implementationIncomplete: classifyCodingFailure({
                planReady: assessment?.ready ?? true,
                gaps: implementationGapsFor(workspace),
                failedValidation: false,
              }) === "IMPLEMENTATION_INCOMPLETE",
              implementationGaps: implementationGapsFor(workspace),
              missingScope: assessment?.missingFiles ?? [],
              revisedPlanReady,
              retryOffer: workspaceRetryOffer(workspace, agentRuns),
              recordRepairOffer: repairResultNeedsRecording({
                runs: agentRuns,
                workspaceId: workspace.id,
                planVersion: workspace.plan?.version ?? null,
                diffUpdatedAt: workspace.diff?.updatedAt ?? null,
                commands: workspace.evidence.map((item) => ({ command: item.command, result: item.result, createdAt: item.createdAt })),
                requiredCommands: requiredValidationCommands(workspace.plan?.validationCommands),
                gaps: implementationGapsFor(workspace).length,
              }),
              repairOffer: workspaceRepairOffer(
                workspace,
                agentRuns,
                Boolean(assessment && !assessment.ready) || revisedPlanReady,
                initialSchemaContext({
                  dataApproach: architecture?.dataApproach,
                  entities: architecture?.dataEntities,
                }).named,
              ),
              escalations: workspace.escalations,
              selfReview: workspace.selfReview,
              revisions: workspace.revisions,
              approvals: workspace.codeApprovals,
            }
          : null,
        trace: {
          outcome: story?.capability?.outcome?.title ?? "Not linked",
          capability: story?.capability?.name ?? "Not linked",
          epic: story?.parent?.parent?.title ?? "Not linked",
          feature: story?.parent?.title ?? "Not linked",
          story: story?.title ?? "Not linked",
          acceptanceCriteria: story?.acceptanceCriteria.map((item) => item.description) ?? [],
          architecture: architecture?.summary || "Not linked",
          task: task.title,
        },
      };
    }),
  };
}

async function backfillEvidenceOutput(productId: string) {
  const evidence = await db.codingEvidence.findMany({
    where: { workspace: { productId }, output: "", command: { not: "" } },
    select: { id: true, workspaceId: true, command: true, startedAt: true, completedAt: true },
  });
  if (evidence.length === 0) return;
  const events = await db.codingToolEvent.findMany({
    where: { workspace: { productId }, action: "RUN_COMMAND" },
    select: { workspaceId: true, command: true, metadata: true, createdAt: true },
  });
  for (const item of evidence) {
    const event = events.find((candidate) => {
      if (candidate.workspaceId !== item.workspaceId || candidate.command !== item.command) return false;
      if (!item.startedAt || !item.completedAt) return false;
      return candidate.createdAt >= item.startedAt && candidate.createdAt <= item.completedAt;
    });
    const output = commandOutputFromMetadata(event?.metadata);
    if (!output) continue;
    await db.codingEvidence.update({ where: { id: item.id }, data: { output } });
  }
}

function implementationGapsFor(workspace: { workspacePath: string; plan: { steps?: unknown } | null }) {
  const steps = asStrings(workspace.plan?.steps);
  return assessImplementationCompleteness({
    steps,
    files: readPlannedImplementationFiles(workspace.workspacePath, steps),
  }).gaps;
}

function workspaceRepairOffer(
  workspace: {
    id: string;
    workspacePath: string;
    plan: { status: string; version?: number; approvedAt: Date | null; validationCommands?: unknown; setupCommands?: unknown; steps?: unknown } | null;
    evidence: { result: string; command: string; createdAt: Date }[];
  },
  agentRuns: { createdAt?: Date | null; input: unknown; output: unknown }[],
  scopeInsufficient = false,
  initialModelNamed = true,
) {
  const repairs = repairsForCurrentImplementation(agentRuns, workspace.id, workspace.plan?.version ?? null);
  const latest = [...agentRuns].reverse().find((run) => {
    const input = run.input && typeof run.input === "object" ? run.input as { phase?: unknown; workspaceId?: unknown } : null;
    return input?.phase === "implement" && input.workspaceId === workspace.id;
  }) ?? null;
  const output = latest?.output && typeof latest.output === "object" ? latest.output as { outcome?: unknown; errorCategory?: unknown } : null;
  const latestByCommand = new Map<string, { result: string; command: string }>();
  for (const item of [...workspace.evidence].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (item.command) latestByCommand.set(item.command, item);
  }
  const required = new Set(requiredValidationCommands(workspace.plan?.validationCommands));
  const setup = new Set(asStrings(workspace.plan?.setupCommands));
  const gaps = implementationGapsFor(workspace);
  if (gaps.some((gap) => gap.kind === "MISSING_PRISMA_MODEL") && !initialModelNamed) return false;
  const failures = [...latestByCommand.values()].filter((item) => item.result === "FAIL" && (required.has(item.command) || setup.has(item.command) || (item.command === "" && gaps.length > 0))).map((item) => ({
    id: item.command || "implementation-incomplete",
    command: item.command || (gaps.some((gap) => gap.kind === "MISSING_PRISMA_MODEL") ? "npx prisma generate" : gaps[0]?.path ?? "implementation"),
    output: "",
    exitCode: 1,
  }));
  if (failures.length === 0 && gaps.length > 0) {
    failures.push({
      id: "implementation-incomplete",
      command: gaps.some((gap) => gap.kind === "MISSING_PRISMA_MODEL") ? "npx prisma generate" : gaps[0]?.path ?? "implementation",
      output: "",
      exitCode: 1,
    });
  }
  return validationRepairDecision({
    planStatus: workspace.plan?.status ?? null,
    approvedAt: workspace.plan?.approvedAt?.toISOString() ?? null,
    providerFailure: typeof output?.errorCategory === "string" || output?.outcome !== "FAILED",
    failures,
    repairAttempts: repairs.length,
    scopeInsufficient,
  }).offer;
}

async function approvedInitialSchemaContext(productId: string) {
  const architecture = await db.solutionArchitecture.findFirst({
    where: { productId, status: "APPROVED" },
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

async function assessmentForWorkspace(productId: string, workspace: {
  workspacePath: string;
  plan: { filesExpectedToChange: unknown; steps?: unknown; validationCommands: unknown; validationPlan?: string } | null;
  task: { title: string; objective: string; description: string; guidance: string; filesLikely: string; validation: string } | null;
  contract: { architectureConstraints: string } | null;
}, override?: { files?: string[]; steps?: string[]; validationPlan?: string }) {
  const [product, architecture] = await Promise.all([
    db.product.findUnique({ where: { id: productId }, select: { developmentContext: true } }),
    db.solutionArchitecture.findFirst({
      where: { productId, status: "APPROVED" },
      orderBy: { version: "desc" },
      include: { technologies: { select: { choice: true } } },
    }),
  ]);
  return assessBootstrapCompleteness({
    files: override?.files ?? asStrings(workspace.plan?.filesExpectedToChange),
    steps: override?.steps ?? asStrings(workspace.plan?.steps),
    validationCommands: parsePlannedCommands(workspace.plan?.validationCommands),
    validationPlan: override?.validationPlan ?? workspace.plan?.validationPlan ?? "",
    design: designFactsFromSources({
      architecture,
      task: workspace.task,
      fallbackSummary: workspace.contract?.architectureConstraints ?? "",
    }),
    greenfield: product?.developmentContext === "GREENFIELD",
    existingFiles: existingEntryFiles(workspace.workspacePath),
  });
}

function existingEntryFiles(workspacePath: string) {
  return NEXT_ENTRY_CANDIDATES.filter((file) => fs.existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ workspacePath, file)));
}

function planVersionOf(input: unknown) {
  if (!input || typeof input !== "object" || !("planVersion" in input)) return null;
  const version = input.planVersion;
  return typeof version === "number" ? version : null;
}

function planSupersedes(planVersion: number, implementedVersion: number | null) {
  return implementedVersion != null && planVersion > implementedVersion;
}

function completenessRequiredCommands(commands: unknown) {
  return parsePlannedCommands(commands)
    .filter((item) => item.applicability !== "NOT_APPLICABLE")
    .map((item) => item.command);
}

function workspaceRetryOffer(
  workspace: {
    id: string;
    status: string;
    executionContractStale: boolean;
    contract: { stale: boolean; allowedPaths: unknown; restrictedPaths: unknown } | null;
    plan: {
      status: string;
      version: number;
      approvedAt: Date | null;
      filesExpectedToChange: unknown;
      setupCommands: unknown;
      validationCommands: unknown;
    } | null;
  },
  agentRuns: { status: string; input: unknown; output: unknown }[],
) {
  const latest = agentRuns.filter((run) => {
    const input = run.input && typeof run.input === "object" ? run.input as { phase?: unknown; workspaceId?: unknown } : null;
    return input?.phase === "implement" && input.workspaceId === workspace.id;
  }).at(-1) ?? null;
  const output = latest?.output && typeof latest.output === "object" ? latest.output as { errorCategory?: unknown } : null;
  const stored = latest?.input && typeof latest.input === "object" ? (latest.input as { executionContract?: unknown }).executionContract : null;
  const flight = workspace.plan ? compileExecutionContract({
    planVersion: workspace.plan.version,
    files: workspace.plan.filesExpectedToChange,
    allowedPaths: workspace.contract?.allowedPaths,
    restrictedPaths: workspace.contract?.restrictedPaths,
    setupCommands: workspace.plan.setupCommands,
    validationCommands: workspace.plan.validationCommands,
  }) : null;
  return codingRetryDecision({
    stale: workspace.executionContractStale || Boolean(workspace.contract?.stale),
    workspaceStatus: workspace.status,
    planStatus: workspace.plan?.status ?? null,
    approvedAt: workspace.plan?.approvedAt?.toISOString() ?? null,
    contractReady: flight?.ready ?? false,
    contractBlocker: flight?.blockers[0]?.message ?? null,
    runStatus: latest?.status ?? null,
    errorCategory: typeof output?.errorCategory === "string" ? output.errorCategory : null,
    storedContract: stored ?? null,
    currentContract: flight?.contract ?? null,
  }).offer;
}

const BLOCKING_INTEGRATION_STATUSES = new Set([
  "ahead",
  "diverged",
  "dirty",
  "missing-local",
  "missing-remote",
  "auth-failed",
]);

function taskBlockers(
  task: Awaited<ReturnType<typeof listProductTasks>>[number],
  readiness: string[],
  occupyingTaskId: string | null,
  repositoryConfigured: boolean,
  integrationBase: Awaited<ReturnType<typeof describeCodingBase>>,
) {
  const reasons = [...readiness];
  if (!repositoryConfigured) reasons.push(REPOSITORY_NOT_CONFIGURED);
  if (integrationBase && BLOCKING_INTEGRATION_STATUSES.has(integrationBase.status)) {
    reasons.push(integrationBase.message);
  }
  if (task.status !== "APPROVED" && task.status !== "IN_PROGRESS" && task.status !== "CODE_REVIEW" && task.status !== "COMPLETED") {
    reasons.push(`The implementation task is ${task.status}. Approve the task before coding.`);
  } else if (task.status !== "APPROVED" && !occupyingTaskId) {
    reasons.push(`The implementation task is ${task.status}. Approve the task before coding.`);
  }
  const risk = task.codingRisks[0];
  if (!risk) reasons.push("This task has no coding-risk assessment.");
  else if ((risk.overrideExecutionMode ?? risk.recommendedExecutionMode) === "HUMAN_ONLY") {
    reasons.push("This task is HUMAN_ONLY and cannot be executed by the Coding Agent.");
  }
  for (const dependency of task.dependencies) {
    if (dependency.dependsOn.status !== "COMPLETED") {
      reasons.push(`Task is blocked by unresolved dependency ${dependency.dependsOn.title}.`);
    }
  }
  if (occupyingTaskId && occupyingTaskId !== task.id) {
    reasons.push("A coding workspace is already open for this product. Finish or abandon it before starting another task.");
  }
  return reasons;
}

export async function previewCodingTask(productId: string, taskId: string) {
  const gate = await codingEntryBlockers(productId, taskId);
  return { blockers: gate.reasons, task: gate.task };
}
