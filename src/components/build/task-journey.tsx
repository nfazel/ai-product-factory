import type { ReactNode } from "react";

import type { Journey, JourneyState } from "@/modules/build/task-journey";

const BADGE: Record<JourneyState, string> = {
  done: "bg-emerald-600 text-white",
  current: "bg-indigo-700 text-white ring-4 ring-indigo-100",
  working: "bg-sky-600 text-white ring-4 ring-sky-100",
  attention: "bg-amber-500 text-white ring-4 ring-amber-100",
  upcoming: "bg-stone-200 text-stone-600",
};

const STATE_WORD: Record<JourneyState, string> = {
  done: "done",
  current: "your turn",
  working: "working",
  attention: "needs attention",
  upcoming: "later",
};

function Heading({ journey }: { journey: Journey }) {
  const kind = journey.finished ? "All done" : journey.current?.state === "working" ? "In progress" : journey.current?.state === "attention" ? "Needs attention" : "Your next step";
  return <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{kind}</p>;
}

/**
 * One answer to "what do I do now?": the steps of this task with the current one marked, and a single card saying what to do or
 * what is happening. The button for the step is passed in, so it sits right under the sentence that explains it.
 */
export function TaskJourneyCard({ journey, blockers = [], children }: { journey: Journey; blockers?: string[]; children?: ReactNode }) {
  const tone = journey.finished ? "border-emerald-200 bg-emerald-50" : journey.current?.state === "attention" ? "border-amber-300 bg-amber-50" : journey.current?.state === "working" ? "border-sky-200 bg-sky-50" : "border-indigo-200 bg-indigo-50";
  return (
    <section aria-label="Next step" className="space-y-4">
      <div className={`rounded-2xl border p-4 sm:p-5 ${tone}`}>
        <Heading journey={journey} />
        <p className="mt-1 text-lg font-semibold tracking-tight text-stone-900">{journey.headline}</p>
        {journey.detail ? <p className="mt-1 text-sm leading-6 text-stone-700">{journey.detail}</p> : null}
        {blockers.length > 0 && journey.yourTurn ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">
            {blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        {journey.yourTurn && children ? <div className="mt-4">{children}</div> : null}
      </div>
      <ol aria-label="Steps for this task" className="flex flex-wrap gap-x-2 gap-y-3">
        {journey.steps.map((step, index) => (
          <li key={step.id} className="flex items-center gap-2" aria-current={step.state === "current" || step.state === "working" || step.state === "attention" ? "step" : undefined}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${BADGE[step.state]}`}>{step.state === "done" ? "✓" : index + 1}</span>
            <span className={`text-sm ${step.state === "upcoming" ? "text-stone-500" : "font-medium text-stone-900"}`}>
              {step.label}
              <span className="sr-only"> ({STATE_WORD[step.state]})</span>
            </span>
            {index < journey.steps.length - 1 ? <span aria-hidden className="text-stone-300">›</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
