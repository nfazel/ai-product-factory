import {
  ApprovePlanButton,
  ProposeContractPlanButton,
  RepairPlanCoverageButton,
  RequestPlanChangesForm,
  RevisePlanButton,
  StartApprovedCodingButton,
} from "@/components/build/coding-controls";
import {
  assessPlanConsistency,
  planScopeDelta,
  planVerificationSummary,
  planWorkDelta,
  technicalCompletionCriteria,
} from "@/modules/coding/bootstrap";
import { filesBlockingPlanApproval, filesOutsideContract } from "@/modules/coding/policy";
import { asStrings } from "@/modules/coding/strings";

type PlanRecord = {
  status: string;
  version: number;
  summary: string;
  analysisNote: string;
  filesExpectedToChange: unknown;
  steps: unknown;
  risks: string;
  validationPlan: string;
  changeRequest: string;
  approvedBy: string;
  approvedAt: Date | null;
  createdAt: Date;
  history: unknown;
};

const STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Awaiting approval",
  ESCALATED: "Needs review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  EXECUTING: "Coding in progress",
  COMPLETED: "Completed",
};

function when(value: Date | null) {
  if (!value) return "Not recorded";
  return value.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function previousPlanSteps(history: unknown) {
  if (!Array.isArray(history) || history.length === 0) return [];
  const last = history[history.length - 1];
  if (!last || typeof last !== "object" || !("steps" in last)) return [];
  return asStrings(last.steps);
}

function previousPlanFiles(history: unknown) {
  if (!Array.isArray(history) || history.length === 0) return [];
  const last = history[history.length - 1];
  if (!last || typeof last !== "object" || !("filesExpectedToChange" in last)) return [];
  return asStrings(last.filesExpectedToChange);
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{body || "None recorded"}</p>
    </div>
  );
}

