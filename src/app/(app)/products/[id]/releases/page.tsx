import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { ShipPanel } from "@/components/release/ship-panel";
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
  const view = await getShipView(id);
  if (!view) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ship"
        title="Release"
        description="An approved product slice becomes a release candidate here. A person approves the release and records the deployment. The factory does not deploy it."
      />
      <ShipPanel productId={id} view={view} />
    </div>
  );
}
