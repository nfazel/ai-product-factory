import { describe, expect, it } from "vitest";

import { intakeAnalysisSchema } from "@/modules/intake/schema";

const requirement = {
  key: "r1",
  sourceKey: "s1",
  identifier: null,
  excerpt: "Customer can create a claim.",
  sectionHeading: "Claims",
  blockIndex: 0,
  pageNumber: null,
  requirementType: "UNKNOWN",
  interpretation: "A customer can start a claim.",
  confidence: "UNCERTAIN",
  suggestedCapability: "",
};

describe("intake analysis schema", () => {
  it("accepts an unknown type and a missing identifier", () => {
    const parsed = intakeAnalysisSchema.parse({
      requirements: [requirement],
      findings: [],
      questions: [],
      brief: {
        problem: "",
        users: [],
        needs: [],
        outcomes: [],
        value: "",
        assumptions: [],
        constraints: [],
        risks: [],
        scope: [],
        successMeasures: [],
      },
      suggestedCapabilities: [],
    });
    expect(parsed.requirements[0]?.requirementType).toBe("UNKNOWN");
    expect(parsed.requirements[0]?.identifier).toBeNull();
  });

  it("rejects a response that adds a count or a critical severity", () => {
    const invalid = intakeAnalysisSchema.safeParse({
      requirements: [requirement],
      findings: [],
      questions: [],
      brief: { problem: "Invented", users: [], needs: [], outcomes: [], value: "", assumptions: [], constraints: [], risks: [], scope: [], successMeasures: [] },
      suggestedCapabilities: [],
      requirementCount: 47,
    });
    expect(invalid.success).toBe(false);
    const critical = intakeAnalysisSchema.safeParse({
      requirements: [requirement],
      findings: [{
        findingType: "CONFLICT",
        severity: "CRITICAL",
        title: "Possible conflict",
        explanation: "Two lines disagree.",
        requirementKeys: ["r1"],
        gapNote: "",
      }],
      questions: [],
      brief: { problem: "", users: [], needs: [], outcomes: [], value: "", assumptions: [], constraints: [], risks: [], scope: [], successMeasures: [] },
      suggestedCapabilities: [],
    });
    expect(critical.success).toBe(false);
  });
});
