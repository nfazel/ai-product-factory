import "server-only";

import { assessGuidance } from "@/modules/guidance/assess";
import { loadSnapshots } from "@/modules/guidance/load";
import type { ProductGuidance } from "@/modules/guidance/types";

export async function getProductGuidance(productId: string): Promise<ProductGuidance | null> {
  const [snapshot] = await loadSnapshots(productId);
  return snapshot ? assessGuidance(snapshot) : null;
}

export async function listGuidance(): Promise<ProductGuidance[]> {
  const snapshots = await loadSnapshots();
  return snapshots.map(assessGuidance);
}

export async function listPendingDecisions() {
  const guidance = await listGuidance();
  return guidance.flatMap((item) =>
    item.action?.decision
      ? [
          {
            productId: item.productId,
            productName: item.name,
            sample: item.sample,
            stage: item.action.stage,
            action: item.action,
            blocker: item.blocker,
          },
        ]
      : [],
  );
}
