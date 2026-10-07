import "server-only";

import { listAcceptanceCriteria } from "@/modules/acceptance/service";
import { listActivity } from "@/modules/activity/service";
import { listAgentRuns } from "@/modules/agent/service";
import { listApprovalsForWorkItem } from "@/modules/approval/service";
import { listDecisions } from "@/modules/decision/service";
import {
  getWorkItem,
  listDependencies,
  listWorkItems,
} from "@/modules/work-item/service";

export async function getWorkItemDetail(id: string) {
  const item = await getWorkItem(id);
  if (!item) return null;

  const [criteria, dependencies, decisions, approvals, activity, agentRuns, productItems] =
    await Promise.all([
      listAcceptanceCriteria(id),
      listDependencies(id),
      listDecisions({ workItemId: id }),
      listApprovalsForWorkItem(id),
      listActivity({ workItemId: id, limit: 40 }),
      listAgentRuns({ workItemId: id }),
      listWorkItems({ productId: item.productId }),
    ]);

  return {
    item,
    criteria,
    dependencies,
    decisions,
    approvals,
    activity,
    agentRuns,
    productItems,
  };
}
