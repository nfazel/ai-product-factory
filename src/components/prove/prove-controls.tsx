"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton, TextAreaField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  approveVerificationAction,
  integratedAction,
  manualResultAction,
  notApplicableAction,
  rejectVerificationAction,
  requestTestingAction,
  rerunFailedAction,
  startVerificationAction,
} from "@/server/actions/verification";

function Hidden({ productId, taskId, sessionId }: { productId: string; taskId?: string; sessionId?: string }) {
  return (
    <>
      <input type="hidden" name="productId" value={productId} />
      {taskId ? <input type="hidden" name="taskId" value={taskId} /> : null}
      {sessionId ? <input type="hidden" name="sessionId" value={sessionId} /> : null}
    </>
  );
}

export function StartVerificationButton({ productId, taskId }: { productId: string; taskId: string }) {
  const [state, action] = useActionState(startVerificationAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} taskId={taskId} />
      <SubmitButton pendingLabel="Verifying">Start verification</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function VerificationReview({ productId, sessionId }: { productId: string; sessionId: string }) {
  const [approveState, approve] = useActionState(approveVerificationAction, idleState);
  const [requestState, request] = useActionState(requestTestingAction, idleState);
  const [rejectState, reject] = useActionState(rejectVerificationAction, idleState);
  const [rerunState, rerun] = useActionState(rerunFailedAction, idleState);
  return (
    <div className="space-y-3">
      <form action={approve} className="space-y-2">
        <Hidden productId={productId} sessionId={sessionId} />
        <SubmitButton pendingLabel="Approving">Approve Verification</SubmitButton>
        <FormMessage state={approveState} />
      </form>
      <form action={rerun} className="space-y-2">
        <Hidden productId={productId} sessionId={sessionId} />
        <SubmitButton pendingLabel="Re-running">Re-run failed tests</SubmitButton>
        <FormMessage state={rerunState} />
      </form>
      <form action={request} className="space-y-2">
        <Hidden productId={productId} sessionId={sessionId} />
        <TextAreaField label="What still needs testing" name="note" id={`${sessionId}-more-testing`} />
        <SubmitButton pendingLabel="Saving">Request More Testing</SubmitButton>
        <FormMessage state={requestState} />
      </form>
      <form action={reject} className="space-y-2">
        <Hidden productId={productId} sessionId={sessionId} />
        <TextAreaField label="Why this verification is rejected" name="note" id={`${sessionId}-reject`} />
        <SubmitButton pendingLabel="Rejecting">Reject Verification</SubmitButton>
        <FormMessage state={rejectState} />
      </form>
    </div>
  );
}

export function ManualResultForm({
  productId,
  sessionId,
  testCaseId,
}: {
  productId: string;
  sessionId: string;
  testCaseId: string;
}) {
  const [state, action] = useActionState(manualResultAction, idleState);
  return (
    <form action={action} className="mt-2 space-y-2">
      <Hidden productId={productId} sessionId={sessionId} />
      <input type="hidden" name="testCaseId" value={testCaseId} />
      <label className="block text-sm">
        Manual result
        <select name="result" className="mt-1 w-full rounded-md border bg-background px-2 py-1.5" defaultValue="PASS">
          <option value="PASS">PASS</option>
          <option value="FAIL">FAIL</option>
          <option value="BLOCKED">BLOCKED</option>
        </select>
      </label>
      <TextAreaField label="Comment" name="comment" id={`${testCaseId}-comment`} />
      <SubmitButton pendingLabel="Saving">Mark Manual Test Result</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function NotApplicableButton({
  productId,
  sessionId,
  criterionId,
}: {
  productId: string;
  sessionId: string;
  criterionId: string;
}) {
  const [state, action] = useActionState(notApplicableAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} sessionId={sessionId} />
      <input type="hidden" name="criterionId" value={criterionId} />
      <SubmitButton pendingLabel="Saving">Mark not applicable</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function IntegratedButton({ productId, sliceId }: { productId: string; sliceId: string }) {
  const [state, action] = useActionState(integratedAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="sliceId" value={sliceId} />
      <SubmitButton pendingLabel="Planning">Create integrated verification plan</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
