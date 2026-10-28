import { describe, expect, it } from "vitest";

import {
  verificationApprovalIsCurrent,
  verificationEvidenceFingerprint,
  withCurrentVerificationApprovals,
} from "@/modules/verification/integrity";

const session = {
  commitSha: "a".repeat(40),
  stale: false,
  executions: [{ id: "execution-1", exitCode: 0, status: "PASSED" }],
  coverages: [{ acceptanceCriterionId: "criterion-1", status: "VERIFIED" }],
};

function approval(overrides: Partial<{
  stale: boolean;
  commitSha: string;
  evidenceFingerprint: string;
  approval: { status: string };
}> = {}) {
  return {
    stale: false,
    commitSha: session.commitSha,
    evidenceFingerprint: verificationEvidenceFingerprint(session),
    approval: { status: "APPROVED" },
    ...overrides,
  };
}

describe("verification approval integrity", () => {
  it("preserves the stored execution and coverage fingerprint format", () => {
    expect(verificationEvidenceFingerprint(session)).toBe(
      verificationEvidenceFingerprint({
        ...session,
        executions: [...session.executions].reverse(),
        coverages: [...session.coverages].reverse(),
      }),
    );
  });

  it("requires a current commit and matching evidence fingerprint", () => {
    expect(verificationApprovalIsCurrent(approval(), session)).toBe(true);
    expect(verificationApprovalIsCurrent(approval({ evidenceFingerprint: "different" }), session)).toBe(false);
    expect(verificationApprovalIsCurrent(approval({ commitSha: "b".repeat(40) }), session)).toBe(false);
    expect(verificationApprovalIsCurrent(approval({ stale: true }), session)).toBe(false);
  });

  it("exposes a fingerprint mismatch as a stale approval to consumers", () => {
    const current = withCurrentVerificationApprovals({
      ...session,
      approvals: [approval({ evidenceFingerprint: "different" })],
    });
    expect(current.approvals[0]?.stale).toBe(true);
  });
});