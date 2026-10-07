"use server";

import { invalidState, type ActionState } from "@/lib/action-state";
import { updateAcceptanceStatus } from "@/modules/acceptance/service";
import { updateAcceptanceSchema } from "@/modules/acceptance/schema";
import {
  addWorkItemDependency,
  createWorkItem,
  updateWorkItem,
} from "@/modules/work-item/service";
import {
  createWorkItemSchema,
  dependencySchema,
  updateWorkItemSchema,
} from "@/modules/work-item/schema";
import {
  actionFailure,
  formValues,
  refreshWorkspace,
} from "@/server/action-helpers";

export async function createWorkItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createWorkItemSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);

  try {
    const item = await createWorkItem(parsed.data);
    refreshWorkspace(item.productId, item.id);
    return { status: "success", message: "Work item added to the backlog." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateWorkItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateWorkItemSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);

  try {
    const item = await updateWorkItem(parsed.data);
    refreshWorkspace(item.productId, item.id);
    return { status: "success", message: "Work item updated." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function addDependencyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = dependencySchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);

  try {
    const item = await addWorkItemDependency(
      parsed.data.workItemId,
      parsed.data.dependsOnId,
    );
    refreshWorkspace(item.productId, item.id);
    return { status: "success", message: "Dependency added." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateCriterionStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateAcceptanceSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);

  try {
    const criterion = await updateAcceptanceStatus(
      parsed.data.id,
      parsed.data.status,
    );
    refreshWorkspace(undefined, criterion.workItemId);
    return { status: "success", message: "Acceptance criterion updated." };
  } catch (error) {
    return actionFailure(error);
  }
}
