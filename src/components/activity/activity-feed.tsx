import Link from "next/link";

import { activityLabel } from "@/components/status/badges";
import { EmptyState } from "@/components/feedback/states";
import { formatDateTime } from "@/lib/format";
import type { ActivityRecord } from "@/modules/activity/types";

export function ActivityFeed({
  items,
  emptyDescription = "Important product actions will appear here as they happen.",
}: {
  items: ActivityRecord[];
  emptyDescription?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState title="No activity yet" description={emptyDescription} />
    );
  }

  return (
    <ol className="space-y-0">
      {items.map((item, index) => (
        <li key={item.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" />
            {index < items.length - 1 ? (
              <span className="mt-1 w-px flex-1 bg-border" />
            ) : null}
          </div>
          <div className="min-w-0 pb-5">
            <p className="text-sm leading-6">{item.description}</p>
            <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                {activityLabel(item.type)}
              </span>
              <span>·</span>
              <span>{item.actor}</span>
              <span>·</span>
              <time dateTime={item.createdAt.toISOString()}>
                {formatDateTime(item.createdAt)}
              </time>
              <span>·</span>
              <Link
                href={`/products/${item.productId}`}
                className="underline-offset-2 hover:underline"
              >
                {item.productName}
              </Link>
              {item.workItemId && item.workItemTitle ? (
                <>
                  <span>·</span>
                  <Link
                    href={`/work-items/${item.workItemId}`}
                    className="max-w-xs truncate underline-offset-2 hover:underline"
                  >
                    {item.workItemTitle}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
