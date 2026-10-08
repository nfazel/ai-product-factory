"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavActive, primaryNav, secondaryNav } from "@/components/layout/nav";
import { cn } from "cn";

export function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
          <circle cx="4" cy="12" r="1.7" fill="currentColor" />
          <circle cx="12" cy="12" r="2.1" fill="currentColor" />
          <circle cx="20" cy="12" r="1.7" className="opacity-50" fill="currentColor" />
          <path
            d="M6 12h4M14 12h4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span>
        <span className="block text-sm font-semibold tracking-tight text-white">
          AI Product Builder
        </span>
        <span className="block text-xs text-sidebar-foreground/70">
          From idea to outcome
        </span>
      </span>
    </div>
  );
}

export function SidebarNav({
  pendingApprovals,
  onNavigate,
}: {
  pendingApprovals: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-6 px-3 py-4">
      <div className="space-y-1">
        {primaryNav.map((item) => {
          const active = isNavActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.href === "/decisions" && pendingApprovals > 0 ? (
                <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[11px] font-medium text-amber-100">
                  {pendingApprovals}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto space-y-1 border-t border-sidebar-border pt-4">
        {secondaryNav.map((item) => {
          const active = isNavActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
