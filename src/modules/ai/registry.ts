import "server-only";

import { AnthropicProvider } from "@/modules/ai/anthropic";
import {
  describeAIConfiguration,
  type AITask,
} from "@/modules/ai/config";
import { AINotConfiguredError } from "@/modules/ai/errors";
import { OpenAIProvider } from "@/modules/ai/openai";
import type { AIProvider } from "@/modules/ai/provider";
import { DomainError } from "@/modules/shared/errors";

/**
 * Resolves AI_PROVIDER, AI_MODEL, and the matching server credential into an AIProvider.
 * Product modules call getAIProvider() and do not branch on the provider name.
 * Google and Azure OpenAI are intentionally absent until a real adapter exists.
 */
export function createConfiguredProvider(task?: AITask): AIProvider {
  const configuration = describeAIConfiguration(task);
  if (!configuration.configured || !configuration.providerId || !configuration.model) {
    throw configurationError(configuration.issue, configuration.providerId, configuration.providerLabel, configuration.model);
  }
  if (configuration.providerId === "openai") return new OpenAIProvider(configuration.model);
  if (configuration.providerId === "anthropic") return new AnthropicProvider(configuration.model);
  throw new DomainError(
    `AI provider "${configuration.providerId}" is not supported. Supported providers are OpenAI and Anthropic. No other provider was used. Nothing was generated.`,
  );
}

function configurationError(
  issue: string,
  providerId: string | null,
  providerLabel: string | null,
  model: string | null,
) {
  if (issue === "provider_unsupported") {
    return new DomainError(
      `AI provider "${providerId ?? "unknown"}" is not supported. Supported providers are OpenAI and Anthropic. No other provider was used. Nothing was generated.`,
    );
  }
  if (issue === "model_missing") {
    return new DomainError(
      "AI is not configured. Set AI_MODEL to the model the selected provider should use. No model was substituted. Nothing was generated.",
    );
  }
  if (issue === "model_incompatible") {
    return new DomainError(
      `The model "${model}" cannot be used with ${providerLabel ?? "the selected provider"}. Set AI_MODEL to a model that provider offers. No other model was substituted. Nothing was generated.`,
    );
  }
  return new AINotConfiguredError();
}
