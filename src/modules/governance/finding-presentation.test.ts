import { describe, expect, it } from "vitest";

import {
  findingBlocksProgression,
  findingDecisionConfirmation,
  findingDecisionError,
  findingStatusMeaning,
  findingTraceLines,
  governanceNextActionLabel,
  progressionCopy,
  summarizeGovernanceChecks,
  whyItMatters,
} from "@/modules/governance/finding-presentation";

const critical = { severity: "CRITICAL" as const, status: "OPEN" as const, dueBeforeCoding: true };
const highDue = { severity: "HIGH" as const, status: "OPEN" as const, dueBeforeCoding: true };
const highLater = { severity: "HIGH" as const, status: "OPEN" as const, dueBeforeCoding: false };
const medium = { severity: "MEDIUM" as const, status: "OPEN" as const, dueBeforeCoding: false };

describe("governance finding presentation", () => {
  it("explains a blocking finding without treating risk acceptance as a fix", () => {
    expect(findingBlocksProgression(critical)).toBe(true);
    expect(progressionCopy(critical).label).toBe("Blocks progression");
    expect(progressionCopy(critical).text).toMatch(/must be resolved before Build can progress/);
    expect(progressionCopy(critical).text).toMatch(/accepted by an authorised reviewer with a rationale/);
    expect(whyItMatters({ ...critical, evidence: "No encryption-at-rest mechanism is specified." })).toMatch(
      /No encryption-at-rest mechanism/,
    );
    expect(findingStatusMeaning("RISK_ACCEPTED")).toMatch(/still exists/);
    expect(findingStatusMeaning("MITIGATED")).toMatch(/addressed/);
    expect(findingStatusMeaning("RISK_ACCEPTED")).not.toMatch(/addressed/);
  });

  it("shows severity, source, and the recommended action as separate facts", () => {
    const lines = findingTraceLines(
      [
        {
          nfr: { referenceCode: "NFR-003", title: "User data must be encrypted at rest" },
          component: { referenceCode: "CMP-004", name: "PostgreSQL storage" },
          adr: null,
          task: null,
          workItem: { referenceCode: "STORY-002", title: "Store a claim", type: "STORY" },
          assumption: null,
        },
      ],
      "Encryption-at-rest mechanism not specified",
    );
    expect(lines[0]).toBe("NFR-003 — User data must be encrypted at rest");
    expect(lines).toContain("CMP-004 — PostgreSQL storage");
    expect(lines).toContain("STORY-002 — Store a claim");
    expect(lines.at(-2)).toBe("Governance finding");
    expect(lines.at(-1)).toBe("Encryption-at-rest mechanism not specified");
  });

  it("requires a rationale before any risk is accepted and refuses a generic accept", () => {
    expect(findingDecisionError(critical, "RISK_ACCEPTED", " ")).toMatch(/rationale is required/i);
    expect(findingDecisionError(medium, "RISK_ACCEPTED", "too short")).toMatch(/rationale is required/i);
    expect(findingDecisionError(critical, "ACCEPTED", "This is fine for the pilot launch.")).toMatch(
      /not a risk decision/,
    );
    expect(findingDecisionError(critical, "CLOSED", "Closing it.")).toMatch(/blocks progression/);
    expect(
      findingDecisionError(critical, "RISK_ACCEPTED", "Accepted for the pilot because this store is not public yet."),
    ).toBeNull();
    expect(findingDecisionError(highDue, "MITIGATED", "short")).toMatch(/addressed/);
    expect(findingDecisionError(highDue, "MITIGATED", "Encryption at rest is now required on the database.")).toBeNull();
  });

  it("keeps an accepted risk distinct from a resolved finding in the confirmation", () => {
    expect(findingDecisionConfirmation({ ...critical, status: "RISK_ACCEPTED" })).toMatch(/no longer blocks progression/);
    expect(findingDecisionConfirmation({ ...critical, status: "RISK_ACCEPTED" })).toMatch(/not resolved/);
    expect(findingDecisionConfirmation({ ...medium, status: "RISK_ACCEPTED" })).toMatch(/does not block progression/);
    expect(findingDecisionConfirmation({ ...highDue, status: "MITIGATED" })).toMatch(/different from accepting the risk/);
    expect(findingBlocksProgression({ ...critical, status: "RISK_ACCEPTED" })).toBe(false);
    expect(findingBlocksProgression({ ...critical, status: "MITIGATED" })).toBe(false);
    expect(progressionCopy(highLater).blocks).toBe(false);
  });

  it("summarises the actual checks and names the remaining next action", () => {
    const summary = summarizeGovernanceChecks({
      findings: [
        { ...medium, status: "MITIGATED" },
        { ...medium, status: "RISK_ACCEPTED" },
        highLater,
        critical,
      ],
      threats: [{ status: "ACCEPTED" }, { status: "MITIGATED" }],
      questions: [{ status: "ANSWERED", blocking: false }, { status: "OPEN", blocking: true }],
      codingRisks: [
        { riskLevel: "LOW", overrideRiskLevel: null, overriddenBy: "" },
        { riskLevel: "PROHIBITED", overrideRiskLevel: null, overriddenBy: "" },
      ],
    });
    expect(summary.total).toBe(10);
    expect(summary.passed).toBe(4);
    expect(summary.riskAccepted).toBe(2);
    expect(summary.open).toBe(1);
    expect(summary.blocking).toBe(3);
    expect(summary.complete).toBe(false);
    expect(governanceNextActionLabel({ reviewRequired: false, openCritical: 1, openHighBeforeCoding: 0, openFindings: 2 })).toBe(
      "Resolve 1 blocking governance issue",
    );
    expect(governanceNextActionLabel({ reviewRequired: false, openCritical: 0, openHighBeforeCoding: 0, openFindings: 2 })).toBe(
      "Review 2 open governance findings",
    );
    expect(governanceNextActionLabel({ reviewRequired: true, openCritical: 0, openHighBeforeCoding: 0, openFindings: 0 })).toBe(
      "Resolve Engineering Finding",
    );
    expect(governanceNextActionLabel({ reviewRequired: false, openCritical: 0, openHighBeforeCoding: 0, openFindings: 0 })).toBeNull();
  });
});
