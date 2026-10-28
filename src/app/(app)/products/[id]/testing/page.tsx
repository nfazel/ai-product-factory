import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageSkeleton } from "@/components/feedback/states";
import { NextActionPanel } from "@/components/guidance/guidance-ui";
import { IntegratedPlanDetails, ProveOverview } from "@/components/prove/prove-overview";
import { SourceControlPanel } from "@/components/source-control/source-control-panel";
import { parseProveFilter, proveOverviewSummary } from "@/modules/prove/task-status";
import { getProductGuidance } from "@/modules/guidance/service";
import { revalidateProductRepositoryAccess } from "@/modules/source-control/github-account";
import { getSourceControlView } from "@/modules/source-control/service";
import { getProveView } from "@/modules/verification/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Prove" };
export const maxDuration = 60;

export default function TestingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Prove params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Prove({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  await markDynamic();
  const { id } = await params;
  const { filter: filterParam } = await searchParams;
  await revalidateProductRepositoryAccess(id);
  const [prove, sourceControl, loadedGuidance] = await Promise.all([getProveView(id), getSourceControlView(id), getProductGuidance(id)]);
  if (!prove || !sourceControl || !loadedGuidance) notFound();
  const summary = proveOverviewSummary(prove.awaiting, prove.sessions);
  const filter = parseProveFilter(filterParam, summary.rows);
  const guidance = sourceControl.bootstrap.status === "offer" && loadedGuidance.action?.key === "create-pr" && loadedGuidance.action
    ? {
        ...loadedGuidance,
        action: {
          ...loadedGuidance.action,
          key: "initialize-remote-main",
          label: "Initialize Remote Main Branch",
          why: sourceControl.bootstrap.message,
          execution: "confirm" as const,
        },
      }
    : sourceControl.bootstrap.status === "other-default" && loadedGuidance.action?.key === "create-pr" && loadedGuidance.action
      ? {
          ...loadedGuidance,
          action: {
            ...loadedGuidance.action,
            why: sourceControl.bootstrap.message,
            execution: "confirm" as const,
          },
        }
      : loadedGuidance;
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Prove · Overview</p>
        <h2 className="text-xl font-semibold">Verify tasks, then publish</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Open a task to see its verification workspace. AI Product Builder does not merge the pull request. A person merges it in GitHub.
        </p>
      </header>
      {guidance.action?.stage === "PROVE" || guidance.stage === "PROVE" ? <NextActionPanel guidance={guidance} /> : null}
      <section id="check" tabIndex={-1} className="scroll-mt-20 space-y-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
        <ProveOverview
          productId={id}
          summary={summary}
          filter={filter}
          readinessLabel={prove.readiness.label}
        />
        <IntegratedPlanDetails prove={prove} productId={id} />
      </section>
      <section id="publish" tabIndex={-1} className="scroll-mt-20 space-y-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
        <h2 className="text-lg font-semibold">Publish</h2>
        <p className="text-sm text-muted-foreground">
          Publish Branch pushes the approved task branch. Create Pull Request is the next step. A person reviews and merges in GitHub. Nothing is deployed from here.
        </p>
        <SourceControlPanel productId={id} view={sourceControl} />
      </section>
    </div>
  );
}
