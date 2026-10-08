"use server";

import { redirect } from "next/navigation";

import { invalidState, type ActionState } from "@/lib/action-state";
import { PRODUCT_STAGES } from "@/domain/constants";
import { createProduct, getProduct, updateProduct } from "@/modules/product/service";
import {
  createProductSchema,
  updateProductSchema,
} from "@/modules/product/schema";
import { z } from "zod";
import {
  actionFailure,
  formValues,
  refreshWorkspace,
} from "@/server/action-helpers";

export async function createProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);

  try {
    const product = await createProduct(parsed.data);
    refreshWorkspace(product.id);
    redirect(product.startMode === "EXISTING_REQUIREMENTS" ? `/products/${product.id}/discovery` : `/products/${product.id}`);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);

  try {
    const product = await updateProduct(parsed.data);
    refreshWorkspace(product.id);
    return { status: "success", message: "Product updated." };
  } catch (error) {
    return actionFailure(error);
  }
}

const moveStageSchema = z.object({
  productId: z.string().trim().min(1),
  stage: z.enum(PRODUCT_STAGES),
});

export async function moveStageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = moveStageSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  const product = await getProduct(parsed.data.productId);
  if (!product) return { status: "error", message: "Product not found." };
  try {
    await updateProduct({
      id: product.id,
      name: product.name,
      description: product.description,
      vision: product.vision,
      problemStatement: product.problemStatement,
      targetUsers: product.targetUsers,
      status: product.status,
      currentStage: parsed.data.stage,
    });
    refreshWorkspace(product.id);
    return { status: "success", message: "Stage updated." };
  } catch (error) {
    return actionFailure(error);
  }
}
