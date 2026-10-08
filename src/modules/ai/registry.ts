import "server-only";

import {
  describeAIConfiguration,
  type AIConfigurationIssue,
  type AIProviderId,
  type AITask,
} from "@/modules/ai/config";
import { AIFailure } from "@/modules/ai/failures";
import { GeminiProvider } from "@/modules/ai/gemini";
import { OllamaProvider } from "@/modules/ai/ollama";
import { OpenAIProvider } from "@/modules/ai/openai";
import type { AIProvider } from "@/modules/ai/provider";

/**
 * Resolves the active provider and model into one AIProvider.
 * Product modules call getAIProvider() and do not branch on the provider name.
 * A missing provider fails. Another provider is never substituted.
 *
 * Anthropic, Azure OpenAI, and AWS Bedrock are not registered. A later provider
 * is a new adapter plus one branch here.
 */
export function createConfiguredProvider(task?: AITask): AIProvider {
  const configuration = describeAIConfiguration(task);
  if (!configuration.configured || !configuration.providerId || !configuration.model) {
    throw configurationError(configuration.issue, configuration.providerLabel, configuration.model);
  }
  if (configuration.providerId === "GOOGLE_GEMINI") return new GeminiProvider(configuration.model);
  if (configuration.providerId === "OLLAMA") return new OllamaProvider(configuration.model);
  if (configuration.providerId === "OPENAI") return new OpenAIProvider(configuration.model);
  throw unsupported(configuration.providerId);
}

function unsupported(provider: AIProviderId): never {
  throw new AIFailure(
    `AI provider "${provider}" is not supported. Supported providers are Google Gemini, Ollama, and OpenAI. No other provider was used. Nothing was generated.`,
    "NOT_CONFIGURED",
  );
}

function configurationError(issue: AIConfigurationIssue, providerLabel: string | null, model: string | null): never {
  if (issue === "provider_unsupported") {
    throw new AIFailure(
      `AI provider "${providerLabel ?? "unknown"}" is not supported. Supported providers are Google Gemini, Ollama, and OpenAI. No other provider was used. Nothing was generated.`,
      "NOT_CONFIGURED",
    );
  }
  if (issue === "model_missing") {
    throw new AIFailure(
      "AI is not configured. Set a model for the selected provider. No model was substituted. Nothing was generated.",
      "MODEL_NOT_CONFIGURED",
    );
  }
  if (issue === "model_incompatible") {
    throw new AIFailure(
      model
        ? `The model "${model}" cannot be used with ${providerLabel ?? "the selected provider"}. No other model was substituted. Nothing was generated.`
        : "The model identifier cannot be used with the selected provider. No other model was substituted. Nothing was generated.",
      "MODEL_NOT_AVAILABLE",
    );
  }
  if (issue === "endpoint_invalid") {
    throw new AIFailure(
      "Ollama is not configured. Set OLLAMA_BASE_URL on the server to an http or https address without a username or password. Nothing was generated.",
      "NOT_CONFIGURED",
    );
  }
  throw new AIFailure(
    "AI is not configured. AI Product Builder needs an AI model connection before it can run Discovery. Open Settings for the server setup. Nothing was generated.",
    "NOT_CONFIGURED",
  );
}
