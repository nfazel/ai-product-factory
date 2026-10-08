import "server-only";

import { AGENT_CATALOG } from "@/domain/constants";
import { isAIConfigured, prepareAI } from "@/modules/ai/provider";
import { assertAIReady } from "@/modules/ai/surface";
import { executeAgent, AgentNotConfiguredError } from "@/modules/agent/service";
import { recordActivity } from "@/modules/activity/service";
import { requestApproval, resolveApproval } from "@/modules/approval/service";
import { hashText } from "@/modules/coding/policy";
import { resolveConfiguredRepository } from "@/modules/coding/config";
import { upsertRepository } from "@/modules/coding/repository";
import { assertWorktreeIsolated, branchNameFor, createWorktree, workspaceDirectory } from "@/modules/coding/git";
import { getCurrentActor } from "@/modules/identity/actor";
import { db } from "@/lib/db";
import { recomputeSession } from "@/modules/verification/assess";
import { buildVerificationContract } from "@/modules/verification/contract";
import { assertVerificationEntry, verificationEntryBlockers } from "@/modules/verification/gates";
import { executeVerificationTool } from "@/modules/verification/tools";
import { DomainError } from "@/modules/shared/errors";

const AGENT_NAMES = new Set([
  AGENT_CATALOG.TESTING.name,
  AGENT_CATALOG.CODING.name,
  "Testing Agent",
  "Verification Agent",
]);

function assertHuman(actor: string) {
  if (AGENT_NAMES.has(actor.trim())) {
    throw new DomainError("The Verification Agent cannot approve its own verification.");
  }
}

export async function startVerification(productId: string, taskId: string) {
  await assertVerificationEntry(productId, taskId);
  await prepareAI();
  if (!isAIConfigured()) throw new AgentNotConfiguredError("TESTING");
  await assertAIReady("verification", "No verification was started.");
  const task = await db.implementationTask.findFirst({
    where: { id: taskId, plan: { productId } },
    include: {
      plan: { include: { architecture: true } },
      workItem: {
        include: {
          acceptanceCriteria: true,
          parent: { include: { parent: true } },
          capability: { include: { outcome: true } },
        },
      },
      workspaces: {
        orderBy: { createdAt: "desc" },
        include: { contract: true, diff: true, selfReview: true },
      },
    },
  });
  if (!task) throw new DomainError("The implementation task was not found.", "NOT_FOUND");
  const codingWorkspace = task.workspaces[0];
  if (!codingWorkspace) throw new DomainError("The coding workspace for this task was not found.");
  const configured = await resolveConfiguredRepository();
  const repository = await upsertRepository({
    productId,
    name: configured.name,
    localPath: configured.localPath,
    defaultBranch: configured.defaultBranch,
    status: "CONFIGURED",
  });
  const criteria = task.workItem?.acceptanceCriteria ?? [];
  const nfrs = await db.nonFunctionalRequirement.findMany({
    where: { productId, status: "CONFIRMED" },
  });
  const findings = await db.governanceFinding.findMany({
    where: { links: { some: { taskId } }, status: "OPEN" },
  });
  const draft = buildVerificationContract({
    objective: task.objective || task.title,
    storyTitle: task.workItem?.title ?? "",
    criteria,
    nfrs,
    architecture: task.plan.architecture?.summary ?? "",
    security: findings.map((item) => item.title).join("; "),
    codingSummary: codingWorkspace.contract?.objective ?? task.objective,
    commitSha: codingWorkspace.headCommit,
    changedFiles: changedFileNames(codingWorkspace.diff?.files),
  });
  const session = await db.verificationSession.create({
    data: {
      productId,
      implementationTaskId: taskId,
      repositoryWorkspaceId: codingWorkspace.id,
      commitSha: codingWorkspace.headCommit,
      status: "PLANNING",
      startedAt: new Date(),
    },
  });
  const workspace = await db.verificationWorkspace.create({
    data: {
      sessionId: session.id,
      repositoryId: repository.id,
      branchName: branchNameFor(taskId, `verify ${task.title}`).replace("ai-factory/task-", "ai-factory/verify-task-"),
      baseCommit: codingWorkspace.headCommit,
      status: "CREATING",
    },
  });
  const directory = workspaceDirectory(workspace.id);
  try {
    const created = await createWorktree({
      repositoryPath: configured.localPath,
      workspacePath: directory,
      branchName: workspace.branchName,
      baseCommit: codingWorkspace.headCommit,
    });
    await assertWorktreeIsolated(directory, configured.localPath);
    await db.verificationWorkspace.update({
      where: { id: workspace.id },
      data: { workspacePath: directory, branchName: created.branchName, status: "ACTIVE" },
    });
  } catch (error) {
    await db.verificationWorkspace.update({
      where: { id: workspace.id },
      data: { workspacePath: directory, status: "FAILED" },
    });
    await db.verificationSession.update({ where: { id: session.id }, data: { status: "FAILED" } });
    throw new DomainError(
      `The verification workspace could not be created. The coding workspace and main working tree were not modified. ${error instanceof Error ? error.message : ""}`,
    );
  }
  await db.verificationContract.create({
    data: { sessionId: session.id, ...draft },
  });
  for (const nfr of nfrs) {
    await db.verificationNfrResult.create({
      data: {
        sessionId: session.id,
        nfrId: nfr.id,
        title: nfr.title,
        status: "NOT_TESTED",
        note: "REQUIRES MANUAL VERIFICATION. No accessibility or performance tool is installed, so this NFR is not claimed as verified.",
      },
    });
  }
  await recordActivity({
    productId,
    type: "VERIFICATION_STARTED",
    description: `Started verification for commit ${codingWorkspace.headCommit.slice(0, 12)}.`,
    actor: AGENT_CATALOG.TESTING.name,
  });
  try {
    await executeAgent({
      productId,
      workItemId: task.workItemId ?? undefined,
      agentType: "TESTING",
      input: { phase: "plan", sessionId: session.id, taskId },
    });
    await executeAgent({
      productId,
      workItemId: task.workItemId ?? undefined,
      agentType: "TESTING",
      input: { phase: "execute", sessionId: session.id, taskId },
    });
  } catch (error) {
    await db.verificationSession.update({ where: { id: session.id }, data: { status: "FAILED" } });
    throw error;
  }
  return getVerificationSession(productId, session.id);
}

