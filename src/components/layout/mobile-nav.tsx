"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { BrandMark, SidebarNav } from "@/components/layout/sidebar-nav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileNav({ pendingApprovals }: { pendingApprovals: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 bg-sidebar p-0 text-sidebar-foreground [&_[data-slot=sheet-close]]:text-sidebar-foreground"
      >
        <SheetHeader className="border-b border-sidebar-border px-5 py-5">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <BrandMark />
        </SheetHeader>
        <SidebarNav
          pendingApprovals={pendingApprovals}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
