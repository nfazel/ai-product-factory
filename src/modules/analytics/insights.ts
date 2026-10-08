import { z } from "zod";

import { getAIProvider, isAIConfigured } from "@/modules/ai/provider";
import { getMetricDefinition } from "@/modules/analytics/catalogue";
import type { MetricValue } from "@/modules/analytics/types";

export const insightSchema = z
  .object({
    summary: z.string().trim().min(1).max(800),
    observations: z.array(insightItemSchema()).max(8),
    risks: z.array(insightItemSchema()).max(6),
    opportunities: z.array(insightItemSchema()).max(6),
    questions: z.array(z.string().trim().min(1).max(300)).max(6),
  })
  .strict();

function insightItemSchema() {
  return z
    .object({
      statement: z.string().trim().min(1).max(400),
      metricKeys: z.array(z.string().trim().min(1)).min(1).max(6),
    })
    .strict();
}

export type InsightItem = {
  statement: string;
  metricKeys: string[];
  evidence: string[];
};

export type InsightResult =
  | { available: false; reason: string }
  | {
      available: true;
      summary: string;
      observations: InsightItem[];
      risks: InsightItem[];
      opportunities: InsightItem[];
      questions: string[];
    };

const UNSUPPORTED = /saved|return on investment|\broi\b|productivity|cost saving/i;

export async function explainMetrics(metrics: MetricValue[]): Promise<InsightResult> {
  if (!isAIConfigured()) {
    return { available: false, reason: "AI is not configured. The calculated metrics are unchanged." };
  }
  const generated = await getAIProvider().generate({
    systemPrompt: [
      "You explain factory metrics that were already calculated.",
      "You cannot change a number, a data-quality rating, a sample size, a lifecycle record, or an approval.",
      "Every observation, risk, and opportunity must cite metricKeys from the payload.",
      "Do not invent durations, percentages, savings, ROI, or costs.",
      "If a display is INSUFFICIENT DATA, NOT AVAILABLE, or COST NOT AVAILABLE, say that.",
      "Recommend investigation only.",
    ].join(" "),
    messages: [{ role: "user", content: JSON.stringify(metricPayload(metrics)) }],
    responseSchema: insightSchema,
    schemaName: "factory_insights",
  });
  return {
    available: true,
    summary: generated.data.summary,
    observations: ground(generated.data.observations, metrics),
    risks: ground(generated.data.risks, metrics),
    opportunities: ground(generated.data.opportunities, metrics),
    questions: generated.data.questions,
  };
}

export function metricPayload(metrics: MetricValue[]) {
  return metrics.map((metric) => ({
    key: metric.key,
    name: getMetricDefinition(metric.key)?.name ?? metric.key,
    display: metric.display,
    value: metric.value,
    unit: metric.unit,
    sampleSize: metric.sampleSize,
    numerator: metric.numerator,
    denominator: metric.denominator,
    quality: metric.quality,
    qualityNote: metric.qualityNote,
  }));
}

function ground(
  items: { statement: string; metricKeys: string[] }[],
  metrics: MetricValue[],
): InsightItem[] {
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
  const grounded: InsightItem[] = [];
  for (const item of items) {
    const metricKeys = item.metricKeys.filter((key) => byKey.has(key));
    if (metricKeys.length === 0) continue;
    const evidence = metricKeys.map((key) => {
      const metric = byKey.get(key)!;
      const name = getMetricDefinition(key)?.name ?? key;
      const sample = metric.sampleSize == null ? "" : ` (n = ${metric.sampleSize})`;
      return `${name}: ${metric.display}${sample}`;
    });
    if (!statementSupported(item.statement, evidence.join(" "))) continue;
    grounded.push({ statement: item.statement, metricKeys, evidence });
  }
  return grounded;
}

function statementSupported(statement: string, evidence: string) {
  if (UNSUPPORTED.test(statement)) return false;
  const numbers = statement.match(/\d+(?:\.\d+)?/g) ?? [];
  return numbers.every((number) => evidence.includes(number));
}
