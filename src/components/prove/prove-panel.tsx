import {
  IntegratedButton,
  ManualResultForm,
  NotApplicableButton,
  RetryVerificationButton,
  StartVerificationButton,
  VerificationReview,
} from "@/components/prove/prove-controls";
import { describeVerificationAttempt, integratedPlanCopy } from "@/modules/verification/disposition";
import type { getProveView } from "@/modules/verification/service";

type ProveView = NonNullable<Awaited<ReturnType<typeof getProveView>>>;

export function ProvePanel({
  productId,
  prove,
  commandTaskId = null,
}: {
  productId: string;
  prove: ProveView;
  commandTaskId?: string | null;
}) {
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
          Task-level Independent Verification is separate from the product-slice plan. The product stage does not move by itself.
        </p>
      </section>

      {prove.awaiting.map((task) => {
        const attempts = prove.sessions.filter((session) => session.implementationTaskId === task.id);
        const current = attempts.find((session) => !session.demo) ?? attempts[0] ?? null;
        const described = describeVerificationAttempt({
          taskStatus: task.status,
          commitSha: task.commitSha,
          session: current,
        });
        return (
          <article key={task.id} className="space-y-4 rounded-2xl border bg-card p-5">
            <div>
              <p className="text-xs font-medium tracking-wide text-indigo-700">INDEPENDENT VERIFICATION</p>
              <h2 className="text-lg font-semibold">{task.title}</h2>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Implementation</dt>
                <dd>{described.implementation}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Approved commit</dt>
                <dd>{described.commit}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Verification</dt>
                <dd>{described.verification}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Product verdict</dt>
                <dd>{described.productVerdict}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Human verification approval</dt>
                <dd>{described.approval}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Next action</dt>
                <dd>{described.nextAction}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">Reason: {described.reason}</p>
            {task.featureConcern ? (
              <p className="text-sm text-muted-foreground">Parent feature: {task.featureConcern}</p>
            ) : null}
            <Trace trace={task.trace} commitSha={task.commitSha} />
            {task.blockers.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-950">
                {task.blockers.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : task.id === commandTaskId ? (
              <p className="text-sm text-muted-foreground">
                The Next Action control above starts this attempt for the approved commit. It does not rerun coding, publish, or merge.
              </p>
            ) : described.nextAction === "Start Independent Verification" ? (
              <StartVerificationButton productId={productId} taskId={task.id} />
            ) : described.nextAction === "Retry Independent Verification" ? (
              <RetryVerificationButton productId={productId} taskId={task.id} />
            ) : null}
            {current ? (
              <section className="space-y-3">
                <h3 className="font-medium">Evidence and findings</h3>
                <SessionCard productId={productId} session={current} />
              </section>
            ) : null}
            {attempts.length > 1 ? (
              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-medium">Previous attempts / audit history</summary>
                <ul className="mt-3 space-y-3">
                  {attempts.filter((session) => session !== current).map((session) => {
                    const earlier = describeVerificationAttempt({
                      taskStatus: task.status,
                      commitSha: session.commitSha,
                      session,
                    });
                    return (
                      <li key={session.id} className="text-sm">
                        <p>
                          {earlier.verification} · {earlier.commit} · Product verdict {earlier.productVerdict} · {earlier.approval}
                        </p>
                        <p className="text-muted-foreground">{earlier.reason}</p>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ) : null}
          </article>
        );
      })}

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Integrated verification plan</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{integratedPlanCopy(prove.integrated.length > 0)}</p>
        <p className="mt-2 text-sm">Slice verification: {prove.readiness.label}</p>
        {prove.readiness.reasons.length > 0 ? (
          <div className="mt-3">
            <h3 className="text-sm font-medium">Remaining prerequisites</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {prove.readiness.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {prove.integrated.map((item) => (
          <article key={item.id} className="mt-4 text-sm leading-6">
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
          <div className="mt-4">
            <IntegratedButton productId={productId} sliceId={prove.slice.id} />
          </div>
        ) : null}
      </section>
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
  const planned = session.executions.filter((item) => item.kind === "PLAN_CHECK");
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
          <p className="text-xs font-medium tracking-wide text-indigo-700">
            {session.overallVerdict ? "PRODUCT VERDICT" : "SESSION STATUS"}
          </p>
          <h2 className="text-lg font-semibold">{session.overallVerdict ?? "Not determined"}</h2>
          <p className="text-sm text-muted-foreground">
            {session.overallVerdict
              ? session.verdictReason
              : `Session status ${session.status}${session.verdictReason ? `. ${session.verdictReason}` : ""}`}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>{session.status}</p>
          <p>Commit {session.commitSha ? session.commitSha.slice(0, 12) : "none"}</p>
          {session.stale ? <p>Verification needs to be repeated</p> : null}
          <p>Approval {session.approvals.some((item) => !item.stale) ? "Approved" : "Not approved"}</p>
        </div>
      </div>
      {session.workspace ? (
        <p className="text-sm text-muted-foreground">
          Verification branch {session.workspace.branchName} from {session.workspace.baseCommit.slice(0, 12)}
        </p>
      ) : null}
      <ObligationList obligations={session.contract?.obligations} concerns={session.contract?.definitionConcerns} />
      <div>
        <h3 className="font-medium">Functional acceptance criteria</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {session.coverages.map((coverage) => (
            <li key={coverage.id} className="rounded-lg border p-3">
              <p>{coverage.criterion.description}</p>
              <p className="text-xs text-muted-foreground">
                {coverage.status === "NOT_TESTED" ? "NOT TESTED · this product behaviour was not exercised" : coverage.status}
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
      <Split title="Approved plan checks" rows={planned} />
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
      {!session.demo ? (
        <VerificationReview productId={productId} sessionId={session.id} verdict={session.overallVerdict} />
      ) : null}
    </section>
  );
}

const SOURCE_LABEL = {
  EXECUTION_PLAN: "Execution Plan",
  IMPLEMENTATION_TASK: "Implementation task",
  ARCHITECTURE: "Approved architecture",
  FUNCTIONAL_ACCEPTANCE_CRITERION: "Functional acceptance criterion",
  NFR: "NFR",
} as const;

function ObligationList({ obligations, concerns }: { obligations: unknown; concerns: unknown }) {
  const rows = obligationRows(obligations);
  const notes = Array.isArray(concerns) ? concerns.filter((item): item is string => typeof item === "string") : [];
  if (rows.length === 0 && notes.length === 0) return null;
  const technical = rows.filter((item) => item.kind !== "FUNCTIONAL_ACCEPTANCE" && item.kind !== "NFR");
  return (
    <div className="space-y-3">
      {technical.length > 0 ? (
        <div>
          <h3 className="font-medium">Technical verification</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {technical.map((item) => (
              <li key={item.id} className="rounded-lg border p-3">
                <p>{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.status} · {sourceLabel(item.source)}
                </p>
                <p className="text-muted-foreground">{item.evidence}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {notes.map((note) => (
        <p key={note} className="text-sm text-muted-foreground">
          Definition quality: {note}
        </p>
      ))}
    </div>
  );
}

function sourceLabel(source: string) {
  if (source in SOURCE_LABEL) return SOURCE_LABEL[source as keyof typeof SOURCE_LABEL];
  return source;
}

function obligationRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; title?: unknown; kind?: unknown; source?: unknown; status?: unknown; evidence?: unknown };
    if (typeof row.id !== "string" || typeof row.title !== "string" || typeof row.kind !== "string" || typeof row.source !== "string") return [];
    return [{
      id: row.id,
      title: row.title,
      kind: row.kind,
      source: row.source,
      status: typeof row.status === "string" ? row.status : "NOT_TESTED",
      evidence: typeof row.evidence === "string" ? row.evidence : "",
    }];
  });
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
