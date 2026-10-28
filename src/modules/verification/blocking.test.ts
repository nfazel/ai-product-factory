import { describe, expect, it } from "vitest";

import { proveOutcome, type OutcomeSession } from "@/modules/prove/outcome";
import { classifyVerificationFailure, failureClassForEscalation, failureReason } from "@/modules/verification/failure";
import { verificationAction, verificationProgress } from "@/modules/verification/disposition";
import { judgeObligations } from "@/modules/verification/verdict";
import type { VerificationObligation } from "@/modules/verification/obligations";

function obligation(status: VerificationObligation["status"], overrides: Partial<VerificationObligation> = {}): VerificationObligation {
  return {
    id: "coverage:0",
    title: "Functional acceptance criterion",
    kind: "FUNCTIONAL_ACCEPTANCE",
    source: "FUNCTIONAL_ACCEPTANCE_CRITERION",
    mandatory: true,
    status,
    evidence: "Coverage recorded for an acceptance criterion on this task.",
    ...overrides,
  } as VerificationObligation;
}

describe("a blocking escalation never produces a product FAIL", () => {
  it("is INCONCLUSIVE even when an approved obligation failed", () => {
    const decision = judgeObligations({
      obligations: [obligation("FAILED")],
      defects: [],
      blockingEscalation: true,
    });
    expect(decision.verdict).toBe("INCONCLUSIVE");
    expect(decision.reason).toMatch(/blocked by an unresolved escalation/);
  });

  it("still reports FAIL for a real failure when nothing blocks the verdict", () => {
    const decision = judgeObligations({
      obligations: [obligation("FAILED")],
      defects: [],
      blockingEscalation: false,
    });
    expect(decision.verdict).toBe("FAIL");
  });

  it("maps each blocking escalation to its own class, and nothing else to a blocking class", () => {
    expect(failureClassForEscalation("IMPLEMENTATION_CHANGE")).toBe("VERIFICATION_SNAPSHOT_MISMATCH");
    expect(failureClassForEscalation("SECRET_ACCESS")).toBe("VERIFICATION_ESCALATION_BLOCKED");
    expect(failureClassForEscalation("SCOPE_QUESTION")).toBe("");
  });

  it("classifies a snapshot mismatch error as a snapshot mismatch, not an execution failure", () => {
    const error = new Error("The verification workspace is not at the approved snapshot. Verification was stopped without judging the product.");
    expect(classifyVerificationFailure(error)).toBe("VERIFICATION_SNAPSHOT_MISMATCH");
    expect(failureReason("VERIFICATION_SNAPSHOT_MISMATCH")).toMatch(/blocking error/);
  });
});

describe("interrupted and blocked attempts are distinct progress states", () => {
  const running = { status: "EXECUTING", overallVerdict: null, failureClass: "", demo: false, stale: false };

  it("reports INTERRUPTED only when the server no longer runs the attempt", () => {
    expect(verificationProgress({ session: running, approvalStale: false, approved: false, interrupted: false })).toBe("RUNNING");
    expect(verificationProgress({ session: running, approvalStale: false, approved: false, interrupted: true })).toBe("INTERRUPTED");
    expect(verificationAction("INTERRUPTED")).toMatchObject({ key: "recover-verification", decision: true });
  });

  it("does not treat a finished, interrupted-and-recovered attempt as still running", () => {
    const recovered = { status: "FAILED", overallVerdict: null, failureClass: "VERIFICATION_INTERRUPTED", demo: false, stale: false };
    expect(verificationProgress({ session: recovered, approvalStale: false, approved: false, interrupted: false })).toBe("RETRYABLE");
  });

  it("treats a snapshot mismatch as retryable from the approved commit, never as a product verdict", () => {
    const blocked = {
      status: "BLOCKED",
      overallVerdict: "INCONCLUSIVE",
      failureClass: "VERIFICATION_SNAPSHOT_MISMATCH",
      demo: false,
      stale: false,
    };
    expect(verificationProgress({ session: blocked, approvalStale: false, approved: false })).toBe("RETRYABLE");
  });
});

describe("the outcome explains each state for a person", () => {
  const base: OutcomeSession = {
    status: "EXECUTING",
    overallVerdict: null,
    failureClass: "",
    failureStage: "AGENT_EXECUTE",
    failureDetail: "",
    verdictReason: "",
    staleReason: "",
    completedAt: null,
    updatedAt: new Date("2026-10-27T10:00:00Z"),
    executions: [],
    evidence: [],
    testCases: [],
  };

  it("names an interrupted attempt and states that nothing was judged", () => {
    const outcome = proveOutcome("INTERRUPTED", base);
    expect(outcome?.kind).toBe("interrupted");
    expect(outcome?.message).toMatch(/Nothing about the product was judged/);
    expect(outcome?.recovery).toMatch(/Recover Interrupted Attempt/);
  });

  it("names a snapshot block as blocked, not as failing behaviour", () => {
    const outcome = proveOutcome("RETRYABLE", {
      ...base,
      status: "BLOCKED",
      overallVerdict: "INCONCLUSIVE",
      failureClass: "VERIFICATION_SNAPSHOT_MISMATCH",
      failureDetail: "The verification workspace is not at the approved snapshot.",
    });
    expect(outcome?.kind).toBe("snapshot-blocked");
    expect(outcome?.label).toMatch(/approved snapshot changed/);
    expect(outcome?.technicalDetail).toMatch(/approved snapshot/);
  });
});
