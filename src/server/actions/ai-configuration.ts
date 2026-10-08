"use server";

import { z } from "zod";

import { invalidState, type ActionState } from "@/lib/action-state";
import { canonicalProviderId } from "@/modules/ai/config";
import { testProviderConnection } from "@/modules/ai/connection";
import { removeProviderCredential, saveProviderCredential } from "@/modules/ai/credentials";
import { ollamaModelInstalled, probeOllama } from "@/modules/ai/ollama";
import { saveAISelection } from "@/modules/ai/selection";
import { getCurrentActor } from "@/modules/identity/actor";
import { DomainError } from "@/modules/shared/errors";
import { actionFailure, formValues, refreshWorkspace } from "@/server/action-helpers";

const selection = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1).max(200),
});

export async function saveAIConfigurationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = selection.safeParse({
    provider: values.provider,
    model: values.model,
  });
  if (!parsed.success) return invalidState(parsed.error.issues, "Choose a provider and a model.");
  try {
    const provider = canonicalProviderId(parsed.data.provider);
    if (provider === "OLLAMA") {
      const probe = await probeOllama();
      if (probe.running && !ollamaModelInstalled(probe.models, parsed.data.model)) {
        return {
          status: "error",
          message: probe.models.length === 0
            ? "No local models are installed. Install a model with Ollama before using this provider."
            : "That model is not installed in Ollama. Select an installed model. No other model was substituted.",
        };
      }
    }
    await saveAISelection({
      provider: parsed.data.provider,
      model: parsed.data.model,
      actor: getCurrentActor().name,
    });
    refreshWorkspace();
    return { status: "success", message: "AI configuration saved." };
  } catch (error) {
    return actionFailure(error);
  }
}

const credentialInput = z.object({
  provider: z.string().trim().min(1),
  apiKey: z.string().trim().min(1).max(512),
});

export async function saveProviderCredentialAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const provider = values.provider ?? "";
  let apiKey = values.apiKey ?? "";
  delete values.apiKey;
  const parsed = credentialInput.safeParse({ provider, apiKey });
  apiKey = "";
  if (!parsed.success) return invalidState(parsed.error.issues, "Enter an API key.");
  const credential = parsed.data.apiKey;
  try {
    const saved = await saveProviderCredential({
      provider: parsed.data.provider,
      credential,
      actor: getCurrentActor().name,
    });
    refreshWorkspace();
    return {
      status: "success",
      message: saved.replaced ? "API key replaced. The previous key is no longer active." : "API key saved.",
    };
  } catch (error) {
    return credentialFailure(error, "The API key was not saved.");
  }
}

export async function removeProviderCredentialAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    await removeProviderCredential({
      provider: values.provider ?? "",
      confirm: values.confirm ?? "",
      actor: getCurrentActor().name,
    });
    refreshWorkspace();
    return { status: "success", message: "Configured API key removed." };
  } catch (error) {
    return credentialFailure(error, "The API key was not removed.");
  }
}

export async function testProviderConnectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const result = await testProviderConnection({ provider: values.provider ?? "" });
    refreshWorkspace();
    return { status: result.ok ? "success" : "error", message: result.message };
  } catch (error) {
    return credentialFailure(error, "Provider unavailable");
  }
}

function credentialFailure(error: unknown, fallback: string): ActionState {
  if (error instanceof DomainError) return { status: "error", message: error.message };
  console.error("[ai] credential action failed");
  return { status: "error", message: fallback };
}
