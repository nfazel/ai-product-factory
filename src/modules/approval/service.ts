import "server-only";

import {
  APPROVAL_TYPE_LABEL,
  isApprovalType,
} from "@/domain/constants";
import { recordActivity } from "@/modules/activity/service";
import { getCurrentActor } from "@/modules/identity/actor";
import { DomainError } from "@/modules/shared/errors";
import { findProductRow } from "@/modules/product/repository";
import { findWorkItemRow } from "@/modules/work-item/repository";
import {
  countApprovals,
  findApprovalRow,
  insertApproval,
  queryApprovals,
  saveApprovalResolution,
} from "@/modules/approval/repository";
import type {
  ApprovalGroups,
  CreateApprovalInput,
} from "@/modules/approval/types";

export function approvalTypeLabel(value: string) {
  return isApprovalType(value) ? APPROVAL_TYPE_LABEL[value] : value;
}

export async function listApprovalGroups(filters?: {
  productId?: string;
  workItemId?: string;
}): Promise<ApprovalGroups> {
  const rows = await queryApprovals(filters);
  return {
    pending: rows.filter((row) => row.status === "PENDING"),
    approved: rows
      .filter((row) => row.status === "APPROVED")
      .sort(
        (a, b) =>
          (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0),
      ),
    rejected: rows
      .filter((row) => row.status === "REJECTED")
      .sort(
        (a, b) =>
          (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0),
      ),
  };
}

export async function listApprovalsForWorkItem(workItemId: string) {
  return queryApprovals({ workItemId });
}

export async function countPendingApprovals(productId?: string) {
  if (!productId) return countApprovals("PENDING");
  const rows = await queryApprovals({ productId, status: "PENDING" });
  return rows.length;
}

export async function requestApproval(input: CreateApprovalInput) {
  const product = await findProductRow(input.productId);
  if (!product) throw new DomainError("Product not found.", "NOT_FOUND");

  if (input.workItemId) {
    const item = await findWorkItemRow(input.workItemId);
    if (!item || item.productId !== input.productId) {
      throw new DomainError("Choose a work item from this product.");
    }
  }

  const approval = await insertApproval(input);
  const label = approvalTypeLabel(approval.approvalType).toLowerCase();
  await recordActivity({
    productId: approval.productId,
    workItemId: approval.workItemId,
    type: "APPROVAL_REQUESTED",
    description: approval.comments
      ? `Requested ${label} approval. ${approval.comments}`
      : `Requested ${label} approval.`,
  });
  return approval;
}

export async function resolveApproval(
  id: string,
  status: "APPROVED" | "REJECTED",
  input: { comments?: string; approvedBy?: string },
) {
  const existing = await findApprovalRow(id);
  if (!existing) throw new DomainError("Approval not found.", "NOT_FOUND");
  if (existing.status !== "PENDING") {
    throw new DomainError("This approval has already been resolved.");
  }

  const actor = input.approvedBy?.trim() || getCurrentActor().name;
  const comments = input.comments?.trim() || existing.comments;
  const approval = await saveApprovalResolution(id, {
    status,
    comments,
    approvedBy: actor,
    resolvedAt: new Date(),
  });

  const label = approvalTypeLabel(approval.approvalType).toLowerCase();
  await recordActivity({
    productId: approval.productId,
    workItemId: approval.workItemId,
    type: status === "APPROVED" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED",
    description:
      status === "APPROVED"
        ? `Approved ${label} request.`
        : `Rejected ${label} request.`,
    actor,
  });
  return approval;
}
