import "server-only";

import { db } from "@/lib/db";
import type { AgentRunRecord } from "@/modules/agent/types";

function toRun(row: {
  id: string;
  productId: string;
  workItemId: string | null;
  agentType: string;
  status: AgentRunRecord["status"];
  input: unknown;
  output: unknown;
  startedAt: Date | null;
  completedAt: Date | null;
  duration: number | null;
  estimatedCost: { toString(): string } | null;
  createdAt: Date;
}): AgentRunRecord {
  return {
    id: row.id,
    productId: row.productId,
    workItemId: row.workItemId,
    agentType: row.agentType,
    status: row.status,
    input: row.input,
    output: row.output,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    duration: row.duration,
    estimatedCost: row.estimatedCost ? row.estimatedCost.toString() : null,
    createdAt: row.createdAt,
  };
}

export async function countAgentRuns() {
  return db.agentRun.count();
}

export async function countRunsByAgentType() {
  const rows = await db.agentRun.groupBy({
    by: ["agentType"],
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.agentType, row._count._all]));
}

export async function latestRunByAgentType() {
  const rows = await db.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    distinct: ["agentType"],
    select: { agentType: true, status: true },
  });
  return new Map(rows.map((row) => [row.agentType, row.status]));
}

export async function agentRunStatsByType() {
  const [grouped, averages] = await Promise.all([
    db.agentRun.groupBy({
      by: ["agentType", "status"],
      _count: { _all: true },
    }),
    db.agentRun.groupBy({
      by: ["agentType"],
      where: { status: "COMPLETED", duration: { not: null } },
      _avg: { duration: true },
    }),
  ]);

  const stats = new Map<
    string,
    { completed: number; failed: number; averageDurationMs: number | null }
  >();
  for (const row of grouped) {
    const current = stats.get(row.agentType) ?? {
      completed: 0,
      failed: 0,
      averageDurationMs: null,
    };
    if (row.status === "COMPLETED") current.completed = row._count._all;
    if (row.status === "FAILED") current.failed = row._count._all;
    stats.set(row.agentType, current);
  }
  for (const row of averages) {
    const current = stats.get(row.agentType) ?? {
      completed: 0,
      failed: 0,
      averageDurationMs: null,
    };
    current.averageDurationMs =
      row._avg.duration == null ? null : Math.round(row._avg.duration);
    stats.set(row.agentType, current);
  }
  return stats;
}

export async function insertAgentRun(input: {
  productId: string;
  workItemId: string | null;
  agentType: string;
  input: unknown;
  startedAt: Date;
}) {
  const row = await db.agentRun.create({
    data: {
      productId: input.productId,
      workItemId: input.workItemId,
      agentType: input.agentType,
      status: "RUNNING",
      input: input.input as object,
      startedAt: input.startedAt,
    },
  });
  return toRun(row);
}

export async function completeAgentRun(
  id: string,
  input: {
    output: unknown;
    completedAt: Date;
    duration: number;
    estimatedCost: string | null;
  },
) {
  const row = await db.agentRun.update({
    where: { id },
    data: {
      status: "COMPLETED",
      output: input.output as object,
      completedAt: input.completedAt,
      duration: input.duration,
      estimatedCost: input.estimatedCost,
    },
  });
  return toRun(row);
}

export async function failAgentRun(
  id: string,
  input: { output: unknown; completedAt: Date; duration: number },
) {
  const row = await db.agentRun.update({
    where: { id },
    data: {
      status: "FAILED",
      output: input.output as object,
      completedAt: input.completedAt,
      duration: input.duration,
    },
  });
  return toRun(row);
}

export async function queryAgentRuns(filters?: {
  productId?: string;
  workItemId?: string;
}) {
  const rows = await db.agentRun.findMany({
    where: {
      productId: filters?.productId || undefined,
      workItemId: filters?.workItemId || undefined,
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRun);
}
