import { safeErrorMessage } from "@/modules/ai/errors";
import { STRUCTURED_OUTPUT_ERROR } from "@/modules/ai/structured";
import { DomainError } from "@/modules/shared/errors";

const EMPTY_RESPONSE =
  "The model returned an empty response. Nothing was saved from this response.";
const DECLINED =
  "The model declined this request. Nothing was saved from this response.";
const CUT_OFF =
  "The model response was cut off before it matched the required structure. Nothing was saved from this response.";

export function declinedResponse() {
  return new DomainError(DECLINED);
}

export function emptyResponse() {
  return new DomainError(EMPTY_RESPONSE);
}

export function cutOffResponse() {
  return new DomainError(CUT_OFF);
}

/** Maps a provider SDK failure to a product error. The original message is logged without secrets. */
export function mapProviderFailure(error: unknown): never {
  if (error instanceof DomainError) throw error;

  const status = statusOf(error);
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  console.error("[ai] provider request failed", safeErrorMessage(error));

  if (
    name === "APIConnectionTimeoutError" ||
    name === "AbortError" ||
    /timeout|timed out/i.test(message)
  ) {
    throw new DomainError(
      "The AI provider did not respond in time. Nothing was generated. You can retry.",
    );
  }
  if (
    status === 401 ||
    status === 403 ||
    name === "AuthenticationError" ||
    name === "PermissionDeniedError"
  ) {
    throw new DomainError(
      "The AI provider rejected the credentials. Check the server configuration in Settings. Nothing was generated.",
    );
  }
  if (status === 429 || name === "RateLimitError") {
    throw new DomainError(
      "The AI provider rate limit was reached. Wait and retry. Nothing was generated.",
    );
  }
  if (
    status === 404 ||
    /model[^\n]{0,80}(not found|does not exist)|invalid model|not_found_error/i.test(message)
  ) {
    throw new DomainError(
      "The configured model is not available from this provider. No other model was substituted. Nothing was generated.",
    );
  }
  if (/Failed to parse structured output|did not match the required structure/i.test(message)) {
    throw new DomainError(STRUCTURED_OUTPUT_ERROR);
  }
  if (name === "APIConnectionError" || (status !== undefined && status >= 500)) {
    throw new DomainError(
      "The AI provider is unavailable. Nothing was generated. You can retry.",
    );
  }
  throw new DomainError(
    safeErrorMessage(error) || "The AI provider failed. Nothing was generated.",
  );
}

function statusOf(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  const status = error.status;
  return typeof status === "number" ? status : undefined;
}
