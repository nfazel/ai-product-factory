"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { FormMessage, SubmitButton } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import type { PlanView } from "@/modules/plan/view";
import { approveBriefAndDraftAction, draftFeaturesAction } from "@/server/actions/plan";

/** The one place that says what to do about drafting the features, and starts it. */
export function PlanPrepareCard({ plan }: { plan: PlanView }) {
  const router = useRouter();
  const running = plan.draft.state === "RUNNING";
  const [approveState, approve] = useActionState(approveBriefAndDraftAction, idleState);
  const [draftState, draft] = useActionState(draftFeaturesAction, idleState);

  // Follow the drafting while it works; the page reads the real state again each time.
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [running, router]);

  const hidden = <input type="hidden" name="productId" value={plan.productId} />;
  switch (plan.draft.state) {
    case "NEEDS_BRIEF":
      return (
        <section aria-label="Next step" className="space-y-2 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950">
          <h2 className="text-base font-semibold">Start by describing the product</h2>
          <p className="text-sm leading-6">The AI asks a few questions, then writes the brief. When it is ready you approve it here and the features are drafted for you.</p>
          <Link href={`/products/${plan.productId}/discovery`} className="inline-block font-medium text-indigo-900 hover:underline">Continue the interview</Link>
        </section>
      );
    case "BRIEF_READY":
      return (
        <section aria-label="Next step" className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950">
          <h2 className="text-base font-semibold">The brief is ready for you</h2>
          <p className="text-sm leading-6">Read it below. Approving it is the first of your two decisions, and lets the AI draft the features, the design, the work and the rules.</p>
          <form action={approve} className="space-y-2">
            {hidden}
            <SubmitButton pendingLabel="Approving, then drafting">Approve the brief and draft the features</SubmitButton>
            <FormMessage state={approveState} />
          </form>
        </section>
      );
    case "READY":
    case "FAILED":
      return (
        <section aria-label="Next step" className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950">
          <h2 className="text-base font-semibold">{plan.draft.state === "FAILED" ? "Drafting the features stopped" : "The brief is approved"}</h2>
          <p className="text-sm leading-6">{plan.draft.state === "FAILED" ? plan.draft.reason : "The AI drafts the features, with their acceptance criteria, from the approved brief. Nothing is confirmed until you review it."}</p>
          <form action={draft} className="space-y-2">
            {hidden}
            <SubmitButton pendingLabel="Starting">{plan.draft.state === "FAILED" ? "Try again" : "Draft the features"}</SubmitButton>
            <FormMessage state={draftState} />
          </form>
        </section>
      );
    case "RUNNING":
      return (
        <section aria-label="Next step" role="status" className="space-y-1 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
          <h2 className="text-base font-semibold">Drafting the features</h2>
          <p className="text-sm leading-6">This takes a minute or two. You can leave this page; it carries on and shows the features here when they are ready.</p>
        </section>
      );
    case "CANDIDATE":
      return (
        <section aria-label="Next step" role="status" className="space-y-1 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <h2 className="text-base font-semibold">The features were drafted, but cannot be reviewed yet</h2>
          <p className="text-sm leading-6">
            The AI wrote the features and its draft is saved, but the framework currently holds it as a read-only candidate. There is not yet a step that
            lets you review, select and commit a candidate, so the plan cannot go further from here. That step is the next thing to build.
          </p>
        </section>
      );
    case "DRAFTED":
      return (
        <section aria-label="Next step" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <h2 className="text-base font-semibold">The features are drafted</h2>
          <p className="text-sm leading-6">Read them below. Nothing is confirmed yet.</p>
        </section>
      );
  }
}