export function ExecutionPlanReview({
  productId,
  workspaceId,
  workspaceStatus,
  plan,
  objective,
  allowedPaths,
  restrictedPaths,
  dependencies,
  architectureConstraints,
  maxFiles,
  trace,
  hasCodeChanges,
  planExecuted,
  contractReady,
  contractMessage,
  stale = false,
  staleReason = "",
  revisedPlanReady = false,
  setupCommands,
  validationCommands,
}: {
  productId: string;
  workspaceId: string;
  workspaceStatus: string;
  plan: PlanRecord;
  objective: string;
  allowedPaths: string[];
  restrictedPaths: string[];
  dependencies: string[];
  architectureConstraints: string;
  maxFiles: number;
  trace: Array<[string, string]>;
  hasCodeChanges: boolean;
  planExecuted: boolean;
  contractReady: boolean;
  contractMessage: string;
  stale?: boolean;
  staleReason?: string;
  revisedPlanReady?: boolean;
  setupCommands: string[];
  validationCommands: { command: string; applicability: string; reason: string }[];
}) {
  const files = asStrings(plan.filesExpectedToChange);
  const steps = asStrings(plan.steps);
  const outsideContract = filesOutsideContract(files, allowedPaths, restrictedPaths);
  const outside = filesBlockingPlanApproval(files, allowedPaths, restrictedPaths);
  const historyCount = Array.isArray(plan.history) ? plan.history.length : 0;
  const previous = previousPlanFiles(plan.history);
  const delta = plan.status === "PROPOSED" && previous.length > 0
    ? planScopeDelta(previous, asStrings(plan.filesExpectedToChange))
    : null;
  const previousSteps = previousPlanSteps(plan.history);
  const workDelta = plan.status === "PROPOSED" && previousSteps.length > 0
    ? planWorkDelta(previousSteps, steps)
    : null;
  const technicalCompletion = technicalCompletionCriteria({
    files,
    validationCommands: [
      ...setupCommands.map((command) => ({ command, applicability: "REQUIRED" })),
      ...validationCommands,
    ],
  });
  const productAcceptance = trace.find(([label]) => label === "Product acceptance criteria" || label === "Acceptance criteria")?.[1] || "Not linked";
  const overLimit = files.length > maxFiles;
  const consistency = assessPlanConsistency({
    files,
    steps,
    validationCommands,
    validationPlan: plan.validationPlan,
  });
  const coverageGaps = consistency.unproducedFiles;
  const needsCoverageRepair = (plan.status === "PROPOSED" || plan.status === "ESCALATED") && coverageGaps.length > 0;
  const awaiting = (plan.status === "PROPOSED" || plan.status === "ESCALATED")
    && outside.length === 0
    && !overLimit
    && contractReady
    && !needsCoverageRepair;
  const canRevise = plan.status === "PROPOSED" || plan.status === "ESCALATED" || (plan.status === "APPROVED" && workspaceStatus === "ACTIVE" && !hasCodeChanges);
  const existingImplementation = workspaceStatus === "READY_FOR_REVIEW" || workspaceStatus === "COMPLETED";
  const canCode = plan.status === "APPROVED" && contractReady && !stale && !existingImplementation && (
    revisedPlanReady
    || ((workspaceStatus === "ACTIVE" || workspaceStatus === "ABANDONED") && (!hasCodeChanges || !planExecuted))
  );
  const contractConflict = !contractReady && (plan.status === "APPROVED" || plan.status === "ESCALATED" || plan.status === "PROPOSED");
  const proposedWithExistingWork = (plan.status === "PROPOSED" || plan.status === "ESCALATED") && existingImplementation;

  return (
    <article className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-indigo-700">EXECUTION PLAN</p>
          <h3 className="text-lg font-semibold">Execution plan</h3>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
          {plan.status === "PROPOSED" && !contractReady ? "Needs revision" : STATUS_LABEL[plan.status] ?? plan.status}
        </span>
      </div>
      {stale ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Needs review. {staleReason} This execution plan stays approved. Coding cannot start until it is reviewed.
        </p>
      ) : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Version</dt>
          <dd className="mt-1 font-medium">{plan.version}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd className="mt-1 font-medium">{STATUS_LABEL[plan.status] ?? plan.status}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Generated</dt>
          <dd className="mt-1 font-medium">{when(plan.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Repository</dt>
          <dd className="mt-1 font-medium">Ready</dd>
        </div>
        {plan.approvedBy ? (
          <div>
            <dt className="text-xs text-muted-foreground">Approved by</dt>
            <dd className="mt-1 font-medium">{plan.approvedBy}</dd>
          </div>
        ) : null}
        {plan.approvedAt ? (
          <div>
            <dt className="text-xs text-muted-foreground">Approved</dt>
            <dd className="mt-1 font-medium">{when(plan.approvedAt)}</dd>
          </div>
        ) : null}
      </dl>
      {historyCount > 0 ? (
        <p className="text-sm text-muted-foreground">Earlier version{historyCount === 1 ? "" : "s"} kept: {historyCount}. Approval of an earlier version does not approve this one.</p>
      ) : null}
      {proposedWithExistingWork ? (
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-800">
          An implementation already exists in this workspace. Approving this plan revision authorises the updated scope. It does not restart coding or discard earlier evidence.
        </p>
      ) : null}
      {delta && (delta.added.length > 0 || delta.removed.length > 0) ? (
        <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">Scope change from the previous version</p>
          {delta.added.length > 0 ? <p className="mt-2">Added: {delta.added.join(", ")}</p> : null}
          {delta.removed.length > 0 ? <p className="mt-1">Removed: {delta.removed.join(", ")}</p> : null}
          {delta.unchanged.length > 0 ? <p className="mt-1">Unchanged: {delta.unchanged.join(", ")}</p> : null}
          {workDelta && workDelta.added.length > 0 ? <p className="mt-2">Added work: {workDelta.added.join(" ")}</p> : null}
          <p className="mt-2">This version is not approved. Approving it is a separate action and does not start coding.</p>
        </div>
      ) : null}
      {plan.changeRequest ? <Section title="Requested change" body={plan.changeRequest} /> : null}
      {plan.status === "ESCALATED" && outside.length === 0 && !overLimit ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Execution plan approval is required before Coding can start. The files named here are inside the coding rules. Opening this plan does not approve it.
        </p>
      ) : null}
      {overLimit ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          This plan names more than {maxFiles} files, so it cannot be approved. Request changes before coding.
        </p>
      ) : null}
      {contractConflict ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p>{contractMessage}</p>
          {plan.status === "APPROVED" ? (
            <div className="mt-3">
              <ProposeContractPlanButton productId={productId} workspaceId={workspaceId} />
            </div>
          ) : null}
        </div>
      ) : null}
      {setupCommands.length > 0 || validationCommands.length > 0 ? (
        <Section
          title="Authorised commands"
          body={[
            setupCommands.length ? `Setup:\n${setupCommands.join("\n")}` : "",
            validationCommands.length
              ? `Validation:\n${validationCommands.map((item) => `${item.command} — ${item.applicability}${item.reason ? `. ${item.reason}` : ""}`).join("\n")}`
              : "",
          ].filter(Boolean).join("\n\n")}
        />
      ) : null}
      {outside.length > 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          These files are outside the coding rules, so this plan cannot be approved: {outside.join(", ")}. Request changes that stay inside {allowedPaths.join(", ") || "the allowed paths"}.
        </p>
      ) : null}
      {outside.length === 0 && outsideContract.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Tooling metadata named in this plan ({outsideContract.join(", ")}) does not block approval. Approving authorises that scope for review.
        </p>
      ) : null}
      {needsCoverageRepair ? (
        <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">Work-item coverage is incomplete</p>
          <p className="mt-1">
            These authorised files have no covering work item: {coverageGaps.join(", ")}. Repair proposes a new plan version with the missing work items. It does not approve the plan or restart coding.
          </p>
          <div className="mt-3">
            <RepairPlanCoverageButton productId={productId} workspaceId={workspaceId} />
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Objective" body={objective} />
        <Section title="Implementation approach" body={plan.summary} />
        <Section title="Scope" body={files.length ? `Included files:\n${files.join("\n")}` : "No files were named at planning time."} />
        <Section title="Out of scope" body={[restrictedPaths.length ? `Restricted: ${restrictedPaths.join(", ")}` : "", "Files not listed below are outside this plan."].filter(Boolean).join("\n")} />
        <Section title="Components and areas" body={architectureConstraints} />
        <Section title="Work items" body={steps.map((step, index) => `${index + 1}. ${step}`).join("\n")} />
        <Section title="Files expected to change" body={files.join("\n")} />
        <Section title="Assumptions and analysis" body={plan.analysisNote} />
        <Section title="Risks" body={plan.risks} />
        <Section title="Technical completion criteria" body={technicalCompletion.join("\n")} />
        <Section title="Product acceptance criteria" body={productAcceptance} />
        <Section title="Test and verification plan" body={planVerificationSummary(validationCommands)} />
        <Section title="Dependencies" body={dependencies.join(", ")} />
      </div>
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Requirements traceability</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {trace.map(([label, value]) => (
            <li key={label}>
              <span className="text-muted-foreground">{label}: </span>
              {value}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        {awaiting ? (
          <div className="space-y-2">
            <ApprovePlanButton productId={productId} workspaceId={workspaceId} />
            {proposedWithExistingWork ? (
              <p className="text-sm text-muted-foreground">Approval keeps the existing implementation and does not start a new coding run.</p>
            ) : null}
          </div>
        ) : null}
        {canCode ? <StartApprovedCodingButton productId={productId} workspaceId={workspaceId} /> : null}
        {plan.status === "CHANGES_REQUESTED" ? <RevisePlanButton productId={productId} workspaceId={workspaceId} /> : null}
      </div>
      {(plan.status === "PROPOSED" || plan.status === "ESCALATED") && !awaiting ? (
        <p className="text-sm text-muted-foreground">
          Approve Execution Plan stays closed until the blockers above are cleared.
        </p>
      ) : null}
      {canRevise ? <RequestPlanChangesForm productId={productId} workspaceId={workspaceId} /> : null}
    </article>
  );
}
