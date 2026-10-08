import "server-only";

import { explainMetrics } from "@/modules/analytics/insights";
import { loadAnalyticsInputs } from "@/modules/analytics/load";
import { calculatePortfolio } from "@/modules/analytics/portfolio";
import { calculateProduct } from "@/modules/analytics/engine";
import type { TimeWindow } from "@/modules/analytics/time";

export async function getProductIntelligence(productId: string, window: TimeWindow) {
  const inputs = await loadAnalyticsInputs(productId);
  const input = inputs[0];
  if (!input) return null;
  return calculateProduct(input, window);
}

export async function getPortfolioIntelligence(window: TimeWindow) {
  const inputs = await loadAnalyticsInputs();
  return calculatePortfolio(inputs, window);
}

export async function explainProductIntelligence(productId: string, window: TimeWindow) {
  const view = await getProductIntelligence(productId, window);
  if (!view) return null;
  const before = view.metrics.map((metric) => ({ key: metric.key, value: metric.value, display: metric.display }));
  const insight = await explainMetrics(view.metrics);
  const unchanged = view.metrics.every((metric, index) => metric.value === before[index]?.value && metric.display === before[index]?.display);
  if (!unchanged) {
    throw new Error("Factory Insights changed a metric. That is not allowed.");
  }
  return insight;
}
