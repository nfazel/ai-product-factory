"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage, SubmitButton, TextAreaField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  abandonWorkspaceAction,
  approveCodeAction,
  approvePlanAction,
  approveTaskAction,
  commitCodingAction,
  regenerateContractAction,
  rejectCodeAction,
  requestChangesAction,
  requestPlanChangesAction,
  recordRepairResultAction,
  restoreUnapprovedChangeAction,
  proposeOutOfScopePlanAction,
  repairCodingAction,
  resumeCodingAction,
  retryCodingAction,
  proposeContractPlanAction,
  revisePlanAction,
  startCodingAction,
} from "@/server/actions/coding";

function Hidden({ productId, taskId, workspaceId }: { productId: string; taskId?: string; workspaceId?: string }) {
  return (
    <>
      <input type="hidden" name="productId" value={productId} />
      {taskId ? <input type="hidden" name="taskId" value={taskId} /> : null}
      {workspaceId ? <input type="hidden" name="workspaceId" value={workspaceId} /> : null}
    </>
  );
}

export function ApproveTaskButton({ productId, taskId }: { productId: string; taskId: string }) {
  const [state, action] = useActionState(approveTaskAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} taskId={taskId} />
      <SubmitButton pendingLabel="Approving">Approve implementation task</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function StartCodingButton({ productId, taskId }: { productId: string; taskId: string }) {
  const [state, action] = useActionState(startCodingAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} taskId={taskId} />
      <SubmitButton pendingLabel="Generating">Generate Execution Plan</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ApprovePlanButton({ productId, workspaceId }: { productId: string; workspaceId: string }) {
  const [state, action] = useActionState(approvePlanAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} workspaceId={workspaceId} />
      <SubmitButton pendingLabel="Approving">Approve Execution Plan</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function RequestPlanChangesForm({ productId, workspaceId }: { productId: string; workspaceId: string }) {
  const [state, action] = useActionState(requestPlanChangesAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <Hidden productId={productId} workspaceId={workspaceId} />
      <TextAreaField
        label="What should change"
        name="changeRequest"
        required
        hint="At least 12 characters. This does not approve the plan."
        error={state.fieldErrors?.changeRequest}
      />
      <SubmitButton variant="secondary" pendingLabel="Requesting">Request Changes</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ProposeContractPlanButton({ productId, workspaceId }: { productId: string; workspaceId: string }) {
  const [state, action] = useActionState(proposeContractPlanAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} workspaceId={workspaceId} />
      <SubmitButton pendingLabel="Revising">Revise Execution Plan</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function RevisePlanButton({ productId, workspaceId }: { productId: string; workspaceId: string }) {
  const [state, action] = useActionState(revisePlanAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} workspaceId={workspaceId} />
      <SubmitButton pendingLabel="Revising">Revise Execution Plan</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function RecordRepairResultButton({ productId, workspaceId }: { productId: string; workspaceId: string }) {
  const [state, action] = useActionState(recordRepairResultAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} workspaceId={workspaceId} />
      <SubmitButton pendingLabel="Recording">Record repair result</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function RepairImplementationButton({ productId, workspaceId }: { productId: string; workspaceId: string }) {
  const [state, action] = useActionState(repairCodingAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} workspaceId={workspaceId} />
      <SubmitButton pendingLabel="Repairing">Repair Implementation</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function StartApprovedCodingButton({
  productId,
  workspaceId,
  label = "Start Coding",
  pendingLabel = "Starting",
  retry = false,
}: {
  productId: string;
  workspaceId: string;
  label?: string;
  pendingLabel?: string;
  retry?: boolean;
}) {
  const [state, action] = useActionState(retry ? retryCodingAction : resumeCodingAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} workspaceId={workspaceId} />
      <SubmitButton pendingLabel={pendingLabel}>{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ScopeResolution({
  productId,
  workspaceId,
  files,
  planVersion,
}: {
  productId: string;
  workspaceId: string;
  planVersion: number | null;
  files: { path: string; verb: string }[];
}) {
  return (
    <div className="space-y-3">
      {files.map((file) => (
        <ScopeFileActions key={file.path} productId={productId} workspaceId={workspaceId} path={file.path} verb={file.verb} planVersion={planVersion} />
      ))}
    </div>
  );
}

function ScopeFileActions({
  productId,
  workspaceId,
  path,
  verb,
  planVersion,
}: {
  productId: string;
  workspaceId: string;
  path: string;
  verb: string;
  planVersion: number | null;
}) {
  const [restoreState, restoreAction] = useActionState(restoreUnapprovedChangeAction, idleState);
  const [reviseState, reviseAction] = useActionState(proposeOutOfScopePlanAction, idleState);
  return (
    <div className="space-y-2 rounded-lg border px-3 py-3">
      <p className="text-sm">{path} — {verb} — not authorised by Execution Plan v{planVersion ?? "—"}</p>
      <form action={restoreAction}>
        <Hidden productId={productId} workspaceId={workspaceId} />
        <input type="hidden" name="path" value={path} />
        <SubmitButton variant="secondary" pendingLabel="Restoring">Restore Unapproved Change</SubmitButton>
        <FormMessage state={restoreState} />
      </form>
      <form action={reviseAction}>
        <Hidden productId={productId} workspaceId={workspaceId} />
        <input type="hidden" name="path" value={path} />
        <SubmitButton variant="outline" pendingLabel="Proposing">Revise Execution Plan</SubmitButton>
        <FormMessage state={reviseState} />
      </form>
      <p className="text-sm text-muted-foreground">Revise Execution Plan proposes a new version for this file. The current version stays in history and is not edited. The new version is not approved.</p>
    </div>
  );
}

export function ApprovedCommit({
  productId,
  workspaceId,
  reviewed,
  outOfScope,
  committedSha,
}: {
  productId: string;
  workspaceId: string;
  reviewed: number;
  outOfScope: number;
  committedSha?: string;
}) {
  const [commitState, commitAction] = useActionState(commitCodingAction, idleState);
  if (committedSha) {
    return (
      <div className="space-y-2 rounded-lg border px-3 py-3 text-sm">
        <p className="font-medium">Approved source snapshot committed.</p>
        <p>Commit: {committedSha.slice(0, 12)}</p>
        <p>The implementation is now ready for Independent Verification.</p>
        <Link href={`/products/${productId}/testing#check`} className="inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          Start Independent Verification
        </Link>
      </div>
    );
  }
  return (
    <form action={commitAction} className="space-y-2 rounded-lg border px-3 py-3 text-sm">
      <Hidden productId={productId} workspaceId={workspaceId} />
      <p className="font-medium">Create Approved Commit</p>
      <p>This will create a local, immutable commit containing the code changes you approved.</p>
      <p>{countLabel(reviewed, "reviewed file")}</p>
      <p>{countLabel(outOfScope, "out-of-scope file")}</p>
      <p>Generated build files excluded</p>
      <p>This does not publish, create a pull request, or merge code.</p>
      <SubmitButton pendingLabel="Committing">Create Approved Commit</SubmitButton>
      <FormMessage state={commitState} />
    </form>
  );
}

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function ReviewActions({ productId, workspaceId, allowApprove = true, hideApprove = false }: { productId: string; workspaceId: string; allowApprove?: boolean; hideApprove?: boolean }) {
  const [requestState, requestAction] = useActionState(requestChangesAction, idleState);
  const [approveState, approveAction] = useActionState(approveCodeAction, idleState);
  const [rejectState, rejectAction] = useActionState(rejectCodeAction, idleState);
  return (
    <div className="space-y-4">
      {allowApprove ? (
        <form action={approveAction} className="space-y-2">
          <Hidden productId={productId} workspaceId={workspaceId} />
          <SubmitButton pendingLabel="Approving">Approve Code Changes</SubmitButton>
          <FormMessage state={approveState} />
        </form>
      ) : hideApprove ? null : (
        <p className="text-sm text-muted-foreground">Approve Code Changes is not available for this snapshot.</p>
      )}
      <form action={requestAction} className="space-y-3">
        <Hidden productId={productId} workspaceId={workspaceId} />
        <TextAreaField label="Feedback" name="feedback" required />
        <TextAreaField label="Required changes" name="requiredChanges" required />
        <TextAreaField label="Affected files" name="affectedFiles" hint="One workspace-relative path per line." />
        <SubmitButton variant="secondary" pendingLabel="Sending">
          Request Changes
        </SubmitButton>
        <FormMessage state={requestState} />
      </form>
      <form action={rejectAction} className="space-y-3">
        <Hidden productId={productId} workspaceId={workspaceId} />
        <TextAreaField label="Rejection" name="feedback" required />
        <SubmitButton variant="destructive" pendingLabel="Rejecting">
          Reject Changes
        </SubmitButton>
        <FormMessage state={rejectState} />
      </form>
    </div>
  );
}

export function WorkspaceRecovery({
  productId,
  workspaceId,
  stale,
  allowResume,
  allowRetry,
}: {
  productId: string;
  workspaceId: string;
  stale: boolean;
  allowResume: boolean;
  allowRetry: boolean;
}) {
  const [retryState, retryAction] = useActionState(retryCodingAction, idleState);
  const [resumeState, resumeAction] = useActionState(resumeCodingAction, idleState);
  const [abandonState, abandonAction] = useActionState(abandonWorkspaceAction, idleState);
  const [contractState, contractAction] = useActionState(regenerateContractAction, idleState);
  return (
    <div className="flex flex-wrap gap-3">
      {allowRetry ? (
        <form action={retryAction}>
          <Hidden productId={productId} workspaceId={workspaceId} />
          <SubmitButton variant="secondary" pendingLabel="Retrying">
            Retry
          </SubmitButton>
          <FormMessage state={retryState} />
        </form>
      ) : null}
      {allowResume ? (
        <>
          <form action={resumeAction}>
            <Hidden productId={productId} workspaceId={workspaceId} />
            <SubmitButton variant="secondary" pendingLabel="Resuming">
              Resume
            </SubmitButton>
            <FormMessage state={resumeState} />
          </form>
        </>
      ) : null}
      {stale ? (
        <form action={contractAction}>
          <Hidden productId={productId} workspaceId={workspaceId} />
          <SubmitButton variant="outline" pendingLabel="Regenerating">
            Regenerate Contract
          </SubmitButton>
          <FormMessage state={contractState} />
        </form>
      ) : null}
      <form action={abandonAction}>
        <Hidden productId={productId} workspaceId={workspaceId} />
        <SubmitButton variant="destructive" pendingLabel="Abandoning">
          Abandon Workspace
        </SubmitButton>
        <FormMessage state={abandonState} />
      </form>
    </div>
  );
}
