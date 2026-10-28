import { describe, expect, it } from "vitest";

import { buildCoverageReport, type CoverageReportInput } from "@/modules/prove/coverage-report";

const criteria = [
  { id: "c1", description: "A valid notice returns a claim reference." },
  { id: "c2", description: "A duplicate notice is refused." },
  { id: "c3", description: "A customer can download a receipt." },
];

function input(overrides: Partial<CoverageReportInput> = {}): CoverageReportInput {
  return {
    criteria,
    coverages: [
      { acceptanceCriterionId: "c1", status: "VERIFIED", humanConfirmed: false, rationale: "" },
      { acceptanceCriterionId: "c2", status: "NOT_TESTED", humanConfirmed: false, rationale: "" },
      { acceptanceCriterionId: "c3", status: "NOT_TESTED", humanConfirmed: false, rationale: "" },
    ],
    testCases: [
      { id: "t1", acceptanceCriterionId: "c1", title: "Submit valid notice", purpose: "Demonstrate the criterion.", automated: true, filePath: "verification/x.test.mjs" },
      { id: "t3", acceptanceCriterionId: "c3", title: "Download receipt", purpose: "A person checks the receipt.", automated: false, filePath: "" },
    ],
    evidence: [{ testCaseId: "t1", acceptanceCriterionId: "c1", type: "TEST_RESULT", result: "DEMONSTRATED" }],
    changedFiles: [],
    ...overrides,
  };
}

