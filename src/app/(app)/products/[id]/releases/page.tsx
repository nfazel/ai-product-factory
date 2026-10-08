import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { getSourceControlView } from "@/modules/source-control/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Releases" };

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
  const view = await getSourceControlView(id);
  if (!view) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ship"
        title="Releases"
        description="Release preparation waits for a person. Deployment is not implemented."
      />
      <section className="rounded-2xl border bg-card p-5">
        <p className="text-xs font-medium tracking-wide text-indigo-700">RELEASE CANDIDATE</p>
        <h2 className="mt-1 text-lg font-semibold">{view.release.label}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {view.release.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
