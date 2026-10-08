import { describe, expect, it } from "vitest";

import { governanceResponseSchema } from "@/modules/governance/schema";
import { assessGovernanceReadiness } from "@/modules/governance/readiness";
import { governanceFixture } from "@/modules/governance/testing";

describe("governance readiness", () => {
  it("counts only areas that are sufficiently understood", () => {
    const readiness = assessGovernanceReadiness({
      securityAssessment: "Security was reviewed for authentication, authorisation, and the API boundary in enough detail.",
      privacyAssessment: "Privacy was reviewed. Retention is not confirmed, and GDPR applicability requires confirmation.",
      engineeringAssessment: "The modular monolith is proportionate and the failure behaviour of notification was reviewed.",
      implementationPlanAssessment: "The plan is one vertical slice with validation on every task and was reviewed.",
      findings: [
        { category: "SECURITY", severity: "MEDIUM", status: "OPEN" },
        { category: "RELIABILITY", severity: "LOW", status: "OPEN" },
      ],
      questions: [{ status: "OPEN", blocking: false }],
      taskCount: 2,
      assessedTaskCount: 2,
      unresolvedProhibited: 0,
    });
    expect(readiness.areas).toHaveLength(10);
    expect(readiness.summary).toBe(`${readiness.sufficient} of 10 areas sufficiently understood.`);
    const security = readiness.areas.find((area) => area.key === "security");
    const questions = readiness.areas.find((area) => area.key === "openQuestions");
    expect(security?.level).toBe("MEDIUM");
    expect(security?.explanation).toMatch(/still open/i);
    expect(questions?.level).toBe("MEDIUM");
    expect(questions?.explanation).toMatch(/not marked as blocking/i);
    expect(readiness.areas.filter((area) => area.level === "LOW")).toHaveLength(0);
  });

  it("accepts a structured governance response and rejects tool evidence", () => {
    const fixture = governanceFixture({
      componentId: "component",
      adrId: "adr",
      taskIds: ["task"],
      nfrId: "nfr",
      workItemId: "story",
    });
    expect(governanceResponseSchema.safeParse(fixture).success).toBe(true);
    const scanned = {
      ...fixture,
      evidence: [{ ...fixture.evidence[0], type: "SECURITY_SCAN", source: "scanner" }],
    };
    expect(governanceResponseSchema.safeParse(scanned).success).toBe(false);
  });
});
