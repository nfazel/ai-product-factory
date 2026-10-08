"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton, TextField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  analyseFeedbackAction,
  createPullRequestAction,
  publishBranchAction,
  refreshPullRequestAction,
  sendToCodingAction,
  updateBranchAction,
  validateConnectionAction,
} from "@/server/actions/source-control";

export function ValidateConnectionButton({ productId }: { productId?: string }) {
  const [state, action] = useActionState(validateConnectionAction, idleState);
  return (
    <form action={action} className="space-y-2">
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}
      <SubmitButton pendingLabel="Validating">Validate Connection</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function PublishBranchButton({ productId, taskId }: { productId: string; taskId: string }) {
  const [state, action] = useActionState(publishBranchAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="taskId" value={taskId} />
      <SubmitButton pendingLabel="Publishing">Publish Branch</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function CreatePullRequestForm({ productId, taskId }: { productId: string; taskId: string }) {
  const [state, action] = useActionState(createPullRequestAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="taskId" value={taskId} />
      <TextField label="Pull request title" name="title" id={`${taskId}-pr-title`} />
      <SubmitButton pendingLabel="Creating">Create Pull Request</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function RefreshPullRequestButton({ productId, pullRequestId }: { productId: string; pullRequestId: string }) {
  const [state, action] = useActionState(refreshPullRequestAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="pullRequestId" value={pullRequestId} />
      <SubmitButton pendingLabel="Refreshing">Refresh Pull Request</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AnalyseFeedbackButton({ productId, pullRequestId }: { productId: string; pullRequestId: string }) {
  const [state, action] = useActionState(analyseFeedbackAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="pullRequestId" value={pullRequestId} />
      <SubmitButton pendingLabel="Analysing">Analyse Review Feedback</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function SendToCodingButton({ productId, commentId }: { productId: string; commentId: string }) {
  const [state, action] = useActionState(sendToCodingAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="commentId" value={commentId} />
      <SubmitButton pendingLabel="Recording">Send to Coding Agent</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function UpdateBranchButton({ productId, taskId }: { productId: string; taskId: string }) {
  const [state, action] = useActionState(updateBranchAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="taskId" value={taskId} />
      <SubmitButton pendingLabel="Updating">Update Published Branch</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
