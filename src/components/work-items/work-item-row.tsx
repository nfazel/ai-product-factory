import Link from "next/link";

import {
  PriorityBadge,
  StageBadge,
  WorkItemStatusBadge,
  WorkItemTypeBadge,
} from "@/components/status/badges";
import { PROVENANCE_LABEL } from "@/domain/constants";
import type { WorkItemSummary } from "@/modules/work-item/types";

export function WorkItemRow({
  item,
  showProduct = false,
}: {
  item: WorkItemSummary;
  showProduct?: boolean;
}) {
  return (
    <Link
      href={`/work-items/${item.id}`}
      className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 transition hover:border-primary/30 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-5">{item.title}</p>
        {showProduct ? (
          <p className="mt-1 text-xs text-muted-foreground">{item.productName}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
          {PROVENANCE_LABEL[item.provenance]}
        </span>
        <WorkItemTypeBadge type={item.type} />
        <WorkItemStatusBadge status={item.status} />
        <PriorityBadge priority={item.priority} />
        <StageBadge stage={item.stage} />
      </div>
    </Link>
  );
}
