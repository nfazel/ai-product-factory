import { Suspense } from "react";
import { notFound } from "next/navigation";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { PageSkeleton } from "@/components/feedback/states";
import { isActivityType } from "@/domain/constants";
import { parseDay, single } from "@/lib/search";
import { listActivity } from "@/modules/activity/service";
import { getProduct } from "@/modules/product/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Activity" };

export default function ProductActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductActivity params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductActivity({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await markDynamic();
  const { id } = await params;
  const query = await searchParams;
  const product = await getProduct(id);
  if (!product) notFound();

  const workItem = single(query.workItem);
  const actor = single(query.actor);
  const type = single(query.type);
  const from = single(query.from);
  const to = single(query.to);

  const activity = await listActivity({
    productId: id,
    workItemQuery: workItem,
    actor,
    type: type && isActivityType(type) ? type : undefined,
    from: parseDay(from, false),
    to: parseDay(to, true),
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Audit history for {product.name}.
        </p>
      </div>
      <ActivityFilters
        action={`/products/${id}/activity`}
        showProduct={false}
        values={{ workItem, actor, type, from, to }}
      />
      <div className="rounded-2xl border bg-card p-5">
        <ActivityFeed items={activity} />
      </div>
    </div>
  );
}
