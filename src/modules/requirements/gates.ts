import "server-only";

import { db } from "@/lib/db";
import { findCurrentBrief } from "@/modules/discovery/repository";
import { findProductRow } from "@/modules/product/repository";
import { DomainError } from "@/modules/shared/errors";

export async function approvedBrief(productId: string) {
  const brief = await findCurrentBrief(productId);
  if (!brief || brief.status !== "APPROVED") return null;
  return brief;
}

export async function definitionEntryBlockers(productId: string) {
  const product = await findProductRow(productId);
  if (!product) throw new DomainError("Product not found.", "NOT_FOUND");
  const reasons: string[] = [];
  if (product.currentStage !== "DEFINE") {
    reasons.push(
      `The product is in ${product.currentStage}. The Requirements Agent only runs during DEFINE.`,
    );
  }
  const brief = await findCurrentBrief(productId);
  if (!brief) {
    reasons.push("There is no Product Brief. Complete Product Discovery and approve the brief first.");
  } else if (brief.status !== "APPROVED") {
    reasons.push(
      `The current Product Brief is ${brief.status}. Approve the Product Brief before generating a product definition.`,
    );
  }
  return { product, brief, reasons };
}

export async function buildProgressionBlockers(productId: string) {
  const product = await findProductRow(productId);
  if (!product) throw new DomainError("Product not found.", "NOT_FOUND");
  const reasons: string[] = [];
  if (product.currentStage !== "DEFINE") {
    reasons.push("Move to Build is available when the product is in Define.");
  }
  const brief = await findCurrentBrief(productId);
  if (brief?.status !== "APPROVED") {
    reasons.push("An approved Product Brief is required.");
  }
  const definition = await db.productDefinition.findUnique({ where: { productId } });
  const approval = await db.approval.findFirst({
    where: { productId, approvalType: "PRODUCT_DEFINITION", status: "APPROVED" },
  });
  if (definition?.status !== "APPROVED" || !approval) {
    reasons.push("An approved Product Definition is required.");
  }
  const slice = await db.productSlice.findFirst({
    where: { productId, status: "APPROVED" },
  });
  if (!slice) {
    reasons.push("An approved First Product Slice is required.");
  }
  return { product, reasons };
}
