import type { ZodType } from "zod";

import { DomainError } from "@/modules/shared/errors";

export const STRUCTURED_OUTPUT_ERROR =
  "The model returned a response that did not match the required structure. Nothing was saved from this response.";

/** Validates a provider payload. Missing fields are not filled in. */
export function requireStructured<T>(schema: ZodType<T>, value: unknown): T {
  const validated = schema.safeParse(value);
  if (!validated.success) {
    console.error("[ai] structured output rejected", {
      issues: validated.error.issues.length,
    });
    throw new DomainError(STRUCTURED_OUTPUT_ERROR);
  }
  return validated.data;
}
