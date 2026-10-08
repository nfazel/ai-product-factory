import { Suspense } from "react";

import { BrandMark, SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { listPendingDecisions } from "@/modules/guidance/service";
import { markDynamic } from "@/server/dynamic";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  await markDynamic();
  const pendingApprovals = (await listPendingDecisions()).length;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="px-5 py-5">
          <BrandMark />
        </div>
        <SidebarNav pendingApprovals={pendingApprovals} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:px-8">
          <MobileNav pendingApprovals={pendingApprovals} />
          <p className="text-sm font-medium lg:hidden">AI Product Builder</p>
          <div className="ml-auto text-right">
            <p className="text-sm font-medium leading-tight">Human approval required</p>
            <p className="text-[11px] text-muted-foreground">
              Signed-in identity is not configured
            </p>
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}

function ShellFallback() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-64 border-r bg-sidebar lg:block" />
      <div className="flex-1 p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    </div>
  );
}
