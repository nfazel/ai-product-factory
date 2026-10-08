import "server-only";

import {
  PRODUCT_STATUS_LABEL,
  STAGE_META,
} from "@/domain/constants";
import { recordActivity } from "@/modules/activity/service";
import { findCurrentBrief } from "@/modules/discovery/repository";
import { stageMoveBlockers } from "@/modules/release/service";
import { buildProgressionBlockers } from "@/modules/requirements/gates";
import { DomainError } from "@/modules/shared/errors";
import {
  countProducts,
  findProductRow,
  insertProduct,
  listProductRows,
  saveProduct,
} from "@/modules/product/repository";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "@/modules/product/types";

export async function listProducts(limit?: number) {
  return listProductRows(limit);
}

export async function getProduct(id: string) {
  return findProductRow(id);
}

export async function countActiveProducts() {
  return countProducts("ACTIVE");
}

export async function createProduct(input: CreateProductInput) {
  const product = await insertProduct({
    ...input,
    status: "ACTIVE",
    currentStage: "EXPLORE",
  });

  await recordActivity({
    productId: product.id,
    type: "PRODUCT_CREATED",
    description: `Created product "${product.name}".`,
  });

  return product;
}

export async function updateProduct(input: UpdateProductInput) {
  const existing = await findProductRow(input.id);
  if (!existing) throw new DomainError("Product not found.", "NOT_FOUND");

  const changes: string[] = [];
  if (existing.name !== input.name) changes.push("name");
  if (existing.description !== input.description) changes.push("description");
  if (existing.vision !== input.vision) changes.push("vision");
  if (existing.problemStatement !== input.problemStatement) {
    changes.push("problem statement");
  }
  if (existing.targetUsers !== input.targetUsers) changes.push("target users");
  if (existing.status !== input.status) {
    changes.push(`status to ${PRODUCT_STATUS_LABEL[input.status]}`);
  }
  if (existing.currentStage !== input.currentStage) {
    if (input.currentStage === "DEFINE") {
      const brief = await findCurrentBrief(existing.id);
      if (existing.currentStage !== "EXPLORE" || brief?.status !== "APPROVED") {
        throw new DomainError("Approve the product brief before moving to Define.");
      }
    }
    if (input.currentStage === "BUILD") {
      const gate = await buildProgressionBlockers(existing.id);
      if (gate.reasons.length > 0) {
        throw new DomainError(gate.reasons.join(" "));
      }
    }
    if (input.currentStage === "PROVE") {
      const { proveAdvanceBlockers } = await import("@/modules/guidance/advance");
      const reasons = await proveAdvanceBlockers(existing.id);
      if (reasons.length > 0) throw new DomainError(reasons.join(" "));
    }
    if (input.currentStage === "SHIP" || input.currentStage === "LEARN") {
      const reasons = await stageMoveBlockers(existing.id, input.currentStage);
      if (reasons.length > 0) throw new DomainError(reasons.join(" "));
    }
    changes.push(`stage to ${STAGE_META[input.currentStage].label}`);
  }

  const product = await saveProduct(input);

  if (changes.length > 0) {
    await recordActivity({
      productId: product.id,
      type: "PRODUCT_UPDATED",
      description: `Updated ${changes.join(", ")}.`,
    });
  }
  if (existing.currentStage !== "LEARN" && product.currentStage === "LEARN") {
    await recordActivity({
      productId: product.id,
      type: "MOVED_TO_LEARN",
      description: "A person moved the product to Learn.",
    });
  }

  return product;
}
