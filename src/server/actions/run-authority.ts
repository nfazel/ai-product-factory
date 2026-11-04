"use server";

import { headers } from "next/headers";

import { invalidState, type ActionState } from "@/lib/action-state";
import { confirmLocalOperator, operatorConfirmationAvailable, resolveOperatorCredential } from "@/modules/feature-review/authorization";
import { getCurrentActor } from "@/modules/identity/actor";
import { startFeatureRun } from "@/modules/run-authority/runner";
import { grantRunAuthority, stopRunAuthority } from "@/modules/run-authority/service";
import { DomainError } from "@/modules/shared/errors";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";
import { z } from "zod";

const grantSchema = z.object({
  productId: z.string().trim().min(1),
  planId: z.string().trim().min(1),
  understood: z.string().default("").refine((value) => value === "yes", "Tick the box to confirm you understand what the Builder may and may not do."),
  credential: z.string().default(""),
});
const authoritySchema = z.object({ productId: z.string().trim().min(1), authorityId: z.string().trim().min(1) });

/** Same-origin only, like the other protected actions. */
async function assertLocalOrigin() {
  const h = await headers();
  const origin = new URL(h.get("origin") ?? "");
  if (!["http:", "https:"].includes(origin.protocol) || origin.host !== h.get("host") || (origin.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) {
    throw new DomainError("Open this workspace on localhost or a secure same-origin connection.");
  }
}

/** A person signs the grant, then the Builder starts. The run goes on in the background; this returns at once. */
export async function startBuildingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = grantSchema.safeParse(formValues(formData));
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
    const authority = await grantRunAuthority({ productId: parsed.data.productId, planId: parsed.data.planId, credential });
    startFeatureRun({ productId: parsed.data.productId, authorityId: authority.id });
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: "The Builder has started. You can leave this page; it keeps going and stops when it needs you." };
  } catch (error) {
    return actionFailure(error);
  }
}

/** Carries on from where each task really is. The authority was already signed, so nothing is asked again. */
export async function continueBuildingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = authoritySchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await assertLocalOrigin();
    const result = startFeatureRun(parsed.data);
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: result === "started" ? "The Builder is carrying on." : "The Builder is already running." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function stopBuildingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = authoritySchema.safeParse(formValues(formData));
  if (!parsed.success) return invalidState(parsed.error.issues);
  try {
    await assertLocalOrigin();
    await stopRunAuthority({ authorityId: parsed.data.authorityId, stoppedBy: getCurrentActor().name });
    refreshWorkspace(parsed.data.productId);
    return { status: "success", message: "The Builder was stopped. It finishes the step it is on and does nothing more." };
  } catch (error) {
    return actionFailure(error);
  }
}
