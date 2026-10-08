import "server-only";

import { assessGuidance } from "@/modules/guidance/assess";
import { loadSnapshots } from "@/modules/guidance/load";

export async function proveAdvanceBlockers(productId: string) {
  const [snapshot] = await loadSnapshots(productId);
  if (!snapshot) return ["The product was not found."];
  if (snapshot.stage !== "BUILD") return ["Move to Prove is available when the product is in Build."];
  if (!snapshot.prove.sliceVerified) {
    return ["Move to Prove stays closed until every task in the First Slice has an approved independent check and no critical or high defect is open."];
  }
  const guidance = assessGuidance(snapshot);
  if (guidance.blocker && guidance.action?.key !== "move-prove") {
    return [guidance.blocker.why];
  }
  return [];
}
