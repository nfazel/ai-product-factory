import "server-only";

import { GoogleGenAI } from "@google/genai";
import { toJSONSchema, type ZodType } from "zod";

import { readProviderCredential } from "@/modules/ai/config";
import {
  AIFailure,
  cutOffResponse,
  declinedResponse,
  emptyResponse,
  geminiRejectedRequest,
  mapProviderFailure,
  type SchemaDiagnostics,
} from "@/modules/ai/failures";
import type { AIChatMessage, AIGenerateRequest, AIGenerateResult, AIProvider } from "@/modules/ai/provider";
import { inspectStructured, STRUCTURED_OUTPUT_ERROR, type StructuredIssue } from "@/modules/ai/structured";

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
      const first = await complete(apiKey, this.model, request, request.messages);
      const initial = readCompletion(this.model, request.responseSchema, first, Date.now() - started);
      if (initial.kind === "ok") return initial.result;
      if (initial.kind !== "invalid") throw initial.error;
      const repaired = await complete(apiKey, this.model, request, [
        ...request.messages,
        { role: "assistant", content: initial.text },
        { role: "user", content: repairInstruction(request.purpose, initial.issues, initial.cutOff) },
      ]);
      const second = readCompletion(this.model, request.responseSchema, repaired, Date.now() - started);
      if (second.kind === "ok") return { ...second.result, repairAttempted: true };
      if (second.kind === "fatal") throw second.error;
      throw schemaFailure(request.purpose, true, second.issues);
    } catch (error) {
      const rejected = geminiRejectedRequest(error, {
        model: this.model,
        operation: request.purpose?.trim() || "this result",
      });
      if (rejected) throw rejected;
      mapProviderFailure(error);
    }
  }
}

function payload<T>(model: string, request: AIGenerateRequest<T>, messages: AIChatMessage[]) {
  return {
    model,
    systemPrompt: request.systemPrompt,
    messages,
    temperature: request.temperature ?? 0.3,
    responseJsonSchema: geminiResponseSchema(request.responseSchema),
  };
}

async function complete<T>(
  apiKey: string,
  model: string,
  request: AIGenerateRequest<T>,
  messages: AIChatMessage[],
): Promise<GeminiCompletion> {
  const outbound = messages.length > 0 ? messages : [{ role: "user" as const, content: "Follow the system instruction and the schema." }];
  if (completeOverride) return completeOverride(payload(model, request, outbound));
  return callGemini(apiKey, model, request, outbound);
}

async function callGemini<T>(
  apiKey: string,
  model: string,
  request: AIGenerateRequest<T>,
  messages: AIChatMessage[],
): Promise<GeminiCompletion> {
  const ai = new GoogleGenAI({
    apiKey,
    vertexai: false,
    httpOptions: { timeout: 120_000 },
  });
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
      responseJsonSchema: geminiResponseSchema(request.responseSchema),
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

/** Confirms the key and model with a model lookup. This does not generate text. */
export async function probeGeminiCredential(apiKey: string, model: string) {
  const ai = new GoogleGenAI({
    apiKey,
    vertexai: false,
    httpOptions: { timeout: 20_000 },
  });
  await ai.models.get({ model });
}

/**
 * Structural schema for Gemini. Length, pattern, and item-count constraints stay on the
 * domain schema and are checked after the model responds. Gemini rejects a large schema
 * that still carries those constraints with INVALID_ARGUMENT.
 */
export function geminiResponseSchema(schema: ZodType) {
  return omitUnsupportedSchemaKeywords(toJSONSchema(schema));
}

const UNSUPPORTED_SCHEMA_KEYS = new Set([
  "$schema",
  "$id",
  "$defs",
  "$ref",
  "additionalProperties",
  "unevaluatedProperties",
  "pattern",
  "format",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "contentMediaType",
  "contentEncoding",
  "default",
  "const",
]);

function omitUnsupportedSchemaKeywords(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUnsupportedSchemaKeywords);
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  let pattern = "";
  for (const [key, child] of Object.entries(value)) {
    if (key === "pattern" && typeof child === "string") {
      pattern = child;
      continue;
    }
    if (UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
    next[key] = omitUnsupportedSchemaKeywords(child);
  }
  const idPrefix = /^\^([a-z]+)-\[1-9\]\\d\*\$$/.exec(pattern);
  if (idPrefix && typeof next.description !== "string") {
    next.description = `Stable id such as ${idPrefix[1]}-1.`;
  }
  return next;
}

function repairInstruction(operation: string | undefined, issues: StructuredIssue[], cutOff: boolean) {
  const lines = issues.map((issue) => `- ${issue.path}: ${issue.message}`);
  const cutoff = cutOff ? "The previous response was cut off before it was complete.\n" : "";
  return `${cutoff}The previous response was valid JSON and was not saved because it failed validation.
Return one complete corrected object for ${operation?.trim() || "this result"}.
Keep the same design. Change only the structure problems below.
Do not add business facts that were not already in the previous response.

Problems:
${lines.join("\n")}`;
}

function schemaFailure(operation: string | undefined, repairAttempted: boolean, issues: StructuredIssue[]) {
  const diagnostics: SchemaDiagnostics = {
    operation: operation?.trim() || "structured generation",
    validationStage: "response schema",
    repairAttempted,
    issues: issues.map((issue) => `${issue.path}: ${issue.message}`),
  };
  return new AIFailure(STRUCTURED_OUTPUT_ERROR, "SCHEMA_VALIDATION_FAILED", diagnostics);
}

type ReadResult<T> =
  | { kind: "ok"; result: AIGenerateResult<T> }
  | { kind: "invalid"; text: string; issues: StructuredIssue[]; cutOff: boolean }
  | { kind: "fatal"; error: AIFailure };

function readCompletion<T>(model: string, schema: ZodType<T>, completed: GeminiCompletion, durationMs: number): ReadResult<T> {
  const finish = completed.finishReason;
  if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST" || finish === "SPII") {
    return { kind: "fatal", error: declinedResponse() };
  }
  const text = completed.text?.trim() ?? "";
  if (!text) {
    return { kind: "fatal", error: finish === "MAX_TOKENS" ? cutOffResponse() : emptyResponse() };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      kind: "fatal",
      error:
        finish === "MAX_TOKENS"
          ? cutOffResponse()
          : new AIFailure(
              "The model returned a response that could not be read as structured data. Nothing was saved from this response.",
              "INVALID_RESPONSE",
            ),
    };
  }
  const inspected = inspectStructured(schema, parsed);
  if (!inspected.ok) {
    console.error("[ai] structured output rejected", { issues: inspected.issues.length, repairPending: true });
    return { kind: "invalid", text, issues: inspected.issues, cutOff: finish === "MAX_TOKENS" };
  }
  return {
    kind: "ok",
    result: {
      data: inspected.data,
      usage: {
        inputTokens: typeof completed.promptTokens === "number" ? completed.promptTokens : null,
        outputTokens: typeof completed.outputTokens === "number" ? completed.outputTokens : null,
      },
      model: completed.modelVersion?.trim() || model,
      provider: "GOOGLE_GEMINI",
      ...(finish ? { finishStatus: finish } : {}),
      durationMs,
    },
  };
}
