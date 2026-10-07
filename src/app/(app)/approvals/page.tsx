import { Suspense } from "react";

import {
  ApprovalColumn,
  RequestApprovalForm,
} from "@/components/approvals/approval-board";
import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { single } from "@/lib/search";
import { listApprovalGroups } from "@/modules/approval/service";
import { listProducts } from "@/modules/product/service";
import { listWorkItems } from "@/modules/work-item/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Approvals" };

export default function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Approvals searchParams={searchParams} />
    </Suspense>
  );
}

async function Approvals({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await markDynamic();
  const query = await searchParams;
  const [groups, products, items] = await Promise.all([
    listApprovalGroups(),
    listProducts(),
    listWorkItems(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Control"
        title="Approval centre"
        description="People approve stage gates, requirements, architecture, security, and release. Agents may request these later. They do not grant them."
      />
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-base font-semibold">Request a test approval</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Use this to exercise the gate before agents exist.
        </p>
        <RequestApprovalForm
          products={products}
          items={items}
          defaultProductId={single(query.productId)}
          defaultWorkItemId={single(query.workItemId)}
        />
      </section>
      <div className="grid gap-4 xl:grid-cols-3">
        <ApprovalColumn
          title="Pending"
          description="Waiting for a person."
          items={groups.pending}
          tone="pending"
        />
        <ApprovalColumn
          title="Approved"
          description="Accepted and recorded."
          items={groups.approved}
          tone="approved"
        />
        <ApprovalColumn
          title="Rejected"
          description="Declined, with the reason kept."
          items={groups.rejected}
          tone="rejected"
        />
      </div>
    </div>
  );
}
