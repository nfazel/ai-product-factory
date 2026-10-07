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
