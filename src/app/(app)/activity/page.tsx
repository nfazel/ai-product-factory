import { Suspense } from "react";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { isActivityType } from "@/domain/constants";
import { parseDay, single } from "@/lib/search";
import { listActivity } from "@/modules/activity/service";
import { listProducts } from "@/modules/product/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Activity" };

export default function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ActivityLog searchParams={searchParams} />
    </Suspense>
  );
}

async function ActivityLog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await markDynamic();
  const query = await searchParams;
  const productId = single(query.productId);
  const workItem = single(query.workItem);
  const actor = single(query.actor);
  const type = single(query.type);
  const from = single(query.from);
  const to = single(query.to);

  const [products, activity] = await Promise.all([
    listProducts(),
    listActivity({
      productId,
      workItemQuery: workItem,
      actor,
      type: type && isActivityType(type) ? type : undefined,
      from: parseDay(from, false),
      to: parseDay(to, true),
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Audit"
        title="Activity"
        description="A chronological record of product, backlog, criterion, and approval changes."
      />
      <ActivityFilters
        action="/activity"
        products={products}
        values={{ productId, workItem, actor, type, from, to }}
      />
      <div className="rounded-2xl border bg-card p-5">
        <ActivityFeed items={activity} />
      </div>
    </div>
  );
}
