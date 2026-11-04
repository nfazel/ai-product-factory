import "server-only";

import { db } from "@/lib/db";
import { architectureEntryBlockers, type GateMode } from "@/modules/architecture/gates";
import { DomainError } from "@/modules/shared/errors";

export async function governanceEntryBlockers(productId: string, mode: GateMode = {}) {
  let base: Awaited<ReturnType<typeof architectureEntryBlockers>>;
  try {
    base = await architectureEntryBlockers(productId, mode);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") throw error;
    throw error;
  }
  const reasons = [...base.reasons];
  if (mode.draftAhead === true) {
    // The review is drafted from the design and delivery plan once they are committed and ready for review; approval comes later.
    const architecture = await db.solutionArchitecture.findFirst({ where: { productId, status: { in: ["READY_FOR_REVIEW", "APPROVED"] } }, orderBy: { version: "desc" } });
    const plan = await db.implementationPlan.findFirst({ where: { productId, status: { in: ["READY_FOR_REVIEW", "APPROVED"] } }, orderBy: { version: "desc" } });
    if (!architecture) reasons.push("The design needs to be drafted and marked ready before the review can be.");
    if (!plan) reasons.push("The delivery plan needs to be drafted and marked ready before the review can be.");
    return { ...base, architecture, plan, reasons };
  }
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
