import "server-only";

import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";

export async function noteGovernanceReviewRequired(productId: string, reason: string) {
  const rows = await db.engineeringGovernanceReview.findMany({
    where: { productId, status: "APPROVED" },
  });
  if (rows.length === 0) return;
  const flaggedAt = new Date();
  for (const row of rows) {
    await db.engineeringGovernanceReview.update({
      where: { id: row.id },
      data: {
        reviewRequired: true,
        reviewReason: reason,
        reviewFlaggedAt: flaggedAt,
      },
    });
  }
  await recordActivity({
    productId,
    type: "GOVERNANCE_REVIEW_REQUIRED",
    description: reason,
  });
}

export async function noteCodingPolicyReapproval(productId: string, policyId: string, reason: string) {
  const approval = await db.approval.findFirst({
    where: { productId, approvalType: "CODING_POLICY", status: "APPROVED" },
  });
  if (!approval) return;
  const flaggedAt = new Date();
  await db.codingPolicy.update({
    where: { id: policyId },
    data: {
      reapprovalRequired: true,
      reapprovalReason: reason,
      reapprovalFlaggedAt: flaggedAt,
      humanLocked: true,
    },
  });
  await recordActivity({
    productId,
    type: "CODING_POLICY_REAPPROVAL_REQUIRED",
    description: reason,
  });
}
