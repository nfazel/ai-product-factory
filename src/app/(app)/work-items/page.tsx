import { Suspense } from "react";
import Link from "next/link";

import { EmptyState, PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { WorkItemRow } from "@/components/work-items/work-item-row";
import { Button } from "@/components/ui/button";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  WORK_ITEM_STATUSES,
  WORK_ITEM_STATUS_LABEL,
  WORK_ITEM_TYPES,
  WORK_ITEM_TYPE_LABEL,
  type Priority,
  type WorkItemStatus,
  type WorkItemType,
} from "@/domain/constants";
import { single } from "@/lib/search";
import { listProducts } from "@/modules/product/service";
import { listWorkItems } from "@/modules/work-item/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Work Items" };

function oneOf<T extends string>(values: readonly T[], value?: string) {
  if (!value) return undefined;
  return (values as readonly string[]).includes(value) ? (value as T) : undefined;
}

export default function WorkItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WorkItems searchParams={searchParams} />
    </Suspense>
  );
}

async function WorkItems({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await markDynamic();
  const query = await searchParams;
  const productId = single(query.productId);
  const type = oneOf<WorkItemType>(WORK_ITEM_TYPES, single(query.type));
  const status = oneOf<WorkItemStatus>(WORK_ITEM_STATUSES, single(query.status));
  const priority = oneOf<Priority>(PRIORITIES, single(query.priority));
  const q = single(query.q);

  const [products, items] = await Promise.all([
    listProducts(),
    listWorkItems({ productId, type, status, priority, query: q }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Delivery"
        title="Work items"
        description="Everything moving through the pipeline, across every product."
      />
      <form
        method="get"
        className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-3 xl:grid-cols-6"
      >
        <FilterSelect label="Product" name="productId" defaultValue={productId}>
          <option value="">All products</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Type" name="type" defaultValue={type}>
          <option value="">All types</option>
          {WORK_ITEM_TYPES.map((item) => (
            <option key={item} value={item}>
              {WORK_ITEM_TYPE_LABEL[item]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Status" name="status" defaultValue={status}>
          <option value="">All statuses</option>
          {WORK_ITEM_STATUSES.map((item) => (
            <option key={item} value={item}>
              {WORK_ITEM_STATUS_LABEL[item]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Priority" name="priority" defaultValue={priority}>
          <option value="">All priorities</option>
          {PRIORITIES.map((item) => (
            <option key={item} value={item}>
              {PRIORITY_LABEL[item]}
            </option>
          ))}
        </FilterSelect>
        <label className="space-y-1.5 text-sm xl:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Title</span>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search titles"
            className="h-9 w-full rounded-lg border bg-background px-3"
          />
        </label>
        <div className="flex items-end gap-2 md:col-span-3 xl:col-span-6">
          <Button type="submit" size="lg">
            Apply filters
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/work-items">Clear</Link>
          </Button>
        </div>
      </form>
      {items.length === 0 ? (
        <EmptyState
          title="No work items match"
          description="Adjust the filters, or add work from a product backlog."
          action={
            <Button asChild size="lg" variant="outline">
              <Link href="/products">View products</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <WorkItemRow key={item.id} item={item} showProduct />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="h-9 w-full rounded-lg border bg-background px-3"
      >
        {children}
      </select>
    </label>
  );
}
