import type { ZodType } from "zod";

import { describeAIConfiguration, type AITask } from "@/modules/ai/config";
import { createConfiguredProvider } from "@/modules/ai/registry";

export type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AIUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export type AIGenerateRequest<T> = {
  systemPrompt: string;
  messages: AIChatMessage[];
  responseSchema: ZodType<T>;
  schemaName: string;
  temperature?: number;
  /** Reserved for a later per-task model. Ignored by adapters; the registry resolves the model. */
  task?: AITask;
};

export type AIGenerateResult<T> = {
  data: T;
  usage: AIUsage;
  model: string;
  /** Set by a real adapter. Test doubles may omit it. */
  provider?: string;
};

export interface AIProvider {
  generate<T>(request: AIGenerateRequest<T>): Promise<AIGenerateResult<T>>;
}

let providerOverride: AIProvider | null = null;

/** Test hook. Pass null to use the real provider configuration again. */
export function setAIProviderForTests(provider: AIProvider | null) {
  providerOverride = provider;
}

export function isAIConfigured() {
  if (providerOverride) return true;
  return describeAIConfiguration().configured;
}

export function getAIProvider(task?: AITask): AIProvider {
  if (providerOverride) return providerOverride;
  return createConfiguredProvider(task);
}
