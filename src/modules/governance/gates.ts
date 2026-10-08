import "server-only";

import { db } from "@/lib/db";
import { architectureEntryBlockers } from "@/modules/architecture/gates";
import { DomainError } from "@/modules/shared/errors";

export async function governanceEntryBlockers(productId: string) {
  let base: Awaited<ReturnType<typeof architectureEntryBlockers>>;
  try {
    base = await architectureEntryBlockers(productId);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") throw error;
    throw error;
  }
  const reasons = [...base.reasons];
  const architecture = await db.solutionArchitecture.findFirst({
    where: { productId, status: "APPROVED" },
    orderBy: { version: "desc" },
  });
  const architectureApproval = await db.approval.findFirst({
    where: { productId, approvalType: "SOLUTION_ARCHITECTURE", status: "APPROVED" },
  });
  if (!architecture || !architectureApproval) {
    reasons.push("An approved Solution Architecture is required.");
  }
  const plan = await db.implementationPlan.findFirst({
    where: { productId, status: "APPROVED" },
    orderBy: { version: "desc" },
  });
  const planApproval = await db.approval.findFirst({
    where: { productId, approvalType: "IMPLEMENTATION_PLAN", status: "APPROVED" },
  });
  if (!plan || !planApproval) {
    reasons.push("An approved Implementation Plan is required.");
  }
  return { ...base, architecture, plan, reasons };
}
