"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  approveDefinitionAction,
  continueDefinitionAction,
  generateDefinitionAction,
  moveToBuildAction,
  requestDefinitionReviewAction,
  reviewDefinitionAction,
} from "@/server/actions/requirements";

function GateButton({
  productId,
  action,
  label,
  pendingLabel,
  variant = "outline",
}: {
  productId: string;
  action: typeof generateDefinitionAction;
  label: string;
  pendingLabel: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <SubmitButton pendingLabel={pendingLabel} variant={variant}>
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DefinitionControls({
  productId,
  showReview,
  approved,
}: {
  productId: string;
  showReview: boolean;
  approved: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <GateButton
          productId={productId}
          action={generateDefinitionAction}
          label="Generate Product Definition"
          pendingLabel="Generating definition…"
        />
        <GateButton
          productId={productId}
          action={requestDefinitionReviewAction}
          label="Ask AI to Review"
          pendingLabel="Reviewing…"
          variant="outline"
        />
        <GateButton
          productId={productId}
          action={reviewDefinitionAction}
          label="Prepare for Approval"
          pendingLabel="Saving…"
          variant="secondary"
        />
        {!approved ? (
          <GateButton
            productId={productId}
            action={continueDefinitionAction}
            label="Continue Definition"
            pendingLabel="Saving…"
            variant="outline"
          />
        ) : null}
      </div>
      {showReview && !approved ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-sm font-medium text-indigo-950">Product Definition Ready for Review</p>
          <p className="mt-1 text-sm leading-6 text-indigo-900">
            A person can approve the definition. Approval does not move the product stage.
          </p>
          <div className="mt-3">
            <GateButton
              productId={productId}
              action={approveDefinitionAction}
              label="Approve Product Definition"
              pendingLabel="Approving…"
            />
          </div>
        </div>
      ) : null}
      {approved ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-950">
            Product Definition approved. Product is ready for architecture and delivery planning.
          </p>
          <div className="mt-3">
            <GateButton
              productId={productId}
              action={moveToBuildAction}
              label="Move to Build"
              pendingLabel="Moving…"
              variant="outline"
            />
          </div>
        </div>
      ) : (
        <GateButton
          productId={productId}
          action={moveToBuildAction}
          label="Move to Build"
          pendingLabel="Checking gates…"
          variant="outline"
        />
      )}
    </div>
  );
}
