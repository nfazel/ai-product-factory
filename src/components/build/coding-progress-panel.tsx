import { ProposeContractPlanButton, RecordRepairResultButton, RepairImplementationButton, ScopeResolution, StartApprovedCodingButton } from "@/components/build/coding-controls";
import { REPAIR_RECORD_MESSAGE } from "@/modules/coding/diff";
import { ClarificationHold } from "@/components/clarification/keep-version";
import { describedProviderFailure, isProviderFailureCategory } from "@/modules/ai/failures";
import { compileExecutionContract, parsePlannedCommands } from "@/modules/coding/commands";
import { isGeneratedReviewPath } from "@/modules/coding/review";
import { asStrings } from "@/modules/coding/strings";
import { approvedPlanWasExecuted, describeCodingProgress, type CodingLifecycle } from "@/modules/coding/progress";
import { failureRecordKey } from "@/modules/coding/repair";
import { filesChangedByRun } from "@/modules/coding/retry";

type Workspace = {
  status: string;
  plan: {
    status: string;
    version: number;
    approvedBy: string;
    approvedAt: Date | null;
    steps: unknown;
    validationPlan: string;
    filesExpectedToChange: unknown;
    setupCommands: unknown;
    validationCommands: unknown;
  } | null;
  contract: { requiredChecks: unknown; allowedPaths: unknown; restrictedPaths: unknown } | null;
  evidence: { id: string; type?: string; description: string; command: string; result: string; output?: string; exitCode: number | null; createdAt: Date }[];
  toolEvents: { id: string; action: string; allowed: boolean; path: string; command: string; reason: string; createdAt: Date }[];
  agentRun: { status: string; input: unknown; startedAt: Date | null; completedAt: Date | null } | null;
  escalations: { status: string; type: string; description: string; reason: string; recommendedAction: string }[];
  diff: { files: unknown; patch: string; truncated: boolean; additions: number; deletions: number } | null;
  stale?: boolean;
  staleReason?: string;
  retryOffer?: boolean;
  repairOffer?: boolean;
  recordRepairOffer?: boolean;
  repairRuns?: { id: string; status: string; attempt: number | null; planVersion: number | null; startedAt: Date | null }[];
  commitOffer?: boolean;
  codeReview?: {
    approvable: boolean;
    reason: string;
    created: string[];
    modified: string[];
    deleted: string[];
    approved: { path: string; verb: string }[];
    derived: { path: string; verb: string }[];
    outOfScope: { path: string; verb: string }[];
    planVersion: number | null;
    setup: { command: string; result: string; passed: boolean }[];
    checks: { command: string; result: string; passed: boolean; stale: boolean }[];
    notApplicable: string[];
  };
  planIncomplete?: boolean;
  implementationIncomplete?: boolean;
  implementationGaps?: { path: string; kind: string; workItem: string }[];
  missingScope?: string[];
  revisedPlanReady?: boolean;
};

const LIFECYCLE_LABEL: Record<CodingLifecycle, string> = {
  NONE: "Not started",
  READY: "Ready",
  RUNNING: "Running",
  WAITING_FOR_HUMAN: "Waiting for you",
  FAILED: "Failed",
  COMPLETED: "Coding complete",
};

const NEXT_LABEL: Record<CodingLifecycle, string> = {
  NONE: "Generate an execution plan before coding.",
  READY: "Start Coding",
  RUNNING: "Coding in progress",
  WAITING_FOR_HUMAN: "Resolve Coding Blocker",
  FAILED: "Review Coding Failure",
  COMPLETED: "Review Code Changes",
};

function fileChangeText(paths: string[]) {
  if (paths.length === 0) return "Files changed: 0. No files were written by this run.";
  return `Files changed: ${paths.length} (${paths.join(", ")}). Retry starts a new coding run. It does not continue this one.`;
}

