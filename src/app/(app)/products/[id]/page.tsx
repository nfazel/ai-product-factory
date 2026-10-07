import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { PageSkeleton } from "@/components/feedback/states";
import { EditProductForm, StageControlForm } from "@/components/products/product-forms";
import { RecordDecisionForm } from "@/components/work-items/work-item-forms";
import { formatDateTime } from "@/lib/format";
import { getProductOverview } from "@/modules/product/overview";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Overview" };

export default function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: Promise<{ id: string }> }) {
  await markDynamic();
  const { id } = await params;
  const overview = await getProductOverview(id);
  if (!overview) notFound();

  const { product, counts, activity, decisions } = overview;
  const summary = [
    { label: "Epics", value: counts.epics },
    { label: "Features", value: counts.features },
    { label: "Stories", value: counts.stories },
    { label: "Defects", value: counts.defects },
    {
      label: "Pending approvals",
      value: counts.pendingApprovals,
      attention: counts.pendingApprovals > 0,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border bg-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Product definition</h2>
          <dl className="mt-4 space-y-4">
            <Definition term="Product vision" value={product.vision} />
            <Definition term="Problem statement" value={product.problemStatement} />
            <Definition term="Target users" value={product.targetUsers} />
          </dl>
        </article>
        <article className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Stage and status</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Changing the stage updates the pipeline. This stays a human decision.
          </p>
          <div className="mt-4">
            <StageControlForm product={product} />
          </div>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summary.map((item) => (
          <article key={item.label} className="rounded-2xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p
              className={
                item.attention
                  ? "mt-2 text-3xl font-semibold text-amber-800"
                  : "mt-2 text-3xl font-semibold"
              }
            >
              {item.value}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent activity</h2>
            <Link
              href={`/products/${product.id}/activity`}
              className="text-sm text-primary hover:underline"
            >
              Product log
            </Link>
          </div>
          <ActivityFeed items={activity} />
        </article>
        <article className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">Recent decisions</h2>
          {decisions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No decisions recorded for this product yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {decisions.map((decision) => (
                <li key={decision.id} className="border-b pb-4 last:border-0 last:pb-0">
                  <p className="text-sm font-medium">{decision.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {decision.decision}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {decision.decisionMaker} · {formatDateTime(decision.createdAt)}
                    {decision.workItemTitle ? ` · ${decision.workItemTitle}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-4 border-t pt-4">
            <summary className="cursor-pointer text-sm font-medium">
              Record a decision
            </summary>
            <div className="mt-4">
              <RecordDecisionForm productId={product.id} />
            </div>
          </details>
        </article>
      </section>

      <details className="rounded-2xl border bg-card p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          Edit product definition
        </summary>
        <div className="mt-4 max-w-2xl">
          <EditProductForm product={product} />
        </div>
      </details>
    </div>
  );
}

function Definition({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {term}
      </dt>
      <dd className="mt-1 text-sm leading-6">{value}</dd>
    </div>
  );
}
