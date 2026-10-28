import { describe, expect, it } from "vitest";

import {
  failureClassForVerdict,
  failureReason,
  RETRYABLE_VERIFICATION_FAILURES,
  VERIFICATION_FAILURE_CLASSES,
} from "@/modules/verification/failure";
import { verificationProgress } from "@/modules/verification/disposition";
import { proveOutcome, type OutcomeSession } from "@/modules/prove/outcome";

const NOW = new Date("2026-10-27T10:52:18.000Z");

function outcomeSession(patch: Partial<OutcomeSession> = {}): OutcomeSession {
  return {
    status: "BLOCKED",
    overallVerdict: "INCONCLUSIVE",
    failureClass: "VERIFICATION_TEST_ENVIRONMENT_FAILED",
    failureStage: "AGENT_EXECUTE",
    failureDetail: "A module or package the test or product code imports is not installed or does not exist in this environment.",
    verdictReason: "A required check could not be executed.",
    staleReason: "",
    completedAt: NOW,
    updatedAt: NOW,
    executions: [],
    evidence: [],
    testCases: [],
    ...patch,
  };
}

describe("failure classes for environment and test-infrastructure problems", () => {
  it("names a blocked verification test as an environment failure, not a missing command or a product failure", () => {
    expect(failureClassForVerdict("INCONCLUSIVE", [{ status: "BLOCKED", kind: "NEW_VERIFICATION" }])).toBe(
      "VERIFICATION_TEST_ENVIRONMENT_FAILED",
    );
  });

  it("keeps a blocked repository check as a missing command", () => {
    expect(failureClassForVerdict("INCONCLUSIVE", [{ status: "BLOCKED", kind: "PLAN_CHECK" }])).toBe(
      "VERIFICATION_COMMAND_UNAVAILABLE",
    );
  });

  it("uses product failure only when an executed check failed", () => {
    expect(
      failureClassForVerdict("FAIL", [
        { status: "FAILED", kind: "NEW_VERIFICATION" },
        { status: "BLOCKED", kind: "NEW_VERIFICATION" },
      ]),
    ).toBe("PRODUCT_VERIFICATION_FAILED");
  });

  it("treats a test that did not run as missing evidence", () => {
    expect(failureClassForVerdict("INCONCLUSIVE", [{ status: "NOT_RUN", kind: "NEW_VERIFICATION" }])).toBe(
      "VERIFICATION_EVIDENCE_INSUFFICIENT",
    );
  });

  it("returns no class for a passing verdict", () => {
    expect(failureClassForVerdict("PASS", [{ status: "PASSED", kind: "NEW_VERIFICATION" }])).toBe("");
  });

  it("registers the new class as retryable, with a reason that says it is not a product failure", () => {
    expect(VERIFICATION_FAILURE_CLASSES).toContain("VERIFICATION_TEST_ENVIRONMENT_FAILED");
    expect(RETRYABLE_VERIFICATION_FAILURES.has("VERIFICATION_TEST_ENVIRONMENT_FAILED")).toBe(true);
    expect(failureReason("VERIFICATION_TEST_ENVIRONMENT_FAILED")).toMatch(/not a product failure/);
  });
});

describe("disposition for environment failures", () => {
  it("offers retry when a verification test could not run in this environment", () => {
    const progress = verificationProgress({
      session: {
        status: "BLOCKED",
        overallVerdict: "INCONCLUSIVE",
        failureClass: "VERIFICATION_TEST_ENVIRONMENT_FAILED",
        demo: false,
        stale: false,
      },
      approvalStale: false,
      approved: false,
    });
    expect(progress).toBe("RETRYABLE");
  });

  it("still asks a person to review missing acceptance evidence rather than retrying", () => {
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
  });
});

describe("Prove outcome for environment failures", () => {
  it("presents the stop as a test environment problem, not as a failed product check", () => {
    const outcome = proveOutcome("RETRYABLE", outcomeSession());
    expect(outcome?.label).toBe("Verification tests could not run");
    expect(outcome?.tone).toBe("warning");
    expect(outcome?.message).toContain("The product was not judged");
    expect(outcome?.recovery).toMatch(/not a product failure/);
    expect(outcome?.technicalDetail).toContain("not installed or does not exist");
  });

  it("keeps the generic execution failure presentation for other execution failures", () => {
    const outcome = proveOutcome("RETRYABLE", outcomeSession({ failureClass: "VERIFICATION_EXECUTION_FAILED" }));
    expect(outcome?.label).toBe("Verification execution failed");
    expect(outcome?.tone).toBe("danger");
  });
});
