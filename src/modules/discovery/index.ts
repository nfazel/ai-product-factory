export {
  countSufficientClarity,
  mergeAssumptions,
  mergeDiscoveryResponse,
  readinessSummary,
} from "@/modules/discovery/merge";
export { discoveryResponseSchema } from "@/modules/discovery/schema";
export {
  approveProductBrief,
  continueDiscovery,
  editProductBrief,
  getDiscoveryWorkspace,
  moveDiscoveryToDefine,
  requestDiscoveryReview,
  retryDiscovery,
  setAssumptionStatus,
  startDiscovery,
} from "@/modules/discovery/service";
export type { DiscoveryResponse } from "@/modules/discovery/schema";