export async function approveVerification(productId: string, sessionId: string, options?: { actorName?: string }) {
  const actor = options?.actorName ?? getCurrentActor().name;
  assertHuman(actor);
  const session = await requireSession(productId, sessionId);
  if (session.stale) throw new DomainError(session.staleReason || "RE-VERIFICATION REQUIRED.");
  if (session.overallVerdict !== "PASS" && session.overallVerdict !== "PASS_WITH_CONCERNS") {
    throw new DomainError("Only a passing verification can be approved.");
  }
  const fingerprint = evidenceFingerprint(session);
  const approval = await requestApproval({
    productId,
    workItemId: session.task.workItemId ?? undefined,
    approvalType: "VERIFICATION",
    comments: `Verification for task ${session.implementationTaskId} at ${session.commitSha}.`,
  });
  await resolveApproval(approval.id, "APPROVED", {
    approvedBy: actor,
    comments: "Approved the verification. The Verification Agent did not approve it.",
  });
  await db.verificationApproval.create({
    data: {
      productId,
      approvalId: approval.id,
      sessionId,
      implementationTaskId: session.implementationTaskId,
      commitSha: session.commitSha,
      evidenceFingerprint: fingerprint,
    },
  });
  await recordActivity({
    productId,
    type: "VERIFICATION_APPROVED",
    description: `${actor} approved verification ${sessionId}.`,
    actor,
  });
  return getVerificationSession(productId, sessionId);
}

export async function requestMoreTesting(productId: string, sessionId: string, note: string) {
  const actor = getCurrentActor().name;
  assertHuman(actor);
  await requireSession(productId, sessionId);
  await recordActivity({
    productId,
    type: "VERIFICATION_CHANGES_REQUESTED",
    description: `${actor} requested more testing. ${note}`,
    actor,
  });
  return getVerificationSession(productId, sessionId);
}

