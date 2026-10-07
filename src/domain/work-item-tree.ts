import type { WorkItemType } from "@/domain/constants";

export type TreeItem = {
  id: string;
  parentId: string | null;
  type: WorkItemType;
  title: string;
};

export type WorkItemNode<T extends TreeItem> = T & {
  children: WorkItemNode<T>[];
};

const TYPE_ORDER: Record<WorkItemType, number> = {
  EPIC: 0,
  FEATURE: 1,
  STORY: 2,
  TASK: 3,
  DEFECT: 4,
};

export function buildWorkItemTree<T extends TreeItem>(
  items: T[],
): WorkItemNode<T>[] {
  const nodes = new Map<string, WorkItemNode<T>>();
  for (const item of items) {
    nodes.set(item.id, { ...item, children: [] });
  }

  const roots: WorkItemNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortLevel = (level: WorkItemNode<T>[]) => {
    level.sort(
      (a, b) =>
        TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
        a.title.localeCompare(b.title),
    );
    for (const node of level) sortLevel(node.children);
  };

  sortLevel(roots);
  return roots;
}
