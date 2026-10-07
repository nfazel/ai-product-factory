export {
  addWorkItemDependency,
  countBlockedWorkItems,
  countInProgressWorkItems,
  createWorkItem,
  getWorkItem,
  listAttentionItems,
  listDependencies,
  listWorkItems,
  updateWorkItem,
  workItemTypeCounts,
} from "@/modules/work-item/service";
export { getWorkItemDetail } from "@/modules/work-item/detail";
export type {
  CreateWorkItemInput,
  DependencyLink,
  UpdateWorkItemInput,
  WorkItemFilters,
  WorkItemSummary,
} from "@/modules/work-item/types";
