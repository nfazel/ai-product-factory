"use client";

import { useActionState } from "react";

import { OperatorCredentialField } from "@/components/build/operator-confirmation";
import { FormMessage, SubmitButton } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import type { PlanView } from "@/modules/plan/view";
import { approvePlanAction, approvePlanAndStartAction } from "@/server/actions/plan";

const SECTION_TITLE: Record<string, string> = { brief: "What this is", features: "What it will do", architecture: "How it will be built", work: "The work", rules: "The rules" };

/** The second of the person's decisions: one signature over everything on the page. */
export function PlanApproveCard({ plan }: { plan: PlanView }) {
  const [approveState, approve] = useActionState(approvePlanAction, idleState);
  const [startState, start] = useActionState(approvePlanAndStartAction, idleState);
  if (!plan.planApproval.offered) return null;
  const { blockers } = plan.planApproval;
  const hidden = <input type="hidden" name="productId" value={plan.productId} />;

  return (
    <section aria-label="Approve the plan" className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">Approve the plan</h2>
        <p className="mt-1 text-sm leading-6">
          You have read the whole plan. Approving it once records, in order, your approval of the features and first slice, the design, the
          work, the engineering review and the coding rules, and moves the product to Build. The AI approves nothing.
        </p>
      </div>

      {blockers.length > 0 ? (
        <div role="status" className="text-sm leading-6">
          <p className="font-medium">It cannot be approved yet:</p>
          <ul className="list-disc pl-5">
            {blockers.map((blocker) => (
              <li key={`${blocker.section}:${blocker.reason}`}>
                <a href={`#${blocker.section}`} className="font-medium underline">{SECTION_TITLE[blocker.section]}</a>: {blocker.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <form action={approve} className="space-y-2">
            {hidden}
            <SubmitButton pendingLabel="Approving">Approve plan</SubmitButton>
            <p className="text-xs leading-5">Building starts when you choose to.</p>
            <FormMessage state={approveState} />
          </form>
          <form action={start} className="space-y-2">
            {hidden}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="understood" value="yes" className="mt-1" />
              <span>I understand. Give the Builder authority for 7 days, LOW risk tasks only, with 2 retries per step.</span>
            </label>
            <OperatorCredentialField />
            <SubmitButton pendingLabel="Approving and starting">Approve and start building</SubmitButton>
            <FormMessage state={startState} />
          </form>
        </div>
      )}
    </section>
  );
}
