import { describe, expect, it } from "vitest";

import { proveOutcome, type OutcomeSession } from "@/modules/prove/outcome";
import { failureStageLabel, sanitizeFailureDetail } from "@/modules/verification/diagnostics";

const NOW = new Date("2026-10-27T10:52:18.000Z");

function session(patch: Partial<OutcomeSession> = {}): OutcomeSession {
  return {
    status: "BLOCKED",
    overallVerdict: null,
    failureClass: "",
    failureStage: "",
    failureDetail: "",
    verdictReason: "",
    staleReason: "",
    completedAt: NOW,
    updatedAt: NOW,
    executions: [],
    evidence: [],
    testCases: [],
    ...patch,
  };
}

const FOUR_CASES = [
  { id: "c1", title: "Submit a card for the feed", status: "READY" },
  { id: "c2", title: "Record a connect action", status: "READY" },
  { id: "c3", title: "Record a pass action", status: "READY" },
  { id: "c4", title: "Empty feed message", status: "READY" },
];

describe("execution failures (the process could not complete)", () => {
  it("names the failed stage, the failure code, the redacted detail and a recovery that is not automatic", () => {
    const outcome = proveOutcome("RETRYABLE", session({
      status: "FAILED",
      failureClass: "AI_PROVIDER_UNAVAILABLE",
      failureStage: "AGENT_EXECUTE",
      failureDetail: "Provider rejected request with api_key=sk-FAKE_TEST_KEY_NOT_REAL_1234567890 and Bearer eyJhbGciOiJIUzI1NiJ9.payload",
      verdictReason: "AI provider unavailable",
    }));
    expect(outcome).toMatchObject({
      kind: "execution-failed",
      tone: "danger",
      label: "Verification execution failed",
      stage: "Verification execution (test runs, technical checks, AI interpretation)",
      failureClass: "AI_PROVIDER_UNAVAILABLE",
    });
    expect(outcome?.technicalDetail).toContain("api_key=[redacted]");
    expect(outcome?.technicalDetail).not.toContain("sk-live-abcdef123456");
    expect(outcome?.technicalDetail).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(outcome?.recovery).toContain("Retry never happens automatically");
    expect(outcome?.recovery).toContain("server configuration");
  });

  it("says no evidence was written when the failure happened before any evidence", () => {
    const outcome = proveOutcome("RETRYABLE", session({
      status: "FAILED",
      failureClass: "VERIFICATION_SETUP_FAILED",
      failureStage: "WORKSPACE_SETUP",
      failureDetail: "worktree add failed",
    }));
    expect(outcome?.kind).toBe("execution-failed");
    expect(outcome?.message).toContain("No evidence was written before the stop");
    expect(outcome?.stage).toBe("Creating the isolated verification workspace");
    expect(outcome?.recovery).toContain("workspace");
  });

  it("counts the records written before a failure after partial evidence, without judging criteria", () => {
    const outcome = proveOutcome("RETRYABLE", session({
      status: "FAILED",
      failureClass: "VERIFICATION_EXECUTION_FAILED",
      failureStage: "AGENT_EXECUTE",
      executions: [{ status: "PASSED" }, { status: "PASSED" }],
      evidence: [{ testCaseId: null, result: "EXECUTED", description: "npm run build", acceptanceCriterionId: null }],
    }));
    expect(outcome?.kind).toBe("execution-failed");
    expect(outcome?.message).toContain("2 technical check record(s) and 1 evidence record(s) were written");
    expect(outcome?.message).toContain("do not decide the acceptance criteria");
  });

  it("treats a required check command that could not run as an execution failure with a command-specific recovery", () => {
    const outcome = proveOutcome("RETRYABLE", session({
      status: "BLOCKED",
      overallVerdict: "INCONCLUSIVE",
      failureClass: "VERIFICATION_COMMAND_UNAVAILABLE",
      failureStage: "AGENT_EXECUTE",
    }));
    expect(outcome?.kind).toBe("execution-failed");
    expect(outcome?.recovery).toContain("required check command");
  });

  it("explains an attempt that predates stage recording without inventing a stage", () => {
    const outcome = proveOutcome("RETRYABLE", session({ status: "FAILED", failureClass: "VERIFICATION_EXECUTION_FAILED" }));
    expect(outcome?.stage).toBe("Not recorded for this attempt");
    expect(outcome?.message).toContain("Stage: Not recorded for this attempt");
    expect(outcome?.technicalDetail).toBe("");
  });
});

