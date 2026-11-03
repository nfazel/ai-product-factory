import type { ReactNode } from "react";

/**
 * A long, mostly historical part of a page, folded away so the page opens on what matters. It opens by itself when the next
 * step points inside it; a person can open it any time. Server-rendered, so it needs no script to fold or unfold.
 */
export function CollapsedGroup({
  id,
  title,
  summary,
  open = false,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  open?: boolean;
  children?: ReactNode;
}) {
  return (
    <details id={id} open={open} className="group rounded-2xl border bg-card">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 px-4 py-3 sm:px-5">
        <span className="text-base font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">
          {summary ? `${summary} · ` : ""}
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="space-y-6 border-t p-4 sm:p-5">{children}</div>
    </details>
  );
}

/** Which group the next step points into, from the destination the guidance gave (`/products/<id>/build#plan` → `plan`). */
export function nextStepHash(href: string | null | undefined): string {
  const at = href ? href.indexOf("#") : -1;
  return at === -1 || !href ? "" : decodeURIComponent(href.slice(at + 1));
}
