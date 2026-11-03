"use client";

import { usePathname } from "next/navigation";

import { NextActionLink } from "@/components/guidance/guidance-ui";
import { nextStepView } from "@/modules/guidance/next-step-view";
import type { BlockerView, NextAction } from "@/modules/guidance/types";

const TONE = {
  action: "border-indigo-200 bg-indigo-50 text-indigo-950",
  blocked: "border-amber-300 bg-amber-50 text-amber-950",
  quiet: "border-stone-200 bg-stone-50 text-stone-700",
} as const;

/** Presentational: exported so it can be rendered and tested without a router. */
export function NextStepBarContent({ productId, action, blocker }: { productId: string; action: NextAction | null; blocker: BlockerView | null }) {
  const view = nextStepView(action, blocker, productId);
  return (
    <section aria-label="Next step" data-product={productId} className={`rounded-2xl border px-4 py-3 sm:px-5 ${TONE[view.tone]}`}>
      <p className="text-xs font-semibold tracking-[0.14em] uppercase">{view.kicker}</p>
      <p className="mt-1 text-base font-semibold tracking-tight">{view.title}</p>
      {view.body ? <p className="mt-1 text-sm leading-6">{view.body}</p> : null}
      {view.meta ? <p className="mt-1 text-xs opacity-80">{view.meta}</p> : null}
      {view.href ? <div className="mt-3"><NextActionLink href={view.href} label={view.linkLabel} /></div> : null}
    </section>
  );
}

/** Shown on every product page except the Overview, which already carries the full next-action panel. */
export function NextStepBar(props: { productId: string; action: NextAction | null; blocker: BlockerView | null }) {
  const pathname = usePathname();
  if (pathname === `/products/${props.productId}`) return null;
  return <NextStepBarContent {...props} />;
}
