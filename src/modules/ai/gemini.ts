import "server-only";

import { GoogleGenAI } from "@google/genai";
import { toJSONSchema, type ZodType } from "zod";

import { readProviderCredential } from "@/modules/ai/config";
import {
  AIFailure,
  cutOffResponse,
  declinedResponse,
  emptyResponse,
  mapProviderFailure,
} from "@/modules/ai/failures";
import type { AIChatMessage, AIGenerateRequest, AIGenerateResult, AIProvider } from "@/modules/ai/provider";
import { requireStructured } from "@/modules/ai/structured";

export type GeminiCompletion = {
  text?: string;
  modelVersion?: string;
  finishReason?: string;
  promptTokens?: number | null;
  outputTokens?: number | null;
};

type GeminiComplete = (input: {
  model: string;
  systemPrompt: string;
  messages: AIChatMessage[];
  temperature: number;
  responseJsonSchema: unknown;
}) => Promise<GeminiCompletion>;

let completeOverride: GeminiComplete | null = null;

/** Test hook. Production calls the Gemini API. Tests pass a fake completion. */
export function setGeminiCompleteForTests(complete: GeminiComplete | null) {
  completeOverride = complete;
}

export class GeminiProvider implements AIProvider {
  readonly id = "GOOGLE_GEMINI";

  constructor(private readonly model: string) {}

  async generate<T>(request: AIGenerateRequest<T>): Promise<AIGenerateResult<T>> {
    const apiKey = readProviderCredential("GOOGLE_GEMINI");
    if (!apiKey || !this.model.trim()) {
      throw new AIFailure(
        "Google Gemini is not configured. Add GOOGLE_GEMINI_API_KEY to the server environment and restart AI Product Builder. Nothing was generated.",
        "NOT_CONFIGURED",
      );
    }
    const started = Date.now();
    try {
      const completed = completeOverride
        ? await completeOverride(payload(this.model, request))
        : await callGemini(apiKey, this.model, request);
      return normalise(this.model, request.responseSchema, completed, Date.now() - started);
    } catch (error) {
      mapProviderFailure(error);
    }
  }
}

function payload<T>(model: string, request: AIGenerateRequest<T>) {
  return {
    model,
    systemPrompt: request.systemPrompt,
    messages: request.messages,
    temperature: request.temperature ?? 0.3,
    responseJsonSchema: toJSONSchema(request.responseSchema),
  };
}

async function callGemini<T>(apiKey: string, model: string, request: AIGenerateRequest<T>): Promise<GeminiCompletion> {
  const ai = new GoogleGenAI({
    apiKey,
    vertexai: false,
    httpOptions: { timeout: 120_000 },
  });
  const messages = request.messages.length > 0 ? request.messages : [{ role: "user" as const, content: "Follow the system instruction and the schema." }];
  const response = await ai.models.generateContent({
    model,
    contents: messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    config: {
      systemInstruction: request.systemPrompt,
      temperature: request.temperature ?? 0.3,
      responseMimeType: "application/json",
      responseJsonSchema: toJSONSchema(request.responseSchema),
    },
  });
  const usage = response.usageMetadata;
  const finish = response.candidates?.[0]?.finishReason;
  return {
    text: response.text,
    modelVersion: response.modelVersion,
    finishReason: finish ? String(finish) : undefined,
    promptTokens: typeof usage?.promptTokenCount === "number" ? usage.promptTokenCount : null,
    outputTokens: typeof usage?.candidatesTokenCount === "number" ? usage.candidatesTokenCount : null,
  };
}

function normalise<T>(model: string, schema: ZodType<T>, completed: GeminiCompletion, durationMs: number): AIGenerateResult<T> {
  const finish = completed.finishReason;
  if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST" || finish === "SPII") {
    throw declinedResponse();
  }
  const text = completed.text?.trim() ?? "";
  if (!text) {
    if (finish === "MAX_TOKENS") throw cutOffResponse();
    throw emptyResponse();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (finish === "MAX_TOKENS") throw cutOffResponse();
    throw new AIFailure(
      "The model returned a response that could not be read as structured data. Nothing was saved from this response.",
      "INVALID_RESPONSE",
    );
  }
  const data = requireStructured(schema, parsed);
  return {
    data,
    usage: {
      inputTokens: typeof completed.promptTokens === "number" ? completed.promptTokens : null,
      outputTokens: typeof completed.outputTokens === "number" ? completed.outputTokens : null,
    },
    model: completed.modelVersion?.trim() || model,
    provider: "GOOGLE_GEMINI",
    ...(finish ? { finishStatus: finish } : {}),
    durationMs,
  };
}
