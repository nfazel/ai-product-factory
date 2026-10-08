export const TIME_WINDOWS = ["7d", "30d", "90d", "all"] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];

export const WINDOW_LABEL: Record<TimeWindow, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

export function parseWindow(value: string | null | undefined): TimeWindow {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") return value;
  return "30d";
}

export function windowStart(window: TimeWindow, now: Date): Date | null {
  if (window === "all") return null;
  const days = window === "7d" ? 7 : window === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function previousWindowStart(window: TimeWindow, now: Date): Date | null {
  const start = windowStart(window, now);
  if (!start || window === "all") return null;
  const days = window === "7d" ? 7 : window === "30d" ? 30 : 90;
  return new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
}

export function inWindow(iso: string | null | undefined, start: Date | null): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return false;
  if (!start) return true;
  return time >= start.getTime();
}

export function inRange(iso: string | null | undefined, from: Date | null, to: Date | null): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return false;
  if (from && time < from.getTime()) return false;
  if (to && time >= to.getTime()) return false;
  return true;
}

/** Duration in milliseconds. Missing or reversed timestamps are not zero. */
export function durationMs(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2;
  return sorted[mid]!;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** P85 is withheld below 20 samples so a small demo cannot look like a percentile. */
export const P85_MINIMUM = 20;

export function p85(values: number[]): number | null {
  if (values.length < P85_MINIMUM) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * 0.85;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "INSUFFICIENT DATA";
  const totalSeconds = Math.round(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "INSUFFICIENT DATA";
  const percent = (numerator / denominator) * 100;
  const rounded = Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
  return `${numerator} / ${denominator} = ${rounded}%`;
}
