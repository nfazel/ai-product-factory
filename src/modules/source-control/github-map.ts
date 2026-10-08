import type { CheckConclusion, RemoteCheck, RemotePullRequest, RemoteReview } from "@/modules/source-control/types";

const CONCLUSIONS: Record<string, CheckConclusion> = {
  success: "SUCCESS",
  failure: "FAILURE",
  neutral: "NEUTRAL",
  cancelled: "CANCELLED",
  skipped: "SKIPPED",
  timed_out: "TIMED_OUT",
  action_required: "ACTION_REQUIRED",
};

export function mapConclusion(value: string | null | undefined): CheckConclusion {
  if (!value) return "UNKNOWN";
  return CONCLUSIONS[value] ?? "UNKNOWN";
}

export function mapCheckStatus(value: string): RemoteCheck["status"] {
  if (value === "queued") return "QUEUED";
  if (value === "in_progress") return "IN_PROGRESS";
  return "COMPLETED";
}

export function mapPullRequestState(value: string, merged: boolean): RemotePullRequest["state"] {
  if (merged || value === "merged") return "MERGED";
  if (value === "closed") return "CLOSED";
  if (value === "draft") return "DRAFT";
  return "OPEN";
}

export function mapReviewState(value: string): RemoteReview["state"] {
  if (value === "APPROVED") return "APPROVED";
  if (value === "CHANGES_REQUESTED") return "CHANGES_REQUESTED";
  if (value === "COMMENTED") return "COMMENTED";
  if (value === "DISMISSED") return "DISMISSED";
  return "UNKNOWN";
}

export function rateLimitMessage(headers: { get(name: string): string | null }) {
  if (headers.get("x-ratelimit-remaining") !== "0") return null;
  const reset = headers.get("x-ratelimit-reset");
  const when = reset && Number.isFinite(Number(reset)) ? new Date(Number(reset) * 1000).toISOString() : "later";
  return `GitHub rate limit reached. Retry after ${when}.`;
}
