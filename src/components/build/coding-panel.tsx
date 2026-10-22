import {
  ApproveTaskButton,
  ApprovedCommit,
  ReviewActions,
  StartCodingButton,
  WorkspaceRecovery,
} from "@/components/build/coding-controls";
import { CodingProgressPanel } from "@/components/build/coding-progress-panel";
import { ExecutionPlanReview } from "@/components/build/execution-plan-review";
import { approvedPlanWindows, codeReviewGuidance, evaluatePlanChecks, type CheckEvidenceInput } from "@/modules/coding/check-identity";
import { parsePlannedCommands } from "@/modules/coding/commands";
import { asStrings } from "@/modules/coding/strings";
import { approvedPlanWasExecuted } from "@/modules/coding/progress";
import { CODING_EXECUTION_LABEL, CODING_RISK_LABEL, type CodingExecutionModeName, type CodingRiskLevelName } from "@/domain/constants";
import type { getCodingView } from "@/modules/coding/service";

type CodingView = NonNullable<Awaited<ReturnType<typeof getCodingView>>>;

function asList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function CodingPanel({
  productId,
  coding,
}: {
  productId: string;
  coding: CodingView | null;
}) {
  if (!coding) return null;
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-indigo-700">CODING EXECUTION</p>
          <h2 className="text-lg font-semibold">Coding Agent</h2>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
          {coding.readiness.label}
        </span>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        The Coding Agent executes one approved implementation task in an isolated Git worktree. It does not push, merge, or approve its own changes.
        {coding.repositoryConfigured
          ? " This product repository is ready."
          : " This product does not have a repository yet. Set up the product repository before starting Coding."}
      </p>
      {coding.integrationBase ? <IntegrationBaseStatus base={coding.integrationBase} /> : null}
      {coding.readiness.blockers.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-950">
          {coding.readiness.blockers.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <div className="space-y-4">
        {coding.tasks.filter((task) => task.workspace?.plan).map((task) => {
          const latestRun = task.workspace!.implementRuns?.at(-1) ?? null;
          const planExecuted = approvedPlanWasExecuted(
            task.workspace!.plan,
            latestRun ? { startedAt: latestRun.startedAt, input: task.workspace!.agentRun?.input ?? { phase: "implement" } } : null,
          );
          return (
          <ExecutionPlanReview
            key={task.workspace!.id}
            productId={productId}
            workspaceId={task.workspace!.id}
            workspaceStatus={task.workspace!.status}
            plan={task.workspace!.plan!}
            objective={task.workspace!.contract?.objective || task.objective}
            allowedPaths={asList(task.workspace!.contract?.allowedPaths)}
            restrictedPaths={asList(task.workspace!.contract?.restrictedPaths)}
            dependencies={asList(task.workspace!.contract?.dependencies)}
            architectureConstraints={task.workspace!.contract?.architectureConstraints || "Not recorded at planning time."}
            maxFiles={task.workspace!.contract?.maxFiles ?? 8}
            hasCodeChanges={Array.isArray(task.workspace!.diff?.files) && task.workspace!.diff.files.length > 0}
            planExecuted={planExecuted}
            contractReady={task.workspace!.contractFlight?.ready ?? true}
            contractMessage={task.workspace!.contractFlight?.blockers[0]?.message ?? "Execution Plan cannot be approved because a required operation is not permitted by the current coding contract."}
            revisedPlanReady={Boolean(task.workspace!.revisedPlanReady)}
            stale={task.workspace!.stale}
            staleReason={task.workspace!.staleReason}
            setupCommands={asList(task.workspace!.plan?.setupCommands)}
            validationCommands={parsePlannedCommands(task.workspace!.plan?.validationCommands)}
            trace={[
              ["Outcome", task.trace.outcome],
              ["Capability", task.trace.capability],
              ["Epic", task.trace.epic],
              ["Feature", task.trace.feature],
              ["Story", task.trace.story],
              ["Product acceptance criteria", task.trace.acceptanceCriteria.join("; ") || "Not linked"],
              ["Implementation task", task.trace.task],
            ]}
          />
          );
        })}
        {coding.tasks.map((task) => (
          <article key={task.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">{task.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{task.objective}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Task {task.status}</p>
                <p>
                  Risk {task.riskLevel ? CODING_RISK_LABEL[task.riskLevel as CodingRiskLevelName] : "Not assessed"}
                </p>
                <p>
                  Mode{" "}
                  {task.executionMode
                    ? CODING_EXECUTION_LABEL[task.executionMode as CodingExecutionModeName]
                    : "Not assessed"}
                </p>
                <p>Workspace {task.workspace?.status ?? "None"}</p>
              </div>
            </div>
            {task.blockers.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {task.blockers.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">Evidence</summary>
              <div className="mt-3 space-y-3">
                <Trace trace={task.trace} />
                {task.preview ? <ContractPreview preview={task.preview} story={task.trace.story} /> : null}
              </div>
            </details>
            <div className="mt-4 flex flex-wrap gap-3">
              {task.status === "PROPOSED" || task.status === "BLOCKED" ? (
                <ApproveTaskButton productId={productId} taskId={task.id} />
              ) : null}
              {task.canStart ? <StartCodingButton productId={productId} taskId={task.id} /> : null}
            </div>
            {task.workspace ? <WorkspaceDetail productId={productId} taskTitle={task.title} workspace={task.workspace} /> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function IntegrationBaseStatus({
  base,
}: {
  base: NonNullable<CodingView["integrationBase"]>;
}) {
  const blocking = ["ahead", "diverged", "dirty", "missing-local", "missing-remote", "auth-failed"].includes(base.status);
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${blocking ? "border-amber-300 bg-amber-50 text-amber-950" : "bg-stone-50 text-stone-800"}`}>
      <p className="font-medium">Coding base · {base.integrationBranch}</p>
      <p className="mt-1">{base.message}</p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Local tip</dt>
          <dd className="font-mono text-xs">{base.localCommit || "Missing"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">GitHub tip</dt>
          <dd className="font-mono text-xs">{base.githubConfigured ? base.remoteCommit || "Unavailable" : "Not connected"}</dd>
        </div>
      </dl>
      {blocking ? (
        <p className="mt-2 text-xs">Starting Coding is blocked until the integration branch can be synchronised safely.</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Starting Coding uses this integration branch tip as the worktree base commit.
        </p>
      )}
    </div>
  );
}

function Trace({ trace }: { trace: CodingView["tasks"][number]["trace"] }) {
  const steps = [
    ["Product outcome", trace.outcome],
    ["Capability", trace.capability],
    ["Epic", trace.epic],
    ["Feature", trace.feature],
    ["Story", trace.story],
    ["Architecture", trace.architecture],
    ["Implementation task", trace.task],
  ];
  return (
    <ol className="mt-4 space-y-1 text-sm">
      {steps.map(([label, value]) => (
        <li key={label}>
          <span className="text-muted-foreground">{label}: </span>
          {value}
        </li>
      ))}
      <li>
        <span className="text-muted-foreground">Acceptance criteria: </span>
        {trace.acceptanceCriteria.length > 0 ? trace.acceptanceCriteria.join("; ") : "Not linked"}
      </li>
    </ol>
  );
}

function ContractPreview({
  preview,
  story,
}: {
  preview: NonNullable<CodingView["tasks"][number]["preview"]>;
  story: string;
}) {
  return (
    <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
      <Fact label="Objective" value={preview.objective} />
      <Fact label="Related story" value={story} />
      <Fact label="Acceptance criteria" value={preview.acceptanceCriteria.join("; ") || "None"} />
      <Fact label="Allowed paths" value={preview.allowedPaths.join(", ") || "None"} />
      <Fact label="Restricted paths" value={preview.restrictedPaths.join(", ") || "None"} />
      <Fact label="Architecture constraints" value={preview.architectureConstraints || "None"} />
      <Fact label="Required checks" value={preview.requiredChecks.join(", ") || "None"} />
      <Fact label="Execution mode" value={CODING_EXECUTION_LABEL[preview.executionMode]} />
      <Fact label="File limit" value={String(preview.maxFiles)} />
      <Fact label="Dependencies" value={preview.dependencies.join(", ") || "None"} />
    </div>
  );
}

function WorkspaceDetail({
  productId,
  taskTitle,
  workspace,
}: {
  productId: string;
  taskTitle: string;
  workspace: NonNullable<CodingView["tasks"][number]["workspace"]>;
}) {
  const files = Array.isArray(workspace.diff?.files) ? workspace.diff.files : [];
  const findings = workspace.selfReview?.findings;
  return (
    <div className="mt-4 space-y-4 border-t pt-4">
      {workspace.stale ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          The approved coding instructions are out of date. {workspace.staleReason} Review them, then resume or abandon this workspace.
        </p>
      ) : null}
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <Fact label="Branch" value={workspace.branchName} />
        <Fact label="Coding base commit" value={workspace.baseCommit || "Not captured"} />
        <Fact label="Head commit" value={workspace.headCommit || "Not committed"} />
        <Fact label="Plan" value={workspace.plan?.status ?? "Not created"} />
      </div>
      <p className="text-sm text-muted-foreground">
        New coding worktrees start from the product integration branch tip after a safe GitHub synchronisation check. They do not start from an arbitrary local HEAD.
      </p>
      <p className="text-sm text-muted-foreground">Plan {workspace.plan?.status ?? "Not created"} · version {workspace.plan?.version ?? "—"}</p>
      <CodingProgressPanel
        productId={productId}
        workspaceId={workspace.id}
        workspace={workspace}
        contractBlocked={Boolean(workspace.contractFlight && !workspace.contractFlight.ready && workspace.plan?.status === "APPROVED")}
        implementRuns={workspace.implementRuns ?? []}
      />
      <div>
        <p className="text-sm font-medium">Files changed</p>
        <p className="text-sm text-muted-foreground">
          {files.length} files, +{workspace.diff?.additions ?? 0} / -{workspace.diff?.deletions ?? 0}
          {workspace.diff?.truncated ? " Diff truncated." : ""}
        </p>
        <ul className="mt-1 text-sm text-muted-foreground">
          {files.map((file, index) => {
            const item = file as { path?: string; status?: string; additions?: number; deletions?: number };
            const identity = `${item.status ?? "changed"}:${item.path ?? "unknown"}`;
            const identities = files.map((entry) => {
              const record = entry as { path?: string; status?: string };
              return `${record.status ?? "changed"}:${record.path ?? "unknown"}`;
            });
            const earlier = identities.slice(0, index).filter((value) => value === identity).length;
            return (
              <li key={earlier === 0 ? identity : `${identity}:${earlier + 1}`}>
                {item.status} {item.path} +{item.additions ?? 0} -{item.deletions ?? 0}
              </li>
            );
          })}
        </ul>
        {workspace.diff?.patch ? (
          <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-stone-950 p-3 text-xs text-stone-100">{workspace.diff.patch}</pre>
        ) : null}
      </div>
      <ChecksAndEvidence workspace={workspace} />
      {workspace.selfReview ? (
        <div className="text-sm">
          <p className="font-medium">Self review</p>
          <p className="text-muted-foreground">AI analysis, not independent verification. {workspace.selfReview.summary}</p>
          <FindingList findings={findings} />
        </div>
      ) : null}
      {workspace.escalations.length > 0 ? (
        <div className="text-sm">
          <p className="font-medium">Escalations</p>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {workspace.escalations.map((item) => (
              <li key={item.id}>
                {item.status} {item.type}: {item.description} {item.recommendedAction}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <p className="text-sm font-medium">Code review</p>
        <p className="text-sm text-muted-foreground">
          {taskTitle}. {codeReviewGuidance({
            status: workspace.status,
            commitOffer: workspace.commitOffer,
            headCommit: workspace.headCommit,
            baseCommit: workspace.baseCommit,
          })}
        </p>
        {workspace.status === "COMPLETED" && workspace.headCommit && workspace.headCommit !== workspace.baseCommit ? (
          <div className="mt-3">
            <ApprovedCommit productId={productId} workspaceId={workspace.id} reviewed={0} outOfScope={0} committedSha={workspace.headCommit} />
          </div>
        ) : null}
        {workspace.status === "READY_FOR_REVIEW" ? (
          <div className="mt-3 space-y-3">
            {workspace.codeReview && !workspace.codeReview.approvable ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">{workspace.codeReview.reason}</p>
            ) : null}
            {workspace.commitOffer && workspace.codeReview ? (
              <ApprovedCommit
                productId={productId}
                workspaceId={workspace.id}
                reviewed={workspace.codeReview.approved.length + workspace.codeReview.derived.length}
                outOfScope={workspace.codeReview.outOfScope.length}
              />
            ) : null}
            <ReviewActions productId={productId} workspaceId={workspace.id} allowApprove={!workspace.commitOffer && workspace.codeReview?.approvable !== false} hideApprove={Boolean(workspace.commitOffer)} />
          </div>
        ) : null}
      </div>
      {workspace.status !== "COMPLETED" && workspace.status !== "ABANDONED" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{workspace.planIncomplete ? "Coding stays closed until the execution plan is revised and the next version is approved. Revising does not start coding." : "Resume starts another implementation pass in this workspace. A failed validation is repaired inside the approved plan. These actions do not approve the code or start verification."}</p>
        <WorkspaceRecovery
          productId={productId}
          workspaceId={workspace.id}
          stale={workspace.stale}
          allowRetry={Boolean(workspace.retryOffer)}
          allowResume={!workspace.planIncomplete && !workspace.repairOffer && !workspace.recordRepairOffer && !workspace.retryOffer && workspace.plan?.status === "APPROVED" && (workspace.status === "FAILED" || workspace.status === "ACTIVE")}
        />
        </div>
      ) : null}
    </div>
  );
}

function FindingList({ findings }: { findings: unknown }) {
  if (!findings || typeof findings !== "object") return null;
  const record = findings as Record<string, unknown>;
  const lines = Object.entries(record).flatMap(([key, value]) =>
    Array.isArray(value) ? value.filter((item) => typeof item === "string").map((item) => `${key}: ${item}`) : [],
  );
  if (lines.length === 0) return null;
  return (
    <ul className="mt-1 list-disc pl-5 text-muted-foreground">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

export function ChecksAndEvidence({
  workspace,
}: {
  workspace: {
    status: string;
    headCommit: string;
    baseCommit: string;
    plan: {
      version: number;
      status: string;
      approvedAt: Date | null;
      history: unknown;
      setupCommands: unknown;
      validationCommands: unknown;
    } | null;
    evidence: {
      id: string;
      type: string;
      source: string;
      result: string;
      command: string;
      description: string;
      exitCode: number | null;
      createdAt: Date;
      completedAt: Date | null;
    }[];
    approvals: { stale: boolean; headCommit: string }[];
  };
}) {
  const evidence = checkEvidence(workspace.evidence);
  const windows = workspace.plan
    ? approvedPlanWindows({
        version: workspace.plan.version,
        status: workspace.plan.status,
        approvedAt: workspace.plan.approvedAt,
        history: workspace.plan.history,
      })
    : [];
  const planVersion = workspace.plan?.version ?? 0;
  const setup = workspace.plan
    ? evaluatePlanChecks({
        planVersion,
        windows,
        checks: asStrings(workspace.plan.setupCommands).map((command) => ({ command, applicability: "REQUIRED" })),
        evidence,
      }).required
    : [];
  const validation = workspace.plan
    ? evaluatePlanChecks({
        planVersion,
        windows,
        checks: parsePlannedCommands(workspace.plan.validationCommands),
        evidence,
      })
    : { required: [], notApplicable: [] };
  const approval = workspace.approvals.find((item) => !item.stale);
  const committed = Boolean(approval && approval.headCommit === workspace.headCommit && workspace.headCommit !== workspace.baseCommit);
  return (
    <div>
      <p className="text-sm font-medium">Current result</p>
      <p className="text-sm text-muted-foreground">Execution plan v{workspace.plan?.version ?? "—"}.</p>
      <CheckGroup title="Setup" rows={setup.map((item) => ({ key: item.command, mark: item.passed ? "✓" : "✗", text: item.command }))} />
      <CheckGroup title="Required checks" rows={validation.required.map((item) => ({ key: item.checkId ?? item.command, mark: item.passed ? "✓" : "✗", text: `${item.label} · ${item.command}` }))} />
      <CheckGroup title="Not applicable" rows={validation.notApplicable.map((item) => ({ key: item.checkId ?? item.command, mark: "—", text: item.label }))} />
      <CheckGroup
        title="Human governance"
        rows={[
          { key: "approved", mark: approval ? "✓" : "✗", text: "Code changes approved" },
          { key: "committed", mark: committed ? "✓" : "✗", text: "Approved snapshot committed" },
        ]}
      />
      <details className="mt-3 text-sm text-muted-foreground">
        <summary>View full audit history</summary>
        <ul className="mt-1 space-y-1">
          {workspace.evidence.map((item) => (
            <li key={item.id}>
              {item.type} · {item.source} · {item.result}
              {item.command ? ` · ${item.command}` : ""}
              {item.description && item.description !== item.command ? ` · ${item.description}` : ""}
              {item.exitCode != null ? ` · exit ${item.exitCode}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function CheckGroup({ title, rows }: { title: string; rows: { key: string; mark: string; text: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-1 text-sm text-muted-foreground">
        {rows.map((row) => (
          <li key={row.key}>{row.mark} {row.text}</li>
        ))}
      </ul>
    </div>
  );
}

function checkEvidence(evidence: {
  command: string;
  description: string;
  result: string;
  exitCode: number | null;
  createdAt: Date;
  completedAt: Date | null;
}[]): CheckEvidenceInput[] {
  return evidence.map((item) => ({
    command: item.command,
    description: item.description,
    result: item.result,
    exitCode: item.exitCode,
    at: item.completedAt ?? item.createdAt,
  }));
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-medium">{label}. </span>
      <span className="text-muted-foreground">{value}</span>
    </p>
  );
}
