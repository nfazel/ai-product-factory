import type { AIFailureCategory } from "@/modules/ai/config";
import { safeErrorMessage } from "@/modules/ai/errors";
import { STRUCTURED_OUTPUT_ERROR } from "@/modules/ai/structured";
import { DomainError } from "@/modules/shared/errors";

export type SchemaDiagnostics = {
  operation: string;
  validationStage: "response schema";
  repairAttempted: boolean;
  issues: string[];
};

export class AIFailure extends DomainError {
  readonly category: AIFailureCategory;
  readonly diagnostics?: SchemaDiagnostics;

  constructor(message: string, category: AIFailureCategory, diagnostics?: SchemaDiagnostics) {
    super(message, "INVALID");
    this.name = "AIFailure";
    this.category = category;
    this.diagnostics = diagnostics;
  }
}

export function validationActivity(input: {
  agent: string;
  provider: string | null;
  model: string | null;
  diagnostics: SchemaDiagnostics;
}) {
  const provider = input.provider === "GOOGLE_GEMINI" ? "Gemini" : input.provider?.trim() || "Unavailable";
  const summary = input.diagnostics.issues.slice(0, 8).join("; ") || "The response did not match the schema.";
  return [
    `${input.agent} failed validation.`,
    `Provider: ${provider}.`,
    `Model: ${input.model?.trim() || "Unavailable"}.`,
    `Operation: ${input.diagnostics.operation}.`,
    `Validation stage: ${input.diagnostics.validationStage}.`,
    `Repair attempted: ${input.diagnostics.repairAttempted ? "Yes" : "No"}.`,
    `Validation issue summary: ${summary}`,
  ].join(" ");
}

const EMPTY_RESPONSE =
  "The model returned an empty response. Nothing was saved from this response.";
const DECLINED =
  "The model declined this request. Nothing was saved from this response.";
const CUT_OFF =
  "The model response was cut off before it matched the required structure. Nothing was saved from this response.";

export function declinedResponse() {
  return new AIFailure(DECLINED, "INVALID_RESPONSE");
}

export function emptyResponse() {
  return new AIFailure(EMPTY_RESPONSE, "INVALID_RESPONSE");
}

export function cutOffResponse() {
  return new AIFailure(CUT_OFF, "INVALID_RESPONSE");
}

/** Category only. Connection tests use this so provider text is not returned to the browser. */
export function providerFailureCategory(error: unknown): AIFailureCategory | "domain" {
  if (error instanceof AIFailure) return error.category;
  if (error instanceof DomainError) return "domain";
  const status = statusOf(error);
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (name === "APIConnectionTimeoutError" || name === "AbortError" || /timeout|timed out/i.test(message)) {
    return "TIMEOUT";
  }
  if (status === 401 || status === 403 || name === "AuthenticationError" || name === "PermissionDeniedError") {
    return "AUTHENTICATION_FAILED";
  }
  if (status === 429 || name === "RateLimitError") return "RATE_LIMITED";
  if (
    status === 404 ||
    /model[^\n]{0,80}(not found|does not exist)|invalid model|not_found_error/i.test(message)
  ) {
    return "MODEL_NOT_AVAILABLE";
  }
  if (/Failed to parse structured output|did not match the required structure/i.test(message)) {
    return "SCHEMA_VALIDATION_FAILED";
  }
  if (isRejectedRequest(status, message)) return "INVALID_RESPONSE";
  if (name === "APIConnectionError" || (status !== undefined && status >= 500)) return "PROVIDER_UNAVAILABLE";
  return "PROVIDER_UNAVAILABLE";
}

/** Maps a provider SDK failure to a product error. The original message is logged without secrets. */
export function mapProviderFailure(error: unknown): never {
  if (error instanceof AIFailure || error instanceof DomainError) throw error;

  const status = statusOf(error);
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  console.error("[ai] provider request failed", safeErrorMessage(error));

  if (
    name === "APIConnectionTimeoutError" ||
    name === "AbortError" ||
    /timeout|timed out/i.test(message)
  ) {
    throw new AIFailure(
      "The AI provider did not respond in time. Nothing was generated. You can retry.",
      "TIMEOUT",
    );
  }
  if (
    status === 401 ||
    status === 403 ||
    name === "AuthenticationError" ||
    name === "PermissionDeniedError"
  ) {
    throw new AIFailure(
      "The AI provider rejected the credentials. Check the server configuration in Settings. Nothing was generated.",
      "AUTHENTICATION_FAILED",
    );
  }
  if (status === 429 || name === "RateLimitError") {
    throw new AIFailure(
      "The AI provider rate limit was reached. Wait and retry. Nothing was generated.",
      "RATE_LIMITED",
    );
  }
  if (
    status === 404 ||
    /model[^\n]{0,80}(not found|does not exist)|invalid model|not_found_error/i.test(message)
  ) {
    throw new AIFailure(
      "The configured model is not available from this provider. No other model was substituted. Nothing was generated.",
      "MODEL_NOT_AVAILABLE",
    );
  }
  if (/Failed to parse structured output|did not match the required structure/i.test(message)) {
    throw new AIFailure(STRUCTURED_OUTPUT_ERROR, "SCHEMA_VALIDATION_FAILED");
  }
  if (isRejectedRequest(status, message)) {
    console.error("[ai] provider rejected the request format", {
      httpStatus: status ?? 400,
      providerStatus: providerStatus(message),
      stage: "request",
      message: safeErrorMessage(error).slice(0, 240),
    });
    throw new AIFailure(
      "The AI provider could not complete this request because the request format was not accepted. Nothing was generated.",
      "INVALID_RESPONSE",
    );
  }
  if (name === "APIConnectionError" || (status !== undefined && status >= 500)) {
    throw new AIFailure(
      "The AI provider is unavailable. Nothing was generated. You can retry.",
      "PROVIDER_UNAVAILABLE",
    );
  }
  throw new AIFailure(
    safeErrorMessage(error) || "The AI provider failed. Nothing was generated.",
    "PROVIDER_UNAVAILABLE",
  );
}

function statusOf(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  const status = error.status;
  return typeof status === "number" ? status : undefined;
}

function isRejectedRequest(status: number | undefined, message: string) {
  return status === 400 || /INVALID_ARGUMENT/.test(message);
}

function providerStatus(message: string) {
  const match = message.match(/"status"\s*:\s*"([A-Z_]+)"/);
  return match?.[1] ?? "INVALID_ARGUMENT";
}

/** Gemini-specific request rejection. Does not include credentials, headers, or prompt text. */
export function geminiRejectedRequest(error: unknown, context: { model: string; operation: string }) {
  const status = statusOf(error);
  const message = error instanceof Error ? error.message : "";
  if (!isRejectedRequest(status, message)) return null;
  const operation = context.operation.trim() || "this result";
  console.error("[ai] provider rejected the request format", {
    provider: "GOOGLE_GEMINI",
    model: context.model,
    operation,
    httpStatus: status ?? 400,
    providerStatus: providerStatus(message),
    stage: "generate",
    message: safeErrorMessage(error).slice(0, 240),
  });
  return new AIFailure(
    `Gemini could not generate ${operation} because the request format was not accepted. Nothing was generated.`,
    "INVALID_RESPONSE",
  );
}