function when(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function clock(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function CodingProgressPanel({
  productId,
  workspaceId,
  workspace,
  contractBlocked,
  implementRuns,
}: {
  productId: string;
  workspaceId: string;
  workspace: Workspace;
  contractBlocked: boolean;
  implementRuns: {
    id: string;
    status?: string;
    outcome: string;
    startedAt: Date | null;
    completedAt: Date | null;
    planVersion?: number | null;
    error?: string;
    errorCategory?: string;
    provider?: string;
    model?: string;
  }[];
}) {
  const phase = workspace.agentRun?.input && typeof workspace.agentRun.input === "object" && "phase" in workspace.agentRun.input
    ? String((workspace.agentRun.input as { phase?: unknown }).phase ?? "")
    : null;
  const latestRun = implementRuns.at(-1) ?? null;
  const providerFailure = Boolean(latestRun && (latestRun.status === "FAILED" || latestRun.outcome === "FAILED") && isProviderFailureCategory(latestRun.errorCategory) && !workspace.stale);
  const latestStart = latestRun?.startedAt?.getTime() ?? 0;
  const currentEvents = latestStart ? workspace.toolEvents.filter((event) => event.createdAt.getTime() >= latestStart) : workspace.toolEvents;
  const currentEvidence = latestStart ? workspace.evidence.filter((item) => item.createdAt.getTime() >= latestStart) : workspace.evidence;
  const currentPlanExecuted = approvedPlanWasExecuted(
    workspace.plan,
    latestRun ? { startedAt: latestRun.startedAt, input: workspace.agentRun?.input ?? { phase: "implement" } } : null,
  );
  const compiled = workspace.plan ? compileExecutionContract({
    planVersion: workspace.plan.version,
    files: workspace.plan.filesExpectedToChange,
    allowedPaths: workspace.contract?.allowedPaths,
    restrictedPaths: workspace.contract?.restrictedPaths,
    setupCommands: workspace.plan.setupCommands,
    validationCommands: workspace.plan.validationCommands,
  }) : null;
  const files = Array.isArray(workspace.diff?.files) ? workspace.diff.files.flatMap((file) => {
    if (!file || typeof file !== "object") return [];
    const item = file as { path?: unknown; status?: unknown };
    return typeof item.path === "string" && !isGeneratedReviewPath(item.path) ? [{ path: item.path, status: typeof item.status === "string" ? item.status : "added" }] : [];
  }) : [];
  const progress = describeCodingProgress({
    workspaceStatus: workspace.status,
    planStatus: workspace.plan?.status ?? null,
    planVersion: workspace.plan?.version ?? null,
    currentPlanExecuted,
    planApprovedBy: workspace.plan?.approvedBy ?? "",
    planSteps: asStrings(workspace.plan?.steps),
    requiredChecks: workspace.plan
      ? parsePlannedCommands(workspace.plan.validationCommands).filter((item) => item.applicability !== "NOT_APPLICABLE").map((item) => item.command)
      : asStrings(workspace.contract?.requiredChecks),
    agentRunStatus: currentPlanExecuted ? (workspace.agentRun?.status ?? null) as "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | null : null,
    agentPhase: currentPlanExecuted ? phase : null,
    startedAt: currentPlanExecuted ? workspace.agentRun?.startedAt?.toISOString() ?? null : null,
    openEscalations: workspace.escalations.filter((item) => item.status === "OPEN"),
    events: (currentPlanExecuted ? currentEvents : []).map((event) => ({
      id: event.id,
      at: event.createdAt.toISOString(),
      action: event.action,
      allowed: event.allowed,
      path: event.path,
      command: event.command,
      reason: event.reason,
    })),
    evidence: (currentPlanExecuted ? currentEvidence : []).map((item) => ({
      id: item.id,
      description: item.description,
      command: item.command,
      result: item.result,
      output: item.output ?? "",
      exitCode: item.exitCode,
      at: item.createdAt.toISOString(),
    })),
    files,
    setupCommands: asStrings(workspace.plan?.setupCommands),
    implementationIncomplete: workspace.implementationIncomplete,
    implementationGaps: workspace.implementationGaps,
  });
  const last = [...progress.log].reverse().find((entry) => entry.at);
  const started = currentPlanExecuted ? latestRun?.startedAt ?? null : null;
  const historyRows = [
    ...implementRuns.flatMap((run, index) => {
      if (workspace.plan?.version != null && run.planVersion !== workspace.plan.version) return [];
      return [{
        key: `implement:${run.id}`,
        text: `Coding Run ${index + 1} — ${run.outcome === "FAILED" ? "failed initially" : runLabel(run.outcome).toLowerCase()}`,
      }];
    }),
    ...(workspace.repairRuns ?? []).flatMap((run) => {
      if (workspace.plan?.version != null && run.planVersion !== workspace.plan.version) return [];
      const successful = workspace.codeReview?.checks.every((check) => check.passed);
      return [{
        key: `repair:${run.id}:${run.attempt ?? "unnumbered"}`,
        text: `Repair Attempt ${run.attempt ?? "—"} — ${successful ? "successful" : run.status.toLowerCase()}. The original run failure stays on record.`,
      }];
    }),
  ];
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-indigo-700">CODING</p>
          <h3 className="text-lg font-semibold">{workspace.planIncomplete ? "Failed — plan revision required" : LIFECYCLE_LABEL[progress.lifecycle]}</h3>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">{progress.lifecycle}</span>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Status" value={LIFECYCLE_LABEL[progress.lifecycle]} />
        <Fact label="Execution plan" value={workspace.plan ? `v${workspace.plan.version} — ${workspace.planIncomplete ? "APPROVED · INCOMPLETE" : workspace.plan.status === "APPROVED" && compiled?.ready ? "APPROVED · VALIDATED" : workspace.plan.status}` : "None"} />
        <Fact label="Current step" value={progress.currentStep ? `${progress.currentStep.index} of ${progress.steps.length} — ${progress.currentStep.text}` : "No step is in progress"} />
        <Fact label="Started" value={currentPlanExecuted ? when(started) : "Not started for this plan"} />
        <Fact label="Last activity" value={when(last?.at ?? workspace.agentRun?.completedAt)} />
        <Fact label="Next action" value={workspace.status === "COMPLETED" ? "Start Independent Verification" : workspace.commitOffer ? "Create Commit" : workspace.plan?.status === "PROPOSED" ? "Review Execution Plan" : workspace.stale || workspace.planIncomplete ? "Revise Execution Plan" : workspace.revisedPlanReady ? "Start Coding" : workspace.recordRepairOffer ? "Record repair result" : workspace.repairOffer ? "Repair Implementation" : workspace.retryOffer ? "Retry Coding" : workspace.codeReview?.outOfScope.length ? "Restore Unapproved Change" : workspace.codeReview && progress.lifecycle === "COMPLETED" ? "Review Code Changes" : NEXT_LABEL[progress.lifecycle]} />
      </dl>
      <p className="text-sm leading-6 text-muted-foreground">
        Coding runs inside the request that starts it and saves each file write, command, and check as it happens. This page reads those saved events. It does not estimate a percentage, and a refresh shows the latest saved event.
        {workspace.plan?.approvedBy ? ` Version ${workspace.plan.version} was approved by ${workspace.plan.approvedBy}${workspace.plan.approvedAt ? ` on ${when(workspace.plan.approvedAt)}` : ""}.` : ""}
      </p>
      {progress.lifecycle === "COMPLETED" && workspace.codeReview ? (
        <div className={`rounded-lg px-3 py-3 text-sm ${workspace.codeReview.outOfScope.length > 0 ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}>
          <p className="font-medium">{workspace.status === "COMPLETED" ? "Approved source snapshot committed." : workspace.codeReview.outOfScope.length > 0 ? "Code changes are blocked." : "Ready for human review."} Execution plan v{workspace.plan?.version ?? "—"}.</p>
          <p className="mt-1">Source changes: {workspace.codeReview.created.length} created, {workspace.codeReview.modified.length} modified, {workspace.codeReview.deleted.length} deleted. Required checks: {workspace.codeReview.checks.filter((check) => check.passed).length} passed, {workspace.codeReview.checks.filter((check) => !check.passed).length} not passed. {workspace.status === "COMPLETED" ? "Ready for Independent Verification." : "This does not approve the code or complete independent verification."}</p>
          <p className="mt-2">Plan coverage: {countPhrase(workspace.codeReview.approved.length, "approved implementation file")}, {countPhrase(workspace.codeReview.derived.length, "expected derived file")}, {countPhrase(workspace.codeReview.outOfScope.length, "out-of-scope change")}.</p>
          {workspace.codeReview.outOfScope.length > 0 ? (
            <div className="mt-2">
              <p>{workspace.codeReview.reason}</p>
              <ScopeResolution productId={productId} workspaceId={workspaceId} planVersion={workspace.codeReview.planVersion} files={workspace.codeReview.outOfScope} />
            </div>
          ) : null}
          <p className="mt-2 font-medium">Setup</p>
          <ul className="mt-1">{workspace.codeReview.setup.map((item, index) => <li key={listKey("setup", item.command, index, workspace.codeReview?.setup.map((entry) => entry.command) ?? [])}>{item.passed ? "✓" : "✗"} {item.command}</li>)}</ul>
          <p className="mt-2 font-medium">Required checks</p>
          <ul className="mt-1">{workspace.codeReview.checks.map((item, index) => <li key={listKey("check", item.command, index, workspace.codeReview?.checks.map((entry) => entry.command) ?? [])}>{item.passed ? "✓" : "✗"} {item.command}{item.stale ? " — stale" : ""}</li>)}</ul>
          {workspace.codeReview.notApplicable.length > 0 ? (
            <>
              <p className="mt-2 font-medium">Not applicable</p>
              <ul className="mt-1">{workspace.codeReview.notApplicable.map((command, index) => <li key={listKey("not-applicable", command, index, workspace.codeReview?.notApplicable ?? [])}>— {command}</li>)}</ul>
            </>
          ) : null}
          {historyRows.length > 0 ? (
            <>
              <p className="mt-2 font-medium">History</p>
              <ul className="mt-1">
                {historyRows.map((row) => (
                  <li key={row.key}>{row.text}</li>
                ))}
              </ul>
            </>
          ) : null}
          {workspace.status === "COMPLETED" ? <p className="mt-2">Next action: Start Independent Verification.</p> : workspace.commitOffer ? <p className="mt-2">Next action: Create Commit. This locks the approved snapshot locally. It does not publish, create a pull request, or merge.</p> : workspace.codeReview.approvable ? <p className="mt-2">Next action: Review Code Changes, then Approve Code Changes.</p> : <p className="mt-2">{workspace.codeReview.reason}</p>}
        </div>
      ) : progress.lifecycle === "COMPLETED" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Coding complete for execution plan version {workspace.plan?.version ?? "—"}. {progress.files.created.length} files created, {progress.files.modified.length} modified, {progress.files.deleted.length} deleted. {progress.checks.filter((check) => check.state === "PASSED").length} checks passed, {progress.checks.filter((check) => check.state === "FAILED").length} failed. This does not approve the code or complete independent verification.
        </p>
      ) : null}
      {compiled ? (
        <div className="rounded-lg border px-3 py-3 text-sm">
          <h4 className="font-medium">Execution contract</h4>
          <p className="mt-1 text-muted-foreground">Execution plan v{compiled.contract.planVersion}. {workspace.planIncomplete ? "Incomplete. A required validation cannot succeed inside the approved file scope." : compiled.ready ? "Validated." : "Not valid."} {workspace.planIncomplete ? "Revise the plan before another coding run." : "This is the contract the next coding run will execute."}</p>
          <p className="mt-3 font-medium">Setup commands</p>
          <ul className="mt-1 space-y-1">
            {compiled.contract.setupCommands.length === 0 ? <li className="text-muted-foreground">None</li> : compiled.contract.setupCommands.map((command) => (
              <li key={command}>{command}</li>
            ))}
          </ul>
          <p className="mt-3 font-medium">Required validation</p>
          <ul className="mt-1 space-y-1">
            {compiled.contract.validationCommands.length === 0 ? <li className="text-muted-foreground">None</li> : compiled.contract.validationCommands.map((item) => (
              <li key={item.command}>{item.command}</li>
            ))}
          </ul>
          <p className="mt-3 font-medium">Not applicable</p>
          <ul className="mt-1 space-y-1">
            {compiled.contract.notApplicableChecks.length === 0 ? <li className="text-muted-foreground">None</li> : compiled.contract.notApplicableChecks.map((item) => (
              <li key={item.command}>— {item.command}. {item.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {implementRuns.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium">Coding runs</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {implementRuns.map((run, index) => (
              <li key={run.id}>
                Coding Run {index + 1} · {runLabel(run.outcome)} · {when(run.startedAt)}
                {run.planVersion ? ` · Execution Plan v${run.planVersion}` : ""}
                {!currentPlanExecuted || index < implementRuns.length - 1 || run.outcome === "ESCALATED" || run.outcome === "FAILED" ? " · kept as evidence" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {workspace.stale ? (
        <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">Needs review before Coding continues</p>
          <p className="mt-1">{workspace.staleReason || "A clarification answer changed after this execution plan was approved."}</p>
          <p className="mt-1">Earlier coding runs stay as evidence. This plan was not rewritten.</p>
          <ClarificationHold productId={productId} target="PLAN" reason={workspace.staleReason || ""} />
        </div>
      ) : null}
      {providerFailure && latestRun ? (
        <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">Coding Run {implementRuns.length} — FAILED</p>
          <p className="mt-1">Failure stage: AI generation. Provider: {latestRun.provider === "GOOGLE_GEMINI" ? "Gemini" : latestRun.provider || "Unavailable"}{latestRun.model ? `. Model: ${latestRun.model}` : ""}. {fileChangeText(filesChangedByRun(currentEvents))}</p>
          <p className="mt-1">{describedProviderFailure({ provider: latestRun.provider || null, category: latestRun.errorCategory || null, error: latestRun.error || null })}</p>
          <p className="mt-1">Execution plan v{workspace.plan?.version ?? "—"} {workspace.plan?.status === "APPROVED" ? "stays approved" : `is ${workspace.plan?.status ?? "unavailable"}`}. Retry uses that same plan.</p>
          {workspace.retryOffer ? (
            <div className="mt-3">
              <StartApprovedCodingButton productId={productId} workspaceId={workspaceId} label="Retry Coding" pendingLabel="Retrying" retry />
            </div>
          ) : null}
        </div>
      ) : null}
      {implementRuns.slice(0, -1).map((run, index) => {
        const start = run.startedAt?.getTime() ?? 0;
        const end = implementRuns[index + 1]?.startedAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const events = workspace.toolEvents.filter((event) => {
          const at = event.createdAt.getTime();
          return at >= start && at < end;
        });
        const evidence = workspace.evidence.filter((item) => {
          const at = item.createdAt.getTime();
          return at >= start && at < end;
        });
        if (events.length === 0 && evidence.length === 0) return null;
        const earlier = describeCodingProgress({
          workspaceStatus: "FAILED",
          planStatus: "ESCALATED",
          planVersion: run.planVersion ?? null,
          planApprovedBy: "",
          planSteps: [],
          requiredChecks: [],
          agentRunStatus: "COMPLETED",
          agentPhase: "implement",
          startedAt: run.startedAt?.toISOString() ?? null,
          openEscalations: [],
          events: events.map((event) => ({
            id: event.id,
            at: event.createdAt.toISOString(),
            action: event.action,
            allowed: event.allowed,
            path: event.path,
            command: event.command,
            reason: event.reason,
          })),
          evidence: evidence.map((item) => ({
            id: item.id,
            description: item.description,
            command: item.command,
            result: item.result,
            output: item.output ?? "",
            exitCode: item.exitCode,
            at: item.createdAt.toISOString(),
          })),
          files: [],
        });
        return (
          <div key={run.id} className="rounded-lg bg-stone-50 px-3 py-3 text-sm">
            <p className="font-medium">Coding Run {index + 1} — {runLabel(run.outcome)}{run.planVersion ? ` · Execution Plan v${run.planVersion}` : ""}</p>
            <p className="mt-1 text-muted-foreground">Kept as evidence. These results are separate from Coding Run {implementRuns.length}.</p>
            {earlier.failureGroups.map((group) => (
              <div key={group.category} className="mt-3">
                <p className="font-medium">{group.label}</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {group.items.map((failure, index) => (
                    <li key={listKey(group.category, failureRecordKey(failure.id ?? ""), index, group.items.map((entry) => failureRecordKey(entry.id ?? "")))}>{failure.what}. {failure.message}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
      {workspace.planIncomplete ? (
        <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">Coding Run {implementRuns.length || 1} — FAILED — plan revision required</p>
          {progress.failures.some((failure) => `${failure.what} ${failure.message}`.includes("prisma validate")) ? (
            <>
              <p className="mt-2 font-medium">Prisma validation — FAILED</p>
              <p>Validation environment can be corrected within the existing contract. A non-secret placeholder is supplied only to the validation process.</p>
            </>
          ) : null}
          <p className="mt-2 font-medium">Next.js build — FAILED</p>
          <p>Execution plan scope is insufficient.</p>
          {workspace.missingScope && workspace.missingScope.length > 0 ? (
            <p className="mt-1">Required additional scope: {workspace.missingScope.join(", ")}</p>
          ) : null}
          <p className="mt-2">Next action: Revise Execution Plan. The next version is not approved and coding does not start.</p>
          <div className="mt-3">
            <ProposeContractPlanButton productId={productId} workspaceId={workspaceId} />
          </div>
        </div>
      ) : null}
      {workspace.revisedPlanReady ? (
        <div className="rounded-lg bg-stone-50 px-3 py-3 text-sm">
          <p className="font-medium">Execution plan v{workspace.plan?.version} is approved and has not been executed.</p>
          <p className="mt-1 text-muted-foreground">Start a new coding run. Earlier runs stay as evidence. Starting coding does not approve the code.</p>
          <div className="mt-3">
            <StartApprovedCodingButton productId={productId} workspaceId={workspaceId} />
          </div>
        </div>
      ) : null}
      {contractBlocked && !workspace.planIncomplete && progress.failures.length > 0 ? (
        <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">Coding failed</p>
          <p className="mt-1">Root cause: the execution plan and the coding contract conflict.</p>
          <p className="mt-1">Recommended next action: revise the execution plan. The failed run stays as evidence. Revising does not approve the next version and does not start coding.</p>
          <div className="mt-3">
            <ProposeContractPlanButton productId={productId} workspaceId={workspaceId} />
          </div>
        </div>
      ) : null}
      {currentPlanExecuted && !providerFailure ? (
        <div className="space-y-3 text-sm">
          <p className="font-medium">Coding Run {implementRuns.length || 1}</p>
          {stageGroups(currentEvidence).map((group) => (
            <div key={group.title}>
              <p className="font-medium">{group.title}</p>
              <ul className="mt-1 space-y-1">
                {group.items.map((item, index) => (
                  <li key={listKey(group.title, item.id, index, group.items.map((entry) => entry.id))}>
                    {item.mark} {item.label}
                    {workspace.planIncomplete && item.label.includes("npx prisma validate") ? <span className="mt-1 block text-muted-foreground">Validation environment can be corrected within the existing contract.</span> : null}
                    {workspace.planIncomplete && item.label.includes("npm run build") ? <span className="mt-1 block text-muted-foreground">Execution plan scope is insufficient.{workspace.missingScope && workspace.missingScope.length > 0 ? ` Required additional scope: ${workspace.missingScope.join(", ")}.` : ""}</span> : null}
                    {item.output ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer">View details</summary>
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">{item.output}</pre>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {workspace.recordRepairOffer ? (
        <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">Repair result not fully recorded</p>
          <p className="mt-1">{REPAIR_RECORD_MESSAGE}</p>
          <div className="mt-3">
            <RecordRepairResultButton productId={productId} workspaceId={workspaceId} />
          </div>
        </div>
      ) : null}
      {workspace.implementationIncomplete ? (
        <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">Implementation incomplete</p>
          <p className="mt-1">The approved execution plan is sufficient. Coding did not produce the planned structure.</p>
          <ul className="mt-2 space-y-1">
            {(workspace.implementationGaps ?? []).map((gap) => (
              <li key={`${gap.kind}-${gap.path}`}>{gap.path}. {gap.workItem}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {progress.failureGroups.length > 0 && progress.lifecycle !== "READY" ? (
        <div className="space-y-3 rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">Coding Run {implementRuns.length || 1} — saved failures</p>
          {progress.failureGroups.map((group) => (
            <div key={group.category}>
              <p className="font-medium">{group.label}</p>
              <ul className="mt-1 space-y-1">
                {group.items.map((failure, index) => (
                  <li key={listKey(group.category, failureRecordKey(failure.id ?? ""), index, group.items.map((entry) => failureRecordKey(entry.id ?? "")))}>
                    {failure.what}. {failure.step}. {failure.message}
                    {failure.output ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer">View details</summary>
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">{failure.output}</pre>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {workspace.repairOffer && !workspace.planIncomplete && !workspace.recordRepairOffer ? (
            <div className="mt-3">
              <RepairImplementationButton productId={productId} workspaceId={workspaceId} />
            </div>
          ) : null}
        </div>
      ) : null}
      <div>
        <h4 className="text-sm font-medium">Execution progress</h4>
        <ol className="mt-2 space-y-1 text-sm">
          {progress.steps.map((step) => (
            <li key={step.index}>
              <span className="font-medium">{stepMark(step.state)} {step.index}.</span> {step.text}
              <span className="text-muted-foreground"> · {step.state}</span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h4 className="text-sm font-medium">Changed files</h4>
        <p className="mt-1 text-sm text-muted-foreground">Local worktree changes. GitHub is not required to read them.</p>
        <FileGroup label="Created" files={progress.files.created} />
        <FileGroup label="Modified" files={progress.files.modified} />
        <FileGroup label="Deleted" files={progress.files.deleted} />
        {workspace.diff?.patch ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium">View diff</summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-stone-950 p-3 text-xs text-stone-100">{workspace.diff.patch}</pre>
          </details>
        ) : null}
      </div>
      <div>
        <h4 className="text-sm font-medium">Checks run by Coding</h4>
        <p className="mt-1 text-sm text-muted-foreground">These are the Coding Agent’s own checks. They are not independent verification, and an unrun check is not a pass.</p>
        <ul className="mt-2 space-y-1 text-sm">
          {!currentPlanExecuted ? <li className="text-muted-foreground">No checks have been run for this execution plan.</li> : progress.checks.map((check) => (
            <li key={check.label}>
              <span className="font-medium">{check.label}</span>
              <span className="text-muted-foreground"> · {check.state}. {check.detail}</span>
            </li>
          ))}
        </ul>
        {workspace.plan?.validationPlan ? <p className="mt-2 text-sm text-muted-foreground">Plan validation: {workspace.plan.validationPlan}</p> : null}
      </div>
      <div>
        <h4 className="text-sm font-medium">Activity</h4>
        <ul className="mt-2 space-y-1 text-sm">
          {progress.log.length === 0 ? <li className="text-muted-foreground">No file writes or commands have been saved for this run.</li> : progress.log.map((entry) => (
            <li key={entry.id}>
              <span className="text-muted-foreground">{clock(entry.at)} </span>
              {entry.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function stageGroups(evidence: Workspace["evidence"]) {
  const groups = [
    { title: "IMPLEMENTATION", items: [] as StageItem[] },
    { title: "SETUP", items: [] as StageItem[] },
    { title: "VALIDATION", items: [] as StageItem[] },
    { title: "NOT APPLICABLE", items: [] as StageItem[] },
  ];
  const latest = new Map<string, Workspace["evidence"][number]>();
  const rows = [];
  for (const item of evidence) {
    if (item.command) latest.set(item.command, item);
    else rows.push(item);
  }
  for (const item of [...rows, ...latest.values()]) {
    const stage = item.result === "NOT APPLICABLE"
      ? "NOT APPLICABLE"
      : !item.command
        ? "IMPLEMENTATION"
        : /\b(?:npm install|npx prisma generate)\b/.test(item.command)
          ? "SETUP"
          : "VALIDATION";
    const mark = item.result === "FAIL" ? "✗" : item.result === "PASS" || item.result === "CHANGED" ? "✓" : "—";
    const label = item.result === "NOT RUN"
      ? `${item.command || item.description}. Not run`
      : item.command || item.description;
    groups.find((group) => group.title === stage)?.items.push({
      id: item.id,
      mark,
      label,
      output: item.result === "FAIL" ? item.output ?? "" : "",
    });
  }
  return groups.filter((group) => group.items.length > 0);
}

type StageItem = { id: string; mark: string; label: string; output: string };

function runLabel(outcome: string) {
  if (outcome === "ESCALATED" || outcome === "FAILED") return "FAILED";
  if (outcome === "COMPLETED" || outcome === "COMPLETED_WITH_CONCERNS") return "COMPLETED";
  return outcome;
}

function stepMark(state: string) {
  if (state === "COMPLETED") return "✓";
  if (state === "RUNNING" || state === "FAILED") return "→";
  if (state === "BLOCKED") return "–";
  return "○";
}

function FileGroup({ label, files }: { label: string; files: string[] }) {
  return (
    <div className="mt-2 text-sm">
      <p className="font-medium">{label}</p>
      {files.length === 0 ? <p className="text-muted-foreground">None</p> : (
        <ul className="text-muted-foreground">{files.map((file, index) => <li key={listKey(label, file, index, files)}>{file}</li>)}</ul>
      )}
    </div>
  );
}

function listKey(role: string, value: string, index: number, values: string[]) {
  const earlier = values.slice(0, index).filter((item) => item === value).length;
  return earlier === 0 ? `${role}:${value}` : `${role}:${value}:${earlier + 1}`;
}

function countPhrase(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
