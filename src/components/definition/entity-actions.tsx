"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton, TextAreaField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  answerQuestionAction,
  approveSliceAction,
  confirmCapabilityAction,
  confirmNfrAction,
  confirmOutcomeAction,
  rejectCapabilityAction,
  rejectNfrAction,
} from "@/server/actions/requirements";

const ACTIONS = {
  outcome: confirmOutcomeAction,
  capability: confirmCapabilityAction,
  "reject-capability": rejectCapabilityAction,
  slice: approveSliceAction,
  nfr: confirmNfrAction,
  "reject-nfr": rejectNfrAction,
} as const;

export function EntityAction({
  productId,
  entityId,
  kind,
  label,
}: {
  productId: string;
  entityId: string;
  kind: keyof typeof ACTIONS;
  label: string;
}) {
  const [state, action] = useActionState(ACTIONS[kind], idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="entityId" value={entityId} />
      <SubmitButton pendingLabel="Saving…" variant={label === "Reject" ? "outline" : "secondary"}>
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AnswerForm({ productId, entityId }: { productId: string; entityId: string }) {
  const [state, action] = useActionState(answerQuestionAction, idleState);
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="entityId" value={entityId} />
      <TextAreaField label="Answer" name="answer" error={state.fieldErrors?.answer} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…" variant="outline">
        Save answer
      </SubmitButton>
    </form>
  );
}
