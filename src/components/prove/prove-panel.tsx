import {
  IntegratedButton,
  ManualResultForm,
  NotApplicableButton,
  StartVerificationButton,
  VerificationReview,
} from "@/components/prove/prove-controls";
import type { getProveView } from "@/modules/verification/service";

type ProveView = NonNullable<Awaited<ReturnType<typeof getProveView>>>;

export function ProvePanel({ productId, prove }: { productId: string; prove: ProveView }) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5">
        <p className="text-xs font-medium tracking-wide text-indigo-700">VERIFICATION STATUS</p>
        <h2 className="text-lg font-semibold">{prove.readiness.label}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {prove.readiness.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          BUILD is where implementation and task-level verification happen. PROVE is where the approved product slice is assessed as a whole. The product stage does not move by itself.
        </p>
        {prove.slice ? <IntegratedButton productId={productId} sliceId={prove.slice.id} /> : null}
      </section>

      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Implementation tasks awaiting verification</h2>
        {prove.awaiting.map((task) => (
          <article key={task.id} className="rounded-xl border p-4">
            <h3 className="font-medium">{task.title}</h3>
            <p className="text-xs text-muted-foreground">Task {task.status}</p>
            <Trace trace={task.trace} commitSha={task.commitSha} />
            {task.blockers.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">
                {task.blockers.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <div className="mt-3">
                <StartVerificationButton productId={productId} taskId={task.id} />
              </div>
            )}
          </article>
        ))}
      </section>

      {prove.sessions.map((session) => (
        <SessionCard key={session.id} productId={productId} session={session} />
      ))}

      {prove.integrated.length > 0 ? (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-lg font-semibold">Integrated slice verification</h2>
          {prove.integrated.map((item) => (
            <article key={item.id} className="mt-3 text-sm leading-6">
              <p className="font-medium">{item.overallVerdict ?? item.status}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{item.planSummary}</p>
              <ul className="mt-2 list-disc pl-5">
                {(Array.isArray(item.evidenceGaps) ? item.evidenceGaps : []).map((gap) => (
                  <li key={String(gap)}>{String(gap)}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function SessionCard({
  productId,
  session,
}: {
  productId: string;
  session: ProveView["sessions"][number];
}) {
  const regression = session.executions.filter((item) => item.kind === "EXISTING_REGRESSION");
  const created = session.executions.filter((item) => item.kind === "NEW_VERIFICATION");
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      {session.demo ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Demo data. This verification was prepared for the sample product. It was not produced by an agent run and no command evidence was invented.
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-indigo-700">OVERALL VERDICT</p>
          <h2 className="text-lg font-semibold">{session.overallVerdict ?? session.status}</h2>
          <p className="text-sm text-muted-foreground">{session.verdictReason}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>{session.status}</p>
          <p>Commit {session.commitSha ? session.commitSha.slice(0, 12) : "none"}</p>
          {session.stale ? <p>RE-VERIFICATION REQUIRED</p> : null}
          <p>Approval {session.approvals.some((item) => !item.stale) ? "Approved" : "Not approved"}</p>
        </div>
      </div>
      {session.workspace ? (
        <p className="text-sm text-muted-foreground">
          Verification branch {session.workspace.branchName} from {session.workspace.baseCommit.slice(0, 12)}
        </p>
      ) : null}
      <div>
        <h3 className="font-medium">Acceptance criteria coverage</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {session.coverages.map((coverage) => (
            <li key={coverage.id} className="rounded-lg border p-3">
              <p>{coverage.criterion.description}</p>
              <p className="text-xs text-muted-foreground">
                {coverage.status}
                {coverage.humanConfirmed ? " · human confirmed" : ""}
              </p>
              <p className="text-muted-foreground">{coverage.rationale}</p>
              {!session.demo && coverage.status !== "NOT_APPLICABLE" ? (
                <NotApplicableButton productId={productId} sessionId={session.id} criterionId={coverage.acceptanceCriterionId} />
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-medium">Test cases</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {session.testCases.map((testCase) => (
            <li key={testCase.id} className="rounded-lg border p-3">
              <p className="font-medium">{testCase.title}</p>
              <p className="text-xs text-muted-foreground">
                {testCase.testType} · {testCase.priority} · {testCase.provenance} · {testCase.status}
              </p>
              <p>{testCase.purpose}</p>
              <p className="text-muted-foreground">Expected: {testCase.expectedResult}</p>
              {!testCase.automated && !session.demo ? (
                <ManualResultForm productId={productId} sessionId={session.id} testCaseId={testCase.id} />
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <Split title="New verification tests" rows={created} />
      <Split title="Existing regression tests" rows={regression} />
      <div>
        <h3 className="font-medium">Evidence</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {session.evidence.map((item) => (
            <li key={item.id}>
              {item.type} · {item.source} · {item.result || "recorded"}
              {item.exitCode != null ? ` · exit ${item.exitCode}` : ""} — {item.description}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-medium">NFR verification</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {session.nfrResults.map((item) => (
            <li key={item.id}>
              {item.title}: {item.status}. {item.note}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-medium">Defects</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {session.defectLinks.map((link) => (
            <li key={link.id}>
              {link.workItem.priority} · {link.workItem.title}
            </li>
          ))}
        </ul>
      </div>
      {session.aiSummary ? (
        <p className="text-sm text-muted-foreground">AI analysis, not independent proof: {session.aiSummary}</p>
      ) : null}
      {session.stale ? <p className="text-sm text-amber-950">{session.staleReason}</p> : null}
      {!session.demo ? <VerificationReview productId={productId} sessionId={session.id} /> : null}
    </section>
  );
}

function Split({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; command: string; status: string; exitCode: number | null }[];
}) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((row) => (
          <li key={row.id}>
            {row.command} · {row.status}
            {row.exitCode != null ? ` · exit ${row.exitCode}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Trace({
  trace,
  commitSha,
}: {
  trace: ProveView["awaiting"][number]["trace"];
  commitSha: string;
}) {
  const chain = [trace.outcome, trace.capability, trace.epic, trace.feature, trace.story, ...trace.criteria, trace.task, commitSha];
  return (
    <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
      {chain.filter(Boolean).map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}
