import { describe, expect, it } from "vitest";

import {
  approvalState,
  coverageRows,
  currentSessionFor,
  executionSummary,
  explainProveState,
  filterProveRows,
  openFindings,
  parseProveFilter,
  parseProveTab,
  proveOverviewSummary,
  proveTaskHref,
  summariseProveTask,
  type ProveAwaitingTask,
  type ProveSession,
} from "@/modules/prove/task-status";

const TASK_4_COMMIT = "7badef42504c88ec8d27de47d8f2f804ae757bee";
const T0 = new Date("2026-10-23T15:32:00.000Z");
const T1 = new Date("2026-10-26T11:09:00.000Z");
const T2 = new Date("2026-10-27T09:00:00.000Z");

function task(patch: Partial<ProveAwaitingTask> = {}): ProveAwaitingTask {
  return {
    id: "task-4",
    title: "Implement Card Discovery Feed",
    status: "COMPLETED",
    blockers: [],
    trace: { outcome: "", capability: "", epic: "", feature: "", story: "", criteria: [], task: "" },
    featureConcern: "",
    commitSha: TASK_4_COMMIT,
    ...patch,
  } as ProveAwaitingTask;
}

function session(patch: Partial<ProveSession> = {}): ProveSession {
  return {
    id: "session-1",
    implementationTaskId: "task-4",
    status: "REVIEW",
    overallVerdict: "PASS",
    failureClass: "",
    verdictReason: "",
    commitSha: TASK_4_COMMIT,
    demo: false,
    stale: false,
    staleReason: "",
    createdAt: T1,
    updatedAt: T1,
    startedAt: T1,
    completedAt: T1,
    approvals: [],
    coverages: [],
    testCases: [],
    evidence: [],
    executions: [],
    defectLinks: [],
    escalations: [],
    nfrResults: [],
    contract: null,
    workspace: null,
    ...patch,
  } as unknown as ProveSession;
}

function covered(id: string, criterionId: string, description: string, status: string) {
  return { id, acceptanceCriterionId: criterionId, status, rationale: "", criterion: { description } };
}

