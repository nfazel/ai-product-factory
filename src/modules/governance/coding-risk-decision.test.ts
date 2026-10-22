import { describe, expect, it } from "vitest";

import {
  acceptCodingRiskConfirmation,
  codingRiskDecisionError,
  codingRiskStillBlocks,
  overrideConfirmation,
  resolveCodingRiskConfirmation,
  summarizeCodingRisks,
} from "@/modules/governance/coding-risk-decision";

describe("coding risk decisions", () => {
  it("keeps an overridden prohibited risk open and blocking", () => {
    const risk = { riskLevel: "PROHIBITED", disposition: "OPEN", overriddenBy: "Local user" };
    expect(codingRiskStillBlocks(risk)).toBe(true);
    expect(overrideConfirmation("OPEN")).toMatch(/remains open/);
    expect(overrideConfirmation("OPEN")).not.toMatch(/resolved/i);
    expect(summarizeCodingRisks([risk, { riskLevel: "LOW", disposition: "OPEN", overriddenBy: "Local user" }])).toEqual({
      open: 2,
      riskAccepted: 0,
      resolved: 0,
    });
  });

  it("accepts a risk without calling it resolved, and resolves only with a note", () => {
    expect(codingRiskDecisionError("OPEN", "short")).toMatch(/rationale is required/i);
    expect(codingRiskDecisionError("RESOLVED", "The migration was completed by a person.")).toMatch(/already has a human decision/);
    expect(acceptCodingRiskConfirmation({ riskLevel: "PROHIBITED", disposition: "RISK_ACCEPTED" })).toMatch(/no longer blocks/);
    expect(acceptCodingRiskConfirmation({ riskLevel: "PROHIBITED", disposition: "RISK_ACCEPTED" })).toMatch(/not resolved/);
    expect(acceptCodingRiskConfirmation({ riskLevel: "LOW", disposition: "RISK_ACCEPTED" })).toMatch(/does not block/);
    expect(resolveCodingRiskConfirmation()).toBe("Risk resolved.");
    expect(codingRiskStillBlocks({ riskLevel: "PROHIBITED", disposition: "RISK_ACCEPTED" })).toBe(false);
    expect(codingRiskStillBlocks({ riskLevel: "PROHIBITED", disposition: "RESOLVED" })).toBe(false);
    expect(summarizeCodingRisks([
      { riskLevel: "HIGH", disposition: "OPEN" },
      { riskLevel: "HIGH", disposition: "RISK_ACCEPTED" },
      { riskLevel: "MEDIUM", disposition: "RESOLVED" },
    ])).toEqual({ open: 1, riskAccepted: 1, resolved: 1 });
  });
});
