"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import {
  APPROVAL_TYPES,
  APPROVAL_TYPE_LABEL,
  WORK_ITEM_TYPE_LABEL,
} from "@/domain/constants";
import { idleState } from "@/lib/action-state";
import { formatDateTime } from "@/lib/format";
import {
  FormMessage,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { ApprovalStatusBadge, approvalLabel } from "@/components/status/badges";
import { EmptyState } from "@/components/feedback/states";
import { getCurrentActor } from "@/modules/identity/actor";
import type { ApprovalRecord } from "@/modules/approval/types";
import type { Product } from "@/modules/product/types";
import type { WorkItemSummary } from "@/modules/work-item/types";
import {
  requestApprovalAction,
  resolveApprovalAction,
} from "@/server/actions/records";

export function RequestApprovalForm({
  products,
  items,
  defaultProductId,
  defaultWorkItemId,
}: {
  products: Product[];
  items: WorkItemSummary[];
  defaultProductId?: string;
  defaultWorkItemId?: string;
}) {
  const [state, action] = useActionState(requestApprovalAction, idleState);

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <SelectField
        label="Product"
        name="productId"
        defaultValue={defaultProductId ?? ""}
        error={state.fieldErrors?.productId}
      >
        <option value="">Choose a product</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Work item"
        name="workItemId"
        defaultValue={defaultWorkItemId ?? ""}
        hint="Optional. Leave blank for a product-level gate."
      >
        <option value="">Product only</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.productName} · {WORK_ITEM_TYPE_LABEL[item.type]} · {item.title}
          </option>
        ))}
      </SelectField>
      <SelectField label="Approval type" name="approvalType" defaultValue="REQUIREMENTS">
        {APPROVAL_TYPES.map((type) => (
          <option key={type} value={type}>
            {APPROVAL_TYPE_LABEL[type]}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        label="Comments"
        name="comments"
        error={state.fieldErrors?.comments}
        hint="Context for the person who will decide."
      />
      <div className="md:col-span-2 space-y-3">
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Requesting…">Request approval</SubmitButton>
      </div>
    </form>
  );
}

export function ApprovalColumn({
  title,
  description,
  items,
  tone,
}: {
  title: string;
  description: string;
  items: ApprovalRecord[];
  tone: "pending" | "approved" | "rejected";
}) {
  return (
    <section className="rounded-2xl border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <span
            className={
              tone === "pending"
                ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950"
                : tone === "approved"
                  ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"
                  : "rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-800"
            }
          >
            {items.length}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-3 p-3">
        {items.length === 0 ? (
          <EmptyState
            title={`No ${title.toLowerCase()} approvals`}
            description="Requests appear here once someone asks for a decision."
          />
        ) : (
          items.map((item) => <ApprovalCard key={item.id} approval={item} />)
        )}
      </div>
    </section>
  );
}

function ApprovalCard({ approval }: { approval: ApprovalRecord }) {
  return (
    <article className="rounded-xl border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{approvalLabel(approval.approvalType)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <Link href={`/products/${approval.productId}`} className="hover:underline">
              {approval.productName}
            </Link>
            {approval.workItemId && approval.workItemTitle ? (
              <>
                {" · "}
                <Link href={`/work-items/${approval.workItemId}`} className="hover:underline">
                  {approval.workItemTitle}
                </Link>
              </>
            ) : (
              " · Product"
            )}
          </p>
        </div>
        <ApprovalStatusBadge status={approval.status} />
      </div>
      <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between gap-3">
          <dt>Requested</dt>
          <dd>{formatDateTime(approval.requestedAt)}</dd>
        </div>
        {approval.resolvedAt ? (
          <div className="flex justify-between gap-3">
            <dt>Resolved</dt>
            <dd>{formatDateTime(approval.resolvedAt)}</dd>
          </div>
        ) : null}
        {approval.approvedBy ? (
          <div className="flex justify-between gap-3">
            <dt>Decided by</dt>
            <dd>{approval.approvedBy}</dd>
          </div>
        ) : null}
      </dl>
      {approval.comments ? (
        <p className="mt-3 text-sm leading-6 text-foreground">{approval.comments}</p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No comments.</p>
      )}
      {approval.status === "PENDING" ? <ResolveForm approval={approval} /> : null}
    </article>
  );
}

function ResolveForm({ approval }: { approval: ApprovalRecord }) {
  const [state, action] = useActionState(resolveApprovalAction, idleState);
  const actor = getCurrentActor();

  return (
    <form action={action} className="mt-4 space-y-3 border-t pt-4">
      <input type="hidden" name="id" value={approval.id} />
      <TextField
        id={`approver-${approval.id}`}
        label="Decided by"
        name="approvedBy"
        defaultValue={actor.name}
      />
      <TextAreaField
        id={`comments-${approval.id}`}
        label="Comments"
        name="comments"
        defaultValue={approval.comments}
      />
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <IntentButton intent="APPROVED" pendingLabel="Approving…">
          Approve
        </IntentButton>
        <IntentButton intent="REJECTED" pendingLabel="Rejecting…" variant="outline">
          Reject
        </IntentButton>
      </div>
    </form>
  );
}

function IntentButton({
  intent,
  children,
  pendingLabel,
  variant = "default",
}: {
  intent: "APPROVED" | "REJECTED";
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="intent" value={intent} size="lg" disabled={pending} variant={variant}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
