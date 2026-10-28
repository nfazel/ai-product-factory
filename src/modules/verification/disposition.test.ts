import { describe, expect, it } from "vitest";

import {
  describeVerificationAttempt,
  integratedPlanCopy,
  verificationAction,
  verificationProgress,
} from "@/modules/verification/disposition";

describe("verification disposition", () => {
  it("keeps a failed session with an empty verdict on retry", () => {
    const progress = verificationProgress({
      session: { status: "FAILED", overallVerdict: null, failureClass: "", demo: false, stale: false },
      approvalStale: false,
      approved: false,
    });
    expect(progress).toBe("RETRYABLE");
    expect(verificationAction(progress)?.label).toBe("Retry Independent Verification");
    expect(verificationAction(progress)?.key).not.toBe("approve-verification");
  });

  it("routes an inconclusive session that lacks evidence to human review, not to retry", () => {
    const progress = verificationProgress({
      session: {
        status: "BLOCKED",
        overallVerdict: "INCONCLUSIVE",
        failureClass: "VERIFICATION_EVIDENCE_INSUFFICIENT",
        demo: false,
        stale: false,
      },
      approvalStale: false,
      approved: false,
    });
    expect(progress).toBe("REVIEW");
    expect(verificationAction(progress)?.label).toBe("Review Verification Result");
    expect(verificationAction(progress)?.key).not.toBe("retry-verification");
    expect(verificationAction(progress)?.key).not.toBe("approve-verification");
  });

  it("keeps retry for an inconclusive session whose required check could not run", () => {
    const progress = verificationProgress({
      session: {
        status: "BLOCKED",
        overallVerdict: "INCONCLUSIVE",
        failureClass: "VERIFICATION_COMMAND_UNAVAILABLE",
        demo: false,
        stale: false,
      },
      approvalStale: false,
      approved: false,
    });
    expect(progress).toBe("RETRYABLE");
    expect(verificationAction(progress)?.label).toBe("Retry Independent Verification");
  });

  it("offers approval only after a passing verdict", () => {
    expect(verificationAction(verificationProgress({
      session: { status: "PASSED", overallVerdict: "PASS", failureClass: "", demo: false, stale: false },
      approvalStale: false,
      approved: false,
    }))?.label).toBe("Approve Verification");
    expect(verificationAction("FAILED")?.label).toBe("Review Findings / Request Changes");
    expect(verificationAction("RUNNING")?.label).toBe("View Verification Progress");
    expect(verificationAction("APPROVED")).toBeNull();
  });

  it("describes the current task when the test command and interpretation both failed", () => {
    const described = describeVerificationAttempt({
      taskStatus: "COMPLETED",
      commitSha: "9abadcbfb2509ffad5902628e1d5bfcd5a8d7075",
      session: {
        status: "FAILED",
        overallVerdict: null,
        failureClass: "",
        verdictReason: "",
        commitSha: "9abadcbfb2509ffad5902628e1d5bfcd5a8d7075",
        executions: [{ command: "npm test", status: "FAILED", outputSummary: "npm error Missing script: \"test\"" }],
        evidence: [{ type: "TEST_RESULT", source: "COMMAND_RUNNER", result: "FAILED" }],
        approvals: [],
      },
    });
    expect(described).toMatchObject({
      implementation: "Completed",
      verification: "Execution failed",
      reason: "Test command unavailable; AI interpretation failed",
      productVerdict: "Not determined",
      approval: "Not available",
      nextAction: "Retry Independent Verification",
    });
    expect(described.commit.startsWith("9abadcbfb250")).toBe(true);
  });

  it("describes an integrated plan as planning rather than execution", () => {
    expect(integratedPlanCopy(true)).toContain("Execution has not started");
    expect(integratedPlanCopy(true)).toContain("Slice verification is blocked");
    expect(integratedPlanCopy(true)).not.toContain("PRODUCT SLICE VERIFIED");
    expect(integratedPlanCopy(false)).toContain("does not execute");
  });
});
