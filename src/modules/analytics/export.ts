import { getMetricDefinition } from "@/modules/analytics/catalogue";
import { WINDOW_LABEL, type TimeWindow } from "@/modules/analytics/time";
import type { MetricValue } from "@/modules/analytics/types";

export type MetricExportRow = {
  metric: string;
  value: string;
  unit: string;
  period: string;
  sampleSize: number | null;
  dataQuality: string;
  calculatedAt: string;
};

export function exportRows(metrics: MetricValue[], window: TimeWindow, calculatedAt: string): MetricExportRow[] {
  return metrics.map((metric) => ({
    metric: getMetricDefinition(metric.key)?.name ?? metric.key,
    value: metric.display,
    unit: metric.unit,
    period: WINDOW_LABEL[window],
    sampleSize: metric.sampleSize,
    dataQuality: metric.quality,
    calculatedAt,
  }));
}

export function exportJson(metrics: MetricValue[], window: TimeWindow, calculatedAt: string) {
  return JSON.stringify(
    {
      period: WINDOW_LABEL[window],
      calculatedAt,
      metrics: exportRows(metrics, window, calculatedAt),
    },
    null,
    2,
  );
}

export function exportCsv(metrics: MetricValue[], window: TimeWindow, calculatedAt: string) {
  const rows = exportRows(metrics, window, calculatedAt);
  const header = ["metric", "value", "unit", "period", "sampleSize", "dataQuality", "calculatedAt"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [row.metric, row.value, row.unit, row.period, row.sampleSize ?? "", row.dataQuality, row.calculatedAt]
        .map(escapeCsv)
        .join(","),
    );
  }
  return lines.join("\n");
}

function escapeCsv(value: string | number) {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}
