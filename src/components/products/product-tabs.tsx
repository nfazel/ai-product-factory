"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "cn";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "/discovery", label: "Discovery" },
  { slug: "/definition", label: "Definition" },
  { slug: "/backlog", label: "Backlog" },
  { slug: "/architecture", label: "Architecture" },
  { slug: "/build", label: "Build" },
  { slug: "/testing", label: "Prove" },
  { slug: "/releases", label: "Ship" },
  { slug: "/metrics", label: "Learn" },
  { slug: "/activity", label: "Activity" },
];

export function ProductTabs({ productId }: { productId: string }) {
  const pathname = usePathname();

  return (
    <div className="overflow-x-auto">
      <nav aria-label="Product workspace" className="flex min-w-max gap-1 border-b">
        {TABS.map((tab) => {
          const href = `/products/${productId}${tab.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={tab.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
