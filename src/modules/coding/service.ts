import "server-only";

import { AGENT_CATALOG } from "@/domain/constants";
import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";
import { noteVerificationCommitChanged } from "@/modules/verification/impact";
import { AgentNotConfiguredError, executeAgent } from "@/modules/agent/service";
import { requestApproval, resolveApproval } from "@/modules/approval/service";
import { buildContractDraft, type ContractDraft } from "@/modules/coding/contract";
import { isAIConfigured } from "@/modules/ai/provider";
import { repositoryRootConfigured, resolveConfiguredRepository } from "@/modules/coding/config";
import { assertCodingEntry, codingEntryBlockers } from "@/modules/coding/gates";
import {
  assertWorktreeIsolated,
  branchNameFor,
  commitWorkspace,
  createWorktree,
  captureWorkspaceDiff,
  repositoryStatus,
  workspaceDirectory,
} from "@/modules/coding/git";
import { classifyWrite, hashText, isSecretPath } from "@/modules/coding/policy";
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
  if (!isAIConfigured()) throw new AgentNotConfiguredError("CODING");
  const configured = await resolveConfiguredRepository();
  const repository = await upsertRepository({
    productId,
    name: configured.name,
    localPath: configured.localPath,
    defaultBranch: configured.defaultBranch,
    status: "CONFIGURED",
  });
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
      baseCommit: configured.head,
    });
    branch = worktree.branchName;
    await assertWorktreeIsolated(directory, configured.localPath);
  } catch (error) {
    await saveWorkspace(created.id, {
      status: "FAILED",
      workspacePath: directory,
      branchName: branch,
      baseCommit: configured.head,
      headCommit: configured.head,
    });
    throw new DomainError(
      `The isolated workspace could not be created. The main working tree was not modified. ${messageOf(error)}`,
    );
  }
  await saveWorkspace(created.id, {
    status: "ACTIVE",
    workspacePath: directory,
    branchName: branch,
    baseCommit: configured.head,
    headCommit: configured.head,
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
    description: `Created isolated workspace ${branch} from ${configured.head.slice(0, 12)}.`,
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
      const implementRun = await executeAgent({
        productId,
        workItemId: gate.task.workItemId ?? undefined,
        agentType: "CODING",
        input: { phase: "implement", workspaceId: created.id, taskId },
      });
      await saveWorkspace(created.id, { agentRunId: implementRun.id });
    }
  } catch (error) {
    await saveWorkspace(created.id, { status: "FAILED" });
    throw error;
  }
  return findWorkspace(productId, created.id);
}

