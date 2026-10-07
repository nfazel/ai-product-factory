import "server-only";

import { listActivity } from "@/modules/activity/service";
import { countPendingApprovals } from "@/modules/approval/service";
import { listDecisions } from "@/modules/decision/service";
import { getProduct } from "@/modules/product/service";
import { workItemTypeCounts } from "@/modules/work-item/service";

export async function getProductOverview(id: string) {
  const product = await getProduct(id);
  if (!product) return null;

  const [counts, pendingApprovals, activity, decisions] = await Promise.all([
    workItemTypeCounts(id),
    countPendingApprovals(id),
    listActivity({ productId: id, limit: 8 }),
    listDecisions({ productId: id, limit: 5 }),
  ]);

  return {
    product,
    counts: {
      epics: counts.EPIC,
      features: counts.FEATURE,
      stories: counts.STORY,
      defects: counts.DEFECT,
      pendingApprovals,
    },
    activity,
    decisions,
  };
}
