"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { FormMessage, SubmitButton, TextAreaField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  approveVerificationAction,
  integratedAction,
  recoverVerificationAction,
  manualResultAction,
  notApplicableAction,
  rejectVerificationAction,
  requestTestingAction,
  rerunFailedAction,
  retryVerificationAction,
  startNewVerificationAction,
  startVerificationAction,
} from "@/server/actions/verification";

function AttemptProgress({ label }: { label: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p role="status" className="text-sm leading-6">
      {label}
    </p>
  );
}

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
      <SubmitButton pendingLabel="Starting Independent Verification">Start Independent Verification</SubmitButton>
      <AttemptProgress label="Independent Verification is running for this task." />
      <FormMessage state={state} />
    </form>
  );
}

export function RetryVerificationButton({ productId, taskId }: { productId: string; taskId: string }) {
  const [state, action] = useActionState(retryVerificationAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} taskId={taskId} />
      <SubmitButton pendingLabel="Starting a new verification attempt">Retry Independent Verification</SubmitButton>
      <p className="text-sm text-muted-foreground">
        This starts a new verification attempt for the same approved commit. It does not rerun coding, publish, or merge.
      </p>
      <AttemptProgress label="A new verification attempt is running. The approved commit is unchanged." />
      <FormMessage state={state} />
    </form>
  );
}

/**
 * Explicit, human-only request for a fresh attempt after an inconclusive result, or after a result awaiting approval.
 * Nothing starts until the person submits this form. The server applies the same policy again before it runs.
 */
export function StartNewVerificationButton({ productId, taskId }: { productId: string; taskId: string }) {
  const [state, action] = useActionState(startNewVerificationAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} taskId={taskId} />
      <SubmitButton pendingLabel="Starting a new verification attempt">Start New Verification Attempt</SubmitButton>
      <p className="text-sm text-muted-foreground">
        Starting a new attempt preserves the previous results and creates a separate verification record.
      </p>
      <AttemptProgress label="A new verification attempt is running. The previous attempt is kept in History." />
      <FormMessage state={state} />
    </form>
  );
}

/**
 * Explicit, human-only recovery for an attempt that stopped without finishing. It releases what the attempt left
 * behind and marks it failed. It never starts a new attempt.
 */
export function RecoverVerificationButton({ productId, sessionId }: { productId: string; sessionId: string }) {
  const [state, action] = useActionState(recoverVerificationAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden productId={productId} sessionId={sessionId} />
      <SubmitButton pendingLabel="Recovering the interrupted attempt">Recover Interrupted Attempt</SubmitButton>
      <p className="text-sm text-muted-foreground">
        This releases the temporary database, directory and processes the stopped attempt recorded, and marks it failed. It does not start a new attempt, and earlier records stay in History.
      </p>
      <FormMessage state={state} />
    </form>
  );
}

export function VerificationReview({
  productId,
  sessionId,
  verdict,
}: {
  productId: string;
  sessionId: string;
  verdict: string | null;
}) {
  const [approveState, approve] = useActionState(approveVerificationAction, idleState);
  const [requestState, request] = useActionState(requestTestingAction, idleState);
  const [rejectState, reject] = useActionState(rejectVerificationAction, idleState);
  const [rerunState, rerun] = useActionState(rerunFailedAction, idleState);
  const passing = verdict === "PASS" || verdict === "PASS_WITH_CONCERNS";
  const failed = verdict === "FAIL";
  const review = verdict === "INCONCLUSIVE";
  if (!passing && !failed && !review) return null;
  return (
    <div className="space-y-3">
      {passing ? (
        <form action={approve} className="space-y-2">
          <Hidden productId={productId} sessionId={sessionId} />
          <SubmitButton pendingLabel="Approving">Approve Verification</SubmitButton>
          <FormMessage state={approveState} />
        </form>
      ) : null}
      {failed ? (
        <form action={rerun} className="space-y-2">
          <Hidden productId={productId} sessionId={sessionId} />
          <SubmitButton pendingLabel="Re-running">Re-run failed tests</SubmitButton>
          <p className="text-sm text-muted-foreground">
            Runs the failed tests again inside this attempt. It does not start a new attempt, and the earlier results are kept.
          </p>
          <FormMessage state={rerunState} />
        </form>
      ) : null}
      {failed || review ? (
        <form action={request} className="space-y-2">
          <Hidden productId={productId} sessionId={sessionId} />
          <TextAreaField label="What still needs testing" name="note" id={`${sessionId}-more-testing`} />
          <SubmitButton pendingLabel="Saving">{failed ? "Review Findings / Request Changes" : "Record Request For More Testing"}</SubmitButton>
          {review ? (
            <p className="text-sm text-muted-foreground">
              This only records your request. No verification runs. To run a new attempt, use Start New Verification Attempt.
            </p>
          ) : null}
          <FormMessage state={requestState} />
        </form>
      ) : null}
      {failed ? (
        <form action={reject} className="space-y-2">
          <Hidden productId={productId} sessionId={sessionId} />
          <TextAreaField label="Why this verification is rejected" name="note" id={`${sessionId}-reject`} />
          <SubmitButton pendingLabel="Rejecting">Reject Verification</SubmitButton>
          <FormMessage state={rejectState} />
        </form>
      ) : null}
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
      <SubmitButton pendingLabel="Planning">Record integrated verification plan</SubmitButton>
      <p className="text-sm text-muted-foreground">
        This records a plan for the product slice. It does not run end-to-end checks, approve task verification, or complete product verification.
      </p>
      <FormMessage state={state} />
    </form>
  );
}
