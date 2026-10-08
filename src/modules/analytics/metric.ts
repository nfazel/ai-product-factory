import { getMetricDefinition } from "@/modules/analytics/catalogue";
import { average, formatDuration, formatPercent, median, type TimeWindow } from "@/modules/analytics/time";
import type { DrillItem, MetricKind, MetricQuality, MetricValue } from "@/modules/analytics/types";

export function blankMetric(
  key: string,
  window: TimeWindow,
  calculatedAt: string,
  display: string,
  quality: MetricQuality,
  qualityNote: string,
  kind: MetricKind,
  extra: Partial<MetricValue> = {},
): MetricValue {
  const definition = getMetricDefinition(key);
  return {
    key,
    display,
    value: null,
    unit: definition?.unit ?? "",
    sampleSize: 0,
    numerator: null,
    denominator: null,
    quality,
    qualityNote,
    window,
    calculatedAt,
    comparison: null,
    drilldown: [],
    samplesMs: [],
    kind,
    ...extra,
  };
}

export function durationAggregate(options: {
  key: string;
  window: TimeWindow;
  calculatedAt: string;
  samples: { ms: number; drill: DrillItem }[];
  pick: "median" | "average";
  quality?: MetricQuality;
  qualityNote: string;
  insufficientNote: string;
  comparison?: string | null;
  sampleSize?: number;
}): MetricValue {
  const { samples } = options;
  if (samples.length === 0) {
    return blankMetric(options.key, options.window, options.calculatedAt, "INSUFFICIENT DATA", "INSUFFICIENT", options.insufficientNote, "duration");
  }
  const values = samples.map((sample) => sample.ms);
  const value = options.pick === "median" ? median(values) : average(values);
  return blankMetric(
    options.key,
    options.window,
    options.calculatedAt,
    formatDuration(value),
    options.quality ?? "GOOD",
    options.qualityNote,
    "duration",
    {
      value,
      sampleSize: options.sampleSize ?? samples.length,
      samplesMs: values,
      drilldown: samples.map((sample) => sample.drill),
      comparison: options.comparison ?? null,
    },
  );
}

export function unavailableDuration(
  key: string,
  window: TimeWindow,
  calculatedAt: string,
  note: string,
  sampleSize: number | null = null,
): MetricValue {
  return blankMetric(key, window, calculatedAt, "NOT AVAILABLE", "INSUFFICIENT", note, "duration", {
    sampleSize,
  });
}

export function rateMetric(options: {
  key: string;
  window: TimeWindow;
  calculatedAt: string;
  numerator: number;
  denominator: number;
  drilldown?: DrillItem[];
  note: string;
  insufficientNote: string;
  quality?: MetricQuality;
  sampleSize?: number;
}): MetricValue {
  if (options.denominator <= 0) {
    return blankMetric(options.key, options.window, options.calculatedAt, "INSUFFICIENT DATA", "INSUFFICIENT", options.insufficientNote, "rate", {
      numerator: options.numerator,
      denominator: options.denominator,
      sampleSize: 0,
      drilldown: options.drilldown ?? [],
    });
  }
  return blankMetric(
    options.key,
    options.window,
    options.calculatedAt,
    formatPercent(options.numerator, options.denominator),
    options.quality ?? "GOOD",
    options.note,
    "rate",
    {
      value: options.numerator / options.denominator,
      numerator: options.numerator,
      denominator: options.denominator,
      sampleSize: options.sampleSize ?? options.denominator,
      drilldown: options.drilldown ?? [],
    },
  );
}

export function countMetric(options: {
  key: string;
  window: TimeWindow;
  calculatedAt: string;
  count: number;
  note: string;
  drilldown?: DrillItem[];
  quality?: MetricQuality;
  display?: string;
  sampleSize?: number;
}): MetricValue {
  return blankMetric(
    options.key,
    options.window,
    options.calculatedAt,
    options.display ?? String(options.count),
    options.quality ?? "GOOD",
    options.note,
    "count",
    {
      value: options.count,
      sampleSize: options.sampleSize ?? options.count,
      drilldown: options.drilldown ?? [],
    },
  );
}

export function textMetric(options: {
  key: string;
  window: TimeWindow;
  calculatedAt: string;
  display: string;
  quality: MetricQuality;
  note: string;
  drilldown?: DrillItem[];
  sampleSize?: number | null;
}): MetricValue {
  return blankMetric(options.key, options.window, options.calculatedAt, options.display, options.quality, options.note, "text", {
    sampleSize: options.sampleSize ?? null,
    drilldown: options.drilldown ?? [],
  });
}