export async function rejectVerification(productId: string, sessionId: string, note: string) {
  const actor = getCurrentActor().name;
  assertHuman(actor);
  await requireSession(productId, sessionId);
  await db.verificationSession.update({
    where: { id: sessionId },
    data: { status: "FAILED", verdictReason: note },
  });
  await recordActivity({
    productId,
    type: "VERIFICATION_REJECTED",
    description: `${actor} rejected verification. ${note}`,
    actor,
  });
  return getVerificationSession(productId, sessionId);
}

export async function recordManualResult(input: {
  productId: string;
  sessionId: string;
  testCaseId: string;
  result: "PASS" | "FAIL" | "BLOCKED";
  comment: string;
  tester?: string;
}) {
  const tester = input.tester ?? getCurrentActor().name;
  assertHuman(tester);
  const session = await requireSession(input.productId, input.sessionId);
  if (session.stale) throw new DomainError(session.staleReason || "RE-VERIFICATION REQUIRED.");
  const testCase = session.testCases.find((item) => item.id === input.testCaseId);
  if (!testCase) throw new DomainError("The test case was not found.", "NOT_FOUND");
  if (testCase.automated) throw new DomainError("Record manual results on manual test cases.");
  const status = input.result === "PASS" ? "PASSED" : input.result === "FAIL" ? "FAILED" : "BLOCKED";
  await db.verificationTestCase.update({ where: { id: testCase.id }, data: { status } });
  await db.verificationEvidence.create({
    data: {
      sessionId: session.id,
      testCaseId: testCase.id,
      acceptanceCriterionId: testCase.acceptanceCriterionId,
      type: "MANUAL_CONFIRMATION",
      source: "HUMAN",
      description: `${tester}: ${input.comment}`,
      result: input.result,
    },
  });
  await db.verificationExecution.create({
    data: {
      sessionId: session.id,
      testCaseId: testCase.id,
      command: "manual",
      kind: "NEW_VERIFICATION",
      status: input.result === "PASS" ? "PASSED" : input.result === "FAIL" ? "FAILED" : "BLOCKED",
      outputSummary: input.comment,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  await recordActivity({
    productId: input.productId,
    type: "VERIFICATION_MANUAL_RESULT",
    description: `${tester} recorded a manual ${input.result}.`,
    actor: tester,
  });
  await recomputeSession(session.id);
  return getVerificationSession(input.productId, input.sessionId);
}

export async function confirmNotApplicable(productId: string, sessionId: string, criterionId: string, actorName?: string) {
  const actor = actorName ?? getCurrentActor().name;
  assertHuman(actor);
  const session = await requireSession(productId, sessionId);
  const coverage = session.coverages.find((item) => item.acceptanceCriterionId === criterionId);
  if (!coverage) throw new DomainError("That acceptance criterion is not in this verification.");
  await db.verificationCoverage.update({
    where: { id: coverage.id },
    data: { status: "NOT_APPLICABLE", humanConfirmed: true, rationale: `${actor} confirmed this criterion is not applicable.` },
  });
  await db.verificationEvidence.create({
    data: {
      sessionId,
      acceptanceCriterionId: criterionId,
      type: "MANUAL_CONFIRMATION",
      source: "HUMAN",
      description: `${actor} confirmed the criterion is not applicable.`,
      result: "NOT_APPLICABLE",
    },
  });
  await recomputeSession(sessionId);
  return getVerificationSession(productId, sessionId);
}

export async function createVerificationDefect(input: {
  productId: string;
  sessionId: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  acceptanceCriterionId?: string;
  condition: string;
  expected: string;
  actual: string;
}) {
  const session = await requireSession(input.productId, input.sessionId);
  const workItem = await db.workItem.create({
    data: {
      productId: input.productId,
      parentId: session.task.workItemId,
      title: input.title,
      description: `${input.description}\nCondition: ${input.condition}\nExpected: ${input.expected}\nActual: ${input.actual}\nCommit: ${session.commitSha}`,
      type: "DEFECT",
      status: "DRAFT",
      stage: "PROVE",
      priority: input.severity,
    },
  });
  await db.verificationDefectLink.create({
    data: {
      sessionId: session.id,
      workItemId: workItem.id,
      acceptanceCriterionId: input.acceptanceCriterionId,
      implementationTaskId: session.implementationTaskId,
      commitSha: session.commitSha,
    },
  });
  await recordActivity({
    productId: input.productId,
    type: "VERIFICATION_DEFECT_CREATED",
    description: `Recorded defect ${workItem.title}. The Coding Agent was not asked to fix it.`,
  });
  await recomputeSession(session.id);
  return getVerificationSession(input.productId, input.sessionId);
}

export async function rerunFailedTests(productId: string, sessionId: string) {
  const session = await requireSession(productId, sessionId);
  if (!session.workspace || session.stale) throw new DomainError(session.staleReason || "RE-VERIFICATION REQUIRED.");
  const failed = session.executions.filter((item) => item.kind === "NEW_VERIFICATION" && item.status === "FAILED" && item.command.startsWith("node --test"));
  for (const execution of failed) {
    const ran = await executeVerificationTool(
      { sessionId, productId, workspacePath: session.workspace.workspacePath },
      { action: "RUN_COMMAND", command: execution.command },
    );
    await db.verificationExecution.create({
      data: {
        sessionId,
        testCaseId: execution.testCaseId,
        command: execution.command,
        kind: "NEW_VERIFICATION",
        status: ran.allowed ? (ran.exitCode === 0 ? "PASSED" : "FAILED") : "NOT_RUN",
        exitCode: ran.exitCode,
        outputSummary: ran.output,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
  }
  await recomputeSession(sessionId);
  return getVerificationSession(productId, sessionId);
}

export async function createIntegratedVerification(productId: string, sliceId: string) {
  const slice = await db.productSlice.findFirst({ where: { id: sliceId, productId } });
  if (!slice) throw new DomainError("The product slice was not found.", "NOT_FOUND");
  const tasks = await db.implementationTask.findMany({
    where: { plan: { productId, productSliceId: sliceId } },
    include: { workspaces: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const sessions = await db.verificationSession.findMany({
    where: { productId, implementationTaskId: { in: tasks.map((task) => task.id) }, demo: false },
    orderBy: { createdAt: "desc" },
  });
  const gaps = [
    "No integrated execution environment is available. End-to-end behaviour of the product slice was not executed.",
  ];
  const lines = tasks.map((task) => {
    const latest = sessions.find((session) => session.implementationTaskId === task.id);
    const sha = task.workspaces[0]?.headCommit || "no commit";
    return `${task.title}: implementation ${task.status}, verification ${latest?.overallVerdict ?? "not run"}, commit ${sha}`;
  });
  const created = await db.integratedVerificationSession.create({
    data: {
      productId,
      productSliceId: sliceId,
      status: "BLOCKED",
      overallVerdict: "INCONCLUSIVE",
      planSummary: [`Integrated verification plan for ${slice.name}.`, ...lines].join("\n"),
      evidenceGaps: gaps,
    },
  });
  return created;
}

export async function getProveView(productId: string) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return null;
  const slice = await db.productSlice.findFirst({
    where: { productId, status: "APPROVED" },
    orderBy: { createdAt: "asc" },
  });
  const tasks = slice
    ? await db.implementationTask.findMany({
        where: { plan: { productId, productSliceId: slice.id } },
        orderBy: { sequence: "asc" },
        include: {
          workItem: {
            include: {
              acceptanceCriteria: true,
              parent: { include: { parent: true } },
              capability: { include: { outcome: true } },
            },
          },
          workspaces: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      })
    : [];
  const sessions = await db.verificationSession.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    include: {
      contract: true,
      workspace: true,
      conditions: true,
      testCases: true,
      coverages: { include: { criterion: true } },
      executions: { orderBy: { createdAt: "asc" } },
      evidence: { orderBy: { createdAt: "asc" } },
      escalations: true,
      nfrResults: true,
      defectLinks: { include: { workItem: true } },
      approvals: { orderBy: { createdAt: "desc" } },
    },
  });
  const integrated = await db.integratedVerificationSession.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
  });
  const readiness = sliceReadiness(product.currentStage, tasks, sessions);
  const awaiting = await Promise.all(
    tasks.map(async (task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      blockers: await verificationEntryBlockers(productId, task.id),
      trace: traceFor(task),
      commitSha: task.workspaces[0]?.headCommit ?? "",
    })),
  );
  return { product, slice, readiness, awaiting, sessions, integrated };
}

export async function getVerificationSession(productId: string, sessionId: string) {
  return db.verificationSession.findFirst({
    where: { id: sessionId, productId },
    include: {
      contract: true,
      workspace: true,
      conditions: true,
      testCases: true,
      coverages: true,
      executions: true,
      evidence: true,
      escalations: true,
      nfrResults: true,
      defectLinks: { include: { workItem: true } },
      approvals: true,
      task: true,
    },
  });
}

export async function applyVerificationTool(
  productId: string,
  sessionId: string,
  request: Parameters<typeof executeVerificationTool>[1],
) {
  const session = await requireSession(productId, sessionId);
  if (!session.workspace) throw new DomainError("Verification workspace not found.", "NOT_FOUND");
  return executeVerificationTool(
    { sessionId, productId, workspacePath: session.workspace.workspacePath },
    request,
  );
}

export { verificationEntryBlockers };

async function requireSession(productId: string, sessionId: string) {
  const session = await getVerificationSession(productId, sessionId);
  if (!session) throw new DomainError("Verification session not found.", "NOT_FOUND");
  return session;
}

function evidenceFingerprint(session: NonNullable<Awaited<ReturnType<typeof getVerificationSession>>>) {
  const body = [
    ...session.executions.map((item) => `${item.id}:${item.exitCode}:${item.status}`),
    ...session.coverages.map((item) => `${item.acceptanceCriterionId}:${item.status}`),
  ].sort();
  return hashText(body.join("|"));
}

function traceFor(task: {
  title: string;
  workItem: {
    title: string;
    acceptanceCriteria: { id: string; description: string }[];
    parent: { title: string; parent: { title: string } | null } | null;
    capability: { name: string; outcome: { title: string } | null } | null;
  } | null;
}) {
  return {
    outcome: task.workItem?.capability?.outcome?.title ?? "",
    capability: task.workItem?.capability?.name ?? "",
    epic: task.workItem?.parent?.parent?.title ?? "",
    feature: task.workItem?.parent?.title ?? "",
    story: task.workItem?.title ?? "",
    criteria: task.workItem?.acceptanceCriteria.map((item) => item.description) ?? [],
    task: task.title,
  };
}

function sliceReadiness(
  stage: string,
  tasks: { id: string; status: string }[],
  sessions: {
    implementationTaskId: string;
    demo: boolean;
    stale: boolean;
    overallVerdict: string | null;
    approvals: { stale: boolean }[];
    defectLinks: { workItem: { priority: string; status: string } }[];
  }[],
) {
  if (tasks.length === 0) {
    return { label: "NOT VERIFIED", ready: false, reasons: ["No implementation tasks belong to an approved slice."] };
  }
  const reasons: string[] = [];
  for (const task of tasks) {
    if (task.status !== "COMPLETED") reasons.push(`${task.id} is not a completed implementation.`);
    const verified = sessions.find(
      (session) =>
        session.implementationTaskId === task.id &&
        !session.demo &&
        !session.stale &&
        (session.overallVerdict === "PASS" || session.overallVerdict === "PASS_WITH_CONCERNS") &&
        session.approvals.some((approval) => !approval.stale),
    );
    if (!verified) reasons.push(`${task.id} does not have an approved verification.`);
  }
  const high = sessions.some((session) =>
    session.defectLinks.some(
      (link) =>
        link.workItem.status !== "DONE" &&
        (link.workItem.priority === "HIGH" || link.workItem.priority === "CRITICAL"),
    ),
  );
  if (high) reasons.push("A critical or high defect is still open.");
  if (reasons.length > 0) return { label: "NOT VERIFIED", ready: false, reasons };
  return {
    label: "PRODUCT SLICE VERIFIED",
    ready: true,
    reasons: [stage === "PROVE" ? "Ready for Release Review" : "Ready to move to PROVE"],
  };
}

function changedFileNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((file) =>
    file && typeof file === "object" && "path" in file && typeof file.path === "string" ? [file.path] : [],
  );
}
