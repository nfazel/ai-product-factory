import { Suspense } from "react";
import Link from "next/link";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { ProductStatusBadge, StageBadge } from "@/components/status/badges";
import { WorkItemRow } from "@/components/work-items/work-item-row";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { getDashboard } from "@/modules/dashboard/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  await markDynamic();
  const dashboard = await getDashboard();
  const { stats } = dashboard;

  const cards = [
    {
      label: "Active products",
      value: stats.activeProducts,
      hint: "Products currently being developed",
    },
    {
      label: "Work items in progress",
      value: stats.workItemsInProgress,
      hint: "Items with people actively on them",
    },
    {
      label: "Items blocked",
      value: stats.itemsBlocked,
      hint: "Work that cannot move until something changes",
      attention: stats.itemsBlocked > 0,
    },
    {
      label: "Pending approvals",
      value: stats.pendingApprovals,
      hint: "Decisions waiting for a person",
      attention: stats.pendingApprovals > 0,
    },
    {
      label: "AI agent runs",
      value: stats.agentRuns,
      hint: "Agents are not configured yet",
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Portfolio"
        title="Factory overview"
        description="What is moving, what is blocked, and which decisions are still waiting for a person."
        actions={
          <Button asChild size="lg">
            <Link href="/products/new">New product</Link>
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <article
            key={card.label}
            className="rounded-2xl border bg-card p-4 shadow-sm"
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p
              className={
                card.attention
                  ? "mt-3 text-3xl font-semibold tracking-tight text-amber-800"
                  : "mt-3 text-3xl font-semibold tracking-tight"
              }
            >
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
            <p className="text-sm text-muted-foreground">
              No products yet. Start one when you have a problem worth pursuing.
            </p>
          ) : (
            <ul className="divide-y">
              {dashboard.recentProducts.map((product) => (
                <li key={product.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <Link
                      href={`/products/${product.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {product.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Updated {formatRelative(product.updatedAt)}
                    </p>
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
          <ActivityFeed
            items={dashboard.recentActivity}
            emptyDescription="Creating a product or a work item will start the audit history."
          />
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
          <p className="rounded-2xl border border-dashed bg-card px-4 py-8 text-sm text-muted-foreground">
            Nothing is blocked, in review, or critical right now.
          </p>
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
