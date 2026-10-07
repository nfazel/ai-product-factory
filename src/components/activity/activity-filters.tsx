import Link from "next/link";

import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABEL } from "@/domain/constants";
import { Button } from "@/components/ui/button";
import type { Product } from "@/modules/product/types";

export function ActivityFilters({
  action,
  products,
  values,
  showProduct = true,
}: {
  action: string;
  products?: Product[];
  showProduct?: boolean;
  values: {
    productId?: string;
    workItem?: string;
    actor?: string;
    type?: string;
    from?: string;
    to?: string;
  };
}) {
  return (
    <form
      method="get"
      action={action}
      className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-3 xl:grid-cols-6"
    >
      {showProduct ? (
        <label className="space-y-1.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Product</span>
          <select
            name="productId"
            defaultValue={values.productId ?? ""}
            className="h-9 w-full rounded-lg border bg-background px-3"
          >
            <option value="">All products</option>
            {products?.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="space-y-1.5 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Work item</span>
        <input
          name="workItem"
          defaultValue={values.workItem ?? ""}
          placeholder="Title contains…"
          className="h-9 w-full rounded-lg border bg-background px-3"
        />
      </label>
      <label className="space-y-1.5 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Actor</span>
        <input
          name="actor"
          defaultValue={values.actor ?? ""}
          placeholder="Name contains…"
          className="h-9 w-full rounded-lg border bg-background px-3"
        />
      </label>
      <label className="space-y-1.5 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Activity type</span>
        <select
          name="type"
          defaultValue={values.type ?? ""}
          className="h-9 w-full rounded-lg border bg-background px-3"
        >
          <option value="">All types</option>
          {ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACTIVITY_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5 text-sm">
        <span className="text-xs font-medium text-muted-foreground">From</span>
        <input
          type="date"
          name="from"
          defaultValue={values.from ?? ""}
          className="h-9 w-full rounded-lg border bg-background px-3"
        />
      </label>
      <label className="space-y-1.5 text-sm">
        <span className="text-xs font-medium text-muted-foreground">To</span>
        <input
          type="date"
          name="to"
          defaultValue={values.to ?? ""}
          className="h-9 w-full rounded-lg border bg-background px-3"
        />
      </label>
      <div className="flex items-end gap-2 md:col-span-3 xl:col-span-6">
        <Button type="submit" size="lg">
          Apply filters
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href={action}>Clear</Link>
        </Button>
      </div>
    </form>
  );
}
