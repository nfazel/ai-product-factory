import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { readProviderCredential } from "@/modules/ai/config";
import { AIFailure, cutOffResponse, declinedResponse, emptyResponse, mapProviderFailure } from "@/modules/ai/failures";
import type { AIChatMessage, AIGenerateRequest, AIGenerateResult, AIProvider } from "@/modules/ai/provider";
import { requireStructured } from "@/modules/ai/structured";

export type OpenAICompletion = {
  parsed: unknown;
  refusal?: string | null;
  model?: string;
  finishReason?: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
};

type OpenAIComplete = (input: {
  model: string;
  systemPrompt: string;
  messages: AIChatMessage[];
  temperature: number;
  schemaName: string;
}) => Promise<OpenAICompletion>;

let completeOverride: OpenAIComplete | null = null;

/** Test hook. Production calls the OpenAI API. Tests pass a fake completion. */
export function setOpenAICompleteForTests(complete: OpenAIComplete | null) {
  completeOverride = complete;
}

export class OpenAIProvider implements AIProvider {
  readonly id = "OPENAI";

  constructor(private readonly model: string) {}

  async generate<T>(request: AIGenerateRequest<T>): Promise<AIGenerateResult<T>> {
    const apiKey = readProviderCredential("OPENAI");
    if (!apiKey || !this.model.trim()) {
      throw new AIFailure(
        "OpenAI is not configured. Add OPENAI_API_KEY to the server environment and restart AI Product Builder. Nothing was generated.",
        "NOT_CONFIGURED",
      );
    }
    const started = Date.now();
    try {
      const completion = completeOverride
        ? await completeOverride({
            model: this.model,
            systemPrompt: request.systemPrompt,
            messages: request.messages,
            temperature: request.temperature ?? 0.3,
            schemaName: request.schemaName,
          })
        : await callOpenAI(apiKey, this.model, request);
      if (completion.refusal) throw declinedResponse();
      if (completion.finishReason === "length" && completion.parsed == null) throw cutOffResponse();
      if (completion.parsed == null) throw emptyResponse();
      const data = requireStructured(request.responseSchema, completion.parsed);
      return {
        data,
        usage: {
          inputTokens: typeof completion.promptTokens === "number" ? completion.promptTokens : null,
          outputTokens: typeof completion.completionTokens === "number" ? completion.completionTokens : null,
        },
        model: completion.model?.trim() || this.model,
        provider: this.id,
        ...(completion.finishReason ? { finishStatus: completion.finishReason } : {}),
        durationMs: Date.now() - started,
      };
    } catch (error) {
      mapProviderFailure(error);
    }
  }
}

async function callOpenAI<T>(apiKey: string, model: string, request: AIGenerateRequest<T>): Promise<OpenAICompletion> {
  const client = new OpenAI({ apiKey, timeout: 120_000 });
  const completion = await client.chat.completions.parse({
    model,
    temperature: request.temperature ?? 0.3,
    messages: [
      { role: "system", content: request.systemPrompt },
      ...request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
    response_format: zodResponseFormat(request.responseSchema, request.schemaName),
  });
  const message = completion.choices[0]?.message;
  return {
    parsed: message?.parsed,
    refusal: message?.refusal,
    model: completion.model,
    finishReason: completion.choices[0]?.finish_reason ?? undefined,
    promptTokens: completion.usage?.prompt_tokens ?? null,
    completionTokens: completion.usage?.completion_tokens ?? null,
  };
}