describe("the four outcomes stay distinct", () => {
  it("shows Task 4's inconclusive attempt as insufficient evidence, not as an execution failure", () => {
    const outcome = proveOutcome("REVIEW", session({
      overallVerdict: "INCONCLUSIVE",
      failureClass: "VERIFICATION_EVIDENCE_INSUFFICIENT",
      failureStage: "AGENT_EXECUTE",
      status: "BLOCKED",
      verdictReason: "Required verification evidence is missing.",
      testCases: FOUR_CASES,
      evidence: FOUR_CASES.map((item) => ({
        testCaseId: item.id,
        result: "NOT RUN",
        description: "This case is manual. A person must run it and record the result.",
        acceptanceCriterionId: null,
      })),
    }));
    expect(outcome).toMatchObject({
      kind: "evidence-insufficient",
      tone: "warning",
      label: "Verification Inconclusive",
    });
    expect(outcome?.kind).not.toBe("execution-failed");
    expect(outcome?.testCases).toEqual({ total: 4, ran: 0 });
    expect(outcome?.message).toContain("0 of 4 acceptance test case(s) ran automatically");
    expect(outcome?.message).toContain("not judged failing");
    expect(outcome?.notRun).toHaveLength(4);
    expect(outcome?.notRun[0]).toMatchObject({ title: "Submit a card for the feed" });
  });

  it("reports failing behaviour when a verdict is FAIL, with no stage or execution wording", () => {
    const outcome = proveOutcome("FAILED", session({
      status: "REVIEW",
      overallVerdict: "FAIL",
      verdictReason: "A connect action was not persisted.",
    }));
    expect(outcome).toMatchObject({
      kind: "checks-failed",
      label: "Verification checks failed",
      message: "A connect action was not persisted.",
      stage: "",
    });
    expect(outcome?.kind).not.toBe("execution-failed");
  });

  it("asks for a human decision on a passing verdict without approving it", () => {
    const outcome = proveOutcome("AWAITING", session({ status: "REVIEW", overallVerdict: "PASS" }));
    expect(outcome).toMatchObject({ kind: "awaiting-review", label: "Awaiting human review" });
    expect(outcome?.message).toContain("cannot approve its own work");
  });

  it("marks a recorded human approval as approved", () => {
    expect(proveOutcome("APPROVED", session({ overallVerdict: "PASS" }))).toMatchObject({
      kind: "approved",
      tone: "success",
    });
  });

  it("returns nothing when no attempt exists, when demo data is shown, or when it is still running", () => {
    expect(proveOutcome("NONE", null)).toBeNull();
    expect(proveOutcome("DEMO", session())).toBeNull();
    expect(proveOutcome("RUNNING", session({ status: "EXECUTING" }))?.kind).toBe("running");
  });
});

describe("failure diagnostics helpers", () => {
  it("maps only known stage codes to readable labels", () => {
    expect(failureStageLabel("AGENT_PLAN")).toContain("planning");
    expect(failureStageLabel("")).toBeNull();
    expect(failureStageLabel("SOMETHING_ELSE")).toBeNull();
  });

  it("removes credential-shaped values and keeps the readable part of the message", () => {
    const text = sanitizeFailureDetail(
      "Request failed for https://user:pw@example.com. token: abc123secret, key sk-proj-ABCDEFGH1234 and AIzaSyD-1234567890abcdefghij failed postgresql://app:hunter2@localhost:5433/db",
    );
    expect(text).toContain("Request failed");
    expect(text).not.toContain("sk-proj-ABCDEFGH1234");
    expect(text).not.toContain("AIzaSyD");
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("abc123secret");
  });

  it("bounds the length of stored technical detail", () => {
    const text = sanitizeFailureDetail("x".repeat(2000), 100);
    expect(text.length).toBeLessThanOrEqual(100);
    expect(text.endsWith("…")).toBe(true);
  });
});
