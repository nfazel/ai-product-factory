"use server";

import type { InsightResult } from "@/modules/analytics/insights";
import { explainProductIntelligence } from "@/modules/analytics/service";
import { parseWindow } from "@/modules/analytics/time";

export async function explainIntelligenceAction(_previous: InsightResult | null, formData: FormData): Promise<InsightResult> {
  const productId = String(formData.get("productId") ?? "");
  const window = parseWindow(String(formData.get("window") ?? ""));
  const insight = await explainProductIntelligence(productId, window);
  if (!insight) return { available: false, reason: "This product was not found. The metrics were not changed." };
  return insight;
}
