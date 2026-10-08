import "server-only";

import { db } from "@/lib/db";
import {
  canonicalProviderId,
  currentAISelection,
  modelFitsProvider,
  providerSpec,
  rememberAISelection,
  selectionFromEnvironment,
} from "@/modules/ai/config";
import { AIFailure } from "@/modules/ai/failures";

const SELECTION_ID = "factory";

export async function ensureAISelection() {
  if (process.env.AI_SELECTION_DISABLE_STORE === "1") {
    rememberAISelection(selectionFromEnvironment());
    return currentAISelection();
  }
  try {
    const row = await db.aiSelection.findUnique({ where: { id: SELECTION_ID } });
    if (!row) {
      rememberAISelection(selectionFromEnvironment());
    } else {
      rememberAISelection({
        provider: row.provider,
        model: row.model,
        source: "settings",
      });
    }
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "unavailable";
    console.error("[ai] selection store unavailable", code);
    throw new AIFailure(
      "AI configuration could not be read. Nothing was generated.",
      "PROVIDER_UNAVAILABLE",
    );
  }
  return currentAISelection();
}

export async function saveAISelection(input: { provider: string; model: string; actor: string }) {
  const provider = canonicalProviderId(input.provider);
  if (!provider) {
    throw new AIFailure(
      "That provider is not supported. Supported providers are Google Gemini, Ollama, and OpenAI. No other provider was used.",
      "NOT_CONFIGURED",
    );
  }
  const model = input.model.trim();
  if (!model) {
    throw new AIFailure(
      "Set a model for the selected provider. No model was substituted.",
      "MODEL_NOT_CONFIGURED",
    );
  }
  if (!modelFitsProvider(provider, model) || !/^[\w./:@+-]{1,200}$/.test(model)) {
    throw new AIFailure(
      `${providerSpec(provider).label} cannot use that model identifier. No other model was substituted.`,
      "MODEL_NOT_AVAILABLE",
    );
  }

  const previous = await ensureAISelection();
  const previousProvider = canonicalProviderId(previous.provider);
  const previousModel = previous.model.trim();
  const actor = input.actor.trim() || "Local user";

  await db.aiSelection.upsert({
    where: { id: SELECTION_ID },
    create: { id: SELECTION_ID, provider, model, updatedBy: actor },
    update: { provider, model, updatedBy: actor },
  });
  rememberAISelection({ provider, model, source: "settings" });

  const descriptions: string[] = [];
  if (previousProvider !== provider) {
    descriptions.push(
      `AI provider changed from ${previousProvider ? providerSpec(previousProvider).label : "none"} to ${providerSpec(provider).label}`,
    );
  }
  if (previousModel !== model) {
    descriptions.push(`AI model changed from ${previousModel || "none"} to ${model}`);
  }
  if (descriptions.length === 0) return { provider, model, recorded: false };
  await db.aiSelectionChange.createMany({
    data: descriptions.map((description) => ({ description, actor })),
  });
  return { provider, model, recorded: true };
}

export async function listAISelectionChanges(limit = 12) {
  if (process.env.AI_SELECTION_DISABLE_STORE === "1") return [];
  const rows = await db.aiSelectionChange.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, description: true, actor: true, createdAt: true },
  });
  return rows;
}

export function selectionId() {
  return SELECTION_ID;
}