export async function approveExecutionPlan(productId: string, workspaceId: string, options?: { actorName?: string }) {
  const actor = options?.actorName ?? getCurrentActor().name;
  assertHuman(actor);
  const workspace = await requireActiveContract(productId, workspaceId);
  if (workspace.plan?.status !== "PROPOSED") {
    throw new DomainError("There is no proposed execution plan to approve.");
  }
  await db.codingExecutionPlan.update({
    where: { workspaceId },
    data: { status: "APPROVED" },
  });
  await recordActivity({
    productId,
    type: "CODING_PLAN_APPROVED",
    description: `${actor} approved the coding execution plan.`,
    actor,
  });
  try {
    const run = await executeAgent({
      productId,
      workItemId: workspace.task.workItemId ?? undefined,
      agentType: "CODING",
      input: { phase: "implement", workspaceId, taskId: workspace.implementationTaskId },
    });
    await saveWorkspace(workspaceId, { agentRunId: run.id });
  } catch (error) {
    await saveWorkspace(workspaceId, { status: "FAILED" });
    throw error;
  }
  return findWorkspace(productId, workspaceId);
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
      input: { phase: "implement", workspaceId: workspace.id, taskId: workspace.implementationTaskId, revision: revision.id },
    });
    await saveWorkspace(workspace.id, { agentRunId: run.id });
  } catch (error) {
    await saveWorkspace(workspace.id, { status: "FAILED" });
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
  const checks = workspace.evidence.filter(
    (item) => item.source === "COMMAND_RUNNER" && ["TEST_RESULT", "TYPECHECK", "LINT", "BUILD"].includes(item.type),
  );
  if (checks.length === 0 || checks.some((item) => item.exitCode !== 0 || item.result !== "PASS")) {
    throw new DomainError("Required checks have not passed. The Coding Agent cannot approve them.");
  }
  const diff = await captureWorkspaceDiff(workspace.workspacePath);
  if (diff.files.length === 0) throw new DomainError("There are no code changes to approve.");
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
      headCommit: workspace.headCommit,
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
  const diff = await captureWorkspaceDiff(workspace.workspacePath);
  const digest = hashText(diff.fullPatch);
  const approval = workspace.codeApprovals.find((item) => !item.stale && item.diffHash === digest);
  if (!approval) {
    throw new DomainError("Code changes must be approved by a person before a commit.");
  }
  const status = await repositoryStatus(workspace.workspacePath);
  for (const entry of status.entries) {
    const filePath = entry.slice(3).trim();
    if (isSecretPath(filePath)) {
      throw new DomainError("The commit includes a secret file and was refused.");
    }
  }
  const sha = await commitWorkspace(
    workspace.workspacePath,
    `feat: ${workspace.task.title.replace(/\s+/g, " ").trim()}\n\nAI Product Factory Task: ${workspace.implementationTaskId}`,
  );
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
  await recordActivity({
    productId,
    type: "CODING_COMMIT_CREATED",
    description: `Created commit ${sha} for task ${workspace.implementationTaskId}. The commit was not pushed.`,
  });
  return { sha, workspace: await findWorkspace(productId, workspaceId) };
}

export async function retryCodingTask(productId: string, workspaceId: string) {
  return continueCoding(productId, workspaceId);
}

export async function resumeCodingTask(productId: string, workspaceId: string) {
  return continueCoding(productId, workspaceId);
}

async function continueCoding(productId: string, workspaceId: string) {
  const workspace = await requireActiveContract(productId, workspaceId);
  if (!["FAILED", "ACTIVE"].includes(workspace.status)) {
    throw new DomainError("Retry or resume a failed or paused coding workspace.");
  }
  if (workspace.plan?.status !== "APPROVED") {
    throw new DomainError("Approve the execution plan before resuming.");
  }
  await saveWorkspace(workspaceId, { status: "ACTIVE" });
  try {
    const run = await executeAgent({
      productId,
      workItemId: workspace.task.workItemId ?? undefined,
      agentType: "CODING",
      input: { phase: "implement", workspaceId, taskId: workspace.implementationTaskId, continue: true },
    });
    await saveWorkspace(workspaceId, { agentRunId: run.id });
  } catch (error) {
    await saveWorkspace(workspaceId, { status: "FAILED" });
    throw error;
  }
  return findWorkspace(productId, workspaceId);
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
      policyCommands: asStrings(workspace.contract.requiredChecks).filter((check) => check.startsWith("npm ")),
      stale: workspace.executionContractStale || workspace.contract.stale,
    },
    request,
  );
}

export async function getCodingView(productId: string) {
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
        selfReview: true,
        diff: true,
        revisions: { orderBy: { createdAt: "asc" } },
        codeApprovals: { orderBy: { createdAt: "desc" } },
      },
    }),
    db.solutionArchitecture.findFirst({
      where: { productId, status: "APPROVED" },
      orderBy: { version: "desc" },
    }),
  ]);
  const repositoryConfigured = repositoryRootConfigured();
  return {
    readiness,
    repositoryConfigured,
    occupyingWorkspaceId: occupying?.id ?? null,
    tasks: tasks.map((task) => {
      const workspace = workspaces.find((item) => item.implementationTaskId === task.id) ?? null;
      const risk = [...task.codingRisks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const blockers = taskBlockers(task, readiness.blockers, occupying?.implementationTaskId ?? null);
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

function taskBlockers(
  task: Awaited<ReturnType<typeof listProductTasks>>[number],
  readiness: string[],
  occupyingTaskId: string | null,
) {
  const reasons = [...readiness];
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
