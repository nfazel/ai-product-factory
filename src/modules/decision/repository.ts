import "server-only";

import { db } from "@/lib/db";
import type {
  CreateDecisionInput,
  DecisionRecord,
} from "@/modules/decision/types";

function toDecision(row: {
  id: string;
  productId: string;
  workItemId: string | null;
  title: string;
  description: string;
  decision: string;
  reason: string;
  decisionMaker: string;
  createdAt: Date;
  product: { name: string };
  workItem: { title: string } | null;
}): DecisionRecord {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.product.name,
    workItemId: row.workItemId,
    workItemTitle: row.workItem?.title ?? null,
    title: row.title,
    description: row.description,
    decision: row.decision,
    reason: row.reason,
    decisionMaker: row.decisionMaker,
    createdAt: row.createdAt,
  };
}

const include = {
  product: { select: { name: true } },
  workItem: { select: { title: true } },
} as const;

export async function queryDecisions(filters: {
  productId?: string;
  workItemId?: string;
  limit?: number;
}) {
  const rows = await db.decision.findMany({
    where: {
      productId: filters.productId || undefined,
      workItemId: filters.workItemId || undefined,
    },
    include,
    orderBy: { createdAt: "desc" },
    take: filters.limit,
  });
  return rows.map(toDecision);
}

export async function insertDecision(input: CreateDecisionInput) {
  const row = await db.decision.create({
    data: {
      productId: input.productId,
      workItemId: input.workItemId ?? null,
      title: input.title,
      description: input.description,
      decision: input.decision,
      reason: input.reason,
      decisionMaker: input.decisionMaker,
    },
    include,
  });
  return toDecision(row);
}
