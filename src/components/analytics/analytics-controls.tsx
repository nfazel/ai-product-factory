import Link from "next/link";

import { cn } from "cn";
import { TIME_WINDOWS, WINDOW_LABEL, type TimeWindow } from "@/modules/analytics/time";

export function AnalyticsControls({
  basePath,
  window,
  view,
}: {
  basePath: string;
  window: TimeWindow;
  view?: "leadership" | "engineering";
}) {
  const viewQuery = view ? `&view=${view}` : "";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2" aria-label="Time window">
        {TIME_WINDOWS.map((item) => (
          <Link
            key={item}
            href={`${basePath}?window=${item}${viewQuery}`}
            aria-current={item === window ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              item === window ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {WINDOW_LABEL[item]}
          </Link>
        ))}
      </div>
      {view ? (
        <div className="flex gap-2" aria-label="Audience">
          <ViewLink href={`${basePath}?window=${window}&view=leadership`} active={view === "leadership"}>
            Leadership
          </ViewLink>
          <ViewLink href={`${basePath}?window=${window}&view=engineering`} active={view === "engineering"}>
            Engineering
          </ViewLink>
        </div>
      ) : null}
    </div>
  );
}

function ViewLink({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
