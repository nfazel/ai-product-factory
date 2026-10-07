"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton, TextAreaField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  approveBriefAction,
  continueDiscoveryAction,
  moveToDefineAction,
  reviewDiscoveryAction,
  retryDiscoveryAction,
} from "@/server/actions/discovery";

function ProductForm({
  productId,
  action,
  pendingLabel,
  label,
  variant = "default",
}: {
  productId: string;
  action: typeof approveBriefAction;
  pendingLabel: string;
  label: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel={pendingLabel} variant={variant}>
        {label}
      </SubmitButton>
    </form>
  );
}

export function DiscoveryComposer({
  productId,
  configured,
  canRetry,
  approved,
  canApprove,
}: {
  productId: string;
  configured: boolean;
  canRetry: boolean;
  approved: boolean;
  canApprove: boolean;
}) {
  const [state, action] = useActionState(continueDiscoveryAction, idleState);

  return (
    <div className="space-y-4 border-t pt-4">
      {approved ? (
        <p className="text-sm leading-6 text-muted-foreground">
          Another turn after approval opens a new brief version. The approved version stays in history.
        </p>
      ) : null}
      {configured ? (
        <form action={action} className="space-y-3">
          <input type="hidden" name="productId" value={productId} />
          <TextAreaField
            label="Your reply"
            name="message"
            error={state.fieldErrors?.message}
            hint="Answer the questions that matter, or correct something the brief got wrong."
            placeholder="The people who feel this first are claims handlers, not customers."
          />
          <FormMessage state={state} />
          <SubmitButton pendingLabel="Working with the brief…">
            Send to discovery
          </SubmitButton>
        </form>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          Replies stay closed until OPENAI_API_KEY is set on the server. Nothing is invented in its place.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {configured ? (
          <ProductForm
            productId={productId}
            action={reviewDiscoveryAction}
            pendingLabel="Reviewing…"
            label="Request AI review"
            variant="outline"
          />
        ) : null}
        {canRetry ? (
          <ProductForm
            productId={productId}
            action={retryDiscoveryAction}
            pendingLabel="Retrying…"
            label="Retry last turn"
            variant="secondary"
          />
        ) : null}
        {canApprove ? (
          <ProductForm
            productId={productId}
            action={approveBriefAction}
            pendingLabel="Approving…"
            label="Approve Product Brief"
            variant="outline"
          />
        ) : null}
      </div>
    </div>
  );
}

export function ApproveBriefButton({ productId }: { productId: string }) {
  return (
    <ProductForm
      productId={productId}
      action={approveBriefAction}
      pendingLabel="Approving…"
      label="Approve Product Brief"
    />
  );
}

export function MoveToDefineButton({ productId }: { productId: string }) {
  return (
    <ProductForm
      productId={productId}
      action={moveToDefineAction}
      pendingLabel="Moving…"
      label="Move to Define"
    />
  );
}
