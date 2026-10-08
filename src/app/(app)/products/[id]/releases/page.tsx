import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { EvidenceSummary, NextActionPanel } from "@/components/guidance/guidance-ui";
import { ShipPanel } from "@/components/release/ship-panel";
import { getProductGuidance } from "@/modules/guidance/service";
import { getShipView } from "@/modules/release/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Ship" };

export default function ReleasesPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Releases params={params} />
    </Suspense>
  );
}

async function Releases({ params }: { params: Promise<{ id: string }> }) {
  await markDynamic();
  const { id } = await params;
  const [view, guidance] = await Promise.all([getShipView(id), getProductGuidance(id)]);
  if (!view || !guidance) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ship"
        title="Release"
        description="A person approves the release and records the deployment. AI Product Builder does not deploy to production."
      />
      {guidance.action?.stage === "SHIP" || guidance.stage === "SHIP" ? <NextActionPanel guidance={guidance} /> : null}
      <EvidenceSummary items={guidance.evidence.items} summary={guidance.evidence.summary} ready={guidance.evidence.ready} />
      {guidance.risk ? <p className="rounded-2xl border bg-card p-4 text-sm leading-6">Important risk: {guidance.risk}</p> : null}
      <ShipPanel productId={id} view={view} />
    </div>
  );
}
