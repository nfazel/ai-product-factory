import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageSkeleton } from "@/components/feedback/states";
import { NextActionPanel } from "@/components/guidance/guidance-ui";
import { ProvePanel } from "@/components/prove/prove-panel";
import { SourceControlPanel } from "@/components/source-control/source-control-panel";
import { getProductGuidance } from "@/modules/guidance/service";
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
  const [prove, sourceControl, guidance] = await Promise.all([getProveView(id), getSourceControlView(id), getProductGuidance(id)]);
  if (!prove || !sourceControl || !guidance) notFound();
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Prove</p>
        <h2 className="text-xl font-semibold">Check, then publish</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Tasks can be checked as they are completed. The First Slice is proven together before a release. AI Product Builder does not merge the pull request. A person merges it in GitHub.
        </p>
      </header>
      {guidance.action?.stage === "PROVE" || guidance.stage === "PROVE" ? <NextActionPanel guidance={guidance} /> : null}
      <section id="check" tabIndex={-1} className="scroll-mt-20 space-y-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
        <h2 className="text-lg font-semibold">Check</h2>
        <ProvePanel productId={id} prove={prove} />
      </section>
      <section id="publish" tabIndex={-1} className="scroll-mt-20 space-y-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
        <h2 className="text-lg font-semibold">Publish</h2>
        <p className="text-sm text-muted-foreground">Publishing opens a pull request. Merging stays in GitHub. Refresh reads the result back.</p>
        <SourceControlPanel productId={id} view={sourceControl} />
      </section>
    </div>
  );
}
