"use server";

import { invalidState, type ActionState } from "@/lib/action-state";
import {
  acknowledgeRequirementsChange,
  addressFinding,
  addPastedRequirements,
  addTraceLink,
  addUploadedRequirements,
  analyseRequirements,
  answerIntakeQuestion,
  confirmRequirement,
  draftBriefFromRequirements,
  prepareRequirementsBrief,
  setRequirementDisposition,
} from "@/modules/intake/service";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";
import { z } from "zod";

function done(productId: string, message: string): ActionState {
  refreshWorkspace(productId);
  return { status: "success", message };
}

export async function pasteRequirementsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().trim().min(1),
    title: z.string().trim().max(160).optional().default(""),
    text: z.string().min(1),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await addPastedRequirements(parsed.data.productId, parsed.data.title, parsed.data.text);
    return done(parsed.data.productId, "Requirements stored. The original wording is unchanged by later analysis.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function uploadRequirementsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productId = String(formData.get("productId") ?? "");
  const file = formData.get("file");
  if (!productId || !(file instanceof File)) return { status: "error", message: "Choose a requirements file." };
  try {
    await addUploadedRequirements(productId, file);
    return done(productId, "Document stored. Only extracted text is analysed.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function analyseRequirementsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return { status: "error", message: "Product is missing." };
  try {
    await analyseRequirements(productId);
    return done(productId, "Analysis stored. Counts come from the saved requirements, not from a model summary.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function confirmRequirementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().trim().min(1),
    requirementId: z.string().trim().min(1),
    confirmation: z.enum(["CONFIRMED", "NEEDS_CHANGE", "REJECTED"]),
    interpretation: z.string().optional().default(""),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await confirmRequirement(parsed.data.productId, parsed.data.requirementId, parsed.data.confirmation, parsed.data.interpretation);
    return done(parsed.data.productId, "Interpretation updated. The source wording was not changed.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function answerQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().trim().min(1),
    questionId: z.string().trim().min(1),
    answer: z.string().trim().min(2),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await answerIntakeQuestion(parsed.data.productId, parsed.data.questionId, parsed.data.answer);
    return done(parsed.data.productId, "Answer recorded. The source requirement was not changed.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function dispositionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().trim().min(1),
    requirementId: z.string().trim().min(1),
    disposition: z.enum(["IN_SCOPE", "OUT_OF_SCOPE", "DEFERRED", "DUPLICATE", "SUPERSEDED", "NOT_A_REQUIREMENT"]),
    reason: z.string().optional().default(""),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await setRequirementDisposition(parsed.data.productId, parsed.data.requirementId, parsed.data.disposition, parsed.data.reason);
    return done(parsed.data.productId, "Disposition recorded by a person.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function traceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().trim().min(1),
    requirementId: z.string().trim().min(1),
    target: z.string().trim().min(3),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  const [targetKind, targetId] = parsed.data.target.split("|");
  const kinds = ["PRODUCT_OUTCOME", "PRODUCT_CAPABILITY", "WORK_ITEM", "ACCEPTANCE_CRITERION", "NFR"] as const;
  if (!kinds.includes(targetKind as (typeof kinds)[number]) || !targetId) {
    return { status: "error", message: "Choose a definition item to link." };
  }
  try {
    await addTraceLink(parsed.data.productId, parsed.data.requirementId, targetKind as (typeof kinds)[number], targetId);
    return done(parsed.data.productId, "Link confirmed by a person.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function addressFindingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    productId: z.string().trim().min(1),
    findingId: z.string().trim().min(1),
    status: z.enum(["ADDRESSED", "DISMISSED"]),
  }).safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await addressFinding(parsed.data.productId, parsed.data.findingId, parsed.data.status);
    return done(parsed.data.productId, "Finding updated. The source requirement was not changed.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function draftBriefAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productId = String(formData.get("productId") ?? "");
  try {
    await draftBriefFromRequirements(productId);
    return done(productId, "Draft Product Brief created from the requirements. It is not approved.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function prepareBriefAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productId = String(formData.get("productId") ?? "");
  try {
    await prepareRequirementsBrief(productId);
    return done(productId, "The brief is ready for a person to approve.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function acknowledgeChangeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productId = String(formData.get("productId") ?? "");
  try {
    await acknowledgeRequirementsChange(productId);
    return done(productId, "Change reviewed. The approved definition was left as it was.");
  } catch (error) {
    return actionFailure(error);
  }
}
