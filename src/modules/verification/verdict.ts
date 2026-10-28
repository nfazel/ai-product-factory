import type { VerificationObligation } from "@/modules/verification/obligations";

export const VERIFICATION_AREAS = [
  "Acceptance criteria",
  "Functional behaviour",
  "Negative paths",
  "Regression",
  "Security-relevant behaviour",
  "NFRs",
  "Evidence completeness",
] as const;

export type VerdictName = "PASS" | "PASS_WITH_CONCERNS" | "FAIL" | "INCONCLUSIVE";

export type VerdictInput = {
  coverages: { status: string; humanConfirmed: boolean }[];
  executions: { kind: string; status: string }[];
  defects: { severity: string; status: string }[];
  blockingEscalation: boolean;
  obligations?: VerificationObligation[];
};

export function decideVerdict(input: VerdictInput): { verdict: VerdictName; reason: string } {
  return judgeObligations({
    obligations: input.obligations ?? obligationsFromEvidence(input),
    defects: input.defects,
    blockingEscalation: input.blockingEscalation,
  });
}

export function judgeObligations(input: {
  obligations: VerificationObligation[];
  defects: { severity: string; status: string }[];
  blockingEscalation: boolean;
}): { verdict: VerdictName; reason: string } {
  const openDefects = input.defects.filter((item) => item.status !== "DONE");
  const high = openDefects.some((item) => item.severity === "CRITICAL" || item.severity === "HIGH");
  const lowConcern = openDefects.some((item) => item.severity === "LOW" || item.severity === "MEDIUM");
  const functional = input.obligations.filter((item) => item.kind === "FUNCTIONAL_ACCEPTANCE");
  const mandatory = input.obligations.filter((item) => item.mandatory && item.status !== "NOT_APPLICABLE");
  if (functional.length > 0 && functional.every((item) => item.status === "NOT_APPLICABLE")) {
    return { verdict: "INCONCLUSIVE", reason: "Functional acceptance criteria were marked not applicable. That is not a pass." };
  }
  // A blocking escalation (for example a change to the approved snapshot) means the run cannot judge what was
  // approved. That is a blocked verification, not a product failure, so it never produces FAIL.
  if (input.blockingEscalation) {
    return {
      verdict: "INCONCLUSIVE",
      reason: "Verification is blocked by an unresolved escalation. The product was not judged until a person resolves it.",
    };
  }
  if (mandatory.length === 0) {
    return { verdict: "INCONCLUSIVE", reason: "No approved verification obligations apply to this task." };
  }
  const failed = mandatory.filter((item) => item.status === "FAILED");
  if (failed.length > 0 || high) {
    return {
      verdict: "FAIL",
      reason: high
        ? "A critical or high defect is unresolved."
        : `An approved obligation failed: ${failed[0]?.title ?? "a required check"}.`,
    };
  }
  const blocked = mandatory.filter((item) => item.status === "BLOCKED");
  if (blocked.length > 0) {
    return { verdict: "INCONCLUSIVE", reason: "A required check could not be executed. That is not a product failure." };
  }
  const missing = mandatory.filter((item) => item.status === "NOT_TESTED");
  if (missing.length > 0) {
    return { verdict: "INCONCLUSIVE", reason: "Required verification evidence is missing." };
  }
  const concerns = input.obligations.filter((item) => !item.mandatory && item.status === "FAILED");
  if (lowConcern || concerns.length > 0) {
    return { verdict: "PASS_WITH_CONCERNS", reason: "Mandatory obligations passed. Non-blocking concerns remain." };
  }
  return { verdict: "PASS", reason: "Mandatory obligations passed, and no blocking defect is open." };
}

function obligationsFromEvidence(input: VerdictInput): VerificationObligation[] {
  const obligations: VerificationObligation[] = [];
  input.coverages.forEach((coverage, index) => {
    const status = coverage.status === "VERIFIED"
      ? "VERIFIED"
      : coverage.status === "FAILED"
        ? "FAILED"
        : coverage.status === "NOT_APPLICABLE" && coverage.humanConfirmed
          ? "NOT_APPLICABLE"
          : coverage.status === "BLOCKED"
            ? "BLOCKED"
            : "NOT_TESTED";
    obligations.push({
      id: `coverage:${index}`,
      title: "Functional acceptance criterion",
      kind: "FUNCTIONAL_ACCEPTANCE",
      source: "FUNCTIONAL_ACCEPTANCE_CRITERION",
      mandatory: status !== "NOT_APPLICABLE",
      status,
      evidence: "Coverage recorded for an acceptance criterion on this task.",
    });
  });
  for (const execution of input.executions) {
    if (execution.kind !== "PLAN_CHECK" && execution.kind !== "EXISTING_REGRESSION" && execution.kind !== "NEW_VERIFICATION") continue;
    const status = execution.status === "PASSED"
      ? "VERIFIED"
      : execution.status === "FAILED"
        ? "FAILED"
        : execution.status === "BLOCKED"
          ? "BLOCKED"
          : execution.status === "NOT_RUN"
            ? "NOT_APPLICABLE"
            : "NOT_TESTED";
    obligations.push({
      id: `execution:${execution.kind}:${obligations.length}`,
      title: execution.kind,
      kind: "PLAN_CHECK",
      source: "EXECUTION_PLAN",
      mandatory: status !== "NOT_APPLICABLE",
      status,
      evidence: "Command evidence.",
    });
  }
  return obligations;
}

export function sessionStatusFor(verdict: VerdictName) {
  if (verdict === "PASS" || verdict === "PASS_WITH_CONCERNS") return "PASSED" as const;
  if (verdict === "FAIL") return "FAILED" as const;
  return "BLOCKED" as const;
}

export function evidenceAreas(input: {
  coverages: { status: string; humanConfirmed: boolean }[];
  positivePassed: boolean;
  negativePassed: boolean;
  regressionPassed: boolean;
  securityPassed: boolean;
  securityRequired: boolean;
  nfrTested: boolean;
  evidenceComplete: boolean;
}) {
  const acceptance =
    input.coverages.length > 0 &&
    input.coverages.every(
      (item) => item.status === "VERIFIED" || (item.status === "NOT_APPLICABLE" && item.humanConfirmed),
    ) &&
    input.coverages.some((item) => item.status === "VERIFIED");
  const flags = [
    acceptance,
    input.positivePassed,
    input.negativePassed,
    input.regressionPassed,
    input.securityPassed || !input.securityRequired,
    input.nfrTested,
    input.evidenceComplete,
  ];
  const evidenced = flags.filter(Boolean).length;
  const level = evidenced >= 6 ? "HIGH" : evidenced >= 3 ? "MEDIUM" : "LOW";
  return { evidenced, total: VERIFICATION_AREAS.length, level, areas: VERIFICATION_AREAS.map((name, index) => ({
    name,
    evidenced: flags[index] === true,
  })) };
}
