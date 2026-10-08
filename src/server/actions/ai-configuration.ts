"use server";

import { z } from "zod";

import { invalidState, type ActionState } from "@/lib/action-state";
import { canonicalProviderId } from "@/modules/ai/config";
import { ollamaModelInstalled, probeOllama } from "@/modules/ai/ollama";
import { saveAISelection } from "@/modules/ai/selection";
import { getCurrentActor } from "@/modules/identity/actor";
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
    return { status: "success", message: "AI configuration saved. Credentials stay in the server environment." };
  } catch (error) {
    return actionFailure(error);
  }
}
