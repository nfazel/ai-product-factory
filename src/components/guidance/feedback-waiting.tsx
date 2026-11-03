import Link from "next/link";

import type { FeedbackWaitingItem } from "@/modules/rework/waiting";

const SHOWN = 3;

/** Feedback that is waiting for a person, with where to continue. Renders nothing when there is none. */
export function FeedbackWaitingList({ items }: { items: FeedbackWaitingItem[] }) {
  if (!items.length) return null;
  const shown = items.slice(0, SHOWN);
  return (
    <section aria-label="Feedback waiting for you" className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 sm:px-5">
      <p className="text-xs font-semibold tracking-[0.14em] text-stone-600 uppercase">Feedback waiting for you</p>
      <ul className="mt-2 space-y-3">
        {shown.map((item) => (
          <li key={item.feedbackId} className="text-sm leading-6">
            <p className="font-medium text-stone-900">
              “{item.text}” <span className="font-normal text-stone-600">· {item.feature}</span>
            </p>
            <p className="text-stone-700">{item.sentence}</p>
            <Link href={item.href} className="text-sm font-medium text-indigo-800 hover:underline">
              {item.step === "BUILD_TASK" || item.step === "AUTHORISE_TASK" ? "Open the task" : "Open the feedback in Build"}
            </Link>
          </li>
        ))}
      </ul>
      {items.length > SHOWN ? <p className="mt-2 text-xs text-stone-600">And {items.length - SHOWN} more.</p> : null}
    </section>
  );
}
