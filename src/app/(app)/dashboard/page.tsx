import { Suspense } from "react";
import Link from "next/link";

import { AnalyticsControls } from "@/components/analytics/analytics-controls";
import { BarList } from "@/components/analytics/charts";
import { MetricGrid } from "@/components/analytics/metric-card";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { ProductStatusBadge, StageBadge } from "@/components/status/badges";
import { WorkItemRow } from "@/components/work-items/work-item-row";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { getPortfolioIntelligence } from "@/modules/analytics/service";
import { parseWindow } from "@/modules/analytics/time";
import { getDashboard } from "@/modules/dashboard/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Dashboard" };

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DashboardContent({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  await markDynamic();
  const window = parseWindow((await searchParams).window);
  const [dashboard, portfolio] = await Promise.all([getDashboard(), getPortfolioIntelligence(window)]);
  const { stats } = dashboard;
  const byKey = new Map(portfolio.metrics.map((metric) => [metric.key, metric]));
  const pick = (keys: string[]) => keys.map((key) => byKey.get(key)).filter((metric) => metric != null);

  const cards = [
    { label: "Active products", value: stats.activeProducts, hint: "Products currently being developed" },
    { label: "Work items in progress", value: stats.workItemsInProgress, hint: "Items with people actively on them" },
    { label: "Items blocked", value: stats.itemsBlocked, hint: "Work that cannot move until something changes", attention: stats.itemsBlocked > 0 },
    { label: "Pending approvals", value: stats.pendingApprovals, hint: "Decisions waiting for a person", attention: stats.pendingApprovals > 0 },
    { label: "AI agent runs", value: stats.agentRuns, hint: "Runs recorded by the factory" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Portfolio"
        title="Factory overview"
        description="Are we delivering, where is work waiting, and are released capabilities producing the outcome? Numbers come from factory records."
        actions={
          <Button asChild size="lg">
            <Link href="/products/new">New product</Link>
          </Button>
        }
      />

      <AnalyticsControls basePath="/dashboard" window={window} />

      <section className="space-y-3" data-section="health">
        <h2 className="text-base font-semibold">Portfolio health</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {portfolio.stageCounts.map((stage) => (
            <article key={stage.stage} className="rounded-2xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">{stage.stage}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{stage.count}</p>
            </article>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <NameList title="Blocked" items={portfolio.blocked} empty="No product is blocked by a work item, a high release issue, or a governance flag." />
          <NameList title="Ready for a person" items={portfolio.ready} empty="No product is waiting on an approval." />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Product delivery</h2>
        <MetricGrid metrics={pick(["idea_to_deployment_lead_time", "implementation_cycle_median", "pr_cycle", "deployment_frequency_30d", "delivery_predictability"])} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Quality</h2>
        <MetricGrid metrics={pick(["change_failure_rate", "defect_escape_rate", "defects_open_critical_high"])} />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="mb-3 text-base font-semibold">Flow</h2>
          <BarList points={portfolio.charts.waitBreakdown} empty="INSUFFICIENT DATA. No closed wait has both a start and a finish." />
        </div>
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Approval wait</h2>
          <MetricGrid metrics={pick(["approval_wait_release", "rework_rate_tasks"])} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">AI factory</h2>
        <MetricGrid metrics={pick(["agent_runs", "first_pass_coding", "escalation_count", "automation_rate", "ai_execution_time", "human_approval_time"])} />
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-medium">Agent runs by result</h3>
          <BarList points={portfolio.charts.agentRunsByResult} empty="INSUFFICIENT DATA. No agent run was recorded in this period." />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Outcomes</h2>
        <MetricGrid metrics={pick(["outcomes_achieved", "outcomes_awaiting_evidence", "delivery_complete_outcome_pending"])} />
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="text-primary hover:underline" href={`/api/intelligence/export?format=csv&window=${window}`}>
          Export CSV
        </Link>
        <Link className="text-primary hover:underline" href={`/api/intelligence/export?format=json&window=${window}`}>
          Export JSON
        </Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <article key={card.label} className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className={card.attention ? "mt-3 text-3xl font-semibold tracking-tight text-amber-800" : "mt-3 text-3xl font-semibold tracking-tight"}>
              {card.value}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{card.hint}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent products</h2>
            <Link href="/products" className="text-sm text-primary hover:underline">
              All products
            </Link>
          </div>
          {dashboard.recentProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products yet. Start one when you have a problem worth pursuing.</p>
          ) : (
            <ul className="divide-y">
              {dashboard.recentProducts.map((product) => (
                <li key={product.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <Link href={`/products/${product.id}/intelligence`} className="text-sm font-medium hover:underline">
                      {product.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">Updated {formatRelative(product.updatedAt)}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <StageBadge stage={product.currentStage} />
                    <ProductStatusBadge status={product.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent activity</h2>
            <Link href="/activity" className="text-sm text-primary hover:underline">
              Full log
            </Link>
          </div>
          <ActivityFeed items={dashboard.recentActivity} emptyDescription="Creating a product or a work item will start the audit history." />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Work items requiring attention</h2>
          <Link href="/work-items" className="text-sm text-primary hover:underline">
            All work items
          </Link>
        </div>
        {dashboard.attentionItems.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card px-4 py-8 text-sm text-muted-foreground">Nothing is blocked, in review, or critical right now.</p>
        ) : (
          <div className="space-y-2">
            {dashboard.attentionItems.map((item) => (
              <WorkItemRow key={item.id} item={item} showProduct />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NameList({
  title,
  items,
  empty,
}: {
  title: string;
  items: { id: string; name: string; stage: string }[];
  empty: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/products/${item.id}/intelligence`} className="text-sm hover:underline">
                {item.name}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">{item.stage}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
