import { Suspense } from "react";
import { notFound } from "next/navigation";

import { EmptyState, PageSkeleton } from "@/components/feedback/states";
import { BacklogTree } from "@/components/work-items/backlog-tree";
import { CreateWorkItemDialog } from "@/components/work-items/work-item-forms";
import { buildWorkItemTree } from "@/domain/work-item-tree";
import { getProduct } from "@/modules/product/service";
import { listWorkItems, workItemTypeCounts } from "@/modules/work-item/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Backlog" };

export default function BacklogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Backlog params={params} />
    </Suspense>
  );
}

async function Backlog({ params }: { params: Promise<{ id: string }> }) {
  await markDynamic();
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const [items, counts] = await Promise.all([
    listWorkItems({ productId: id }),
    workItemTypeCounts(id),
  ]);
  const tree = buildWorkItemTree(items);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Backlog</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This is part of Define. Stories are grouped under features and epics. Tasks and defects stay with their parent.
          </p>
        </div>
        <CreateWorkItemDialog
          productId={product.id}
          stage={product.currentStage}
          items={items}
        />
      </div>
      <dl className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Count label="Epics" value={counts.EPIC} />
        <Count label="Features" value={counts.FEATURE} />
        <Count label="Stories" value={counts.STORY} />
        <Count label="Tasks" value={counts.TASK} />
        <Count label="Defects" value={counts.DEFECT} />
      </dl>
      {items.length === 0 ? (
        <EmptyState
          title="The backlog is empty"
          description="The backlog is the work you are committing to after the Product Definition. Add an epic, then the features and stories under it, or return to Define to draft the definition first."
        />
      ) : (
        <BacklogTree nodes={tree} />
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-full border bg-card px-3 py-1">
      <dt className="sr-only">{label}</dt>
      <dd>
        {value} {label.toLowerCase()}
      </dd>
    </div>
  );
}
