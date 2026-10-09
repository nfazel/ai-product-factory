import type { ZodType } from "zod";

import { AIFailure } from "@/modules/ai/failures";

export const STRUCTURED_OUTPUT_ERROR =
  "The model returned a response that did not match the required structure. Nothing was saved from this response.";

export type StructuredIssue = {
  path: string;
  message: string;
};

/** Validates a provider payload. Missing fields are not filled in. */
export function requireStructured<T>(schema: ZodType<T>, value: unknown): T {
  const inspected = inspectStructured(schema, value);
  if (!inspected.ok) {
    console.error("[ai] structured output rejected", { issues: inspected.issues.length });
    throw new AIFailure(STRUCTURED_OUTPUT_ERROR, "SCHEMA_VALIDATION_FAILED");
  }
  return inspected.data;
}

/** Field-level schema problems. The messages are safe to show and to send back for one repair. */
export function inspectStructured<T>(
  schema: ZodType<T>,
  value: unknown,
): { ok: true; data: T } | { ok: false; issues: StructuredIssue[] } {
  const validated = schema.safeParse(value);
  if (validated.success) return { ok: true, data: validated.data };
  return {
    ok: false,
    issues: validated.error.issues.slice(0, 20).map((issue) => ({
      path: issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)",
      message: safeIssueMessage(issue.message),
    })),
  };
}

function safeIssueMessage(message: string) {
  return message
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, "[redacted]")
    .replace(/sk-[0-9A-Za-z_-]{8,}/g, "[redacted]")
    .replace(/bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "bearer [redacted]")
    .slice(0, 180);
}
