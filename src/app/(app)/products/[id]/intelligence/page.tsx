import { Suspense } from "react";
import { notFound } from "next/navigation";

import { AnalyticsControls } from "@/components/analytics/analytics-controls";
import { IntelligenceView } from "@/components/analytics/intelligence-view";
import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { getProductIntelligence } from "@/modules/analytics/service";
import { parseWindow } from "@/modules/analytics/time";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Intelligence" };

export default function IntelligencePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ window?: string; view?: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Intelligence params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Intelligence({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ window?: string; view?: string }>;
}) {
  await markDynamic();
  const { id } = await params;
  const query = await searchParams;
  const window = parseWindow(query.window);
  const mode = query.view === "engineering" ? "engineering" : "leadership";
  const view = await getProductIntelligence(id, window);
  if (!view) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intelligence"
        title={mode === "leadership" ? "How this product is moving" : "Delivery evidence"}
        description={
          mode === "leadership"
            ? "Risk, release, and outcome come first. Every number comes from a recorded event. Missing evidence stays missing."
            : "Task cycle time, agent runs, checks, revisions, verification, pull requests, defects, and escalations. The same records as the leadership view, with the engineering detail."
        }
      />
      <AnalyticsControls basePath={`/products/${id}/intelligence`} window={window} view={mode} />
      <IntelligenceView view={view} mode={mode} />
    </div>
  );
}
