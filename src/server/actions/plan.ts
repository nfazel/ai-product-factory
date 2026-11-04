"use server";

import { headers } from "next/headers";

import { invalidState, type ActionState } from "@/lib/action-state";
import { approveProductBrief } from "@/modules/discovery/service";
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
