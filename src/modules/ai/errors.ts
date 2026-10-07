import { DomainError } from "@/modules/shared/errors";

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /bearer\s+[A-Za-z0-9._-]+/gi,
  /OPENAI_API_KEY\s*[=:]\s*\S+/gi,
];

/** A description safe to store and show. Secrets and stacks are removed. */
export function safeErrorMessage(error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : "The discovery agent failed.";
  const redacted = SECRET_PATTERNS.reduce(
    (message, pattern) => message.replace(pattern, "[redacted]"),
    raw,
  )
    .replace(/\s+/g, " ")
    .trim();
  const message = redacted || "The discovery agent failed.";
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}

export class AINotConfiguredError extends DomainError {
  constructor() {
    super(
      "Product Discovery is not configured. Add OPENAI_API_KEY on the server. No response was generated.",
      "INVALID",
    );
    this.name = "AINotConfiguredError";
  }
}
