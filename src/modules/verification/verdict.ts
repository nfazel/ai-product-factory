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
};

export function decideVerdict(input: VerdictInput): { verdict: VerdictName; reason: string } {
  const openDefects = input.defects.filter((item) => item.status !== "DONE");
  const high = openDefects.some((item) => item.severity === "CRITICAL" || item.severity === "HIGH");
  const lowConcern = openDefects.some((item) => item.severity === "LOW" || item.severity === "MEDIUM");
  const failedCriterion = input.coverages.some((item) => item.status === "FAILED");
  const requiredFailed = input.executions.some(
    (item) => item.kind === "NEW_VERIFICATION" && item.status === "FAILED",
  );
  const regressionFailed = input.executions.some(
    (item) => item.kind === "EXISTING_REGRESSION" && item.status === "FAILED",
  );
  const regressionPassed = input.executions.some(
    (item) => item.kind === "EXISTING_REGRESSION" && item.status === "PASSED",
  );
  const accounted = input.coverages.every(
    (item) => item.status === "VERIFIED" || (item.status === "NOT_APPLICABLE" && item.humanConfirmed),
  );
  const anyVerified = input.coverages.some((item) => item.status === "VERIFIED");

  if (input.coverages.length === 0) {
    return { verdict: "INCONCLUSIVE", reason: "No acceptance criteria were available to verify." };
  }
  if (failedCriterion || requiredFailed || regressionFailed || high || input.blockingEscalation) {
    return {
      verdict: "FAIL",
      reason: high
        ? "A critical or high defect is unresolved."
        : regressionFailed
          ? "Existing regression tests failed."
          : "A required verification test or acceptance criterion failed.",
    };
  }
  if (!regressionPassed || !accounted || !anyVerified) {
    return {
      verdict: "INCONCLUSIVE",
      reason: !regressionPassed
        ? "Existing regression tests did not produce a passing result."
        : "One or more acceptance criteria are not verified.",
    };
  }
  if (lowConcern) {
    return {
      verdict: "PASS_WITH_CONCERNS",
      reason: "Acceptance criteria are verified. Non-blocking concerns remain.",
    };
  }
  return {
    verdict: "PASS",
    reason: "Acceptance criteria are verified, regression passed, and no blocking defect is open.",
  };
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
