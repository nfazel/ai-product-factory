import "server-only";

import { db } from "@/lib/db";
import type {
  ApprovalRecord,
  CreateApprovalInput,
} from "@/modules/approval/types";

function toApproval(row: {
  id: string;
  productId: string;
  workItemId: string | null;
  approvalType: string;
  status: ApprovalRecord["status"];
  requestedAt: Date;
  resolvedAt: Date | null;
  approvedBy: string | null;
  comments: string;
  product: { name: string };
  workItem: { title: string } | null;
}): ApprovalRecord {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.product.name,
    workItemId: row.workItemId,
    workItemTitle: row.workItem?.title ?? null,
    approvalType: row.approvalType,
    status: row.status,
    requestedAt: row.requestedAt,
    resolvedAt: row.resolvedAt,
    approvedBy: row.approvedBy,
    comments: row.comments,
  };
}

const include = {
  product: { select: { name: true } },
  workItem: { select: { title: true } },
} as const;

export async function queryApprovals(filters?: {
  productId?: string;
  workItemId?: string;
  status?: ApprovalRecord["status"];
}) {
  const rows = await db.approval.findMany({
    where: {
      productId: filters?.productId || undefined,
      workItemId: filters?.workItemId || undefined,
      status: filters?.status,
    },
    include,
    orderBy: { requestedAt: "desc" },
  });
  return rows.map(toApproval);
}

export async function findApprovalRow(id: string) {
  const row = await db.approval.findUnique({ where: { id }, include });
  return row ? toApproval(row) : null;
}

export async function insertApproval(input: CreateApprovalInput) {
  const row = await db.approval.create({
    data: {
      productId: input.productId,
      workItemId: input.workItemId ?? null,
      approvalType: input.approvalType,
      comments: input.comments ?? "",
      status: "PENDING",
    },
    include,
  });
  return toApproval(row);
}

export async function saveApprovalResolution(
  id: string,
  input: {
    status: "APPROVED" | "REJECTED";
    comments: string;
    approvedBy: string;
    resolvedAt: Date;
  },
) {
  const row = await db.approval.update({
    where: { id },
    data: input,
    include,
  });
  return toApproval(row);
}

export async function countApprovals(status: ApprovalRecord["status"]) {
  return db.approval.count({ where: { status } });
}
