import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { readProviderCredential } from "@/modules/ai/config";
import { AINotConfiguredError } from "@/modules/ai/errors";
import {
  declinedResponse,
  emptyResponse,
  mapProviderFailure,
} from "@/modules/ai/failures";
import type {
  AIGenerateRequest,
  AIGenerateResult,
  AIProvider,
} from "@/modules/ai/provider";
import { requireStructured } from "@/modules/ai/structured";

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";

  constructor(private readonly model: string) {}

  async generate<T>(request: AIGenerateRequest<T>): Promise<AIGenerateResult<T>> {
    const apiKey = readProviderCredential("openai");
    if (!apiKey || !this.model.trim()) throw new AINotConfiguredError();

    const client = new OpenAI({ apiKey, timeout: 120_000 });
    try {
      const completion = await client.chat.completions.parse({
        model: this.model,
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
      if (message?.refusal) throw declinedResponse();
      if (!message?.parsed) throw emptyResponse();
      const data = requireStructured(request.responseSchema, message.parsed);
      return {
        data,
        usage: {
          inputTokens: completion.usage?.prompt_tokens ?? null,
          outputTokens: completion.usage?.completion_tokens ?? null,
        },
        model: completion.model?.trim() || this.model,
        provider: this.id,
      };
    } catch (error) {
      mapProviderFailure(error);
    }
  }
}
