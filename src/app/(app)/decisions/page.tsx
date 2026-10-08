import { Suspense } from "react";
import Link from "next/link";

import { EmptyState, PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { STAGE_META } from "@/domain/constants";
import { formatRelative } from "@/lib/format";
import { listPendingDecisions } from "@/modules/guidance/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Decisions" };

export default function DecisionsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Decisions />
    </Suspense>
  );
}

async function Decisions() {
  await markDynamic();
  const decisions = await listPendingDecisions();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Decisions"
        title="Waiting for a person"
        description="AI Product Builder lists the real decisions the current products are waiting on. AI can draft. It cannot approve."
      />
      {decisions.length === 0 ? (
        <EmptyState
          title="No decision is waiting"
          description="When a brief, definition, design, code change, check, or release needs a person, it appears here. Open a product to see the next action."
          action={
            <Link href="/products" className="text-sm font-medium text-primary hover:underline">
              View products
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {decisions.map((item) => (
            <li key={`${item.productId}-${item.action.key}`}>
              <Link href={item.action.href} className="block rounded-2xl border bg-card p-4 hover:border-primary/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">{item.productName}{item.sample ? " · Sample" : ""}</p>
                  <p className="text-xs text-muted-foreground">{STAGE_META[item.action.stage].label}</p>
                </div>
                <h2 className="mt-1 text-base font-semibold">{item.action.label}</h2>
                <p className="mt-2 text-sm leading-6">{item.action.why}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.action.role}
                  {item.action.waitingSince ? ` · ${formatRelative(item.action.waitingSince)}` : ""}
                </p>
                {item.blocker ? <p className="mt-2 text-sm text-amber-900">Blocked: {item.blocker.what}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
