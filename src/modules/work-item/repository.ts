import "server-only";

import { db } from "@/lib/db";
import type {
  CreateWorkItemInput,
  DependencyEdge,
  DependencyLink,
  UpdateWorkItemInput,
  WorkItemFilters,
  WorkItemSummary,
} from "@/modules/work-item/types";

function toSummary(row: {
  id: string;
  productId: string;
  parentId: string | null;
  title: string;
  description: string;
  type: WorkItemSummary["type"];
  status: WorkItemSummary["status"];
  stage: WorkItemSummary["stage"];
  priority: WorkItemSummary["priority"];
  createdAt: Date;
  updatedAt: Date;
  product: { name: string };
}): WorkItemSummary {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.product.name,
    parentId: row.parentId,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    stage: row.stage,
    priority: row.priority,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const summaryInclude = { product: { select: { name: true } } } as const;

export async function queryWorkItems(filters: WorkItemFilters = {}) {
  const rows = await db.workItem.findMany({
    where: {
      productId: filters.productId || undefined,
      type: filters.type,
      status: filters.status,
      priority: filters.priority,
      title: filters.query
        ? { contains: filters.query, mode: "insensitive" }
        : undefined,
    },
    include: summaryInclude,
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map(toSummary);
}

export async function findWorkItemRow(id: string) {
  const row = await db.workItem.findUnique({
    where: { id },
    include: summaryInclude,
  });
  return row ? toSummary(row) : null;
}

export async function insertWorkItem(input: CreateWorkItemInput) {
  const row = await db.workItem.create({
    data: {
      productId: input.productId,
      parentId: input.parentId ?? null,
      title: input.title,
      description: input.description ?? "",
      type: input.type,
      status: input.status ?? "DRAFT",
      stage: input.stage,
      priority: input.priority ?? "MEDIUM",
    },
    include: summaryInclude,
  });
  return toSummary(row);
}

export async function saveWorkItem(input: UpdateWorkItemInput) {
  const row = await db.workItem.update({
    where: { id: input.id },
    data: {
      title: input.title,
      description: input.description,
      status: input.status,
      stage: input.stage,
      priority: input.priority,
    },
    include: summaryInclude,
  });
  return toSummary(row);
}

export async function countWorkItemsByStatus(
  status: WorkItemSummary["status"],
) {
  return db.workItem.count({ where: { status } });
}

export async function countWorkItemsByType(productId: string) {
  const rows = await db.workItem.groupBy({
    by: ["type"],
    where: { productId },
    _count: { _all: true },
  });
  const counts = { EPIC: 0, FEATURE: 0, STORY: 0, TASK: 0, DEFECT: 0 };
  for (const row of rows) counts[row.type] = row._count._all;
  return counts;
}

export async function queryAttentionItems(limit: number) {
  const rows = await db.workItem.findMany({
    where: {
      OR: [
        { status: { in: ["BLOCKED", "REVIEW"] } },
        { priority: "CRITICAL", NOT: { status: "DONE" } },
      ],
    },
    include: summaryInclude,
    take: 50,
  });

  const rank = (status: WorkItemSummary["status"]) => {
    if (status === "BLOCKED") return 0;
    if (status === "REVIEW") return 1;
    return 2;
  };

  return rows
    .sort(
      (a, b) =>
        rank(a.status) - rank(b.status) ||
        b.updatedAt.getTime() - a.updatedAt.getTime(),
    )
    .slice(0, limit)
    .map(toSummary);
}

export async function queryDependencies(
  workItemId: string,
): Promise<DependencyLink[]> {
  const rows = await db.workItemDependency.findMany({
    where: { workItemId },
    include: {
      dependsOn: { select: { id: true, title: true, type: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    dependsOnId: row.dependsOn.id,
    title: row.dependsOn.title,
    type: row.dependsOn.type,
    status: row.dependsOn.status,
  }));
}

export async function queryDependencyEdges(
  productId: string,
): Promise<DependencyEdge[]> {
  return db.workItemDependency.findMany({
    where: { workItem: { productId } },
    select: { workItemId: true, dependsOnId: true },
  });
}

export async function insertDependency(workItemId: string, dependsOnId: string) {
  await db.workItemDependency.create({
    data: { workItemId, dependsOnId },
  });
}