describe("Prove overview status", () => {
  it("shows Task 4 as ready for verification from real eligibility, without any verification record", () => {
    const row = summariseProveTask(task(), []);
    expect(row.bucket).toBe("ready");
    expect(row.verificationLabel).toBe("Ready for verification");
    expect(row.implementationLabel).toBe("Completed");
    expect(row.shortCommit).toBe("7badef42504c");
    expect(row.nextAction).toEqual({ kind: "start-verification", label: "Start Independent Verification" });
    expect(row.primaryBlocker).toBe("");
  });

  it("does not mark a completed task verified from coding completion alone", () => {
    const row = summariseProveTask(task({ status: "COMPLETED" }), []);
    expect(row.bucket).not.toBe("verified");
    expect(row.verificationLabel).not.toBe("Verified");
  });

  it("maps a running verification to in progress with a progress action", () => {
    const row = summariseProveTask(task(), [session({ status: "EXECUTING", overallVerdict: null })]);
    expect(row.bucket).toBe("in-progress");
    expect(row.verificationLabel).toBe("Verification in progress");
    expect(row.nextAction).toEqual({ kind: "workspace-tab", label: "View verification progress", tab: "results" });
  });

  it("maps a passing verdict without human approval to awaiting human review", () => {
    const row = summariseProveTask(task(), [session({ overallVerdict: "PASS" })]);
    expect(row.bucket).toBe("awaiting-review");
    expect(row.nextAction).toEqual({ kind: "workspace-tab", label: "Review verification evidence", tab: "approval" });
    expect(row.approved).toBe(false);
  });

  it("maps a non-stale human approval on a passing verdict to verified", () => {
    const row = summariseProveTask(task(), [
      session({ overallVerdict: "PASS", approvals: [{ id: "a", stale: false, commitSha: TASK_4_COMMIT, createdAt: T2 }] as never }),
    ]);
    expect(row.bucket).toBe("verified");
    expect(row.nextAction).toEqual({ kind: "workspace-tab", label: "View evidence", tab: "evidence" });
  });

  it("keeps a blocked task blocked with the exact blocker and a Build link action", () => {
    const row = summariseProveTask(task({ blockers: ["Required coding checks did not pass."] }), []);
    expect(row.bucket).toBe("blocked");
    expect(row.primaryBlocker).toBe("Required coding checks did not pass.");
    expect(row.nextAction).toEqual({ kind: "return-to-build", label: "Return to Build" });
    expect(row.needsAttention).toBe(true);
  });

  it("asks for Build completion when the implementation is not completed", () => {
    const row = summariseProveTask(task({ status: "IN_PROGRESS" }), []);
    expect(row.bucket).toBe("blocked");
    expect(row.nextAction).toEqual({ kind: "return-to-build", label: "Complete Build" });
  });

  it("offers retry only for retryable failures and never for a blocked gate", () => {
    const retryable = summariseProveTask(task(), [session({ status: "FAILED", overallVerdict: null, failureClass: "" })]);
    expect(retryable.bucket).toBe("blocked");
    expect(retryable.nextAction.kind).toBe("retry-verification");

    const gated = summariseProveTask(task({ blockers: ["A human code approval is required before verification."] }), [
      session({ status: "FAILED", overallVerdict: null }),
    ]);
    expect(gated.nextAction).toEqual({ kind: "return-to-build", label: "Return to Build" });
  });

  it("treats a stale verification as blocked and needing a new attempt", () => {
    const row = summariseProveTask(task(), [session({ stale: true, staleReason: "RE-VERIFICATION REQUIRED." })]);
    expect(row.bucket).toBe("blocked");
    expect(row.verificationLabel).toBe("Verification stale");
    expect(row.nextAction.kind).toBe("retry-verification");
    const state = explainProveState(row);
    expect(state.meaning).toBe("RE-VERIFICATION REQUIRED.");
  });

  it("explains the Task 4 workspace state in plain language", () => {
    const row = summariseProveTask(task(), []);
    const state = explainProveState(row);
    expect(state.headline).toBe("Ready for Independent Verification");
    expect(state.meaning).toContain("7badef42504c");
    expect(state.why).toMatch(/does not approve/);
  });
});

describe("historical failures and later evidence", () => {
  it("uses the latest passing attempt and does not let an earlier failure override it", () => {
    const newest = session({ id: "newer", overallVerdict: "PASS", createdAt: T2 });
    const older = session({ id: "older", status: "FAILED", overallVerdict: "FAIL", createdAt: T0 });
    expect(currentSessionFor([newest, older])?.id).toBe("newer");
    const row = summariseProveTask(task(), [newest, older]);
    expect(row.bucket).toBe("awaiting-review");
  });

  it("does not hide a newer failure behind an earlier pass", () => {
    const newest = session({ id: "newer", status: "FAILED", overallVerdict: "FAIL", createdAt: T2 });
    const older = session({ id: "older", overallVerdict: "PASS", createdAt: T0 });
    const row = summariseProveTask(task(), [newest, older]);
    expect(row.bucket).toBe("blocked");
    expect(row.verificationLabel).toBe("Verification checks failed");
  });

  it("keeps earlier failed evidence available to the history view", () => {
    const failing = session({
      id: "older",
      overallVerdict: "FAIL",
      evidence: [{ id: "e-old", type: "TEST_RESULT", source: "COMMAND_RUNNER", result: "FAIL", description: "npm test" }] as never,
    });
    expect(failing.evidence).toHaveLength(1);
    expect(failing.evidence[0]).toMatchObject({ result: "FAIL" });
  });
});

