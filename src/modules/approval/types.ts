import type { ApprovalStatus, ApprovalType } from "@/domain/constants";

export type ApprovalRecord = {
  id: string;
  productId: string;
  productName: string;
  workItemId: string | null;
  workItemTitle: string | null;
  approvalType: string;
  status: ApprovalStatus;
  requestedAt: Date;
  resolvedAt: Date | null;
  approvedBy: string | null;
  comments: string;
};

export type CreateApprovalInput = {
  productId: string;
  workItemId?: string;
  approvalType: ApprovalType;
  comments?: string;
};

export type ApprovalGroups = {
  pending: ApprovalRecord[];
  approved: ApprovalRecord[];
  rejected: ApprovalRecord[];
};
