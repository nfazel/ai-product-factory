import "server-only";

import type { ActivityType } from "@/domain/constants";
import { db } from "@/lib/db";
import type { ActivityFilters, ActivityRecord } from "@/modules/activity/types";

export async function insertActivity(input: {
  productId: string;
  workItemId?: string | null;
  type: ActivityType;
  description: string;
  actor: string;
}) {
  await db.activity.create({
    data: {
      productId: input.productId,
      workItemId: input.workItemId ?? null,
      type: input.type,
      description: input.description,
      actor: input.actor,
    },
  });
}

export async function queryActivity(
  filters: ActivityFilters,
): Promise<ActivityRecord[]> {
  const rows = await db.activity.findMany({
    where: {
      productId: filters.productId || undefined,
      workItemId: filters.workItemId || undefined,
      type: filters.type,
      actor: filters.actor
        ? { contains: filters.actor, mode: "insensitive" }
        : undefined,
      createdAt:
        filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
      workItem: filters.workItemQuery
        ? {
            title: { contains: filters.workItemQuery, mode: "insensitive" },
          }
        : undefined,
    },
    include: {
      product: { select: { name: true } },
      workItem: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 200,
  });

  return rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    productName: row.product.name,
    workItemId: row.workItemId,
    workItemTitle: row.workItem?.title ?? null,
    type: row.type,
    description: row.description,
    actor: row.actor,
    createdAt: row.createdAt,
  }));
}

export async function listActors(): Promise<string[]> {
  const rows = await db.activity.findMany({
    distinct: ["actor"],
    select: { actor: true },
    orderBy: { actor: "asc" },
  });
  return rows.map((row) => row.actor);
}
