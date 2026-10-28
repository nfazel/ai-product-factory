import Link from "next/link";
import type { ReactNode } from "react";

import { StatusPill } from "@/components/build/status-pill";
import { OutcomeDiagnostics, OutcomePanel } from "@/components/prove/outcome-panel";
import { ProveTabs } from "@/components/prove/prove-tabs";
import {
  ManualResultForm,
  RecoverVerificationButton,
  RetryVerificationButton,
  StartNewVerificationButton,
  StartVerificationButton,
  VerificationReview,
} from "@/components/prove/prove-controls";
import { buildCoverageReport, COVERAGE_STATES, COVERAGE_STATE_LABEL } from "@/modules/prove/coverage-report";
import {
  PROVE_TABS,
  approvalState,
  buildTaskHref,
  coverageRows,
  currentSessionFor,
  executionSummary,
  explainProveState,
  lastActivityAt,
  openFindings,
  proveTaskHref,
  type ProveAwaitingTask,
  type ProveNextAction,
  type ProveSession,
  type ProveTabId,
  type ProveTaskRow,
} from "@/modules/prove/task-status";

export function VerificationWorkspace({
  productId,
  task,
  sessions,
  row,
  planVersion,
  planStatus,
  activeTab,
}: {
  productId: string;
  task: ProveAwaitingTask;
  sessions: ProveSession[];
  row: ProveTaskRow;
  planVersion: number | null;
  planStatus: string | null;
  activeTab: ProveTabId;
}) {
  const session = currentSessionFor(sessions);
  const explanation = explainProveState(row);
  const workspaceHref = proveTaskHref(productId, task.id);
  const ctx: Ctx = { productId, taskId: task.id, workspaceHref, session, row, task, sessions };

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link href={`/products/${productId}/testing#check`} className="font-medium text-indigo-800 hover:underline">
          Back to Prove Overview
        </Link>
        <span className="mx-2">/</span>
        <span className="text-stone-800">Verification workspace</span>
      </nav>

      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Current verification status</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{task.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Implementation completion and verification completion are tracked separately. Verification checks the approved source snapshot.
            </p>
          </div>
          <StatusPill label={row.verificationLabel} tone={row.verificationTone} />
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Implementation" value={row.implementationLabel} />
          <Fact label="Verification" value={row.verificationLabel} />
          <Fact
            label="Approved source snapshot"
            value={row.commitSha ? <code className="font-mono text-xs" title={row.commitSha}>{row.shortCommit}</code> : "No approved snapshot"}
          />
          <Fact
            label="Execution plan"
            value={planVersion != null ? `v${planVersion}${planStatus ? ` · ${planStatus.toLowerCase()}` : ""}` : "Not recorded"}
          />
          <Fact
            label="Last verification activity"
            value={session ? formatUtc(lastActivityAt(session)) : "No verification activity yet"}
          />
          <Fact label="Attempts" value={String(sessions.length)} />
        </dl>

        {row.blockers.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">Current blockers</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {row.blockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 rounded-xl border bg-stone-50 px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Recommended next action</p>
          <p className="mt-1 text-base font-semibold text-stone-900">{explanation.headline}</p>
          <p className="mt-2 text-sm leading-6 text-stone-800">{explanation.meaning}</p>
          {explanation.blocker ? (
            <p className="mt-2 text-sm leading-6 text-amber-950">Blocked by: {explanation.blocker}</p>
          ) : null}
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{explanation.why}</p>
          <div className="mt-3">
            <ActionControl action={row.nextAction} ctx={ctx} />
          </div>
        </div>
      </section>

      <InconclusiveNotice ctx={ctx} />

      <ProveTabs
        key={activeTab}
        tabs={PROVE_TABS}
        defaultTab={activeTab}
        panels={{
          overview: <OverviewPanel ctx={ctx} />,
          plan: <PlanPanel ctx={ctx} />,
          results: <ResultsPanel ctx={ctx} />,
          evidence: <EvidencePanel ctx={ctx} />,
          approval: <ApprovalPanel ctx={ctx} />,
          history: <HistoryPanel ctx={ctx} />,
        }}
      />
    </div>
  );
}

type Ctx = {
  productId: string;
  taskId: string;
  workspaceHref: string;
  session: ProveSession | null;
  row: ProveTaskRow;
  task: ProveAwaitingTask;
  sessions: ProveSession[];
};

/**
 * Shown above every tab when the latest attempt is inconclusive. It explains the result, links to the previous
 * evidence, and offers the explicit new attempt when the policy permits it, or the reason it does not.
 */
function InconclusiveNotice({ ctx }: { ctx: Ctx }) {
  const { session, row } = ctx;
  if (!session || session.demo || session.overallVerdict !== "INCONCLUSIVE") return null;
  return (
    <section
      id="new-verification-attempt"
      aria-labelledby="inconclusive-heading"
      className="scroll-mt-20 space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:p-5"
    >
      <h2 id="inconclusive-heading" className="text-lg font-semibold">Verification Inconclusive</h2>
      <p className="text-sm leading-6">
        The previous verification attempt did not produce sufficient evidence to confirm the acceptance criteria.
      </p>
      <div className="flex flex-wrap items-start gap-3">
        <Link
          href={`${ctx.workspaceHref}?tab=evidence#verification-tabs`}
          className="inline-flex rounded-lg border border-amber-900/20 bg-white px-3 py-2 text-sm font-medium text-stone-900 hover:bg-stone-50"
        >
          Review Previous Evidence
        </Link>
        <div className="min-w-0 flex-1">
          {row.newAttempt.allowed ? (
            <StartNewVerificationButton productId={ctx.productId} taskId={ctx.taskId} />
          ) : (
            <p className="text-sm leading-6">A new attempt is not available: {row.newAttempt.reason}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ActionControl({ action, ctx }: { action: ProveNextAction; ctx: Ctx }) {
  switch (action.kind) {
    case "start-verification":
      return <StartVerificationButton productId={ctx.productId} taskId={ctx.taskId} />;
    case "retry-verification":
      return <RetryVerificationButton productId={ctx.productId} taskId={ctx.taskId} />;
    case "start-new-verification":
      // The control itself lives in the Verification Inconclusive panel. This link only moves the person to it.
      return (
        <Link
          href={`${ctx.workspaceHref}#new-verification-attempt`}
          className="inline-flex rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          {action.label}
        </Link>
      );
    case "recover-verification":
      return <RecoverVerificationButton productId={ctx.productId} sessionId={action.sessionId} />;
    case "workspace-tab":
      return (
        <Link
          href={`${ctx.workspaceHref}?tab=${action.tab}#verification-tabs`}
          className="inline-flex rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          {action.label}
        </Link>
      );
    case "return-to-build":
      return (
        <Link
          href={buildTaskHref(ctx.productId, ctx.taskId)}
          className="inline-flex rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          {action.label}
        </Link>
      );
    default:
      return <p className="text-sm text-muted-foreground">No action is permitted right now.</p>;
  }
}

function OverviewPanel({ ctx }: { ctx: Ctx }) {
  const { session, row } = ctx;
  const coverage = coverageRows(session);
  const verified = coverage.filter((item) => item.verificationStatus === "VERIFIED").length;
  const summary = executionSummary(session);
  const findings = openFindings(session);
  const approval = approvalState(session);
  const tabHref = (tab: ProveTabId) => `${ctx.workspaceHref}?tab=${tab}#verification-tabs`;
  return (
    <div className="space-y-5">
      {row.outcome ? <OutcomePanel outcome={row.outcome} /> : null}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Verification status" value={row.verificationLabel} />
        <Fact label="Product verdict" value={session?.overallVerdict ?? "Not determined"} />
        <Fact label="Human approval" value={approvalLabel(session)} />
        <Fact
          label="Approved source snapshot"
          value={row.commitSha ? <code className="font-mono text-xs" title={row.commitSha}>{row.shortCommit}</code> : "No approved snapshot"}
        />
      </dl>
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryBox
          title="Acceptance criteria"
          headline={session ? `${verified} of ${coverage.length} verified` : "Not started"}
          detail={session && coverage.length - verified > 0 ? `${coverage.length - verified} not verified` : ""}
          href={tabHref("evidence")}
          linkLabel="View coverage"
        />
        <SummaryBox
          title="Test execution"
          headline={session ? `${summary.PASSED} passed · ${summary.FAILED} failed · ${summary.BLOCKED} blocked · ${summary.NOT_RUN} not run` : "No runs yet"}
          detail=""
          href={tabHref("results")}
          linkLabel="View results"
        />
        <SummaryBox
          title="Open findings"
          headline={`${findings.length} open`}
          detail=""
          href={tabHref("evidence")}
          linkLabel="View findings"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Approval status: {approvalLabel(session)}.{" "}
        <Link href={tabHref("approval")} className="text-indigo-800 hover:underline">Open Approval</Link>
        {approval.passed && !approval.humanApproved ? " The Testing & Verification Agent cannot approve its own work." : ""}
      </p>
    </div>
  );
}

function PlanPanel({ ctx }: { ctx: Ctx }) {
  const { session, task } = ctx;
  const contract = session?.contract ?? null;
  const obligations = obligationRows(contract?.obligations);
  const nfrs = obligations.filter((item) => item.kind === "NFR");
  const technical = obligations.filter((item) => item.kind !== "FUNCTIONAL_ACCEPTANCE" && item.kind !== "NFR");
  const concerns = stringList(contract?.definitionConcerns);
  const coverage = coverageRows(session);
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="font-medium">What is being verified</h3>
        {contract?.objective ? <p className="text-sm leading-6">{contract.objective}</p> : null}
        <TraceList trace={task.trace} commitSha={task.commitSha} />
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Acceptance criteria</h3>
        {coverage.length === 0 ? (
          <Empty message="Acceptance criteria are recorded when Independent Verification starts. The Build trace above shows the linked criteria." />
        ) : (
          <ul className="space-y-2 text-sm">
            {coverage.map((item) => (
              <li key={item.criterionId} className="rounded-lg border p-3">
                <p>{item.criterion}</p>
                <p className="text-xs text-muted-foreground">{item.verificationLabel}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Planned test cases</h3>
        {!session || session.testCases.length === 0 ? (
          <Empty message="No test cases are recorded yet." />
        ) : (
          <ul className="space-y-2 text-sm">
            {session.testCases.map((test) => (
              <li key={test.id} className="rounded-lg border p-3">
                <p className="font-medium">{test.title}</p>
                <p className="text-xs text-muted-foreground">
                  {test.testType} · {test.priority} · {test.provenance} · {test.automated ? "automated" : "manual"} · {test.status}
                </p>
                {test.purpose ? <p>{test.purpose}</p> : null}
                {test.expectedResult ? <p className="text-muted-foreground">Expected: {test.expectedResult}</p> : null}
                {test.automated ? (
                  test.body.trim() ? (
                    <details className="mt-3 rounded-md border bg-stone-50">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">View Test Source</summary>
                      <div className="border-t p-3">
                        <p className="mb-2 text-xs text-muted-foreground">
                          Test file: <code className="font-mono">{test.filePath || "Path unavailable"}</code>
                        </p>
                        <pre className="max-h-96 overflow-auto rounded-md bg-stone-950 p-3 text-xs leading-5 whitespace-pre text-stone-50">
                          <code>{test.body}</code>
                        </pre>
                      </div>
                    </details>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">Test source unavailable.</p>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          No separate plan approval exists for this contract. Human approval applies to the verification result in Approval.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Non-functional requirements</h3>
        {nfrs.length === 0 && (!session || session.nfrResults.length === 0) ? (
          <Empty message="No non-functional requirements are recorded for this task." />
        ) : (
          <ul className="space-y-1 text-sm">
            {nfrs.map((item) => (
              <li key={item.id}>{item.title} · {item.status}{item.evidence ? ` — ${item.evidence}` : ""}</li>
            ))}
            {session?.nfrResults.map((item) => (
              <li key={item.id}>{item.title} · {item.status}{item.note ? ` — ${item.note}` : ""}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Technical completion checks</h3>
        {technical.length === 0 ? (
          <Empty message="No technical completion checks are recorded." />
        ) : (
          <ul className="space-y-1 text-sm">
            {technical.map((item) => (
              <li key={item.id}>{item.title} · {item.status}{item.evidence ? ` — ${item.evidence}` : ""}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Dependencies, assumptions and concerns</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {task.featureConcern ? <li>{task.featureConcern}</li> : null}
          {concerns.map((item) => (
            <li key={item}>Definition quality: {item}</li>
          ))}
          {contract?.architectureConstraints ? <li>Architecture: {contract.architectureConstraints}</li> : null}
          {contract?.securityConstraints ? <li>Security: {contract.securityConstraints}</li> : null}
          {!task.featureConcern && concerns.length === 0 && !contract?.architectureConstraints && !contract?.securityConstraints ? (
            <li>None recorded.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function ResultsPanel({ ctx }: { ctx: Ctx }) {
  const { session } = ctx;
  if (!session) {
    return <Empty message="Independent Verification has not run for this task. Results appear here after it starts." />;
  }
  const grouped = {
    NEW_VERIFICATION: session.executions.filter((item) => item.kind === "NEW_VERIFICATION"),
    EXISTING_REGRESSION: session.executions.filter((item) => item.kind === "EXISTING_REGRESSION"),
    PLAN_CHECK: session.executions.filter((item) => item.kind === "PLAN_CHECK"),
  };
  return (
    <div className="space-y-6">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Session status" value={session.status} />
        <Fact label="Started" value={session.startedAt ? formatUtc(session.startedAt) : "Not recorded"} />
        <Fact label="Completed" value={session.completedAt ? formatUtc(session.completedAt) : "Not completed"} />
        <Fact label="Verified snapshot" value={session.commitSha ? <code className="font-mono text-xs">{session.commitSha.slice(0, 12)}</code> : "Not recorded"} />
      </dl>

      <OutcomeDiagnostics outcome={ctx.row.outcome} />

      {session.demo ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Demo data. These results were prepared for the sample product and were not produced by an agent run.
        </p>
      ) : null}

      <ExecutionGroup title="New verification tests" rows={grouped.NEW_VERIFICATION} />
      <ExecutionGroup title="Existing regression tests" rows={grouped.EXISTING_REGRESSION} />
      <ExecutionGroup title="Approved plan checks" rows={grouped.PLAN_CHECK} />

      <section className="space-y-2">
        <h3 className="font-medium">Test cases</h3>
        {session.testCases.length === 0 ? (
          <Empty message="No test cases were recorded for this session." />
        ) : (
          <ul className="space-y-2 text-sm">
            {session.testCases.map((test) => (
              <li key={test.id} className="rounded-lg border p-3">
                <p className="font-medium">{test.title}</p>
                <p className="text-xs text-muted-foreground">
                  {test.status} · {test.automated ? "automated" : "manual"} · {test.provenance}
                </p>
                {!test.automated && !session.demo ? (
                  <ManualResultForm productId={ctx.productId} sessionId={session.id} testCaseId={test.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {session.aiSummary ? (
        <section className="rounded-xl border border-dashed p-3 text-sm">
          <p className="font-medium">AI analysis — not an executed test</p>
          <p className="mt-1 text-muted-foreground">{session.aiSummary}</p>
        </section>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Failed tests can be re-run or reviewed from{" "}
        <Link href={`${ctx.workspaceHref}?tab=approval#verification-tabs`} className="text-indigo-800 hover:underline">Approval</Link>
        {" "}when a verdict is recorded.
      </p>
    </div>
  );
}

/**
 * Coverage gaps for a person to review. Read-only: it reports which approved criteria have demonstrating evidence,
 * which need manual verification, and which implemented files no criterion mentions. It never changes a criterion
 * or a verdict.
 */
function CoverageGapSection({ ctx }: { ctx: Ctx }) {
  const { session, task } = ctx;
  if (!session) return null;
  const changedFiles = Array.isArray(session.contract?.changedFiles)
    ? session.contract.changedFiles.filter((value): value is string => typeof value === "string")
    : [];
  const report = buildCoverageReport({
    criteria: task.criteria,
    coverages: session.coverages.map((item) => ({
      acceptanceCriterionId: item.acceptanceCriterionId,
      status: item.status,
      humanConfirmed: item.humanConfirmed,
      rationale: item.rationale,
    })),
    testCases: session.testCases.map((item) => ({
      id: item.id,
      acceptanceCriterionId: item.acceptanceCriterionId,
      title: item.title,
      purpose: item.purpose,
      automated: item.automated,
      filePath: item.filePath,
    })),
    evidence: session.evidence.map((item) => ({
      testCaseId: item.testCaseId,
      acceptanceCriterionId: item.acceptanceCriterionId,
      type: item.type,
      result: item.result,
    })),
    changedFiles,
  });
  return (
    <section className="space-y-3" aria-labelledby="coverage-gaps-heading">
      <h3 id="coverage-gaps-heading" className="font-medium">Coverage gaps and recommendations</h3>
      <p className="text-sm text-muted-foreground">
        For human review. This report does not change approved criteria, does not add criteria, and does not change the verdict.
      </p>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {COVERAGE_STATES.map((state) => (
          <Fact key={state} label={COVERAGE_STATE_LABEL[state]} value={String(report.counts[state])} />
        ))}
      </dl>
      {report.criteria.length === 0 ? (
        <Empty message="The approved task has no acceptance criteria to report on." />
      ) : (
        <ul className="divide-y rounded-lg border">
          {report.criteria.map((item) => (
            <li key={item.criterionId} className="px-3 py-2 text-sm">
              <p className="font-medium text-stone-900">{item.description}</p>
              <p className="text-muted-foreground">
                {item.label}. {item.reason}
              </p>
            </li>
          ))}
        </ul>
      )}
      {report.recommendations.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Recommendations for human review</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {report.recommendations.map((item, index) => (
              <li key={`${item.kind}-${index}`}>{item.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function EvidencePanel({ ctx }: { ctx: Ctx }) {
  const { session } = ctx;
  if (!session) {
    return <Empty message="No evidence exists yet. Evidence is recorded when Independent Verification runs." />;
  }
  const coverage = coverageRows(session);
  const findings = openFindings(session);
  const gaps = coverage.filter((item) => item.gap || item.verificationStatus === "NOT_TESTED");
  return (
    <div className="space-y-6">
      <CoverageGapSection ctx={ctx} />
      <section className="space-y-2">
        <h3 className="font-medium">Acceptance criteria coverage</h3>
        {coverage.length === 0 ? (
          <Empty message="No acceptance criteria coverage is recorded for this session." />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-stone-50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Acceptance criterion</th>
                  <th className="px-3 py-2 font-medium">Test case</th>
                  <th className="px-3 py-2 font-medium">Verification</th>
                  <th className="px-3 py-2 font-medium">Evidence</th>
                  <th className="px-3 py-2 font-medium">Finding or gap</th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((item) => (
                  <tr key={item.criterionId} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">{item.criterion}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {item.testCases.length > 0 ? item.testCases.map((test) => test.title).join("; ") : "No linked test case"}
                    </td>
                    <td className="px-3 py-2">{item.verificationLabel}</td>
                    <td className="px-3 py-2">{item.evidenceCount > 0 ? `${item.evidenceCount} item${item.evidenceCount === 1 ? "" : "s"}` : "Not verified"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.finding || item.gap || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Links come only from recorded acceptance-criterion and test-case references. Missing links are shown as gaps, not inferred.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Evidence records</h3>
        {session.evidence.length === 0 ? (
          <Empty message="No evidence records exist for this session." />
        ) : (
          <ul className="space-y-2 text-sm">
            {session.evidence.map((item) => (
              <li key={item.id} className="rounded-lg border p-3">
                <p>
                  {item.type} · {item.source === "AI_ANALYSIS" ? "AI analysis" : item.source} · {item.result || "recorded"}
                  {item.exitCode != null ? ` · exit ${item.exitCode}` : ""}
                </p>
                <p className="text-muted-foreground">{item.description}</p>
                {item.command ? <p className="font-mono text-xs text-muted-foreground">{item.command}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Findings, defects and risks</h3>
        {findings.length === 0 ? (
          <Empty message="No open findings are recorded." />
        ) : (
          <ul className="space-y-1 text-sm">
            {findings.map((item) => (
              <li key={item.id}>{item.kind}: {item.title} — {item.detail}</li>
            ))}
          </ul>
        )}
        <p className="text-sm">
          <Link href={buildTaskHref(ctx.productId, ctx.taskId)} className="text-indigo-800 hover:underline">
            Open the implementation task in Build
          </Link>
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Evidence gaps</h3>
        {gaps.length === 0 ? (
          <Empty message="No evidence gaps are recorded for this session." />
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {gaps.map((item) => (
              <li key={item.criterionId}>{item.criterion}: {item.gap || "Not verified"}</li>
            ))}
          </ul>
        )}
      </section>

      {session.nfrResults.length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-medium">Non-functional results</h3>
          <ul className="space-y-1 text-sm">
            {session.nfrResults.map((item) => (
              <li key={item.id}>{item.title}: {item.status}. {item.note}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ApprovalPanel({ ctx }: { ctx: Ctx }) {
  const { session, row } = ctx;
  const state = approvalState(session);
  const coverage = coverageRows(session);
  const unverified = coverage.filter((item) => item.verificationStatus !== "VERIFIED" && item.verificationStatus !== "NOT_APPLICABLE").length;
  const approvedAt = session?.approvals.find((item) => !item.stale)?.createdAt;
  return (
    <div className="space-y-6">
      <p className="rounded-xl border bg-stone-50 px-4 py-3 text-sm leading-6">
        The Testing & Verification Agent cannot approve its own work. Verification completed, verification passed, and human approval are three separate facts.
      </p>
      <dl className="grid gap-3 md:grid-cols-3">
        <Fact label="Verification completed" value={state.completed ? "Yes" : "No"} />
        <Fact label="Verification passed" value={session?.overallVerdict ?? "Not determined"} />
        <Fact label="Human approval granted" value={state.humanApproved && approvedAt ? `Yes · ${formatUtc(approvedAt)}` : state.humanApproved ? "Yes" : "No"} />
      </dl>

      <section className="space-y-2">
        <h3 className="font-medium">Outstanding blockers</h3>
        {row.blockers.length === 0 && !session?.stale ? (
          <Empty message="No blockers are outstanding." />
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-950">
            {row.blockers.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {session?.stale ? <li>{session.staleReason || "Verification needs to be repeated."}</li> : null}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Required evidence</h3>
        <p className="text-sm">
          {!session
            ? "Verification has not run."
            : unverified === 0
              ? "Every acceptance criterion has a verified result."
              : `${unverified} acceptance criteria are not verified. Their status stays as recorded.`}
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="font-medium">Human decision</h3>
        {!session ? (
          <Empty message="No decision is available before verification runs." />
        ) : session.demo ? (
          <Empty message="Demo verification. No decision controls are shown." />
        ) : state.humanApproved ? (
          <Empty message="Human approval is already recorded for this verification. The decision is kept in the approval history below." />
        ) : session.overallVerdict ? (
          <VerificationReview productId={ctx.productId} sessionId={session.id} verdict={session.overallVerdict} />
        ) : (
          <Empty message="No decision is available until verification completes." />
        )}
        {session && !session.demo && !state.humanApproved && session.overallVerdict !== "INCONCLUSIVE" && row.newAttempt.allowed ? (
          <div className="space-y-2 rounded-xl border bg-stone-50 px-4 py-3">
            <p className="text-sm leading-6">
              A new attempt re-runs verification against the same approved snapshot. It does not change the current result or any approval.
            </p>
            <StartNewVerificationButton productId={ctx.productId} taskId={ctx.taskId} />
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Approval history</h3>
        {!session || session.approvals.length === 0 ? (
          <Empty message="No human approval has been recorded for this verification session." />
        ) : (
          <ul className="space-y-1 text-sm">
            {session.approvals.map((item) => (
              <li key={item.id}>
                {formatUtc(item.createdAt)} · snapshot {item.commitSha ? item.commitSha.slice(0, 12) : "none"} · {item.stale ? `Superseded${item.staleReason ? `: ${item.staleReason}` : ""}` : "Current"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HistoryPanel({ ctx }: { ctx: Ctx }) {
  const { session, sessions } = ctx;
  const earlier = sessions.filter((item) => item !== session);
  const superseded = earlier.flatMap((item) => item.evidence.map((evidence) => ({ session: item, evidence })));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Earlier attempts and evidence are preserved. The latest attempt determines the current status.
      </p>

      <Disclosure title={`Verification attempts (${sessions.length})`}>
        {sessions.length === 0 ? (
          <Empty message="No verification attempts yet." />
        ) : (
          <ul className="space-y-3 text-sm">
            {sessions.map((item) => (
              <li key={item.id} className="rounded-lg border p-3">
                <p className="font-medium">
                  {item === session ? "Current attempt" : "Earlier attempt — superseded by the latest attempt"}
                </p>
                <p className="text-muted-foreground">
                  {formatUtc(item.createdAt)} · status {item.status} · verdict {item.overallVerdict ?? "not determined"} · snapshot {item.commitSha ? item.commitSha.slice(0, 12) : "none"}
                </p>
                {item.verdictReason ? <p>{item.verdictReason}</p> : null}
                {item.failureClass ? <p className="text-muted-foreground">Failure class: {item.failureClass}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Disclosure>

      <Disclosure title={`Earlier evidence (${superseded.length})`}>
        {superseded.length === 0 ? (
          <Empty message="No evidence from earlier attempts." />
        ) : (
          <ul className="space-y-1 text-sm">
            {superseded.map(({ session: owner, evidence }) => (
              <li key={evidence.id}>
                {formatUtc(evidence.createdAt)} · {evidence.type} · {evidence.result || "recorded"} · attempt {owner.id.slice(0, 8)}
              </li>
            ))}
          </ul>
        )}
      </Disclosure>

      <Disclosure title="Agent activity and workspace">
        {!session ? (
          <Empty message="No agent activity yet." />
        ) : (
          <div className="space-y-2 text-sm">
            <p>Session status: {session.status}. Executions recorded: {session.executions.length}.</p>
            {session.workspace ? (
              <p>
                Verification branch {session.workspace.branchName} from {session.workspace.baseCommit.slice(0, 12)} ({session.workspace.status}).
              </p>
            ) : (
              <p>No verification workspace is recorded.</p>
            )}
            {session.aiSummary ? <p className="text-muted-foreground">AI analysis, not independent proof: {session.aiSummary}</p> : null}
          </div>
        )}
      </Disclosure>

      <Disclosure title="Technical audit records">
        {!session ? (
          <Empty message="No audit records yet." />
        ) : (
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <Fact label="Session ID" value={<code className="font-mono">{session.id}</code>} />
            <Fact label="Task ID" value={<code className="font-mono">{session.implementationTaskId}</code>} />
            <Fact label="Full snapshot" value={<code className="font-mono break-all">{session.commitSha || "none"}</code>} />
            <Fact label="Contract plan version" value={session.contract ? `v${session.contract.planVersion}` : "No contract"} />
            <Fact label="Created" value={formatUtc(session.createdAt)} />
            <Fact label="Updated" value={formatUtc(session.updatedAt)} />
          </dl>
        )}
      </Disclosure>
    </div>
  );
}

function approvalLabel(session: ProveSession | null) {
  const state = approvalState(session);
  if (state.humanApproved) return "Approved";
  if (state.passed) return "Awaiting human decision";
  if (state.completed) return "Not approved";
  return "Not available yet";
}

function ExecutionGroup({ title, rows }: { title: string; rows: ProveSession["executions"] }) {
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{title}</h3>
      {rows.length === 0 ? (
        <Empty message="None recorded." />
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((item) => (
            <li key={item.id} className="rounded-lg border p-3">
              <p className="font-mono text-xs">{item.command || "(no command)"}</p>
              <p>
                {item.status}
                {item.exitCode != null ? ` · exit ${item.exitCode}` : ""}
                {` · ${formatUtc(item.completedAt ?? item.createdAt)}`}
              </p>
              {item.outputSummary ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Output</summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2 text-xs">{item.outputSummary}</pre>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function SummaryBox({
  title,
  headline,
  detail,
  href,
  linkLabel,
}: {
  title: string;
  headline: string;
  detail: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="rounded-xl border bg-stone-50 px-4 py-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm font-medium">{headline}</p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      <Link href={href} className="mt-2 inline-block text-sm text-indigo-800 hover:underline">
        {linkLabel}
      </Link>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border bg-stone-50 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-stone-900">{value}</dd>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">{message}</p>;
}

function TraceList({ trace, commitSha }: { trace: ProveAwaitingTask["trace"]; commitSha: string }) {
  const chain = [trace.outcome, trace.capability, trace.epic, trace.feature, trace.story, ...trace.criteria, trace.task, commitSha];
  const items = chain.filter(Boolean);
  if (items.length === 0) return null;
  return (
    <ol className="space-y-1 text-xs text-muted-foreground">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ol>
  );
}

function obligationRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; title?: unknown; kind?: unknown; source?: unknown; status?: unknown; evidence?: unknown };
    if (typeof row.id !== "string" || typeof row.title !== "string" || typeof row.kind !== "string") return [];
    return [{
      id: row.id,
      title: row.title,
      kind: row.kind,
      status: typeof row.status === "string" ? row.status : "NOT_TESTED",
      evidence: typeof row.evidence === "string" ? row.evidence : "",
    }];
  });
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function formatUtc(value: Date) {
  return `${value.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
