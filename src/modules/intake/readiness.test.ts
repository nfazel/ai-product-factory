import { describe, expect, it } from "vitest";

import { assessIntakeReadiness, countsFromRecords } from "@/modules/intake/readiness";

const confirmed = { confirmation: "CONFIRMED" as const, disposition: "IN_SCOPE" };

describe("requirements readiness", () => {
  it("is not ready without a source or an analysis", () => {
    expect(assessIntakeReadiness({
      activeSources: 0,
      extractionFailed: false,
      analysed: false,
      stale: false,
      requirements: [],
      findings: [],
      questions: [],
    }).status).toBe("NOT_READY");
    expect(assessIntakeReadiness({
      activeSources: 1,
      extractionFailed: false,
      analysed: false,
      stale: false,
      requirements: [],
      findings: [],
      questions: [],
    }).reasons.join(" ")).toMatch(/not been analysed/i);
  });

  it("blocks a high conflict, a material ambiguity, and unconfirmed requirements", () => {
    const conflict = assessIntakeReadiness({
      activeSources: 1,
      extractionFailed: false,
      analysed: true,
      stale: false,
      requirements: [confirmed],
      findings: [{ findingType: "CONFLICT", severity: "HIGH", status: "OPEN" }],
      questions: [],
    });
    expect(conflict.status).toBe("NOT_READY");
    expect(conflict.reasons.join(" ")).toMatch(/conflict/i);
    const ambiguity = assessIntakeReadiness({
      activeSources: 1,
      extractionFailed: false,
      analysed: true,
      stale: false,
      requirements: [confirmed],
      findings: [{ findingType: "AMBIGUOUS", severity: "HIGH", status: "OPEN" }],
      questions: [],
    });
    expect(ambiguity.reasons.join(" ")).toMatch(/ambiguity/i);
    const unconfirmed = assessIntakeReadiness({
      activeSources: 1,
      extractionFailed: false,
      analysed: true,
      stale: false,
      requirements: [{ confirmation: "UNREVIEWED", disposition: "UNSET" }],
      findings: [],
      questions: [],
    });
    expect(unconfirmed.reasons.join(" ")).toMatch(/confirmed by a person/i);
  });

  it("does not block on a low finding once the material checks are done", () => {
    const ready = assessIntakeReadiness({
      activeSources: 1,
      extractionFailed: false,
      analysed: true,
      stale: false,
      requirements: [confirmed],
      findings: [{ findingType: "MISSING_ACCEPTANCE_CRITERIA", severity: "LOW", status: "OPEN" }],
      questions: [{ priority: "LOW", status: "OPEN" }],
    });
    expect(ready.status).toBe("READY_FOR_DEFINITION");
  });

  it("counts from records rather than a model summary", () => {
    const counts = countsFromRecords({
      requirements: [{ requirementType: "FUNCTIONAL" }, { requirementType: "SECURITY" }, { requirementType: "NON_FUNCTIONAL" }],
      findings: [
        { findingType: "CONFLICT" },
        { findingType: "MISSING_ACCEPTANCE_CRITERIA" },
        { findingType: "UNCONFIRMED_ASSUMPTION" },
        { findingType: "MISSING_OUTCOME" },
        { findingType: "SECURITY_QUESTION" },
      ],
      suggestedCapabilities: ["Submit a claim"],
    });
    expect(counts).toEqual({
      requirements: 3,
      capabilities: 1,
      acceptanceGaps: 1,
      conflicts: 1,
      assumptions: 1,
      nonFunctional: 2,
      missingOutcomes: 1,
      securityQuestions: 1,
    });
  });
});
