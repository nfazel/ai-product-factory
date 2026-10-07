import "server-only";

import {
  PRIORITY_LABEL,
  STAGE_META,
  WORK_ITEM_STATUS_LABEL,
  WORK_ITEM_TYPE_LABEL,
} from "@/domain/constants";
import { parentPlacementError } from "@/domain/rules";
import { recordActivity } from "@/modules/activity/service";
import { DomainError } from "@/modules/shared/errors";
import { findProductRow } from "@/modules/product/repository";
import {
  countWorkItemsByStatus,
  countWorkItemsByType,
  findWorkItemRow,
  insertDependency,
  insertWorkItem,
  queryAttentionItems,
  queryDependencies,
  queryDependencyEdges,
  queryWorkItems,
  saveWorkItem,
} from "@/modules/work-item/repository";
import type {
  CreateWorkItemInput,
  DependencyEdge,
  UpdateWorkItemInput,
  WorkItemFilters,
} from "@/modules/work-item/types";

export async function listWorkItems(filters?: WorkItemFilters) {
  return queryWorkItems(filters);
}

export async function getWorkItem(id: string) {
  return findWorkItemRow(id);
}

export async function countInProgressWorkItems() {
  return countWorkItemsByStatus("IN_PROGRESS");
}

export async function countBlockedWorkItems() {
  return countWorkItemsByStatus("BLOCKED");
}

export async function workItemTypeCounts(productId: string) {
  return countWorkItemsByType(productId);
}

export async function listAttentionItems(limit = 8) {
  return queryAttentionItems(limit);
}

export async function listDependencies(workItemId: string) {
  return queryDependencies(workItemId);
}

export async function createWorkItem(input: CreateWorkItemInput) {
  const product = await findProductRow(input.productId);
  if (!product) throw new DomainError("Product not found.", "NOT_FOUND");

  let parentType: CreateWorkItemInput["type"] | null = null;
  if (input.parentId) {
    const parent = await findWorkItemRow(input.parentId);
    if (!parent || parent.productId !== input.productId) {
      throw new DomainError("Choose a parent work item from this product.");
    }
    parentType = parent.type;
  }

  const placement = parentPlacementError(input.type, parentType);
  if (placement) throw new DomainError(placement);

  const item = await insertWorkItem(input);
  await recordActivity({
    productId: item.productId,
    workItemId: item.id,
    type: "WORK_ITEM_CREATED",
    description: `Created ${WORK_ITEM_TYPE_LABEL[item.type].toLowerCase()} "${item.title}".`,
  });
  return item;
}

export async function updateWorkItem(input: UpdateWorkItemInput) {
  const existing = await findWorkItemRow(input.id);
  if (!existing) throw new DomainError("Work item not found.", "NOT_FOUND");

  const changes: string[] = [];
  if (existing.title !== input.title) changes.push("title");
  if (existing.description !== input.description) changes.push("description");
  if (existing.status !== input.status) {
    changes.push(
      `status from ${WORK_ITEM_STATUS_LABEL[existing.status]} to ${WORK_ITEM_STATUS_LABEL[input.status]}`,
    );
  }
  if (existing.priority !== input.priority) {
    changes.push(
      `priority from ${PRIORITY_LABEL[existing.priority]} to ${PRIORITY_LABEL[input.priority]}`,
    );
  }
  if (existing.stage !== input.stage) {
    changes.push(
      `stage from ${STAGE_META[existing.stage].label} to ${STAGE_META[input.stage].label}`,
    );
  }

  const item = await saveWorkItem(input);
  if (changes.length > 0) {
    await recordActivity({
      productId: item.productId,
      workItemId: item.id,
      type: "WORK_ITEM_UPDATED",
      description: `Updated ${changes.join(", ")}.`,
    });
  }
  return item;
}

function dependencyReaches(
  start: string,
  target: string,
  edges: DependencyEdge[],
) {
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    const next = graph.get(edge.workItemId) ?? [];
    next.push(edge.dependsOnId);
    graph.set(edge.workItemId, next);
  }

  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    if (node === target) return true;
    seen.add(node);
    for (const next of graph.get(node) ?? []) stack.push(next);
  }
  return false;
}

export async function addWorkItemDependency(
  workItemId: string,
  dependsOnId: string,
) {
  if (workItemId === dependsOnId) {
    throw new DomainError("A work item cannot depend on itself.");
  }

  const item = await findWorkItemRow(workItemId);
  const target = await findWorkItemRow(dependsOnId);
  if (!item || !target) {
    throw new DomainError("Work item not found.", "NOT_FOUND");
  }
  if (item.productId !== target.productId) {
    throw new DomainError("Dependencies must stay inside the same product.");
  }

  const edges = await queryDependencyEdges(item.productId);
  if (
    edges.some(
      (edge) =>
        edge.workItemId === workItemId && edge.dependsOnId === dependsOnId,
    )
  ) {
    throw new DomainError("That dependency already exists.", "CONFLICT");
  }
  if (dependencyReaches(dependsOnId, workItemId, edges)) {
    throw new DomainError("That dependency would create a cycle.");
  }

  await insertDependency(workItemId, dependsOnId);
  await recordActivity({
    productId: item.productId,
    workItemId: item.id,
    type: "DEPENDENCY_ADDED",
    description: `Added a dependency on "${target.title}".`,
  });
  return item;
}
