import { Suspense } from "react";

import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { DesignWorkspace } from "@/components/design/design-workspace";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "UI/UX" };
export const maxDuration = 300;

export default function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Design params={params} />
    </Suspense>
  );
}

async function Design({ params }: { params: Promise<{ id: string }> }) {
  await markDynamic();
  const { id } = await params;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="UI/UX"
        title="See and shape the screens before anything is built"
        description="The AI proposes the screens and how people move between them, as simple pictures you can click through. Ask for changes in plain words. Nothing is coded until you approve."
      />
      <DesignWorkspace productId={id} />
    </div>
  );
}
