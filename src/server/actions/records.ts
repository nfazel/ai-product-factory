"use server";

import { invalidState, type ActionState } from "@/lib/action-state";
import { addAcceptanceCriterion } from "@/modules/acceptance/service";
import { createAcceptanceSchema } from "@/modules/acceptance/schema";
import { recordDecision } from "@/modules/decision/service";
import { createDecisionSchema } from "@/modules/decision/schema";
import {
  requestApproval,
  resolveApproval,
} from "@/modules/approval/service";
import {
  createApprovalSchema,
  resolveApprovalSchema,
} from "@/modules/approval/schema";
import {
  actionFailure,
  formValues,
  refreshWorkspace,
} from "@/server/action-helpers";

export async function addCriterionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createAcceptanceSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);

  try {
    const criterion = await addAcceptanceCriterion(parsed.data);
    refreshWorkspace(undefined, criterion.workItemId);
    return { status: "success", message: "Acceptance criterion added." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function recordDecisionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createDecisionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);

  try {
    const decision = await recordDecision(parsed.data);
    refreshWorkspace(decision.productId, decision.workItemId ?? undefined);
    return { status: "success", message: "Decision recorded." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function requestApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createApprovalSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);

  try {
    const approval = await requestApproval(parsed.data);
    refreshWorkspace(approval.productId, approval.workItemId ?? undefined);
    return { status: "success", message: "Approval requested." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function resolveApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resolveApprovalSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);

  const intent = formData.get("intent");
  if (intent !== "APPROVED" && intent !== "REJECTED") {
    return { status: "error", message: "Choose approve or reject." };
  }

  try {
    const approval = await resolveApproval(parsed.data.id, intent, {
      comments: parsed.data.comments,
      approvedBy: parsed.data.approvedBy,
    });
    refreshWorkspace(approval.productId, approval.workItemId ?? undefined);
    return {
      status: "success",
      message: intent === "APPROVED" ? "Approval granted." : "Approval rejected.",
    };
  } catch (error) {
    return actionFailure(error);
  }
}