describe("approval state", () => {
  it("separates verification completed, verification passed, and human approval", () => {
    const awaiting = approvalState(session({ overallVerdict: "PASS" }));
    expect(awaiting).toEqual({ completed: true, passed: true, humanApproved: false });

    const verified = approvalState(session({
      overallVerdict: "PASS",
      approvals: [{ id: "a", stale: false, createdAt: T2 }] as never,
    }));
    expect(verified).toEqual({ completed: true, passed: true, humanApproved: true });

    const none = approvalState(null);
    expect(none).toEqual({ completed: false, passed: false, humanApproved: false });
  });

  it("does not treat a stale approval as human approval", () => {
    const state = approvalState(session({ overallVerdict: "PASS", approvals: [{ id: "a", stale: true, createdAt: T2 }] as never }));
    expect(state.humanApproved).toBe(false);
  });
});

describe("acceptance criteria coverage", () => {
  it("shows Not verified when there is no recorded result", () => {
    const rows = coverageRows(session({
      coverages: [covered("c1", "ac-1", "Discovery feed shows candidate profiles", "NOT_TESTED")] as never,
    }));
    expect(rows[0]).toMatchObject({ verificationLabel: "Not verified", evidenceCount: 0 });
  });

  it("links tests and evidence only through recorded references, never by description", () => {
    const testCases = [
      { id: "t1", acceptanceCriterionId: "ac-1", title: "feed loads", status: "PASSED", provenance: "VERIFICATION_AGENT" },
      { id: "t2", acceptanceCriterionId: null, title: "unrelated", status: "NOT_RUN", provenance: "HUMAN_EXISTING" },
    ];
    const evidence = [
      { id: "e1", acceptanceCriterionId: "ac-1", testCaseId: null, type: "TEST_RESULT", result: "PASS", description: "" },
      { id: "e2", acceptanceCriterionId: null, testCaseId: "t1", type: "TEST_RESULT", result: "PASS", description: "" },
      // Description mentions the criterion text, but there is no recorded link: must not count.
      { id: "e3", acceptanceCriterionId: null, testCaseId: null, type: "TEST_RESULT", result: "PASS", description: "Discovery feed shows candidate profiles" },
    ];
    const rows = coverageRows(session({
      coverages: [covered("c1", "ac-1", "Discovery feed shows candidate profiles", "VERIFIED")] as never,
      testCases: testCases as never,
      evidence: evidence as never,
    }));
    expect(rows[0].testCases.map((item) => item.id)).toEqual(["t1"]);
    expect(rows[0].evidenceCount).toBe(2);
    expect(rows[0].gap).toBe("");
  });

  it("flags a verified criterion that has no linked evidence instead of inventing it", () => {
    const rows = coverageRows(session({
      coverages: [covered("c1", "ac-1", "Feed paginates", "VERIFIED")] as never,
      evidence: [{ id: "e", acceptanceCriterionId: null, testCaseId: null, type: "TEST_RESULT", result: "PASS", description: "build" }] as never,
    }));
    expect(rows[0].evidenceCount).toBe(0);
    expect(rows[0].gap).toMatch(/no linked evidence/);
  });
});

