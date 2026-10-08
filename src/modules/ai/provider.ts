import type { ZodType } from "zod";

import { describeAIConfiguration, type AITask } from "@/modules/ai/config";
import { ensureAISelection } from "@/modules/ai/selection";
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
  /** Product purpose, such as discovery. Adapters do not use it to choose a provider. */
  purpose?: string;
  /** Reserved for a later per-task model. The registry resolves the model. */
  task?: AITask;
};

export type AIGenerateResult<T> = {
  data: T;
  usage: AIUsage;
  model: string;
  /** Set by a real adapter. Test doubles may omit it. */
  provider?: string;
  finishStatus?: string;
  durationMs?: number;
};

export interface AIProvider {
  generate<T>(request: AIGenerateRequest<T>): Promise<AIGenerateResult<T>>;
}

let providerOverride: AIProvider | null = null;

/** Test hook. Pass null to use the real provider configuration again. */
export function setAIProviderForTests(provider: AIProvider | null) {
  providerOverride = provider;
}

export function hasProviderOverride() {
  return providerOverride !== null;
}

export function isAIConfigured() {
  if (providerOverride) return true;
  return describeAIConfiguration().configured;
}

/** Loads the saved provider and model before a synchronous configuration check. */
export async function prepareAI() {
  if (providerOverride) return;
  await ensureAISelection();
}

export async function getAIProvider(task?: AITask): Promise<AIProvider> {
  if (providerOverride) return providerOverride;
  await ensureAISelection();
  return createConfiguredProvider(task);
}
