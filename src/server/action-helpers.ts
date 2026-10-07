import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { type ActionState } from "@/lib/action-state";
import { DomainError } from "@/modules/shared/errors";

export function formValues(formData: FormData) {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

export function actionFailure(error: unknown): ActionState {
  unstable_rethrow(error);
  if (error instanceof DomainError) {
    return { status: "error", message: error.message };
  }
  console.error(error);
  return {
    status: "error",
    message: "Something went wrong while saving. Try again.",
  };
}

export function refreshWorkspace(productId?: string, workItemId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/work-items");
  revalidatePath("/approvals");
  revalidatePath("/activity");
  revalidatePath("/agents");
  if (productId) {
    revalidatePath(`/products/${productId}`, "layout");
  }
  if (workItemId) {
    revalidatePath(`/work-items/${workItemId}`);
  }
}