describe("coverage gap report", () => {
  it("classifies each approved criterion from its own evidence", () => {
    const report = buildCoverageReport(input());
    const byId = Object.fromEntries(report.criteria.map((item) => [item.criterionId, item]));
    expect(byId.c1?.state).toBe("automated-evidence");
    expect(byId.c2?.state).toBe("insufficient-evidence");
    expect(byId.c3?.state).toBe("manual-verification-required");
  });

  it("counts every criterion exactly once", () => {
    const report = buildCoverageReport(input());
    const total = Object.values(report.counts).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(criteria.length);
  });

  it("does not count a VERIFIED status without executed evidence as automated", () => {
    const report = buildCoverageReport(
      input({ evidence: [], coverages: [{ acceptanceCriterionId: "c1", status: "VERIFIED", humanConfirmed: false, rationale: "" }] }),
    );
    expect(report.criteria.find((item) => item.criterionId === "c1")?.state).toBe("insufficient-evidence");
  });

  it("counts linked DEMONSTRATED evidence and does not recommend insufficient evidence", () => {
    const report = buildCoverageReport(input());
    const criterion = report.criteria.find((item) => item.criterionId === "c1");
    expect(criterion).toMatchObject({ state: "automated-evidence", automatedEvidence: 1 });
    expect(report.recommendations.some((item) => item.subject === criterion?.description)).toBe(false);
  });

  it("does not treat a linked EXECUTED result as demonstrated evidence", () => {
    const report = buildCoverageReport(input({
      evidence: [{ testCaseId: "t1", acceptanceCriterionId: "c1", type: "TEST_RESULT", result: "EXECUTED" }],
    }));
    const criterion = report.criteria.find((item) => item.criterionId === "c1");
    expect(criterion).toMatchObject({ state: "insufficient-evidence", automatedEvidence: 0 });
    expect(criterion?.reason).toMatch(/Linked evidence exists, but it does not demonstrate/);
    expect(report.recommendations.find((item) => item.subject === criterion?.description)?.message).not.toMatch(/no linked evidence exists/i);
  });

  it("uses persisted criterion IDs to link evidence directly", () => {
    const report = buildCoverageReport(input({
      evidence: [{ testCaseId: null, acceptanceCriterionId: "c1", type: "TEST_RESULT", result: "DEMONSTRATED" }],
    }));
    expect(report.criteria.find((item) => item.criterionId === "c1")).toMatchObject({
      state: "automated-evidence",
      automatedEvidence: 1,
    });
  });

  it("uses persisted test-case IDs to link evidence when the criterion ID is absent", () => {
    const report = buildCoverageReport(input({
      evidence: [{ testCaseId: "t1", acceptanceCriterionId: null, type: "TEST_RESULT", result: "DEMONSTRATED" }],
    }));
    expect(report.criteria.find((item) => item.criterionId === "c1")).toMatchObject({
      state: "automated-evidence",
      automatedEvidence: 1,
    });
  });

  it("reports missing evidence only when neither persisted identifier links a record", () => {
    const report = buildCoverageReport(input({ evidence: [] }));
    const criterion = report.criteria.find((item) => item.criterionId === "c1");
    expect(criterion?.reason).toBe("Recorded as verified, but no linked evidence exists.");
    expect(report.recommendations.find((item) => item.subject === criterion?.description)?.message).toMatch(/no linked evidence exists/i);
  });

  it("keeps a passing manual confirmation distinct from automated evidence", () => {
    const report = buildCoverageReport(input({
      evidence: [{ testCaseId: "t1", acceptanceCriterionId: "c1", type: "MANUAL_CONFIRMATION", result: "PASS" }],
    }));
    expect(report.criteria.find((item) => item.criterionId === "c1")).toMatchObject({
      state: "manual-verification-required",
      automatedEvidence: 0,
      manualEvidence: 1,
    });
  });

  it("reports a failed or blocked criterion with its rationale", () => {
    const report = buildCoverageReport(
      input({
        coverages: [
          { acceptanceCriterionId: "c1", status: "FAILED", humanConfirmed: false, rationale: "The reference was wrong." },
          { acceptanceCriterionId: "c2", status: "BLOCKED", humanConfirmed: false, rationale: "The database was unavailable." },
          { acceptanceCriterionId: "c3", status: "NOT_TESTED", humanConfirmed: false, rationale: "" },
        ],
      }),
    );
    expect(report.criteria.find((item) => item.criterionId === "c1")).toMatchObject({ state: "failed", reason: "The reference was wrong." });
    expect(report.criteria.find((item) => item.criterionId === "c2")).toMatchObject({ state: "blocked" });
  });

  it("treats not-applicable as confirmed only when a person confirmed it", () => {
    const unconfirmed = buildCoverageReport(
      input({ coverages: [{ acceptanceCriterionId: "c2", status: "NOT_APPLICABLE", humanConfirmed: false, rationale: "" }] }),
    );
    expect(unconfirmed.criteria.find((item) => item.criterionId === "c2")?.state).toBe("insufficient-evidence");
    const confirmed = buildCoverageReport(
      input({ coverages: [{ acceptanceCriterionId: "c2", status: "NOT_APPLICABLE", humanConfirmed: true, rationale: "" }] }),
    );
    expect(confirmed.criteria.find((item) => item.criterionId === "c2")?.state).toBe("not-applicable");
  });

  it("recommends human review for insufficient evidence, without changing the criteria", () => {
    const before = JSON.stringify(input());
    const report = buildCoverageReport(input());
    expect(report.recommendations.some((item) => item.kind === "criterion" && /Do not approve/.test(item.message))).toBe(true);
    expect(JSON.stringify(input())).toBe(before);
    expect(report.criteria).toHaveLength(criteria.length);
  });

  it("reports an implemented file that no criterion or test mentions, and ignores tests and verification files", () => {
    const report = buildCoverageReport(
      input({
        changedFiles: ["src/claims/refund.ts", "src/claims/submit.ts", "src/claims/submit.test.ts", "verification/http/x.test.mjs", "README.md"],
      }),
    );
    const behaviour = report.recommendations.filter((item) => item.kind === "behaviour").map((item) => item.subject);
    expect(behaviour).toContain("src/claims/refund.ts");
    expect(behaviour).not.toContain("src/claims/submit.test.ts");
    expect(behaviour).not.toContain("verification/http/x.test.mjs");
    expect(behaviour).not.toContain("README.md");
    expect(behaviour).not.toContain("src/claims/submit.ts");
  });
});
