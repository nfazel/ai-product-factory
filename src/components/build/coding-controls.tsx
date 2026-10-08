"use client";

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
  resumeCodingAction,
  retryCodingAction,
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
      <SubmitButton pendingLabel="Starting">Start Coding Task</SubmitButton>
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

export function ReviewActions({ productId, workspaceId }: { productId: string; workspaceId: string }) {
  const [requestState, requestAction] = useActionState(requestChangesAction, idleState);
  const [approveState, approveAction] = useActionState(approveCodeAction, idleState);
  const [rejectState, rejectAction] = useActionState(rejectCodeAction, idleState);
  const [commitState, commitAction] = useActionState(commitCodingAction, idleState);
  return (
    <div className="space-y-4">
      <form action={approveAction} className="space-y-2">
        <Hidden productId={productId} workspaceId={workspaceId} />
        <SubmitButton pendingLabel="Approving">Approve Code Changes</SubmitButton>
        <FormMessage state={approveState} />
      </form>
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
      <form action={commitAction} className="space-y-2">
        <Hidden productId={productId} workspaceId={workspaceId} />
        <SubmitButton variant="outline" pendingLabel="Committing">
          Create Commit
        </SubmitButton>
        <FormMessage state={commitState} />
      </form>
    </div>
  );
}

export function WorkspaceRecovery({
  productId,
  workspaceId,
  stale,
}: {
  productId: string;
  workspaceId: string;
  stale: boolean;
}) {
  const [retryState, retryAction] = useActionState(retryCodingAction, idleState);
  const [resumeState, resumeAction] = useActionState(resumeCodingAction, idleState);
  const [abandonState, abandonAction] = useActionState(abandonWorkspaceAction, idleState);
  const [contractState, contractAction] = useActionState(regenerateContractAction, idleState);
  return (
    <div className="flex flex-wrap gap-3">
      <form action={retryAction}>
        <Hidden productId={productId} workspaceId={workspaceId} />
        <SubmitButton variant="secondary" pendingLabel="Retrying">
          Retry
        </SubmitButton>
        <FormMessage state={retryState} />
      </form>
      <form action={resumeAction}>
        <Hidden productId={productId} workspaceId={workspaceId} />
        <SubmitButton variant="secondary" pendingLabel="Resuming">
          Resume
        </SubmitButton>
        <FormMessage state={resumeState} />
      </form>
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
