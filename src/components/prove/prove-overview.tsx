import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

import { StatusPill } from "@/components/build/status-pill";
import { IntegratedButton } from "@/components/prove/prove-controls";
import {
  BUCKET_LABEL,
  PROVE_FILTERS,
  buildTaskHref,
  filterProveRows,
  proveTaskHref,
  type ProveBucket,
  type ProveFilter,
  type ProveOverviewSummary,
  type ProveTaskRow,
} from "@/modules/prove/task-status";
import { integratedPlanCopy } from "@/modules/verification/disposition";
import type { getProveView } from "@/modules/verification/service";

type ProveView = NonNullable<Awaited<ReturnType<typeof getProveView>>>;

const CARD_ORDER: ProveBucket[] = ["ready", "in-progress", "awaiting-review", "verified", "blocked"];

export function ProveOverview({
  productId,
  summary,
  filter,
  readinessLabel,
}: {
  productId: string;
  summary: ProveOverviewSummary;
  filter: ProveFilter;
  readinessLabel: string;
}) {
  const rows = filterProveRows(summary.rows, filter);
  const failed = summary.rows.filter(
    (row) => row.outcome?.kind === "execution-failed" || row.outcome?.kind === "checks-failed",
  );
  return (
    <div className="space-y-4">
      {failed.length > 0 ? (
        <section aria-label="Failed verification" className="space-y-2">
          {failed.map((row) => (
            <div key={row.id} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
              <p className="font-semibold">
                {row.outcome?.label}: {row.title}
              </p>
              <p className="mt-1 leading-6">
                {row.outcome?.kind === "execution-failed"
                  ? `The process stopped${row.outcome.stage ? ` at: ${row.outcome.stage}` : ""}. No product verdict was recorded.`
                  : "Verification ran and found failing behaviour. Review the findings before requesting changes."}
              </p>
              <Link href={proveTaskHref(productId, row.id)} className="mt-2 inline-block font-medium text-rose-900 hover:underline">
                Open verification details
              </Link>
            </div>
          ))}
        </section>
      ) : null}
      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Check each task</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{headline(summary)}</p>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Task counts">
          {CARD_ORDER.map((bucket) => {
            const value = countFor(summary, bucket);
            if (value === 0) return null;
            const attention = bucket === "blocked" || bucket === "ready" || bucket === "awaiting-review";
            return (
              <li
                key={bucket}
                className={`rounded-full border px-3 py-1 text-sm ${attention ? "border-amber-300 bg-amber-50 text-amber-950" : "bg-muted text-foreground"}`}
              >
                <span className="font-semibold">{value}</span> {BUCKET_LABEL[bucket].toLowerCase()}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Whole product: {readinessLabel.toLowerCase()}</p>
      </div>

      <nav aria-label="Filter verification tasks" className="flex flex-wrap gap-2">
        {PROVE_FILTERS.map((item) => {
          const active = item.id === filter;
          return (
            <Link
              key={item.id}
              href={`/products/${productId}/testing?filter=${item.id}#check`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                active ? "border-stone-900 bg-stone-900 text-white" : "bg-white text-stone-800 hover:bg-stone-50"
              }`}
            >
              {item.label}
              <span className="ml-1.5 text-xs opacity-80">{countForFilter(summary, item.id)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="overflow-hidden rounded-2xl border bg-card">
        {summary.total === 0 ? (
          <p className="p-5 text-sm leading-6 text-muted-foreground">
            No implementation tasks belong to an approved product slice yet. Complete the approved Build plan first.
          </p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm leading-6 text-muted-foreground">
            No tasks match this filter. Blocked tasks also appear under All and Needs attention.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <ProveRow key={row.id} productId={productId} row={row} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function IntegratedPlanDetails({ prove, productId }: { prove: ProveView; productId: string }) {
  return (
    <details className="rounded-2xl border bg-card p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-semibold">Product slice integrated plan and history</summary>
      <div className="mt-4 space-y-3">
        <p className="text-sm leading-6 text-muted-foreground">{integratedPlanCopy(prove.integrated.length > 0)}</p>
        <p className="text-sm">Slice verification: {prove.readiness.label}</p>
        {prove.readiness.reasons.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {prove.readiness.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        {prove.integrated.map((item) => (
          <article key={item.id} className="text-sm leading-6">
            <p className="font-medium">Plan status: {item.status}. Verdict: {item.overallVerdict ?? "not determined"}.</p>
            <p className="whitespace-pre-wrap text-muted-foreground">{item.planSummary}</p>
            <ul className="mt-2 list-disc pl-5">
              {(Array.isArray(item.evidenceGaps) ? item.evidenceGaps : []).map((gap) => (
                <li key={String(gap)}>{String(gap)}</li>
              ))}
            </ul>
          </article>
        ))}
        {prove.slice ? (
          <div>
            <IntegratedButton productId={productId} sliceId={prove.slice.id} />
          </div>
        ) : null}
      </div>
    </details>
  );
}

function ProveRow({ productId, row }: { productId: string; row: ProveTaskRow }) {
  const href = proveTaskHref(productId, row.id);
  const toBuild = row.nextAction.kind === "return-to-build";
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href} className="font-medium hover:underline">
            {row.title}
          </Link>
          <StatusPill label={row.verificationLabel} tone={row.verificationTone} />
        </div>
        {row.primaryBlocker ? <p className="text-sm leading-6 text-muted-foreground">{row.primaryBlocker}</p> : null}
        {row.commitSha ? (
          <p className="font-mono text-xs text-muted-foreground" title={row.commitSha}>
            Snapshot {row.shortCommit}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {toBuild ? (
          <>
            <Link href={buildTaskHref(productId, row.id)} className={buttonVariants({ size: "lg" })}>
              {row.nextAction.label}
            </Link>
            <Link href={href} className={buttonVariants({ size: "lg", variant: "outline" })}>
              Open verification
            </Link>
          </>
        ) : (
          <Link href={href} className={buttonVariants({ size: "lg" })}>
            {row.nextAction.kind === "none" ? "Open verification" : row.nextAction.label}
          </Link>
        )}
      </div>
    </li>
  );
}

function headline(summary: ProveOverviewSummary) {
  if (summary.total === 0) return "No tasks are ready to check yet.";
  const parts = [`${summary.total} ${summary.total === 1 ? "task" : "tasks"}`, `${summary.verified} verified`];
  if (summary.attention > 0) parts.push(`${summary.attention} need${summary.attention === 1 ? "s" : ""} you`);
  return `${parts.join(" · ")}. A task counts as verified only after an independent check, not because its coding finished.`;
}

function countFor(summary: ProveOverviewSummary, bucket: ProveBucket) {
  switch (bucket) {
    case "ready":
      return summary.ready;
    case "in-progress":
      return summary.inProgress;
    case "awaiting-review":
      return summary.awaitingReview;
    case "verified":
      return summary.verified;
    default:
      return summary.blocked;
  }
}

function countForFilter(summary: ProveOverviewSummary, filter: ProveFilter) {
  switch (filter) {
    case "needs-attention":
      return summary.attention;
    case "ready":
      return summary.ready;
    case "in-progress":
      return summary.inProgress;
    case "verified":
      return summary.verified;
    case "blocked":
      return summary.blocked;
    default:
      return summary.total;
  }
}