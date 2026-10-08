import { formatDuration } from "@/modules/analytics/time";
import type { ChartPoint, FlowSegment } from "@/modules/analytics/types";

export function BarList({ points, empty }: { points: ChartPoint[]; empty: string }) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <ul className="space-y-3">
      {points.map((point) => (
        <li key={point.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span>{point.label}</span>
            <span className="text-xs text-muted-foreground">{point.display}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(6, (point.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function FlowTimeline({ segments }: { segments: FlowSegment[] }) {
  if (segments.length === 0) {
    return <p className="text-sm text-muted-foreground">INSUFFICIENT DATA. No lifecycle events were recorded in this period.</p>;
  }
  const max = Math.max(...segments.map((segment) => segment.durationMs ?? 0), 1);
  return (
    <ol className="space-y-3">
      {segments.map((segment) => (
        <li key={segment.id} className="grid items-center gap-2 sm:grid-cols-[minmax(0,16rem)_1fr_auto]">
          <span className="text-sm">
            {segment.label}
            {segment.demo ? <span className="ml-2 text-xs text-muted-foreground">Demo</span> : null}
          </span>
          <span className="h-2 rounded-full bg-muted">
            <span
              className={segment.kind === "wait" ? "block h-2 rounded-full bg-amber-700" : "block h-2 rounded-full bg-primary"}
              style={{ width: segment.durationMs == null ? "8%" : `${Math.max(8, (segment.durationMs / max) * 100)}%` }}
            />
          </span>
          <span className="text-xs text-muted-foreground">{segment.durationMs == null ? "Milestone" : formatDuration(segment.durationMs)}</span>
        </li>
      ))}
    </ol>
  );
}
