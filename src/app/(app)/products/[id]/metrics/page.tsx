import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { LearnPanel } from "@/components/release/learn-panel";
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
  const view = await getLearnView(id);
  if (!view) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Learn"
        title="Outcomes"
        description="After a recorded deployment, observe whether the product outcome moved. The factory does not invent the measurement."
      />
      <LearnPanel productId={id} view={view} />
    </div>
  );
}
