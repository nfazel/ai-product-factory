import "server-only";

import { countAllAgentRuns } from "@/modules/agent/service";
import { listActivity } from "@/modules/activity/service";
import { countPendingApprovals } from "@/modules/approval/service";
import { countActiveProducts, listProducts } from "@/modules/product/service";
import {
  countBlockedWorkItems,
  countInProgressWorkItems,
  listAttentionItems,
} from "@/modules/work-item/service";

export async function getDashboard() {
  const [
    activeProducts,
    workItemsInProgress,
    itemsBlocked,
    pendingApprovals,
    agentRuns,
    recentProducts,
    recentActivity,
    attentionItems,
  ] = await Promise.all([
    countActiveProducts(),
    countInProgressWorkItems(),
    countBlockedWorkItems(),
    countPendingApprovals(),
    countAllAgentRuns(),
    listProducts(5),
    listActivity({ limit: 8 }),
    listAttentionItems(8),
  ]);

  return {
    stats: {
      activeProducts,
      workItemsInProgress,
      itemsBlocked,
      pendingApprovals,
      agentRuns,
    },
    recentProducts,
    recentActivity,
    attentionItems,
  };
}
