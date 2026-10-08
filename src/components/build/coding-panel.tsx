import {
  ApprovePlanButton,
  ApproveTaskButton,
  ReviewActions,
  StartCodingButton,
  WorkspaceRecovery,
} from "@/components/build/coding-controls";
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
          ? " A local repository is configured."
          : " Set PRODUCT_REPOSITORY_ROOT to a separate Git repository before starting a task."}
      </p>
      {coding.readiness.blockers.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-950">
          {coding.readiness.blockers.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <div className="space-y-4">
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
            <Trace trace={task.trace} />
            {task.preview ? <ContractPreview preview={task.preview} story={task.trace.story} /> : null}
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
          EXECUTION CONTRACT STALE. {workspace.staleReason} Review the contract, regenerate it, and resume, or abandon the workspace.
        </p>
      ) : null}
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <Fact label="Branch" value={workspace.branchName} />
        <Fact label="Base commit" value={workspace.baseCommit || "Not captured"} />
        <Fact label="Head commit" value={workspace.headCommit || "Not committed"} />
        <Fact label="Plan" value={workspace.plan?.status ?? "Not created"} />
      </div>
      {workspace.plan ? (
        <div className="text-sm">
          <p className="font-medium">Execution plan</p>
          <p className="mt-1 text-muted-foreground">{workspace.plan.summary}</p>
          <p className="mt-2 text-muted-foreground">Files: {asList(workspace.plan.filesExpectedToChange).join(", ") || "None"}</p>
          <p className="mt-1 text-muted-foreground">Steps: {asList(workspace.plan.steps).join(" ")}</p>
        </div>
      ) : null}
      {workspace.plan?.status === "PROPOSED" && !workspace.stale ? (
        <ApprovePlanButton productId={productId} workspaceId={workspace.id} />
      ) : null}
      <div>
        <p className="text-sm font-medium">Files changed</p>
        <p className="text-sm text-muted-foreground">
          {files.length} files, +{workspace.diff?.additions ?? 0} / -{workspace.diff?.deletions ?? 0}
          {workspace.diff?.truncated ? " Diff truncated." : ""}
        </p>
        <ul className="mt-1 text-sm text-muted-foreground">
          {files.map((file) => {
            const item = file as { path?: string; status?: string; additions?: number; deletions?: number };
            return (
              <li key={`${item.path}-${item.status}`}>
                {item.status} {item.path} +{item.additions ?? 0} -{item.deletions ?? 0}
              </li>
            );
          })}
        </ul>
        {workspace.diff?.patch ? (
          <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-stone-950 p-3 text-xs text-stone-100">{workspace.diff.patch}</pre>
        ) : null}
      </div>
      <div>
        <p className="text-sm font-medium">Checks and evidence</p>
        <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
          {workspace.evidence.map((item) => (
            <li key={item.id}>
              {item.type} · {item.source} · {item.result}
              {item.command ? ` · ${item.command}` : ""}
              {item.exitCode != null ? ` · exit ${item.exitCode}` : ""}
            </li>
          ))}
        </ul>
      </div>
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
          {taskTitle}. Approvals stay on record. A later edit makes a code approval stale. Nothing is merged from this screen.
        </p>
        {workspace.status === "READY_FOR_REVIEW" ? (
          <div className="mt-3">
            <ReviewActions productId={productId} workspaceId={workspace.id} />
          </div>
        ) : null}
      </div>
      {workspace.status !== "COMPLETED" && workspace.status !== "ABANDONED" ? (
        <WorkspaceRecovery productId={productId} workspaceId={workspace.id} stale={workspace.stale} />
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-medium">{label}. </span>
      <span className="text-muted-foreground">{value}</span>
    </p>
  );
}
