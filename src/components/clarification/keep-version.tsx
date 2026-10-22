"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import { isClarificationReview, type ClarificationReviewTarget } from "@/modules/clarification/materiality";
import { keepClarificationVersionAction } from "@/server/actions/clarification";

export function ClarificationHold({
  productId,
  target,
  reason,
}: {
  productId: string;
  target: ClarificationReviewTarget;
  reason: string;
}) {
  const [state, action] = useActionState(keepClarificationVersionAction, idleState);
  if (!isClarificationReview(reason)) return null;
  return (
    <form action={action} className="mt-3 space-y-2 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="target" value={target} />
      <p>Needs review. {reason}</p>
      <p>The saved version stays as it was. Nothing is regenerated until you ask.</p>
      <SubmitButton pendingLabel="Saving…" variant="outline">
        Keep this version
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
