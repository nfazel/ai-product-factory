"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import { PLATFORMS, platformSummary, type PlatformId } from "@/modules/discovery/platform";
import { targetPlatformAction } from "@/server/actions/discovery";

/** The person's decision about where the product will be used. It shapes the design, architecture and code that follow. */
export function TargetPlatformPanel({
  productId,
  chosen,
  editable,
}: {
  productId: string;
  chosen: PlatformId[];
  editable: boolean;
}) {
  const [state, action] = useActionState(targetPlatformAction, idleState);
  return (
    <section aria-label="Where will people use it?" className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">Where will people use it?</h2>
      <p className="text-sm text-muted-foreground">
        Your choice shapes the design, the architecture and the code that follow. Currently: <strong>{platformSummary(chosen)}</strong>.
        {chosen.length === 0 ? " Until you choose, the builder assumes a website." : ""}
      </p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="productId" value={productId} />
        <fieldset className="space-y-2" disabled={!editable}>
          <legend className="sr-only">Platforms</legend>
          {PLATFORMS.map((item) => (
            <label key={item.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="platform" value={item.id} defaultChecked={chosen.includes(item.id)} className="mt-1" />
              <span>
                <span className="font-medium">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {chosen.length > 0 && !chosen.includes("WEBSITE") ? (
          <p className="text-xs text-muted-foreground">
            The live preview currently runs websites only. Android and iOS apps are designed and coded, and checked by hand for now.
          </p>
        ) : null}
        <FormMessage state={state} />
        {editable ? <SubmitButton pendingLabel="Saving…">Save choice</SubmitButton> : null}
      </form>
    </section>
  );
}
