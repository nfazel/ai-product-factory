export const BLOCKING_FINDING_TYPES = new Set([
  "CONFLICT",
  "AMBIGUOUS",
  "INCOMPLETE",
  "SECURITY_QUESTION",
  "MISSING_OUTCOME",
]);

export type IntakeReadinessStatus = "NOT_READY" | "NEEDS_ATTENTION" | "READY_FOR_DEFINITION";

export type IntakeReadinessInput = {
  activeSources: number;
  extractionFailed: boolean;
  analysed: boolean;
  stale: boolean;
  requirements: {
    confirmation: "UNREVIEWED" | "CONFIRMED" | "NEEDS_CHANGE" | "REJECTED";
    disposition: string;
  }[];
  findings: { findingType: string; severity: string; status: string }[];
  questions: { priority: string; status: string }[];
};

export function assessIntakeReadiness(input: IntakeReadinessInput): {
  status: IntakeReadinessStatus;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (input.extractionFailed && input.activeSources === 0) {
    reasons.push("Readable text could not be extracted from the supplied file.");
  }
  if (input.activeSources === 0) reasons.push("No requirements have been added.");
  if (input.activeSources > 0 && !input.analysed) reasons.push("The requirements have not been analysed.");
  if (input.stale) reasons.push("The analysis is out of date because the source changed.");
  const blocking = input.findings.filter(
    (finding) => finding.status === "OPEN" && finding.severity === "HIGH" && BLOCKING_FINDING_TYPES.has(finding.findingType),
  );
  if (blocking.some((finding) => finding.findingType === "CONFLICT")) {
    reasons.push("An unresolved high-severity possible conflict needs a person.");
  }
  if (blocking.some((finding) => finding.findingType === "AMBIGUOUS" || finding.findingType === "INCOMPLETE")) {
    reasons.push("A material ambiguity is still unresolved.");
  }
  if (blocking.some((finding) => finding.findingType === "SECURITY_QUESTION")) {
    reasons.push("A material security question is still open.");
  }
  if (blocking.some((finding) => finding.findingType === "MISSING_OUTCOME")) {
    reasons.push("The supplied requirements do not state an outcome, and that question is still open.");
  }
  if (input.requirements.some((item) => item.confirmation === "NEEDS_CHANGE")) {
    reasons.push("A requirement could not be interpreted and still needs a person.");
  }
  const confirmed = input.requirements.filter((item) => item.confirmation === "CONFIRMED");
  if (input.analysed && !input.stale && confirmed.length === 0 && input.requirements.length > 0) {
    reasons.push("No requirement interpretation has been confirmed by a person.");
  }
  if (reasons.length > 0) return { status: "NOT_READY", reasons };

  const attention: string[] = [];
  if (input.requirements.some((item) => item.confirmation === "UNREVIEWED")) {
    attention.push("Some interpretations are still unreviewed.");
  }
  if (input.findings.some((finding) => finding.status === "OPEN" && finding.severity === "MEDIUM")) {
    attention.push("A medium finding is still open.");
  }
  if (input.questions.some((question) => question.status === "OPEN" && question.priority !== "LOW")) {
    attention.push("A clarification question is still open.");
  }
  if (attention.length > 0) return { status: "NEEDS_ATTENTION", reasons: attention };
  return { status: "READY_FOR_DEFINITION", reasons: [] };
}

export function countsFromRecords(input: {
  requirements: { requirementType: string }[];
  findings: { findingType: string }[];
  suggestedCapabilities: string[];
}) {
  return {
    requirements: input.requirements.length,
    capabilities: input.suggestedCapabilities.length,
    acceptanceGaps: input.findings.filter((item) => item.findingType === "MISSING_ACCEPTANCE_CRITERIA").length,
    conflicts: input.findings.filter((item) => item.findingType === "CONFLICT").length,
    assumptions: input.findings.filter((item) => item.findingType === "UNCONFIRMED_ASSUMPTION").length,
    nonFunctional: input.requirements.filter((item) => item.requirementType === "NON_FUNCTIONAL" || item.requirementType === "SECURITY").length,
    missingOutcomes: input.findings.filter((item) => item.findingType === "MISSING_OUTCOME").length,
    securityQuestions: input.findings.filter((item) => item.findingType === "SECURITY_QUESTION").length,
  };
}
