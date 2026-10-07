import type { ZodType } from "zod";

import { AINotConfiguredError } from "@/modules/ai/errors";
import { OpenAIProvider } from "@/modules/ai/openai";

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
};

export type AIGenerateResult<T> = {
  data: T;
  usage: AIUsage;
  model: string;
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
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getAIProvider(): AIProvider {
  if (providerOverride) return providerOverride;
  if (!process.env.OPENAI_API_KEY?.trim()) throw new AINotConfiguredError();
  return new OpenAIProvider();
}
