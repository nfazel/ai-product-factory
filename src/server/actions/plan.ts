"use server";

import { headers } from "next/headers";

import { invalidState, type ActionState } from "@/lib/action-state";
import { confirmLocalOperator, operatorConfirmationAvailable, resolveOperatorCredential } from "@/modules/feature-review/authorization";
import { approveProductBrief } from "@/modules/discovery/service";
import { approvePlan } from "@/modules/plan/approve";
import { startFeatureRun } from "@/modules/run-authority/runner";
import { grantRunAuthority } from "@/modules/run-authority/service";
import { startPreparation } from "@/modules/plan/prepare-runner";
import { startTechnicalPreparation } from "@/modules/plan/prepare-technical-runner";
import { DomainError } from "@/modules/shared/errors";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";
import { z } from "zod";

const schema = z.object({ productId: z.string().trim().min(1) });

/** Same-origin only, like the other protected actions. */
async function assertLocalOrigin() {
  const h = await headers();
  const origin = new URL(h.get("origin") ?? "");
  if (!["http:", "https:"].includes(origin.protocol) || origin.host !== h.get("host") || (origin.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) {
    throw new DomainError("Open this workspace on localhost or a secure same-origin connection.");
  }
}

/** The person approves the brief, the one part that has to be approved before the next can be drafted, and the features are drafted. */
export async function approveBriefAndDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await assertLocalOrigin();
    await approveProductBrief(parsed.data.productId);
    startPreparation(parsed.data.productId);
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: "The brief is approved and the features are being drafted. You can leave this page." };
  } catch (error) {
    return actionFailure(error);
  }
}

/** Starts, or starts again, drafting the features from the approved brief. */
export async function draftFeaturesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await assertLocalOrigin();
    const result = startPreparation(parsed.data.productId);
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: result === "started" ? "Drafting the features." : "The features are already being drafted." };
  } catch (error) {
    return actionFailure(error);
  }
}

/** The checkpoint: the person has read the features and the AI may draft the design, the work and the rules. Records no approval. */
export async function confirmFeaturesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await assertLocalOrigin();
    const result = startTechnicalPreparation(parsed.data.productId);
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: result === "started" ? "Drafting the design, the work and the rules." : "That is already being drafted." };
  } catch (error) {
    return actionFailure(error);
  }
}

const startSchema = schema.extend({
  understood: z.string().default("").refine((value) => value === "yes", "Tick the box to confirm you understand what the Builder may and may not do."),
  credential: z.string().default(""),
});

/** The person signs the plan once. The approvals the later stages rely on are recorded in order as theirs. */
export async function approvePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await assertLocalOrigin();
    const result = await approvePlan(parsed.data.productId);
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: result.recorded.length > 0 ? "The plan is approved. Building can start." : "The plan was already approved." };
  } catch (error) {
    refreshWorkspace(parsed.data.productId);
    return actionFailure(error);
  }
}

/** The same approval, and the Builder is given authority for the approved plan and started. The operator is confirmed first, so nothing is approved if that fails. */
export async function approvePlanAndStartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = startSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues, parsed.error.issues[0]?.message);
  try {
    await assertLocalOrigin();
    if (!operatorConfirmationAvailable()) throw new DomainError("Protected operator confirmation is unavailable. Ask the local operator to set it up before handing the plan to the Builder.");
    const credential = resolveOperatorCredential(parsed.data.credential);
    try {
      confirmLocalOperator(credential);
    } catch {
      throw new DomainError("Local operator confirmation was not accepted. Nothing was changed.");
    }
    const result = await approvePlan(parsed.data.productId);
    const authority = await grantRunAuthority({ productId: parsed.data.productId, planId: result.planId, credential });
    startFeatureRun({ productId: parsed.data.productId, authorityId: authority.id });
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: "The plan is approved and the Builder has started. You can leave this page; it keeps going and stops when it needs you." };
  } catch (error) {
    refreshWorkspace(parsed.data.productId);
    return actionFailure(error);
  }
}
