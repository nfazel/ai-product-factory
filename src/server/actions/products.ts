"use server";

import { redirect } from "next/navigation";

import { invalidState, type ActionState } from "@/lib/action-state";
import { createProduct, updateProduct } from "@/modules/product/service";
import {
  createProductSchema,
  updateProductSchema,
} from "@/modules/product/schema";
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
    redirect(`/products/${product.id}`);
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
