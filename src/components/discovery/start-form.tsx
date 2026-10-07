"use client";

import { useActionState } from "react";

import {
  FormMessage,
  SubmitButton,
  TextAreaField,
} from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import { startDiscoveryAction } from "@/server/actions/discovery";

export function StartDiscoveryForm({ productId }: { productId: string }) {
  const [state, action] = useActionState(startDiscoveryAction, idleState);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="productId" value={productId} />
      <TextAreaField
        label="Initial product idea"
        name="initialIdea"
        required
        error={state.fieldErrors?.initialIdea}
        hint="A sentence or two is enough. The agent will help you find the problem before a solution."
        placeholder="Claims handlers still rebuild the story of a claim from email, phone notes, and a separate policy system."
      />
      <TextAreaField
        label="Optional context"
        name="optionalContext"
        error={state.fieldErrors?.optionalContext}
        hint="Market, current process, or why this is being considered now."
      />
      <div className="grid gap-5 md:grid-cols-2">
        <TextAreaField
          label="Known constraints"
          name="knownConstraints"
          error={state.fieldErrors?.knownConstraints}
          hint="Time, budget, regulation, data, or organisation."
        />
        <TextAreaField
          label="Known users"
          name="knownUsers"
          error={state.fieldErrors?.knownUsers}
        />
      </div>
      <TextAreaField
        label="Desired business outcome"
        name="desiredOutcome"
        error={state.fieldErrors?.desiredOutcome}
        hint="An outcome, not a feature list."
      />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Starting discovery…">Start Discovery</SubmitButton>
    </form>
  );
}
