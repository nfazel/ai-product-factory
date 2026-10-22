"use server";

import { z } from "zod";

import { invalidState, type ActionState } from "@/lib/action-state";
import { getCurrentActor } from "@/modules/identity/actor";
import { credentialPresence } from "@/modules/source-control/github";
import { validateGitHubIdentity } from "@/modules/source-control/github-account";
import { readStoredGitHubAccess, removeGitHubCredential, saveGitHubCredential } from "@/modules/source-control/github-credentials";
import { validateGitHubConnection } from "@/modules/source-control/service";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";

const credentialSchema = z.object({
  mode: z.enum(["TOKEN", "APP"]),
  token: z.string().optional(),
  appId: z.string().optional(),
  installationId: z.string().optional(),
  privateKey: z.string().optional(),
});

export async function saveGitHubCredentialAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = credentialSchema.safeParse({
    mode: values.mode,
    token: values.token,
    appId: values.appId,
    installationId: values.installationId,
    privateKey: values.privateKey,
  });
  values.token = "";
  values.privateKey = "";
  if (!parsed.success) return invalidState(parsed.error.issues, "Choose a GitHub authentication method.");
  const token = parsed.data.token ?? "";
  const privateKey = parsed.data.privateKey ?? "";
  try {
    const saved = await saveGitHubCredential({
      actor: getCurrentActor().name,
      mode: parsed.data.mode,
      token,
      appId: parsed.data.appId,
      installationId: parsed.data.installationId,
      privateKey,
    });
    refreshWorkspace();
    return {
      status: "success",
      message: saved.replaced
        ? "GitHub credential replaced. Validate the connection. Nothing was published."
        : "GitHub credential saved. Validate the connection. Nothing was published.",
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function validateGitHubIdentityAction(): Promise<ActionState> {
  try {
    const stored = await readStoredGitHubAccess();
    if (!stored && credentialPresence().configured) {
      await validateGitHubConnection();
      refreshWorkspace();
      return { status: "success", message: "GitHub connection validated from the server environment. Nothing was published." };
    }
    const identity = await validateGitHubIdentity(getCurrentActor().name);
    refreshWorkspace();
    return { status: "success", message: `Connected as ${identity.login}. Choose a repository for each product. Nothing was published.` };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function removeGitHubCredentialAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    await removeGitHubCredential({ actor: getCurrentActor().name, confirm: values.confirm ?? "" });
    refreshWorkspace();
    return { status: "success", message: "GitHub credential removed. No repository was changed." };
  } catch (error) {
    return actionFailure(error);
  }
}
