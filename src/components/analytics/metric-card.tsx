import { getMetricDefinition } from "@/modules/analytics/catalogue";
import type { MetricValue } from "@/modules/analytics/types";

export function MetricCard({ metric }: { metric: MetricValue }) {
  const definition = getMetricDefinition(metric.key);
  return (
    <article data-metric={metric.key} data-quality={metric.quality} className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium">{definition?.name ?? metric.key}</h3>
        <QualityBadge quality={metric.quality} />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-balance">{metric.display}</p>
      {metric.sampleSize != null ? <p className="mt-1 text-xs text-muted-foreground">n = {metric.sampleSize}</p> : null}
      {metric.comparison ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{metric.comparison}</p> : null}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{definition?.interpretation}</p>
      {metric.qualityNote ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{metric.qualityNote}</p> : null}
      {metric.drilldown.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium">Evidence ({metric.drilldown.length})</summary>
          <ul className="mt-2 space-y-2">
            {metric.drilldown.map((item) => (
              <li key={item.id} className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
                <span className="font-medium">{item.label}</span>
                <span className="mt-0.5 block leading-5 text-muted-foreground">{item.detail}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

export function MetricGrid({ metrics }: { metrics: MetricValue[] }) {
  if (metrics.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => (
        <MetricCard key={metric.key} metric={metric} />
      ))}
    </div>
  );
}

function QualityBadge({ quality }: { quality: MetricValue["quality"] }) {
  const label = quality === "GOOD" ? "Good data" : quality === "PARTIAL" ? "Partial data" : "Insufficient data";
  const className =
    quality === "GOOD"
      ? "bg-emerald-50 text-emerald-900"
      : quality === "PARTIAL"
        ? "bg-amber-50 text-amber-950"
        : "bg-muted text-muted-foreground";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{label}</span>;
}
