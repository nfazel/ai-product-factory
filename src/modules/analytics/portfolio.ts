import { definitionsFor, getMetricDefinition } from "@/modules/analytics/catalogue";
import { calculateProduct } from "@/modules/analytics/engine";
import { countMetric, durationAggregate, rateMetric, textMetric, unavailableDuration } from "@/modules/analytics/metric";
import { formatDuration, median, p85, P85_MINIMUM, type TimeWindow } from "@/modules/analytics/time";
import type { AnalyticsInput, ChartPoint, MetricValue, PortfolioIntelligence } from "@/modules/analytics/types";

const SUM_DURATION = new Set(["ai_execution_time", "human_approval_time"]);

export function calculatePortfolio(inputs: AnalyticsInput[], window: TimeWindow): PortfolioIntelligence {
  const products = inputs.map((input) => calculateProduct(input, window));
  const calculatedAt = inputs[0]?.now ?? new Date(0).toISOString();
  const metrics = definitionsFor("product").map((definition) => {
    if (definition.key === "implementation_cycle_p85") return portfolioP85(products.flatMap((product) => product.metrics.find((metric) => metric.key === "implementation_cycle_median")?.samplesMs ?? []), window, calculatedAt);
    return combine(definition.key, products.flatMap((product) => product.metrics.filter((metric) => metric.key === definition.key)), window, calculatedAt);
  });
  const blocked = products.filter((product) => product.blocked);
  const ready = products.filter((product) => product.readyForHuman);
  metrics.push(
    countMetric({
      key: "products_blocked",
      window,
      calculatedAt,
      count: blocked.length,
      note: "Products with a blocked work item, an open high or critical release issue, or a governance review flag.",
      drilldown: blocked.map((product) => ({ id: product.productId, label: product.productName, detail: product.stage })),
    }),
    countMetric({
      key: "products_ready_for_action",
      window,
      calculatedAt,
      count: ready.length,
      note: "Products with a pending approval.",
      drilldown: ready.map((product) => ({ id: product.productId, label: product.productName, detail: product.stage })),
    }),
    countMetric({
      key: "portfolio_products",
      window,
      calculatedAt,
      count: products.length,
      note: "Products included in this calculation.",
      drilldown: products.map((product) => ({ id: product.productId, label: product.productName, detail: product.stage })),
    }),
  );

  const stages = ["EXPLORE", "DEFINE", "BUILD", "PROVE", "SHIP", "LEARN"];
  return {
    window,
    calculatedAt,
    products,
    metrics,
    stageCounts: stages.map((stage) => ({ stage, count: products.filter((product) => product.stage === stage).length })),
    blocked: blocked.map((product) => ({ id: product.productId, name: product.productName, stage: product.stage })),
    ready: ready.map((product) => ({ id: product.productId, name: product.productName, stage: product.stage })),
    bottlenecks: products.flatMap((product) => product.bottlenecks),
    charts: {
      waitBreakdown: medianChart(products.flatMap((product) => product.waits.filter((wait) => wait.durationMs != null).map((wait) => ({ label: wait.label, value: wait.durationMs! })))),
      defectsByStage: combinePoints(products.flatMap((product) => product.charts.defectsByStage)),
      agentRunsByResult: combinePoints(products.flatMap((product) => product.charts.agentRunsByResult)),
      approvalWait: medianChart(products.flatMap((product) => product.metrics.filter((metric) => metric.key.startsWith("approval_wait_")).flatMap((metric) => metric.samplesMs.map((value) => ({ label: metric.key.replace("approval_wait_", "").replaceAll("_", " "), value }))))),
      leadTime: products.flatMap((product) => product.charts.leadTime),
      cycleTime: products.flatMap((product) => product.charts.cycleTime),
      outcomeObservations: products.flatMap((product) => product.charts.outcomeObservations),
    },
  };
}

function portfolioP85(samples: number[], window: TimeWindow, calculatedAt: string) {
  const value = p85(samples);
  if (value == null) {
    return unavailableDuration("implementation_cycle_p85", window, calculatedAt, `P85 is hidden because the portfolio sample has ${samples.length} items. It is shown from ${P85_MINIMUM} items upward.`, samples.length);
  }
  return durationAggregate({
    key: "implementation_cycle_p85",
    window,
    calculatedAt,
    samples: [{ ms: value, drill: { id: "p85", label: "P85", detail: formatDuration(value) } }],
    pick: "median",
    sampleSize: samples.length,
    quality: "PARTIAL",
    qualityNote: "Pooled implementation samples. The task clock is partial because IN_PROGRESS is not stored.",
    insufficientNote: "",
  });
}

