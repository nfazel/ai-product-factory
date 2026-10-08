"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { productTabs } from "@/components/products/product-nav";
import { cn } from "cn";

export function ProductTabs({ productId }: { productId: string }) {
  const pathname = usePathname();

  return (
    <div className="overflow-x-auto">
      <nav aria-label="Product workspace" className="flex min-w-max gap-1 border-b">
        {productTabs.map((tab) => {
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
