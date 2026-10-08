import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { readProviderCredential } from "@/modules/ai/config";
import { AINotConfiguredError } from "@/modules/ai/errors";
import {
  cutOffResponse,
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

/** Response cap required by the Messages API. It does not choose the model. */
const RESPONSE_TOKEN_CAP = 16_384;

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";

  constructor(private readonly model: string) {}

  async generate<T>(request: AIGenerateRequest<T>): Promise<AIGenerateResult<T>> {
    const apiKey = readProviderCredential("anthropic");
    if (!apiKey || !this.model.trim()) throw new AINotConfiguredError();
    if (request.messages.length === 0) {
      throw emptyResponse();
    }

    const client = new Anthropic({ apiKey, timeout: 120_000 });
    try {
      const message = await client.messages.parse({
        model: this.model,
        max_tokens: RESPONSE_TOKEN_CAP,
        temperature: request.temperature ?? 0.3,
        system: request.systemPrompt,
        messages: request.messages.map((item) => ({
          role: item.role,
          content: item.content,
        })),
        output_config: {
          format: zodOutputFormat(request.responseSchema),
        },
      });

      if (message.stop_reason === "refusal") throw declinedResponse();
      if (
        message.stop_reason === "max_tokens" ||
        message.stop_reason === "model_context_window_exceeded"
      ) {
        throw cutOffResponse();
      }
      if (message.parsed_output == null) throw emptyResponse();
      const data = requireStructured(request.responseSchema, message.parsed_output);
      return {
        data,
        usage: {
          inputTokens: message.usage?.input_tokens ?? null,
          outputTokens: message.usage?.output_tokens ?? null,
        },
        model: message.model?.trim() || this.model,
        provider: this.id,
      };
    } catch (error) {
      mapProviderFailure(error);
    }
  }
}