describe("execution, findings and filters", () => {
  it("counts recorded executions by status only", () => {
    const counts = executionSummary(session({
      executions: [
        { id: "x1", status: "PASSED" },
        { id: "x2", status: "FAILED" },
        { id: "x3", status: "NOT_RUN" },
      ] as never,
    }));
    expect(counts).toEqual({ PASSED: 1, FAILED: 1, BLOCKED: 0, NOT_RUN: 1 });
  });

  it("lists only open defects and escalations as findings", () => {
    const findings = openFindings(session({
      defectLinks: [
        { id: "d1", workItem: { title: "Open defect", priority: "HIGH", status: "OPEN" } },
        { id: "d2", workItem: { title: "Closed defect", priority: "LOW", status: "DONE" } },
      ] as never,
      escalations: [{ id: "x1", type: "SCOPE", status: "OPEN", reason: "Needs decision", description: "" }] as never,
    }));
    expect(findings.map((item) => item.title)).toEqual(["Open defect", "SCOPE"]);
  });

  it("prioritises attention by default and keeps blocked tasks visible in All", () => {
    const rows = proveOverviewSummary([
      task({ id: "a", title: "A", blockers: [] }),
      task({ id: "b", title: "B", blockers: ["Blocked by something"] }),
      task({ id: "c", title: "C", status: "COMPLETED" }),
    ], [
      session({ id: "s-c", implementationTaskId: "c", overallVerdict: "PASS", approvals: [{ id: "x", stale: false, createdAt: T2 }] as never }),
    ]).rows;
    expect(parseProveFilter(undefined, rows)).toBe("needs-attention");
    expect(filterProveRows(rows, "needs-attention").map((row) => row.id)).toEqual(["b", "a"]);
    expect(filterProveRows(rows, "all").map((row) => row.id)).toContain("b");
    expect(filterProveRows(rows, "blocked").map((row) => row.id)).toEqual(["b"]);
    expect(filterProveRows(rows, "verified").map((row) => row.id)).toEqual(["c"]);
    expect(filterProveRows(rows, "in-progress")).toEqual([]);
  });

  it("falls back to All when nothing needs attention and ignores unknown filters", () => {
    const verified = summariseProveTask(task(), [
      session({ overallVerdict: "PASS", approvals: [{ id: "a", stale: false, createdAt: T2 }] as never }),
    ]);
    expect(parseProveFilter(undefined, [verified])).toBe("all");
    expect(parseProveFilter("bogus", [verified])).toBe("all");
    expect(parseProveFilter("ready", [verified])).toBe("ready");
    expect(parseProveTab("bogus")).toBe("overview");
    expect(parseProveTab("approval")).toBe("approval");
  });

  it("builds the workspace path for a task without changing state", () => {
    expect(proveTaskHref("p1", "t1")).toBe("/products/p1/testing/tasks/t1");
  });

  it("does not mutate the persisted inputs", () => {
    const input = [task({ blockers: ["x"] })];
    const sessions = [session({ overallVerdict: "PASS" })];
    const before = JSON.stringify({ input, sessions });
    proveOverviewSummary(input, sessions);
    expect(JSON.stringify({ input, sessions })).toBe(before);
  });
});

