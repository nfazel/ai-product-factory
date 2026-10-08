import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { NextActionPanel } from "@/components/guidance/guidance-ui";
import { LearnPanel } from "@/components/release/learn-panel";
import { getProductGuidance } from "@/modules/guidance/service";
import { getLearnView } from "@/modules/release/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Learn" };

export default function MetricsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Learn params={params} />
    </Suspense>
  );
}

async function Learn({ params }: { params: Promise<{ id: string }> }) {
  await markDynamic();
  const { id } = await params;
  const [view, guidance] = await Promise.all([getLearnView(id), getProductGuidance(id)]);
  if (!view || !guidance) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Learn"
        title="Did the outcome move?"
        description="Deployment does not mean the outcome was achieved. Record what was observed. AI Product Builder does not invent the measurement."
      />
      <p className="rounded-2xl border bg-card p-4 text-sm leading-6">Deployed does not mean outcome achieved.</p>
      {guidance.action?.stage === "LEARN" || guidance.stage === "LEARN" ? <NextActionPanel guidance={guidance} /> : null}
      <LearnPanel productId={id} view={view} />
    </div>
  );
}
