import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageSkeleton } from "@/components/feedback/states";
import { CollapsedGroup } from "@/components/build/collapsed-group";
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
  const publishOpen = /publish|pull-request|create-pr|remote-main/i.test(guidance.action?.key ?? "");
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Prove</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Check each task independently, then publish it to GitHub. A person merges the pull request in GitHub; nothing is deployed from here.
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
      <CollapsedGroup id="publish" title="Publish to GitHub" summary={publishSummary(sourceControl.tasks)} open={publishOpen}>
        <p className="text-sm text-muted-foreground">
          Publish Branch pushes the approved task branch. Create Pull Request is the next step. A person reviews and merges in GitHub.
        </p>
        <SourceControlPanel productId={id} view={sourceControl} />
      </CollapsedGroup>
    </div>
  );
}

function publishSummary(tasks: { publication: { remoteCommitSha?: string | null }; pullRequest: { state: string } | null }[]) {
  const published = tasks.filter((task) => task.publication.remoteCommitSha).length;
  const merged = tasks.filter((task) => task.pullRequest?.state === "MERGED").length;
  return `${published} published · ${merged} merged`;
}
