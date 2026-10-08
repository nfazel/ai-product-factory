import { Suspense } from "react";
import Link from "next/link";

import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { ProductStatusBadge, StageBadge } from "@/components/status/badges";
import { Button } from "@/components/ui/button";
import { STAGE_META } from "@/domain/constants";
import { formatRelative } from "@/lib/format";
import { getPortfolioIntelligence } from "@/modules/analytics/service";
import { parseWindow } from "@/modules/analytics/time";
import { listGuidance, listPendingDecisions } from "@/modules/guidance/service";
import { getDashboard } from "@/modules/dashboard/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Home" };

const POSITIONING = "AI Product Builder helps teams take a product idea through discovery, definition, engineering, independent verification, release and learning, while keeping material decisions under human control.";

export default function DashboardPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DashboardContent({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  await markDynamic();
  const window = parseWindow((await searchParams).window);
  const [dashboard, guidance, decisions, portfolio] = await Promise.all([
    getDashboard(),
    listGuidance(),
    listPendingDecisions(),
    getPortfolioIntelligence(window),
  ]);
  const blocked = guidance.filter((item) => item.stages.some((stage) => stage.stage === item.stage && stage.status === "BLOCKED") || item.blocker);
  const flowReady = portfolio.metrics.some((metric) => metric.quality !== "INSUFFICIENT" && (metric.sampleSize ?? 0) > 0 && (metric.key.includes("lead") || metric.key.includes("cycle") || metric.key.includes("frequency") || metric.key.includes("failure")));
  const outcomePending = guidance.filter((item) => (item.stage === "SHIP" || item.stage === "LEARN") && item.outcome && item.outcome.status !== "ACHIEVED");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Home"
        title="AI Product Builder"
        description="From idea to outcome — AI-native product development, end to end."
        actions={
          <Button asChild size="lg">
            <Link href="/products/new">New product</Link>
          </Button>
        }
      />
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{POSITIONING}</p>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Decisions waiting</h2>
          <Link href="/decisions" className="text-sm text-primary hover:underline">All decisions</Link>
        </div>
        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No product is waiting on a person.</p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {decisions.slice(0, 5).map((item) => (
              <li key={`${item.productId}-${item.action.key}`}>
                <Link href={item.action.href} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                  <span>
                    <span className="block text-sm font-medium">{item.action.label}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{item.productName} · {STAGE_META[item.action.stage].label}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{item.action.role}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Blocked products</h2>
        {blocked.length === 0 ? (
          <p className="text-sm text-muted-foreground">No product is blocked.</p>
        ) : (
          <ul className="space-y-2">
            {blocked.map((item) => (
              <li key={item.productId} className="rounded-2xl border bg-card p-4">
                <Link href={`/products/${item.productId}`} className="text-sm font-medium hover:underline">{item.name}</Link>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.blocker?.what ?? "This stage was reached before its gate was complete."}</p>
                <p className="mt-1 text-sm">{item.blocker?.why ?? item.action?.why}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">Release</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            A release is approved by a person. Deployment is recorded afterwards. AI Product Builder does not deploy.
          </p>
          <p className="mt-3 text-sm">Products in Ship or Learn: {guidance.filter((item) => item.stage === "SHIP" || item.stage === "LEARN").length}</p>
        </article>
        <article className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">Outcomes</h2>
          <p className="mt-2 text-sm leading-6">
            Achieved: {guidance.filter((item) => item.outcome?.status === "ACHIEVED").length}. Awaiting evidence: {guidance.filter((item) => item.outcome && item.outcome.status !== "ACHIEVED" && !item.outcome.latest).length}.
          </p>
          {outcomePending.length > 0 ? <p className="mt-2 text-sm text-muted-foreground">Some released work still has an outcome that is not achieved. That is a learning signal.</p> : null}
        </article>
      </section>

      {flowReady ? (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">Flow</h2>
          <p className="mt-2 text-sm text-muted-foreground">Delivery history is available for this period. Open Intelligence on a product for the evidence behind each number.</p>
          <Link className="mt-3 inline-flex text-sm text-primary hover:underline" href={`/api/intelligence/export?format=csv&window=${window}`}>Export metrics</Link>
        </section>
      ) : (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">Flow</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            There is not enough delivery history to summarise lead time, release frequency, or change failure. Missing records stay missing. Sample deployments are not counted.
          </p>
        </section>
      )}

      <section className="rounded-2xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent products</h2>
          <Link href="/products" className="text-sm text-primary hover:underline">All products</Link>
        </div>
        {dashboard.recentProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products yet. Start with the problem you want to solve.</p>
        ) : (
          <ul className="divide-y">
            {dashboard.recentProducts.map((product) => (
              <li key={product.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <Link href={`/products/${product.id}`} className="text-sm font-medium hover:underline">{product.name}</Link>
                  <p className="mt-1 text-xs text-muted-foreground">Updated {formatRelative(product.updatedAt)}</p>
                </div>
                <div className="flex gap-1.5">
                  <StageBadge stage={product.currentStage} />
                  <ProductStatusBadge status={product.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
