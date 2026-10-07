import "server-only";

import { db } from "@/lib/db";
import { findCurrentBrief } from "@/modules/discovery/repository";
import { findProductRow } from "@/modules/product/repository";
import { DomainError } from "@/modules/shared/errors";

export async function architectureEntryBlockers(productId: string) {
  const product = await findProductRow(productId);
  if (!product) throw new DomainError("Product not found.", "NOT_FOUND");
  const reasons: string[] = [];
  if (product.currentStage !== "BUILD") {
    reasons.push(
      `The product is in ${product.currentStage}. The Architecture Agent only runs during BUILD.`,
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
  const definitionApproval = await db.approval.findFirst({
    where: { productId, approvalType: "PRODUCT_DEFINITION", status: "APPROVED" },
  });
  if (definition?.status !== "APPROVED" || !definitionApproval) {
    reasons.push("An approved Product Definition is required.");
  }
  const slice = await db.productSlice.findFirst({
    where: { productId, status: "APPROVED" },
    orderBy: { createdAt: "asc" },
  });
  if (!slice) {
    reasons.push("An approved First Product Slice is required.");
  }
  return { product, brief, definition, slice, reasons };
}

export async function planEntryBlockers(productId: string) {
  const gate = await architectureEntryBlockers(productId);
  const reasons = [...gate.reasons];
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
