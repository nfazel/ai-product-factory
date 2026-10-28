/**
 * Coverage gap report for one verification attempt. Pure: it reads a snapshot of the approved criteria, the coverage
 * rows, the linked test cases, the evidence and the implementation's changed files, and returns a classification.
 *
 * It never changes requirements, never invents a criterion, and never marks anything verified. Gaps become
 * recommendations for a human to review.
 */

export const COVERAGE_STATES = [
  "automated-evidence",
  "manual-verification-required",
  "insufficient-evidence",
  "failed",
  "blocked",
  "not-applicable",
] as const;

export type CoverageState = (typeof COVERAGE_STATES)[number];

export const COVERAGE_STATE_LABEL: Record<CoverageState, string> = {
  "automated-evidence": "Automated evidence",
  "manual-verification-required": "Manual verification required",
  "insufficient-evidence": "Insufficient evidence",
  failed: "Failed",
  blocked: "Blocked",
  "not-applicable": "Not applicable (confirmed)",
};

export type CoverageReportInput = {
  /** Approved acceptance criteria for the task. The source of truth for what must be covered. */
  criteria: { id: string; description: string }[];
  coverages: { acceptanceCriterionId: string; status: string; humanConfirmed: boolean; rationale: string }[];
  testCases: { id: string; acceptanceCriterionId: string | null; title: string; purpose: string; automated: boolean; filePath: string }[];
  evidence: { testCaseId: string | null; acceptanceCriterionId: string | null; type: string; result: string }[];
  /** Product files the implementation changed, as recorded on the verification contract. */
  changedFiles: string[];
};

export type CriterionCoverage = {
  criterionId: string;
  description: string;
  state: CoverageState;
  label: string;
  reason: string;
  automatedEvidence: number;
  manualEvidence: number;
};

export type CoverageRecommendation = {
  kind: "criterion" | "behaviour";
  subject: string;
  message: string;
};

export type CoverageReport = {
  criteria: CriterionCoverage[];
  counts: Record<CoverageState, number>;
  recommendations: CoverageRecommendation[];
};

const PASSING_RESULTS = new Set(["EXECUTED", "PASSED"]);

export function buildCoverageReport(input: CoverageReportInput): CoverageReport {
  const criteria = input.criteria.map((criterion) => classifyCriterion(criterion, input));
  const counts = Object.fromEntries(COVERAGE_STATES.map((state) => [state, 0])) as Record<CoverageState, number>;
  for (const item of criteria) counts[item.state] += 1;

  const recommendations: CoverageRecommendation[] = [];
  for (const item of criteria) {
    if (item.state === "insufficient-evidence") {
      recommendations.push({
        kind: "criterion",
        subject: item.description,
        message: `No demonstrating evidence: ${item.reason} Add a verification case or record a manual result before approval. Do not approve on this basis.`,
      });
    } else if (item.state === "manual-verification-required") {
      recommendations.push({
        kind: "criterion",
        subject: item.description,
        message: `${item.reason} A person must run it and record the result.`,
      });
    }
  }
  recommendations.push(...uncoveredBehaviour(input));
  return { criteria, counts, recommendations };
}

function classifyCriterion(criterion: { id: string; description: string }, input: CoverageReportInput): CriterionCoverage {
  const coverage = input.coverages.find((item) => item.acceptanceCriterionId === criterion.id);
  const linkedTests = input.testCases.filter((item) => item.acceptanceCriterionId === criterion.id);
  const testIds = new Set(linkedTests.map((item) => item.id));
  const linkedEvidence = input.evidence.filter(
    (item) => item.acceptanceCriterionId === criterion.id || (item.testCaseId !== null && testIds.has(item.testCaseId)),
  );
  const automatedEvidence = linkedEvidence.filter((item) => item.type === "TEST_RESULT" && PASSING_RESULTS.has(item.result)).length;
  const manualEvidence = linkedEvidence.filter((item) => item.type === "MANUAL_CONFIRMATION").length;

  const result = (state: CoverageState, reason: string) => ({
    criterionId: criterion.id,
    description: criterion.description,
    state,
    label: COVERAGE_STATE_LABEL[state],
    reason,
    automatedEvidence,
    manualEvidence,
  });

  if (!coverage) return result("insufficient-evidence", "No coverage was assessed for this criterion.");
  if (coverage.status === "FAILED") {
    return result("failed", coverage.rationale || "An executed test for this criterion failed.");
  }
  if (coverage.status === "BLOCKED") {
    return result("blocked", coverage.rationale || "Verification of this criterion is blocked by an environment or infrastructure problem.");
  }
  if (coverage.status === "NOT_APPLICABLE") {
    return coverage.humanConfirmed
      ? result("not-applicable", "A person confirmed this criterion does not apply.")
      : result("insufficient-evidence", "Marked not applicable without a person's confirmation.");
  }
  if (coverage.status === "VERIFIED") {
    if (automatedEvidence > 0) return result("automated-evidence", "Automated test evidence demonstrates this criterion.");
    if (manualEvidence > 0) return result("manual-verification-required", "Verified by a recorded manual result. It is not automated evidence.");
    return result("insufficient-evidence", "Recorded as verified, but no linked evidence exists.");
  }
  if (linkedTests.length === 0) return result("insufficient-evidence", "No verification test is linked to this criterion.");
  if (linkedTests.every((item) => !item.automated)) {
    return result("manual-verification-required", "Only manual verification cases are linked to this criterion.");
  }
  return result("insufficient-evidence", "The linked automated tests did not produce passing evidence.");
}

/** Product source files that no approved criterion or verification case mentions. Heuristic: a reviewer decides. */
function uncoveredBehaviour(input: CoverageReportInput): CoverageRecommendation[] {
  const corpus = [
    ...input.criteria.map((item) => item.description),
    ...input.testCases.flatMap((item) => [item.title, item.purpose, item.filePath]),
  ]
    .join("\n")
    .toLowerCase();
  const recommendations: CoverageRecommendation[] = [];
  for (const file of input.changedFiles) {
    if (!isProductSource(file)) continue;
    const stem = fileStem(file);
    if (stem.length < 4 || corpus.includes(stem)) continue;
    recommendations.push({
      kind: "behaviour",
      subject: file,
      message: `${file} changed, but no approved criterion or verification case mentions "${stem}". Decide whether the behaviour needs an acceptance criterion. The framework does not add one.`,
    });
  }
  return recommendations;
}

function isProductSource(file: string) {
  const normalised = file.replaceAll("\\", "/");
  if (normalised.startsWith("verification/") || normalised.includes("/verification/")) return false;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(normalised) || normalised.includes("__tests__/")) return false;
  if (/\.(md|mdx|txt|json|lock|yaml|yml|css|svg|png|jpg|ico)$/i.test(normalised)) return false;
  if (normalised.endsWith("package-lock.json") || normalised.endsWith(".gitignore")) return false;
  return /\.[cm]?[jt]sx?$|\.py$|\.go$|\.rs$/.test(normalised);
}

function fileStem(file: string) {
  const base = file.replaceAll("\\", "/").split("/").pop() ?? file;
  return base.replace(/\.[^.]+$/, "").toLowerCase();
}
