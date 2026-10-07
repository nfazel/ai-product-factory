import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { DomainError } from "@/modules/shared/errors";
import type {
  AIGenerateRequest,
  AIGenerateResult,
  AIProvider,
} from "@/modules/ai/provider";

const DEFAULT_MODEL = "gpt-4.1-mini";

export class OpenAIProvider implements AIProvider {
  async generate<T>(request: AIGenerateRequest<T>): Promise<AIGenerateResult<T>> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new DomainError(
        "Product Discovery is not configured. Add OPENAI_API_KEY on the server. No response was generated.",
      );
    }

    const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
    const client = new OpenAI({ apiKey });
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
    if (!message?.parsed) {
      throw new DomainError(
        message?.refusal
          ? "The discovery agent declined this turn. The product brief was not changed. You can retry."
          : "The discovery agent returned an empty response. The product brief was not changed. You can retry.",
      );
    }

    const validated = request.responseSchema.safeParse(message.parsed);
    if (!validated.success) {
      throw new DomainError(
        "The discovery agent returned a response that did not match the required brief structure. The product brief was not changed. You can retry.",
      );
    }

    return {
      data: validated.data,
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? null,
        outputTokens: completion.usage?.completion_tokens ?? null,
      },
      model,
    };
  }
}
