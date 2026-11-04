"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { FormMessage, SubmitButton } from "@/components/forms/fields";
import { idleState, type ActionState } from "@/lib/action-state";
import type { PlanView } from "@/modules/plan/view";
import { approveBriefAndDraftAction, confirmFeaturesAction, draftFeaturesAction } from "@/server/actions/plan";

/** The one place that says what to do about drafting the features, and starts it. */
export function PlanPrepareCard({ plan }: { plan: PlanView }) {
  const router = useRouter();
  const running = plan.draft.state === "RUNNING" || plan.technical.state === "RUNNING";
  const [approveState, approve] = useActionState(approveBriefAndDraftAction, idleState);
  const [draftState, draft] = useActionState(draftFeaturesAction, idleState);
  const [confirmState, confirm] = useActionState(confirmFeaturesAction, idleState);

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
    case "CANDIDATE":
    case "FAILED":
      return (
        <section aria-label="Next step" className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950">
          <h2 className="text-base font-semibold">{plan.draft.state === "FAILED" ? "Drafting the features stopped" : plan.draft.state === "CANDIDATE" ? "The features are drafted" : "The brief is approved"}</h2>
          <p className="text-sm leading-6">
            {plan.draft.state === "FAILED"
              ? plan.draft.reason
              : plan.draft.state === "CANDIDATE"
                ? "The AI wrote the features. One more step makes them reviewable. Nothing is confirmed until you review it."
                : "The AI drafts the features, with their acceptance criteria, from the approved brief. Nothing is confirmed until you review it."}
          </p>
          <form action={draft} className="space-y-2">
            {hidden}
            <SubmitButton pendingLabel="Starting">{plan.draft.state === "FAILED" ? "Try again" : plan.draft.state === "CANDIDATE" ? "Carry on" : "Draft the features"}</SubmitButton>
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
    case "DRAFTED":
      return <TechnicalCard plan={plan} confirm={confirm} confirmState={confirmState} hidden={hidden} />;
  }
}

/** After the features: the one pause to confirm them, then the progress of drafting the design, the work and the rules. */
function TechnicalCard({ plan, confirm, confirmState, hidden }: { plan: PlanView; confirm: (formData: FormData) => void; confirmState: ActionState; hidden: React.ReactNode }) {
  const { state, reason, steps } = plan.technical;
  if (state === "CONFIRM" || state === "PARTIAL" || state === "FAILED") {
    return (
      <section aria-label="Next step" className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950">
        <h2 className="text-base font-semibold">{state === "FAILED" ? "Drafting the technical plan stopped" : state === "PARTIAL" ? "The technical plan is partly drafted" : "Are these the right features?"}</h2>
        <p className="text-sm leading-6">
          {state === "FAILED"
            ? reason
            : state === "PARTIAL"
              ? "Some of the design, the work and the rules are drafted. The AI can carry on from there."
              : "Read the features and their acceptance criteria below. If they look right, the AI drafts the design, the work and the rules. This is a checkpoint, not an approval. You can send any part back later."}
        </p>
        <form action={confirm} className="space-y-2">
          {hidden}
          <SubmitButton pendingLabel="Starting">{state === "FAILED" ? "Try again" : state === "PARTIAL" ? "Carry on" : "These look right, draft the rest"}</SubmitButton>
          <FormMessage state={confirmState} />
        </form>
      </section>
    );
  }
  if (state === "RUNNING") {
    return (
      <section aria-label="Next step" role="status" className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
        <h2 className="text-base font-semibold">Drafting the design, the work and the rules</h2>
        <StepList steps={steps} />
        <p className="text-sm leading-6">This takes a few minutes. You can leave this page; it carries on and shows each part here as it is ready.</p>
      </section>
    );
  }
  return (
    <section aria-label="Next step" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
      <h2 className="text-base font-semibold">{state === "DRAFTED" ? "The whole plan is drafted" : "The features are drafted"}</h2>
      <p className="text-sm leading-6">{state === "DRAFTED" ? "Read each part below. The label on each says whether it is approved." : "Read them below. Nothing is confirmed yet."}</p>
    </section>
  );
}

function StepList({ steps }: { steps: PlanView["technical"]["steps"] }) {
  return (
    <ol className="space-y-1 text-sm">
      {steps.map((step) => (
        <li key={step.label}>
          {step.done ? "Done: " : step.current ? "Drafting now: " : "Waiting: "}
          {step.label}
        </li>
      ))}
    </ol>
  );
}
