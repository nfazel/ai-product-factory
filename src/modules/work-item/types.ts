import type {
  Priority,
  ProductStage,
  WorkItemProvenance,
  WorkItemStatus,
  WorkItemType,
} from "@/domain/constants";

export type WorkItemSummary = {
  id: string;
  productId: string;
  productName: string;
  parentId: string | null;
  title: string;
  description: string;
  type: WorkItemType;
  status: WorkItemStatus;
  stage: ProductStage;
  priority: Priority;
  provenance: WorkItemProvenance;
  persona: string;
  userNeed: string;
  userValue: string;
  priorityAssigned: boolean;
  dependenciesIdentified: boolean;
  assumptionsNoted: boolean;
  humanLocked: boolean;
  capabilityId: string | null;
  sliceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkItemFilters = {
  productId?: string;
  type?: WorkItemType;
  status?: WorkItemStatus;
  priority?: Priority;
  query?: string;
};

export type CreateWorkItemInput = {
  productId: string;
  parentId?: string;
  title: string;
  description?: string;
  type: WorkItemType;
  status?: WorkItemStatus;
  stage: ProductStage;
  priority?: Priority;
};

export type UpdateWorkItemInput = {
  id: string;
  title: string;
  description: string;
  status: WorkItemStatus;
  stage: ProductStage;
  priority: Priority;
};

export type DependencyLink = {
  id: string;
  dependsOnId: string;
  title: string;
  type: WorkItemType;
  status: WorkItemStatus;
};

export type DependencyEdge = {
  workItemId: string;
  dependsOnId: string;
};
