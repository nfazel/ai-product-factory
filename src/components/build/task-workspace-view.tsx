import Link from "next/link";
import type { ReactNode } from "react";

import {
  ApproveCodeChangesButton,
  ApprovePlanButton,
  ApproveTaskButton,
  ApprovedCommit,
  RepairPlanCoverageButton,
  StartCodingButton,
  ValidateExistingImplementationButton,
} from "@/components/build/coding-controls";
import { assessPlanConsistency } from "@/modules/coding/bootstrap";
import { asStrings } from "@/modules/coding/strings";
import {
  CodingWorkspaceDetail,
  TaskExecutionPlan,
} from "@/components/build/coding-panel";
import { StatusPill } from "@/components/build/status-pill";
import { TaskWorkDetails } from "@/components/build/task-work-details";
import { CODING_EXECUTION_LABEL, CODING_RISK_LABEL, type CodingExecutionModeName, type CodingRiskLevelName } from "@/domain/constants";
import type { BuildTaskRow, CodingTask } from "@/modules/build/task-status";

export function TaskWorkspaceView({
  productId,
  task,
  summary,
}: {
  productId: string;
  task: CodingTask;
  summary: BuildTaskRow;
}) {
  const workspace = task.workspace;
  const defaultTab =
    summary.primaryAction?.kind === "open-plan"
      ? "plan"
      : summary.primaryAction?.kind === "review-code"
        ? "validation"
        : summary.primaryAction?.kind === "recover-workspace"
          ? "coding"
          : workspace?.plan
            ? "coding"
            : "plan";

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link href={`/products/${productId}/build`} className="font-medium text-indigo-800 hover:underline">
          Build
        </Link>
        <span className="mx-2">/</span>
        <span className="text-stone-800">Task</span>
      </nav>

      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Current status</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{task.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{task.objective}</p>
          </div>
          <StatusPill
            label={summary.taskStatusLabel}
            tone={summary.completed ? "success" : summary.attention ? "attention" : summary.inProgress ? "progress" : "neutral"}
          />
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatusFact label="Overall task" value={summary.taskStatusLabel} />
          <StatusFact label="Latest coding outcome" value={summary.latestCodingOutcome} />
          <StatusFact label="Required validation" value={summary.validationStatus} tone={<StatusPill label={summary.validationStatus} tone={summary.validationTone} />} />
          <StatusFact label="Human approval" value={summary.approvalStatus} tone={<StatusPill label={summary.approvalStatus} tone={summary.approvalTone} />} />
          <StatusFact label="Independent verification" value={summary.verificationStatus} tone={<StatusPill label={summary.verificationStatus} tone={summary.verificationTone} />} />
          <StatusFact
            label="Risk / mode"
            value={`${task.riskLevel ? CODING_RISK_LABEL[task.riskLevel as CodingRiskLevelName] : "Not assessed"} · ${
              task.executionMode ? CODING_EXECUTION_LABEL[task.executionMode as CodingExecutionModeName] : "Not assessed"
            }`}
          />
        </dl>

        {summary.blockers.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">Current blockers</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {summary.blockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 rounded-xl border bg-stone-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended next action</p>
          <p className="mt-1 text-sm font-medium text-stone-900">{summary.nextAction}</p>
          <div className="mt-3">
            <PrimaryActionSlot productId={productId} task={task} summary={summary} />
          </div>
        </div>
      </section>

      <TaskWorkDetails
        defaultTab={defaultTab}
        plan={<TaskExecutionPlan productId={productId} task={task} />}
        coding={
          workspace ? (
            <CodingWorkspaceDetail
              productId={productId}
              taskTitle={task.title}
              workspace={workspace}
              sections={["summary", "progress", "files", "recovery"]}
            />
          ) : (
            <EmptyDetail message="Coding has not started. Approve the task and generate an execution plan when ready." />
          )
        }
        validation={
          workspace ? (
            <CodingWorkspaceDetail
              productId={productId}
              taskTitle={task.title}
              workspace={workspace}
              sections={["validation", "review"]}
            />
          ) : (
            <EmptyDetail message="Validation and human approval appear after coding produces a reviewable result." />
          )
        }
        history={
          workspace ? (
            <CodingWorkspaceDetail
              productId={productId}
              taskTitle={task.title}
              workspace={workspace}
              sections={["history"]}
            />
          ) : (
            <EmptyDetail message="No coding history yet." />
          )
        }
      />
    </div>
  );
}

function PrimaryActionSlot({
  productId,
  task,
  summary,
}: {
  productId: string;
  task: CodingTask;
  summary: BuildTaskRow;
}) {
  const action = summary.primaryAction;
  if (!action) {
    return (
      <p className="text-sm text-muted-foreground">
        {summary.whyNoAction ?? "No permitted action is available right now."}
      </p>
    );
  }
  if (action.kind === "approve-task") {
    return <ApproveTaskButton productId={productId} taskId={task.id} />;
  }
  if (action.kind === "start-coding") {
    return <StartCodingButton productId={productId} taskId={task.id} />;
  }
  if (action.kind === "validate-existing" && task.workspace) {
    return <ValidateExistingImplementationButton productId={productId} workspaceId={task.workspace.id} />;
  }
  if (action.kind === "open-prove") {
    return (
      <Link
        href={`/products/${productId}/testing/tasks/${task.id}`}
        className="inline-flex rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800"
      >
        Open Verification
      </Link>
    );
  }
  if (action.kind === "open-plan") {
    if (task.workspace?.plan && (task.workspace.plan.status === "PROPOSED" || task.workspace.plan.status === "ESCALATED")) {
      const plan = task.workspace.plan;
      const coverageGaps = assessPlanConsistency({
        files: asStrings(plan.filesExpectedToChange),
        steps: asStrings(plan.steps),
        validationCommands: [],
        validationPlan: typeof plan.validationPlan === "string" ? plan.validationPlan : "",
      }).unproducedFiles;
      if (coverageGaps.length > 0) {
        return (
          <div className="space-y-2">
            <RepairPlanCoverageButton productId={productId} workspaceId={task.workspace.id} />
            <p className="text-sm text-muted-foreground">
              Authorised files without work items: {coverageGaps.join(", ")}. Repair proposes a new version; it does not approve the plan or restart coding.
            </p>
          </div>
        );
      }
      return (
        <div className="space-y-2">
          <ApprovePlanButton productId={productId} workspaceId={task.workspace.id} />
          {task.workspace.status === "READY_FOR_REVIEW" || task.workspace.status === "COMPLETED" ? (
            <p className="text-sm text-muted-foreground">
              Approving this plan revision authorises the updated scope. It does not restart coding.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">You can also review the full plan in the Execution plan tab.</p>
          )}
        </div>
      );
    }
    return <p className="text-sm text-muted-foreground">Use the Execution plan tab to review and approve the plan.</p>;
  }
  if (action.kind === "review-code" && task.workspace) {
    const review = task.workspace.codeReview;
    if (task.workspace.commitOffer && review) {
      return (
        <div className="space-y-2">
          <ApprovedCommit
            productId={productId}
            workspaceId={task.workspace.id}
            reviewed={review.approved.length + review.derived.length}
            outOfScope={review.outOfScope.length}
          />
          <p className="text-sm text-muted-foreground">Full review detail stays in the Validation & approval tab.</p>
        </div>
      );
    }
    if (review?.approvable) {
      return (
        <div className="space-y-2">
          <ApproveCodeChangesButton productId={productId} workspaceId={task.workspace.id} />
          <p className="text-sm text-muted-foreground">
            Approving code does not commit, push, or start Independent Verification. Open Validation & approval for the full review.
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {review?.reason ? <p className="text-sm text-amber-950">{review.reason}</p> : null}
        <p className="text-sm text-muted-foreground">Use the Validation & approval tab to review blockers and the next permitted action.</p>
      </div>
    );
  }
  if (action.kind === "recover-workspace") {
    return <p className="text-sm text-muted-foreground">Use the Coding tab to retry, resume, or abandon this workspace.</p>;
  }
  return null;
}

function StatusFact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: ReactNode;
}) {
  return (
    <div className="rounded-xl border px-3 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-stone-900">{tone ?? value}</dd>
    </div>
  );
}

function EmptyDetail({ message }: { message: string }) {
  return <p className="text-sm leading-6 text-muted-foreground">{message}</p>;
}
