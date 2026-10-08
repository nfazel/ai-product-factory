import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const OCCUPYING = ["CREATING", "ACTIVE", "CHECKING", "READY_FOR_REVIEW", "FAILED"] as const;

export async function findOccupyingWorkspace(productId: string) {
  return db.repositoryWorkspace.findFirst({
    where: { productId, status: { in: [...OCCUPYING] } },
    orderBy: { createdAt: "desc" },
  });
}

export async function findWorkspace(productId: string, workspaceId: string) {
  return db.repositoryWorkspace.findFirst({
    where: { id: workspaceId, productId },
    include: {
      contract: true,
      plan: true,
      escalations: { orderBy: { createdAt: "asc" } },
      evidence: { orderBy: { createdAt: "asc" } },
      selfReview: true,
      revisions: { orderBy: { createdAt: "asc" } },
      diff: true,
      codeApprovals: { orderBy: { createdAt: "desc" } },
      task: true,
    },
  });
}

export async function loadTaskGraph(productId: string, taskId: string) {
  return db.implementationTask.findFirst({
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
      components: { include: { component: true } },
      dependencies: { include: { dependsOn: true } },
      codingRisks: true,
    },
  });
}

export async function latestPolicy(productId: string) {
  return db.codingPolicy.findFirst({
    where: { productId, review: { status: "APPROVED" } },
    orderBy: { createdAt: "desc" },
    include: { review: true },
  });
}

export async function upsertRepository(input: {
  productId: string;
  name: string;
  localPath: string;
  defaultBranch: string;
  status: "CONFIGURED" | "UNAVAILABLE" | "DISABLED";
}) {
  return db.repository.upsert({
    where: { productId: input.productId },
    create: {
      productId: input.productId,
      name: input.name,
      provider: "LOCAL",
      localPath: input.localPath,
      defaultBranch: input.defaultBranch,
      status: input.status,
    },
    update: {
      name: input.name,
      localPath: input.localPath,
      defaultBranch: input.defaultBranch,
      status: input.status,
      provider: "LOCAL",
    },
  });
}

export async function insertWorkspace(input: {
  repositoryId: string;
  productId: string;
  implementationTaskId: string;
  workspacePath: string;
  branchName: string;
  baseCommit: string;
}) {
  return db.repositoryWorkspace.create({
    data: {
      repositoryId: input.repositoryId,
      productId: input.productId,
      implementationTaskId: input.implementationTaskId,
      workspacePath: input.workspacePath,
      branchName: input.branchName,
      baseCommit: input.baseCommit,
      headCommit: input.baseCommit,
      status: "CREATING",
    },
  });
}

export async function saveWorkspace(
  id: string,
  data: Prisma.RepositoryWorkspaceUpdateInput,
) {
  return db.repositoryWorkspace.update({ where: { id }, data });
}

export async function insertContract(input: {
  implementationTaskId: string;
  workspaceId: string;
  objective: string;
  allowedPaths: string[];
  restrictedPaths: string[];
  acceptanceCriteria: string[];
  requiredChecks: string[];
  architectureConstraints: string;
  codingPolicyConstraints: string;
  dependencies: string[];
  validationExpectations: string;
  maxFiles: number;
  executionMode: "AUTONOMOUS" | "SUPERVISED" | "HUMAN_ONLY";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "PROHIBITED";
  allowFileDelete: boolean;
  sourceFingerprint: string;
}) {
  return db.codingExecutionContract.create({
    data: {
      ...input,
      status: "APPROVED",
    },
  });
}

export async function replaceContract(
  workspaceId: string,
  data: Omit<Prisma.CodingExecutionContractUpdateInput, "workspace" | "task">,
) {
  return db.codingExecutionContract.update({
    where: { workspaceId },
    data,
  });
}

export async function listProductTasks(productId: string) {
  return db.implementationTask.findMany({
    where: { plan: { productId, status: { not: "SUPERSEDED" } } },
    orderBy: { sequence: "asc" },
    include: {
      workItem: {
        include: {
          acceptanceCriteria: true,
          parent: { include: { parent: true } },
          capability: { include: { outcome: true } },
        },
      },
      components: { include: { component: true } },
      dependencies: { include: { dependsOn: true } },
      codingRisks: true,
      workspaces: { orderBy: { createdAt: "desc" }, include: { contract: true, plan: true } },
    },
  });
}

export async function recordToolEvent(input: {
  workspaceId: string;
  action: "READ_FILE" | "LIST_DIRECTORY" | "WRITE_FILE" | "CREATE_FILE" | "DELETE_FILE" | "RUN_COMMAND" | "GET_DIFF" | "GET_STATUS";
  allowed: boolean;
  reason: string;
  path?: string;
  command?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return db.codingToolEvent.create({
    data: {
      workspaceId: input.workspaceId,
      action: input.action,
      allowed: input.allowed,
      reason: input.reason,
      path: input.path ?? "",
      command: input.command ?? "",
      metadata: input.metadata ?? {},
    },
  });
}

export async function recordEvidence(input: {
  workspaceId: string;
  implementationTaskId: string;
  type: "FILE_CHANGE" | "TEST_RESULT" | "TYPECHECK" | "LINT" | "BUILD" | "STATIC_ANALYSIS" | "AGENT_ANALYSIS" | "HUMAN_CONFIRMATION";
  source: "REPOSITORY" | "COMMAND_RUNNER" | "AI_ANALYSIS" | "HUMAN";
  description: string;
  result: string;
  command?: string;
  exitCode?: number | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}) {
  return db.codingEvidence.create({
    data: {
      workspaceId: input.workspaceId,
      implementationTaskId: input.implementationTaskId,
      type: input.type,
      source: input.source,
      description: input.description,
      result: input.result,
      command: input.command ?? "",
      exitCode: input.exitCode ?? null,
      startedAt: input.startedAt ?? null,
      completedAt: input.completedAt ?? null,
    },
  });
}

export async function recordEscalation(input: {
  workspaceId: string;
  type: "REQUIREMENT_AMBIGUITY" | "ARCHITECTURE_CONFLICT" | "MISSING_DEPENDENCY" | "POLICY_CONFLICT" | "SCOPE_EXPANSION" | "TEST_FAILURE" | "SECURITY_CONCERN" | "UNEXPECTED_CODEBASE" | "OTHER";
  description: string;
  reason: string;
  recommendedAction: string;
}) {
  return db.codingEscalation.create({ data: { ...input, status: "OPEN" } });
}

export async function changedPaths(workspaceId: string) {
  const events = await db.codingToolEvent.findMany({
    where: {
      workspaceId,
      allowed: true,
      action: { in: ["WRITE_FILE", "CREATE_FILE", "DELETE_FILE"] },
    },
    select: { path: true, reason: true },
  });
  return new Set(events.filter((event) => event.reason !== "unchanged" && event.path).map((event) => event.path));
}

export async function openEscalationCount(workspaceId: string) {
  return db.codingEscalation.count({ where: { workspaceId, status: "OPEN" } });
}
