import type { ProveOutcome, ProveOutcomeTone } from "@/modules/prove/outcome";

const TONE_CLASS: Record<ProveOutcomeTone, { box: string; title: string; body: string; label: string }> = {
  danger: {
    box: "border-rose-200 bg-rose-50",
    title: "text-rose-950",
    body: "text-rose-950",
    label: "text-rose-800",
  },
  warning: {
    box: "border-amber-200 bg-amber-50",
    title: "text-amber-950",
    body: "text-amber-950",
    label: "text-amber-800",
  },
  success: {
    box: "border-emerald-200 bg-emerald-50",
    title: "text-emerald-950",
    body: "text-emerald-950",
    label: "text-emerald-800",
  },
  neutral: {
    box: "bg-stone-50",
    title: "text-stone-900",
    body: "text-stone-800",
    label: "text-muted-foreground",
  },
};

/**
 * The latest attempt's outcome, stated in plain language. Execution failures, failed checks, insufficient
 * evidence and awaiting review are shown distinctly. Shows no secrets: the technical detail is already
 * redacted before it reaches this component.
 */
export function OutcomePanel({ outcome }: { outcome: ProveOutcome }) {
  const tone = TONE_CLASS[outcome.tone];
  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${tone.box}`} aria-label="Verification outcome">
      <p className={`text-xs font-medium tracking-[0.14em] uppercase ${tone.label}`}>{outcome.label}</p>
      <h3 className={`mt-1 text-base font-semibold ${tone.title}`}>{outcome.headline}</h3>
      <p className={`mt-2 text-sm leading-6 ${tone.body}`}>{outcome.message}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {outcome.kind === "execution-failed" ? (
          <>
            <OutcomeFact label="Failed stage" value={outcome.stage} />
            <OutcomeFact label="Failure code" value={outcome.failureClass || "Not recorded"} />
          </>
        ) : null}
        <OutcomeFact label="Test cases ran" value={`${outcome.testCases.ran} of ${outcome.testCases.total}`} />
        <OutcomeFact label="Occurred" value={outcome.occurredAt ? formatUtc(outcome.occurredAt) : "Not recorded"} />
      </dl>
      <div className="mt-4 rounded-xl border bg-card/70 px-4 py-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Recommended recovery</p>
        <p className="mt-1 text-sm leading-6 text-stone-800">{outcome.recovery}</p>
      </div>
    </section>
  );
}

/**
 * Execution & results detail: the technical record of a failure and the reasons test cases did not run.
 * Renders nothing when there is nothing to explain.
 */
export function OutcomeDiagnostics({ outcome }: { outcome: ProveOutcome | null }) {
  if (!outcome) return null;
  const hasDetail = outcome.kind === "execution-failed" || outcome.technicalDetail.length > 0;
  if (!hasDetail && outcome.notRun.length === 0) return null;
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="font-medium">Failure diagnostics</h3>
      {hasDetail ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          <OutcomeFact label="Failed stage" value={outcome.stage || "Not recorded for this attempt"} />
          <OutcomeFact label="Failure code" value={outcome.failureClass || "Not recorded"} />
          <div className="rounded-lg bg-stone-50 px-3 py-2 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Technical detail (credentials removed)</dt>
            <dd className="mt-1 font-mono text-xs break-words whitespace-pre-wrap text-stone-900">
              {outcome.technicalDetail || "No technical detail was recorded for this attempt."}
            </dd>
          </div>
        </dl>
      ) : null}
      {outcome.notRun.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Test cases that did not run ({outcome.notRun.length})</p>
          <ul className="space-y-2 text-sm">
            {outcome.notRun.map((item, index) => (
              <li key={`${item.title}-${index}`} className="rounded-lg border p-3">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function OutcomeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card/70 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words text-stone-900">{value}</dd>
    </div>
  );
}

function formatUtc(value: Date) {
  return `${value.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
