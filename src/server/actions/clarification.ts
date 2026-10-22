"use server";

import { z } from "zod";

import { invalidState, type ActionState } from "@/lib/action-state";
import { CLARIFICATION_KINDS, type ClarificationReviewTarget } from "@/modules/clarification/materiality";
import { keepClarificationVersion, saveClarificationAnswer } from "@/modules/clarification/service";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";

function done(productId: string, message: string): ActionState {
  refreshWorkspace(productId);
  return { status: "success", message };
}

const TARGETS = ["BRIEF", "DEFINITION", "DESIGN", "DELIVERY", "GOVERNANCE", "PLAN", "RELEASE"] as const;

export async function saveClarificationAnswerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().trim().min(1),
    kind: z.enum(CLARIFICATION_KINDS),
    questionId: z.string().trim().min(1),
    answer: z.string().trim().min(2),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    const saved = await saveClarificationAnswer(parsed.data);
    if (!saved.changed) return done(parsed.data.productId, "The answer is unchanged.");
    if (saved.material && saved.impacts.length > 0) {
      return done(parsed.data.productId, "Answer updated. Affected artefacts were marked for review and were not rewritten.");
    }
    return done(parsed.data.productId, saved.material ? "Answer updated." : "Answer updated. No downstream artefact needed review.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function keepClarificationVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().trim().min(1),
    target: z.enum(TARGETS),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await keepClarificationVersion(parsed.data.productId, parsed.data.target as ClarificationReviewTarget);
    return done(parsed.data.productId, "The current version stays in place. Nothing was regenerated.");
  } catch (error) {
    return actionFailure(error);
  }
}
