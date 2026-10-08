import "server-only";

import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";
import { noteCodingContractStale } from "@/modules/coding/impact";

export async function noteRequirementChange(productId: string, reason: string) {
  const rows = await db.solutionArchitecture.findMany({
    where: { productId, status: "APPROVED" },
  });
  if (rows.length === 0) return;
  for (const row of rows) {
    await db.solutionArchitecture.update({
      where: { id: row.id },
      data: {
        reviewRequired: true,
        reviewReason: reason,
      },
    });
  }
  await recordActivity({
    productId,
    type: "ARCHITECTURE_REVIEW_REQUIRED",
    description: reason,
  });
  await noteCodingContractStale(productId, reason);
}

export async function noteArchitectureChange(productId: string, reason: string) {
  const rows = await db.implementationPlan.findMany({
    where: { productId, status: "APPROVED" },
  });
  if (rows.length === 0) return;
  for (const row of rows) {
    await db.implementationPlan.update({
      where: { id: row.id },
      data: {
        reviewRequired: true,
        reviewReason: reason,
      },
    });
  }
  await recordActivity({
    productId,
    type: "PLAN_REVIEW_REQUIRED",
    description: reason,
  });
  await noteCodingContractStale(productId, reason);
}