function combine(key: string, rows: MetricValue[], window: TimeWindow, calculatedAt: string): MetricValue {
  const definition = getMetricDefinition(key);
  const samples = rows.flatMap((row) => row.samplesMs);
  if (definition && (rows.some((row) => row.kind === "duration") || samples.length > 0) && rows.every((row) => row.kind === "duration" || row.kind === "text")) {
    if (samples.length === 0) {
      return textMetric({
        key,
        window,
        calculatedAt,
        display: rows[0]?.display ?? "INSUFFICIENT DATA",
        quality: "INSUFFICIENT",
        note: rows[0]?.qualityNote ?? "No product had enough data.",
        sampleSize: 0,
      });
    }
    if (SUM_DURATION.has(key)) {
      const total = samples.reduce((sum, value) => sum + value, 0);
      const size = rows.reduce((sum, row) => sum + (row.sampleSize ?? 0), 0);
      return durationAggregate({
        key,
        window,
        calculatedAt,
        samples: [{ ms: total, drill: { id: key, label: definition.name, detail: formatDuration(total) } }],
        pick: "median",
        sampleSize: size,
        quality: "PARTIAL",
        qualityNote: "Sum across products. This is not a saving.",
        insufficientNote: "",
      });
    }
    const quality = rows.some((row) => row.quality === "PARTIAL") ? "PARTIAL" : "GOOD";
    return durationAggregate({
      key,
      window,
      calculatedAt,
      samples: samples.map((ms, index) => ({ ms, drill: rows.flatMap((row) => row.drilldown)[index] ?? { id: `${key}-${index}`, label: definition.name, detail: formatDuration(ms) } })),
      pick: key.endsWith("_average") ? "average" : "median",
      quality,
      qualityNote: definition.calculation,
      insufficientNote: definition.dataRequirements,
      comparison: rows.every((row) => row.comparison?.includes("insufficient")) ? "The previous period has insufficient data for a comparison." : null,
    });
  }

  if (rows.some((row) => row.kind === "rate")) {
    const usable = rows.filter((row) => row.denominator != null && row.denominator > 0 && row.numerator != null);
    return rateMetric({
      key,
      window,
      calculatedAt,
      numerator: usable.reduce((sum, row) => sum + (row.numerator ?? 0), 0),
      denominator: usable.reduce((sum, row) => sum + (row.denominator ?? 0), 0),
      note: definition?.calculation ?? "Pooled numerator and denominator.",
      insufficientNote: rows[0]?.qualityNote ?? "No product had a usable denominator.",
      drilldown: rows.map((row, index) => ({ id: `${key}-${index}`, label: row.display, detail: row.qualityNote })),
    });
  }

  if (rows.some((row) => row.kind === "count")) {
    const usable = rows.filter((row) => row.value != null && row.quality !== "INSUFFICIENT");
    if (usable.length === 0) {
      return textMetric({
        key,
        window,
        calculatedAt,
        display: "INSUFFICIENT DATA",
        quality: "INSUFFICIENT",
        note: rows[0]?.qualityNote ?? "No product had this count.",
        sampleSize: 0,
      });
    }
    return countMetric({
      key,
      window,
      calculatedAt,
      count: usable.reduce((sum, row) => sum + (row.value ?? 0), 0),
      note: definition?.calculation ?? "Sum across products.",
      sampleSize: usable.reduce((sum, row) => sum + (row.sampleSize ?? 0), 0),
      drilldown: usable.map((row, index) => ({ id: `${key}-${index}`, label: row.display, detail: row.qualityNote })),
    });
  }

  const insufficient = rows.every((row) => row.quality === "INSUFFICIENT");
  return textMetric({
    key,
    window,
    calculatedAt,
    display: insufficient ? (rows[0]?.display ?? "INSUFFICIENT DATA") : "See each product",
    quality: insufficient ? "INSUFFICIENT" : "PARTIAL",
    note: insufficient ? (rows[0]?.qualityNote ?? "") : "This metric is read on each product because the values are not a single number.",
    sampleSize: rows.length,
    drilldown: rows.map((row, index) => ({ id: `${key}-text-${index}`, label: row.display, detail: row.qualityNote })),
  });
}

function medianChart(points: { label: string; value: number }[]) {
  const grouped = new Map<string, number[]>();
  for (const point of points) {
    const list = grouped.get(point.label) ?? [];
    list.push(point.value);
    grouped.set(point.label, list);
  }
  return [...grouped.entries()]
    .map(([label, values]) => ({ label, value: median(values) ?? 0, display: `${formatDuration(median(values))} · n = ${values.length}` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function combinePoints(points: ChartPoint[]) {
  const grouped = new Map<string, { value: number; labels: string[] }>();
  for (const point of points) {
    const current = grouped.get(point.label) ?? { value: 0, labels: [] };
    current.value += point.value;
    current.labels.push(point.display);
    grouped.set(point.label, current);
  }
  return [...grouped.entries()].map(([label, value]) => ({
    label,
    value: value.value,
    display: value.labels.length === 1 ? value.labels[0]! : `${value.labels.length} products`,
  }));
}
