import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageSkeleton } from "@/components/feedback/states";
import { ProvePanel } from "@/components/prove/prove-panel";
import { SourceControlPanel } from "@/components/source-control/source-control-panel";
import { getSourceControlView } from "@/modules/source-control/service";
import { getProveView } from "@/modules/verification/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Prove" };
export const maxDuration = 60;

export default function TestingPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Prove params={params} />
    </Suspense>
  );
}

async function Prove({ params }: { params: Promise<{ id: string }> }) {
  await markDynamic();
  const { id } = await params;
  const [prove, sourceControl] = await Promise.all([getProveView(id), getSourceControlView(id)]);
  if (!prove || !sourceControl) notFound();
  return (
    <div className="space-y-6">
      <ProvePanel productId={id} prove={prove} />
      <SourceControlPanel productId={id} view={sourceControl} />
    </div>
  );
}
