import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { AgentRunEvidenceList } from "@/components/ai/run-evidence";
import { PageSkeleton } from "@/components/feedback/states";
import { EvidencePanel, EvidenceSummary, NextActionPanel } from "@/components/guidance/guidance-ui";
import { EditProductForm } from "@/components/products/product-forms";
import { STAGE_META } from "@/domain/constants";
import { STAGE_PROGRESS_LABEL } from "@/modules/guidance/types";
import { getProductGuidance } from "@/modules/guidance/service";
import { listAgentRuns } from "@/modules/agent/service";
import { getProductOverview } from "@/modules/product/overview";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Overview" };

export default function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: Promise<{ id: string }> }) {
  await markDynamic();
  const { id } = await params;
  const [overview, guidance, runs] = await Promise.all([
    getProductOverview(id),
    getProductGuidance(id),
    listAgentRuns({ productId: id }),
  ]);
  if (!overview || !guidance) notFound();
  const current = guidance.stages.find((stage) => stage.stage === guidance.stage);

  return (
    <div className="space-y-6">
      {guidance.sample ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          Sample product. Demo records stay labelled and cannot satisfy a real release or deployment gate.
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border bg-card p-5 lg:col-span-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Current stage</p>
          <h2 className="mt-1 text-2xl font-semibold">{STAGE_META[guidance.stage].label}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Status: {current?.label ?? STAGE_PROGRESS_LABEL.IN_PROGRESS}</p>
          <p className="mt-3 text-sm leading-6">
            {overview.product.problemStatement ||
              (overview.product.startMode === "EXISTING_REQUIREMENTS"
                ? "The problem is not stated in the supplied requirements yet. It will be asked for, not invented."
                : "The problem has not been recorded.")}
          </p>
        </article>
        <article className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Current outcome</h2>
          {guidance.outcome ? (
            <div className="mt-3 space-y-2 text-sm leading-6">
              <p className="font-medium">{guidance.outcome.title}</p>
              <p>Status: {guidance.outcome.status === "ACHIEVED" ? "Achieved" : "Not achieved"}</p>
              <p>Success measure: {guidance.outcome.measure || "Not recorded"}</p>
              <p>Target: {guidance.outcome.target || "Not recorded"}</p>
              <p>Latest evidence: {guidance.outcome.latest || "None recorded"}</p>
              <p className="text-muted-foreground">Deployed does not mean the outcome is achieved.</p>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              No outcome yet. The outcome is why the product is being built, and it is confirmed during Define.
            </p>
          )}
        </article>
      </section>

      <NextActionPanel guidance={guidance} />

      {guidance.risk ? (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Important risk</h2>
          <p className="mt-2 text-sm leading-6">{guidance.risk}</p>
        </section>
      ) : null}

      <EvidenceSummary items={guidance.evidence.items} summary={guidance.evidence.summary} ready={guidance.evidence.ready} />

      <EvidencePanel title="Product record and history">
        <div>
          <h3 className="text-sm font-semibold">What you can explore</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Explore holds the Product Brief.</li>
            <li>Define holds the outcome, the First Slice, and the backlog.</li>
            <li>Build holds design, engineering review, and code.</li>
            <li>Prove holds the independent check and publication. Merge stays in GitHub.</li>
            <li>Ship records a release. It does not deploy.</li>
            <li>Learn records outcome evidence.</li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Agent runs</h3>
          <div className="mt-2">
            <AgentRunEvidenceList runs={runs.slice(0, 8)} />
          </div>
        </div>
        <ActivityFeed items={overview.activity} />
        <p className="text-sm">
          <Link className="text-primary hover:underline" href={`/products/${id}/activity`}>
            Stage history
          </Link>
        </p>
        <EditProductForm product={overview.product} />
      </EvidencePanel>
    </div>
  );
}
