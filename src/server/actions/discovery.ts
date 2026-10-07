"use server";

import { invalidState, type ActionState } from "@/lib/action-state";
import {
  approveProductBrief,
  continueDiscovery,
  editProductBrief,
  moveDiscoveryToDefine,
  requestDiscoveryReview,
  retryDiscovery,
  setAssumptionStatus,
  startDiscovery,
} from "@/modules/discovery/service";
import {
  assumptionStatusSchema,
  discoveryMessageSchema,
  discoveryProductSchema,
  editBriefSchema,
  startDiscoverySchema,
} from "@/modules/discovery/schema";
import {
  actionFailure,
  formValues,
  refreshWorkspace,
} from "@/server/action-helpers";

export async function startDiscoveryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = startDiscoverySchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await startDiscovery(parsed.data);
    refreshWorkspace(parsed.data.productId);
    return {
      status: "success",
      message: "Discovery started. The product brief is taking shape.",
    };
  } catch (error) {
    refreshWorkspace(parsed.data.productId);
    return actionFailure(error);
  }
}

export async function continueDiscoveryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = discoveryMessageSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await continueDiscovery(parsed.data.productId, parsed.data.message);
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: "Discovery brief updated." };
  } catch (error) {
    refreshWorkspace(parsed.data.productId);
    return actionFailure(error);
  }
}

export async function reviewDiscoveryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = discoveryProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await requestDiscoveryReview(parsed.data.productId);
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: "Discovery review added to the brief." };
  } catch (error) {
    refreshWorkspace(parsed.data.productId);
    return actionFailure(error);
  }
}

export async function retryDiscoveryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = discoveryProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await retryDiscovery(parsed.data.productId);
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: "Discovery turn retried." };
  } catch (error) {
    refreshWorkspace(parsed.data.productId);
    return actionFailure(error);
  }
}

export async function editBriefAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = editBriefSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await editProductBrief(parsed.data);
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: "Your edit is now the confirmed text." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function assumptionStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = assumptionStatusSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await setAssumptionStatus(parsed.data);
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: "Assumption status saved." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approveBriefAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = discoveryProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await approveProductBrief(parsed.data.productId);
    refreshWorkspace(parsed.data.productId);
    return {
      status: "success",
      message: "Discovery approved. Product is ready to move to Define.",
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function moveToDefineAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = discoveryProductSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await moveDiscoveryToDefine(parsed.data.productId);
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: "Product moved to Define." };
  } catch (error) {
    return actionFailure(error);
  }
}