describe("execution failures, failed checks and insufficient evidence stay distinct", () => {
  it("labels a process that could not complete as an execution failure, with its stage and a manual recovery", () => {
    const row = summariseProveTask(task(), [session({
      status: "FAILED",
      overallVerdict: null,
      failureClass: "AI_PROVIDER_UNAVAILABLE",
      failureStage: "AGENT_EXECUTE",
      failureDetail: "provider timeout",
      verdictReason: "AI provider unavailable",
      completedAt: T2,
      updatedAt: T2,
    } as Partial<ProveSession>)]);
    expect(row.bucket).toBe("blocked");
    expect(row.verificationLabel).toBe("Verification execution failed");
    expect(row.outcome).toMatchObject({ kind: "execution-failed", stage: expect.stringContaining("execution") });
    expect(row.nextAction).toMatchObject({ kind: "retry-verification" });
    const explanation = explainProveState(row);
    expect(explanation.headline).toBe("Verification execution failed");
    expect(explanation.why).toContain("Retry never happens automatically");
  });

  it("labels found failing behaviour as failed checks, never as an execution failure", () => {
    const row = summariseProveTask(task(), [session({
      status: "REVIEW",
      overallVerdict: "FAIL",
      verdictReason: "A connect action was not persisted.",
    })]);
    expect(row.verificationLabel).toBe("Verification checks failed");
    expect(row.outcome?.kind).toBe("checks-failed");
    expect(explainProveState(row).headline).toBe("Verification found failing behaviour");
  });

  it("labels Task 4's inconclusive attempt as evidence insufficient awaiting a human decision, not blocked by an execution error", () => {
    const testCases = [
      { id: "c1", title: "Submit a card for the feed", status: "READY", automated: false, provenance: "VERIFICATION_AGENT", acceptanceCriterionId: "ac-1" },
    ];
    const row = summariseProveTask(task(), [session({
      status: "BLOCKED",
      overallVerdict: "INCONCLUSIVE",
      failureClass: "VERIFICATION_EVIDENCE_INSUFFICIENT",
      failureStage: "AGENT_EXECUTE",
      testCases,
      evidence: [{ id: "e1", testCaseId: "c1", acceptanceCriterionId: null, type: "TEST_RESULT", source: "COMMAND_RUNNER", result: "NOT RUN", description: "This case is manual.", createdAt: T2 }],
    } as unknown as Partial<ProveSession>)]);
    expect(row.bucket).toBe("awaiting-review");
    expect(row.verificationLabel).toBe("Verification Inconclusive");
    expect(row.outcome).toMatchObject({ kind: "evidence-insufficient", testCases: { total: 1, ran: 0 } });
    expect(row.nextAction).toEqual({ kind: "start-new-verification", label: "Start New Verification Attempt" });
    expect(row.newAttempt).toEqual({ allowed: true, reason: "" });
    expect(explainProveState(row).headline).toBe("Verification finished without enough evidence");
  });

  it("offers the explicit new attempt only when the policy permits it, and names the reason when it does not", () => {
    const inconclusive = session({
      status: "BLOCKED",
      overallVerdict: "INCONCLUSIVE",
      failureClass: "VERIFICATION_EVIDENCE_INSUFFICIENT",
    });
    const blocked = summariseProveTask(task({ blockers: ["A human code approval is required before verification."] }), [inconclusive]);
    expect(blocked.newAttempt.allowed).toBe(false);
    expect(blocked.newAttempt.allowed ? "" : blocked.newAttempt.reason).toMatch(/code approval/);
    expect(blocked.nextAction.kind).not.toBe("start-new-verification");

    const approved = summariseProveTask(task(), [session({
      status: "PASSED",
      overallVerdict: "PASS",
      failureClass: "",
      approvals: [{ id: "x", stale: false, createdAt: T2 }] as never,
    })]);
    expect(approved.newAttempt.allowed).toBe(false);
    expect(approved.newAttempt.allowed ? "" : approved.newAttempt.reason).toMatch(/already approved/);
    expect(approved.nextAction.kind).not.toBe("start-new-verification");

    const failed = summariseProveTask(task(), [session({ status: "REVIEW", overallVerdict: "FAIL" })]);
    expect(failed.newAttempt.allowed).toBe(false);
    expect(failed.nextAction.kind).not.toBe("start-new-verification");

    const running = summariseProveTask(task(), [session({ status: "EXECUTING", overallVerdict: null })]);
    expect(running.newAttempt.allowed).toBe(false);
    expect(running.nextAction.kind).not.toBe("start-new-verification");

    const none = summariseProveTask(task(), []);
    expect(none.newAttempt.allowed).toBe(false);
    expect(none.nextAction).toMatchObject({ kind: "start-verification" });
  });

  it("shows the newest attempt's outcome while keeping the earlier execution failure in the attempts list", () => {
    const newest = session({
      id: "session-new",
      status: "BLOCKED",
      overallVerdict: "INCONCLUSIVE",
      failureClass: "VERIFICATION_EVIDENCE_INSUFFICIENT",
      createdAt: T2,
      updatedAt: T2,
    });
    const older = session({
      id: "session-old",
      status: "FAILED",
      overallVerdict: null,
      failureClass: "VERIFICATION_EXECUTION_FAILED",
      failureStage: "AGENT_PLAN",
      createdAt: T0,
      updatedAt: T0,
    });
    const sessions = [newest, older];
    const row = summariseProveTask(task(), sessions);
    expect(row.outcome?.kind).toBe("evidence-insufficient");
    expect(row.sessionId).toBe("session-new");
    expect(sessions.find((item) => item.id === "session-old")).toMatchObject({
      failureClass: "VERIFICATION_EXECUTION_FAILED",
      failureStage: "AGENT_PLAN",
    });
    expect(sessions).toHaveLength(2);
  });
});
