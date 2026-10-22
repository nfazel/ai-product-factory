import { AIFailure } from "@/modules/ai/failures";

export const VERIFICATION_FAILURE_CLASSES = [
  "AI_PROVIDER_UNAVAILABLE",
  "VERIFICATION_SETUP_FAILED",
  "VERIFICATION_COMMAND_UNAVAILABLE",
  "VERIFICATION_EXECUTION_FAILED",
  "VERIFICATION_EVIDENCE_INSUFFICIENT",
  "PRODUCT_VERIFICATION_FAILED",
] as const;

export type VerificationFailureClass = (typeof VERIFICATION_FAILURE_CLASSES)[number];

export const RETRYABLE_VERIFICATION_FAILURES = new Set<VerificationFailureClass>([
  "AI_PROVIDER_UNAVAILABLE",
  "VERIFICATION_SETUP_FAILED",
  "VERIFICATION_COMMAND_UNAVAILABLE",
  "VERIFICATION_EXECUTION_FAILED",
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
    case "VERIFICATION_EXECUTION_FAILED":
      return "Verification execution failed before a product verdict.";
    case "VERIFICATION_EVIDENCE_INSUFFICIENT":
      return "The evidence is not sufficient for a passing product verdict.";
    case "PRODUCT_VERIFICATION_FAILED":
      return "An executed verification check failed.";
  }
}

export function failureClassForVerdict(
  verdict: string,
  executions: { status: string }[],
): VerificationFailureClass | "" {
  const blocked = executions.some((item) => item.status === "BLOCKED");
  if (blocked && verdict !== "FAIL") return "VERIFICATION_COMMAND_UNAVAILABLE";
  if (verdict === "FAIL") return "PRODUCT_VERIFICATION_FAILED";
  if (verdict === "INCONCLUSIVE") return "VERIFICATION_EVIDENCE_INSUFFICIENT";
  return "";
}
