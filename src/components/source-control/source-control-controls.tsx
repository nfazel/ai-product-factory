"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  analyseFeedbackAction,
  createPullRequestAction,
  initializeRemoteMainAction,
  publishBranchAction,
  recordCiExceptionAction,
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

export function PublishBranchButton({
  productId,
  taskId,
  destination,
  branch,
  commitSha,
}: {
  productId: string;
  taskId: string;
  destination: string;
  branch: string;
  commitSha: string;
}) {
  const [state, action] = useActionState(publishBranchAction, idleState);
  return (
    <form id={`publish-branch-${taskId}`} action={action} className="w-full space-y-3 rounded-xl border p-4">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="taskId" value={taskId} />
      <p className="text-sm font-medium">Confirm publication</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Destination repository</dt>
          <dd className="font-medium">{destination || "Not configured"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Source branch</dt>
          <dd className="font-medium">{branch}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Approved commit</dt>
          <dd className="font-medium">{commitSha}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        This pushes only that branch. It does not create a pull request, merge, or deploy.
      </p>
      <label className="flex items-start gap-2 text-sm leading-6">
        <input type="checkbox" name="confirmPublication" value="yes" required className="mt-1" />
        <span>Publish this approved branch to {destination || "the configured GitHub repository"}.</span>
      </label>
      <SubmitButton pendingLabel="Publishing">Publish Branch</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function InitializeRemoteMainForm({
  productId,
  repository,
  baselineSha,
  defaultBranch,
}: {
  productId: string;
  repository: string;
  baselineSha: string;
  defaultBranch: string;
}) {
  const [state, action] = useActionState(initializeRemoteMainAction, idleState);
  return (
    <form id="initialize-remote-main" action={action} className="mt-4 space-y-3 rounded-xl border p-4">
      <input type="hidden" name="productId" value={productId} />
      <p className="text-sm font-medium">Initialize Remote Main Branch</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Repository</dt>
          <dd className="font-medium">{repository}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Baseline commit</dt>
          <dd className="font-medium">{baselineSha}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">GitHub default branch</dt>
          <dd className="font-medium">{defaultBranch || "unset"}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        This publishes only that existing commit as main. It does not overwrite an existing main branch, change the published task branch, change GitHub repository settings, create a pull request, merge, or deploy.
      </p>
      <label className="flex items-start gap-2 text-sm leading-6">
        <input type="checkbox" name="confirmRemoteMain" value="yes" required className="mt-1" />
        <span>Initialize the remote main branch from this baseline commit.</span>
      </label>
      <SubmitButton pendingLabel="Initializing">Initialize Remote Main Branch</SubmitButton>
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
      <p className="text-sm text-muted-foreground">Refresh reads GitHub evidence. It does not approve the pull request or merge it.</p>
      <SubmitButton pendingLabel="Refreshing">Refresh Pull Request</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function CiExceptionForm({ productId }: { productId: string }) {
  const [state, action] = useActionState(recordCiExceptionAction, idleState);
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <TextAreaField label="Why CI is not required" name="rationale" id={`${productId}-ci-exception`} required minLength={10} />
      <label className="flex items-start gap-2 text-sm leading-6">
        <input type="checkbox" name="confirmCiException" value="yes" required className="mt-1" />
        <span>Record a human exception. This does not create a workflow, approve the pull request, or merge it. The CI state stays not configured.</span>
      </label>
      <SubmitButton pendingLabel="Recording">Record CI exception</SubmitButton>
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
