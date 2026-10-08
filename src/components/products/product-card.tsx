import Link from "next/link";

import {
  ProductStatusBadge,
  StageBadge,
} from "@/components/status/badges";
import { formatRelative } from "@/lib/format";
import type { Product } from "@/modules/product/types";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm transition hover:border-primary/30"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">{product.name}</h2>
        <ProductStatusBadge status={product.status} />
      </div>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-muted-foreground">
        {product.description}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <StageBadge stage={product.currentStage} />
      </div>
      <dl className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
        <div>
          <dt className="sr-only">Work items</dt>
          <dd>
            {product.workItemCount}{" "}
            {product.workItemCount === 1 ? "work item" : "work items"}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Last updated</dt>
          <dd>Updated {formatRelative(product.updatedAt)}</dd>
        </div>
      </dl>
    </Link>
  );
}
