import "server-only";

import { db } from "@/lib/db";
import { findCurrentBrief } from "@/modules/discovery/repository";
import { findProductRow } from "@/modules/product/repository";
import { DomainError } from "@/modules/shared/errors";

/**
 * Drafting ahead lets the Plan run draft the design, delivery plan, review and rules one after another before each earlier part is
 * approved. It relaxes only what is needed to draft: the product may still be in Define, the definition and first slice need to be
 * drafted rather than approved, and the earlier artifact needs to be committed and ready for review rather than approved. Every
 * approval step, and everything that gates coding, is unchanged and still requires the real approvals.
 */
export type GateMode = { draftAhead?: boolean };

export async function architectureEntryBlockers(productId: string, mode: GateMode = {}) {
  const product = await findProductRow(productId);
  if (!product) throw new DomainError("Product not found.", "NOT_FOUND");
  const reasons: string[] = [];
  const draft = mode.draftAhead === true;
  if (draft ? !["DEFINE", "BUILD"].includes(product.currentStage) : product.currentStage !== "BUILD") {
    reasons.push(
      draft
        ? `The product is in ${product.currentStage}. The design can only be drafted once the features are drafted, in Define or Build.`
        : `The product is in ${product.currentStage}. The Architecture Agent only runs during BUILD.`,
    );
  }
  const brief = await findCurrentBrief(productId);
  if (!brief) {
    reasons.push("An approved Product Brief is required.");
  } else if (brief.status !== "APPROVED") {
    reasons.push(
      `The current Product Brief is ${brief.status}. An approved Product Brief is required.`,
    );
  }
  const definition = await db.productDefinition.findUnique({ where: { productId } });
  if (draft) {
    // Drafted, not approved: the features exist on the backlog for the design to be drafted from.
    const outcomes = await db.productOutcome.count({ where: { productId } });
    const features = await db.workItem.count({ where: { productId, type: "FEATURE" } });
    if (outcomes === 0 || features === 0) reasons.push("The features need to be drafted before the design can be.");
  } else {
    const definitionApproval = await db.approval.findFirst({
      where: { productId, approvalType: "PRODUCT_DEFINITION", status: "APPROVED" },
    });
    if (definition?.status !== "APPROVED" || !definitionApproval) {
      reasons.push("An approved Product Definition is required.");
    }
  }
  const slice = draft
    ? ((await db.productSlice.findFirst({ where: { productId, status: "APPROVED" }, orderBy: { createdAt: "asc" } })) ??
      (await db.productSlice.findFirst({ where: { productId }, orderBy: { createdAt: "asc" } })))
    : await db.productSlice.findFirst({ where: { productId, status: "APPROVED" }, orderBy: { createdAt: "asc" } });
  if (!slice) {
    reasons.push(draft ? "A first product slice needs to be drafted." : "An approved First Product Slice is required.");
  }
  return { product, brief, definition, slice, reasons };
}

export async function planEntryBlockers(productId: string, mode: GateMode = {}) {
  const gate = await architectureEntryBlockers(productId, mode);
  const reasons = [...gate.reasons];
  if (mode.draftAhead === true) {
    // Committed and marked ready for review is enough to draft the plan from; approval is not.
    const architecture = await db.solutionArchitecture.findFirst({
      where: { productId, status: { in: ["READY_FOR_REVIEW", "APPROVED"] } },
      orderBy: { version: "desc" },
    });
    if (!architecture) reasons.push("The design needs to be drafted and marked ready before the delivery plan can be.");
    return { ...gate, architecture, reasons };
  }
  const architecture = await db.solutionArchitecture.findFirst({
    where: { productId, status: "APPROVED" },
    orderBy: { version: "desc" },
  });
  const approval = await db.approval.findFirst({
    where: { productId, approvalType: "SOLUTION_ARCHITECTURE", status: "APPROVED" },
  });
  if (!architecture || !approval) {
    reasons.push("An approved Solution Architecture is required before an implementation plan can be generated.");
  }
  return { ...gate, architecture, reasons };
}
