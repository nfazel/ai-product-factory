import Link from "next/link";

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
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Prove · Verification</p>
        <h2 className="mt-1 text-lg font-semibold">Independent verification by task</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Each implementation task is verified against its approved source snapshot. Counts come from recorded verification
          and task state. A task is not verified because its coding finished.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">Product slice · {readinessLabel}</p>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CARD_ORDER.map((bucket) => {
            const value = countFor(summary, bucket);
            const emphasis = value > 0 && (bucket === "blocked" || bucket === "ready" || bucket === "awaiting-review");
            return (
              <div
                key={bucket}
                className={`rounded-xl border px-4 py-3 ${emphasis ? "border-amber-300 bg-amber-50" : "bg-stone-50"}`}
              >
                <dt className="text-xs text-muted-foreground">{BUCKET_LABEL[bucket]}</dt>
                <dd className="mt-1 text-2xl font-semibold">{value}</dd>
              </div>
            );
          })}
        </dl>
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
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-stone-50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Implementation</th>
                  <th className="px-4 py-3 font-medium">Verification</th>
                  <th className="px-4 py-3 font-medium">Blocker</th>
                  <th className="px-4 py-3 font-medium">Next action</th>
                  <th className="px-4 py-3 font-medium"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <ProveRow key={row.id} productId={productId} row={row} />
                ))}
              </tbody>
            </table>
          </div>
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
  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3 align-top">
        <Link href={href} className="font-medium text-stone-900 hover:underline">
          {row.title}
        </Link>
        {row.commitSha ? (
          <p className="mt-1 font-mono text-xs text-muted-foreground" title={row.commitSha}>
            Snapshot {row.shortCommit}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 align-top">
        <StatusPill label={row.implementationLabel} tone={row.implementationStatus === "COMPLETED" ? "success" : "neutral"} />
      </td>
      <td className="px-4 py-3 align-top">
        <StatusPill label={row.verificationLabel} tone={row.verificationTone} />
      </td>
      <td className="px-4 py-3 align-top text-sm text-muted-foreground">
        {row.primaryBlocker || "None"}
      </td>
      <td className="px-4 py-3 align-top text-sm">
        <span className="font-medium text-stone-900">{row.nextAction.label}</span>
        {row.nextAction.kind === "return-to-build" ? (
          <p className="mt-1">
            <Link href={buildTaskHref(productId, row.id)} className="text-xs text-indigo-800 hover:underline">
              Open task in Build
            </Link>
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 align-top text-right">
        <Link
          href={href}
          className="inline-flex rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-stone-900 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Open Verification
        </Link>
      </td>
    </tr>
  );
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