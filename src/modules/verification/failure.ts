import { AIFailure } from "@/modules/ai/failures";

export const VERIFICATION_FAILURE_CLASSES = [
  "AI_PROVIDER_UNAVAILABLE",
  "VERIFICATION_SETUP_FAILED",
  "VERIFICATION_COMMAND_UNAVAILABLE",
  "VERIFICATION_TEST_ENVIRONMENT_FAILED",
  "VERIFICATION_EXECUTION_FAILED",
  "VERIFICATION_EVIDENCE_INSUFFICIENT",
  "PRODUCT_VERIFICATION_FAILED",
  // The approved source snapshot was not the one verified. Blocking: nothing about the product is judged.
  "VERIFICATION_SNAPSHOT_MISMATCH",
  // An escalation (for example secret access) blocks the verdict. Blocking: nothing about the product is judged.
  "VERIFICATION_ESCALATION_BLOCKED",
  // The process stopped before it finished (for example the server restarted). A person must recover it.
  "VERIFICATION_INTERRUPTED",
] as const;

export type VerificationFailureClass = (typeof VERIFICATION_FAILURE_CLASSES)[number];

export const RETRYABLE_VERIFICATION_FAILURES = new Set<VerificationFailureClass>([
  "AI_PROVIDER_UNAVAILABLE",
  "VERIFICATION_SETUP_FAILED",
  "VERIFICATION_COMMAND_UNAVAILABLE",
  "VERIFICATION_TEST_ENVIRONMENT_FAILED",
  "VERIFICATION_EXECUTION_FAILED",
]);

/** Classes that block a verification without judging the product. They are recorded as BLOCKED, never FAILED. */
export const BLOCKING_VERIFICATION_FAILURES = new Set<VerificationFailureClass>([
  "VERIFICATION_SNAPSHOT_MISMATCH",
  "VERIFICATION_ESCALATION_BLOCKED",
]);

export function isVerificationFailureClass(value: string): value is VerificationFailureClass {
  return (VERIFICATION_FAILURE_CLASSES as readonly string[]).includes(value);
}

export function classifyVerificationFailure(error: unknown): VerificationFailureClass {
  if (error instanceof AIFailure) {
    if (error.category === "PROVIDER_UNAVAILABLE" || error.category === "TIMEOUT" || error.category === "RATE_LIMITED") {
      return "AI_PROVIDER_UNAVAILABLE";
    }
  }
  const message = error instanceof Error ? error.message : "";
  if (/high demand|provider is unavailable|temporarily unavailable/i.test(message)) {
    return "AI_PROVIDER_UNAVAILABLE";
  }
  if (/setup could not|workspace could not be created/i.test(message)) {
    return "VERIFICATION_SETUP_FAILED";
  }
  if (/not at the approved snapshot|approved snapshot changed/i.test(message)) {
    return "VERIFICATION_SNAPSHOT_MISMATCH";
  }
  if (/missing script|command not found|not recognized as an internal or external command/i.test(message)) {
    return "VERIFICATION_COMMAND_UNAVAILABLE";
  }
  return "VERIFICATION_EXECUTION_FAILED";
}

export function failureReason(failureClass: VerificationFailureClass) {
  switch (failureClass) {
    case "AI_PROVIDER_UNAVAILABLE":
      return "The AI provider was unavailable. The product was not judged.";
    case "VERIFICATION_SETUP_FAILED":
      return "Verification setup failed. The product was not judged.";
    case "VERIFICATION_COMMAND_UNAVAILABLE":
      return "A required check could not be executed. The product was not judged.";
    case "VERIFICATION_TEST_ENVIRONMENT_FAILED":
      return "A verification test could not run because of its environment or infrastructure. This is not a product failure, and the product was not judged.";
    case "VERIFICATION_EXECUTION_FAILED":
      return "Verification execution failed before a product verdict.";
    case "VERIFICATION_EVIDENCE_INSUFFICIENT":
      return "The evidence is not sufficient for a passing product verdict.";
    case "PRODUCT_VERIFICATION_FAILED":
      return "An executed verification check failed.";
    case "VERIFICATION_SNAPSHOT_MISMATCH":
      return "The verification did not run against the approved source snapshot. It is a blocking error, so the product was not judged.";
    case "VERIFICATION_ESCALATION_BLOCKED":
      return "An unresolved escalation blocks this verification. The product was not judged until a person resolves it.";
    case "VERIFICATION_INTERRUPTED":
      return "The verification attempt stopped before it finished, for example because the server restarted. The product was not judged. A person must recover it before another attempt can start.";
  }
}

/** The blocking class for an open escalation. Escalations that block a verdict never mean a product failure. */
export function failureClassForEscalation(type: string): VerificationFailureClass | "" {
  if (type === "IMPLEMENTATION_CHANGE") return "VERIFICATION_SNAPSHOT_MISMATCH";
  if (type === "SECRET_ACCESS") return "VERIFICATION_ESCALATION_BLOCKED";
  return "";
}

/**
 * Maps a verdict to its failure class. Product failure only comes from an executed check that failed.
 * A blocked verification test is an environment or infrastructure problem; a blocked repository check is a
 * missing command. Neither is a product defect. A test that did not run is missing evidence.
 */
export function failureClassForVerdict(
  verdict: string,
  executions: { status: string; kind?: string }[],
): VerificationFailureClass | "" {
  const blocked = executions.filter((item) => item.status === "BLOCKED");
  if (blocked.length > 0 && verdict !== "FAIL") {
    return blocked.some((item) => item.kind === "NEW_VERIFICATION")
      ? "VERIFICATION_TEST_ENVIRONMENT_FAILED"
      : "VERIFICATION_COMMAND_UNAVAILABLE";
  }
  if (verdict === "FAIL") return "PRODUCT_VERIFICATION_FAILED";
  if (verdict === "INCONCLUSIVE") return "VERIFICATION_EVIDENCE_INSUFFICIENT";
  return "";
}
