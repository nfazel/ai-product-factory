import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actionSpies = vi.hoisted(() => ({
  startVerificationAction: vi.fn(),
  startNewVerificationAction: vi.fn(),
  retryVerificationAction: vi.fn(),
  approveVerificationAction: vi.fn(),
  rerunFailedAction: vi.fn(),
  requestTestingAction: vi.fn(),
  rejectVerificationAction: vi.fn(),
  manualResultAction: vi.fn(),
  notApplicableAction: vi.fn(),
  integratedAction: vi.fn(),
}));

vi.mock("@/server/actions/verification", () => actionSpies);

import { ProveOverview } from "@/components/prove/prove-overview";
import { VerificationWorkspace } from "@/components/prove/verification-workspace";
import {
  filterProveRows,
  parseProveFilter,
  proveOverviewSummary,
  summariseProveTask,
  type ProveAwaitingTask,
  type ProveSession,
} from "@/modules/prove/task-status";

const PRODUCT_ID = "prod-1";
const TASK_4_COMMIT = "7badef42504c88ec8d27de47d8f2f804ae757bee";

function task4(patch: Partial<ProveAwaitingTask> = {}): ProveAwaitingTask {
  return {
    id: "task-4",
    title: "Implement Card Discovery Feed",
    status: "COMPLETED",
    blockers: [],
    trace: { outcome: "", capability: "Discovery", epic: "", feature: "", story: "Card feed", criteria: ["Shows profiles"], task: "Implement Card Discovery Feed" },
    featureConcern: "",
    commitSha: TASK_4_COMMIT,
    ...patch,
  } as ProveAwaitingTask;
}

function blockedTask(): ProveAwaitingTask {
  return task4({
    id: "task-5",
    title: "Mutual Match Chat",
    status: "IN_PROGRESS",
    blockers: ["The implementation task is IN_PROGRESS. Verification requires a completed task."],
    commitSha: "",
  });
}

function failedSession(): ProveSession {
  return {
    id: "old-fail",
    implementationTaskId: "task-6",
    status: "FAILED",
    overallVerdict: "FAIL",
    failureClass: "",
    verdictReason: "Chat does not deliver messages",
    commitSha: "abc123",
    demo: false,
    stale: false,
    staleReason: "",
    createdAt: new Date("2026-10-20T10:00:00.000Z"),
    updatedAt: new Date("2026-10-20T10:00:00.000Z"),
    startedAt: null,
    completedAt: null,
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
    aiSummary: "",
  } as unknown as ProveSession;
}

function task4Session(): ProveSession {
  return {
    id: "task-4-session",
    implementationTaskId: "task-4",
    status: "REVIEW",
    overallVerdict: "PASS",
    failureClass: "",
    verdictReason: "All criteria verified",
    commitSha: TASK_4_COMMIT,
    demo: false,
    stale: false,
    staleReason: "",
    createdAt: new Date("2026-10-27T09:00:00.000Z"),
    updatedAt: new Date("2026-10-27T09:05:00.000Z"),
    startedAt: null,
    completedAt: null,
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
    aiSummary: "",
  } as unknown as ProveSession;
}

function sessionWithTestSource(body: string): ProveSession {
  return {
    ...task4Session(),
    testCases: [
      {
        id: "test-source-1",
        acceptanceCriterionId: "criterion-1",
        title: "Discovery feed returns matching profiles",
        purpose: "Match profiles and allow a connection or pass action.",
        expectedResult: "The feed contains matching profiles.",
        testType: "API",
        priority: "HIGH",
        provenance: "VERIFICATION_AGENT",
        automated: true,
        status: "PASSED",
        filePath: "verification/http/discovery.test.mjs",
        body,
      },
    ],
  } as unknown as ProveSession;
}

const sessions: ProveSession[] = [];

beforeEach(() => {
  for (const spy of Object.values(actionSpies)) spy.mockClear();
});

describe("Prove Overview rendering", () => {
  it("renders Task 4 as ready for verification with a link to its workspace", () => {
    const summary = proveOverviewSummary([task4(), blockedTask()], sessions);
    const html = renderToStaticMarkup(createElement(ProveOverview, {
      productId: PRODUCT_ID,
      summary,
      filter: "all",
      readinessLabel: "NOT VERIFIED",
    }));
    expect(html).toContain("Implement Card Discovery Feed");
    expect(html).toContain("Ready for verification");
    expect(html).toContain("Start Independent Verification");
    expect(html).toContain(`href="/products/${PRODUCT_ID}/testing/tasks/task-4"`);
    expect(html).toContain("Snapshot 7badef42504c");
    expect(html).toContain("Mutual Match Chat");
    expect(html).toContain("Complete Build");
    expect(html).toContain(`href="/products/${PRODUCT_ID}/build/tasks/task-5"`);
  });

  it("keeps blocked tasks visible under the default needs-attention filter", () => {
    const summary = proveOverviewSummary([task4(), blockedTask()], sessions);
    const filter = parseProveFilter(undefined, summary.rows);
    expect(filter).toBe("needs-attention");
    const html = renderToStaticMarkup(createElement(ProveOverview, {
      productId: PRODUCT_ID,
      summary,
      filter,
      readinessLabel: "NOT VERIFIED",
    }));
    expect(html).toContain("Mutual Match Chat");
    expect(html).toContain("Implement Card Discovery Feed");
  });

  it("shows an explanatory empty state instead of an empty panel when a filter matches nothing", () => {
    const summary = proveOverviewSummary([task4()], sessions);
    const html = renderToStaticMarkup(createElement(ProveOverview, {
      productId: PRODUCT_ID,
      summary,
      filter: "verified",
      readinessLabel: "NOT VERIFIED",
    }));
    expect(html).toContain("No tasks match this filter");
  });

  it("does not start, retry, or approve verification while rendering", () => {
    const summary = proveOverviewSummary([task4(), blockedTask()], sessions);
    renderToStaticMarkup(createElement(ProveOverview, {
      productId: PRODUCT_ID,
      summary,
      filter: "all",
      readinessLabel: "NOT VERIFIED",
    }));
    for (const spy of Object.values(actionSpies)) expect(spy).not.toHaveBeenCalled();
  });
});

describe("Verification Workspace rendering", () => {
  function renderWorkspace(taskValue: ProveAwaitingTask, sessionValues: ProveSession[], tab = "overview") {
    const row = summariseProveTask(taskValue, sessionValues);
    return renderToStaticMarkup(createElement(VerificationWorkspace, {
      productId: PRODUCT_ID,
      task: taskValue,
      sessions: sessionValues,
      row,
      planVersion: 4,
      planStatus: "APPROVED",
      activeTab: tab as never,
    }));
  }

  it("opens Task 4 with the next action Start Independent Verification and the approved snapshot", () => {
    const html = renderWorkspace(task4(), []);
    expect(html).toContain("Ready for Independent Verification");
    expect(html).toContain("Start Independent Verification");
    expect(html).toContain("7badef42504c");
    expect(html).toContain("v4");
    expect(html).toContain("Back to Prove Overview");
    expect(html).toContain("Implementation");
    expect(html).toContain("Verification");
    expect(html).toContain("Overview");
    expect(html).toContain("Verification plan");
    expect(html).toContain("Execution &amp; results");
    expect(html).toContain("Evidence &amp; findings");
    expect(html).toContain("Approval");
    expect(html).toContain("History");
  });

  it("does not run verification when the workspace renders", () => {
    renderWorkspace(task4(), []);
    for (const spy of Object.values(actionSpies)) expect(spy).not.toHaveBeenCalled();
  });

  it("exposes persisted source for an automated test and keeps its title and status visible", () => {
    const source = [
      'import test from "node:test";',
      "",
      'test("discovery feed", async () => {',
      '  const response = await fetch("/api/discovery/feed");',
      "  assert.equal(response.status, 200);",
      "});",
    ].join("\n");
    const html = renderWorkspace(task4(), [sessionWithTestSource(source)], "plan");

    expect(html).toContain("View Test Source");
    expect(html).toContain("<summary");
    expect(html).toContain('Test file: <code class="font-mono">verification/http/discovery.test.mjs</code>');
    expect(html).toContain("Discovery feed returns matching profiles");
    expect(html).toContain(" · PASSED");
    expect(html).toContain("Match profiles and allow a connection or pass action.");
    expect(html).toContain("Expected: The feed contains matching profiles.");
  });

  it("preserves source formatting and safely renders HTML-like source as text", () => {
    const source = [
      'import test from "node:test";',
      'test("source stays literal", () => {',
      "    const markup = \"<script>alert(1)</script>\";",
      "    assert.equal(markup.length > 0, true);",
      "});",
    ].join("\n");
    const html = renderWorkspace(task4(), [sessionWithTestSource(source)], "plan");

    expect(html).toContain('    const markup = &quot;&lt;script&gt;alert(1)&lt;/script&gt;&quot;;\n    assert.equal(markup.length &gt; 0, true);');
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("does not render an empty source viewer when an automated case has no body", () => {
    const html = renderWorkspace(task4(), [sessionWithTestSource("")], "plan");

    expect(html).not.toContain("View Test Source");
    expect(html).toContain("Test source unavailable.");
  });

  it("keeps test source inspection read-only", () => {
    const html = renderWorkspace(task4(), [sessionWithTestSource("assert.equal(1, 1);")], "plan");

    expect(html).toContain("View Test Source");
    for (const spy of Object.values(actionSpies)) expect(spy).not.toHaveBeenCalled();
  });

  it("shows a blocked task with its exact blocker and a link back to Build", () => {
    const html = renderWorkspace(blockedTask(), []);
    expect(html).toContain("Verification blocked");
    expect(html).toContain("Blocked by:");
    expect(html).toContain("Verification requires a completed task.");
    expect(html).toContain(`href="/products/${PRODUCT_ID}/build/tasks/task-5"`);
    expect(html).not.toContain("Start Independent Verification");
  });

  it("does not show a start control for a task whose verification has failed", () => {
    const html = renderWorkspace(task4({ id: "task-6", title: "Chat" }), [failedSession()], "approval");
    expect(html).toContain("Verification checks failed");
    expect(html).not.toContain("Start Independent Verification");
    expect(html).toContain("Approval history");
  });

  it("separates verification completion, verdict, and human approval on the approval tab", () => {
    const html = renderWorkspace(task4(), [task4Session()], "approval");
    expect(html).toContain("Verification completed");
    expect(html).toContain("Verification passed");
    expect(html).toContain("Human approval granted");
    expect(html).toContain("cannot approve its own work");
  });

  it("labels the historical failure as superseded in the history tab and keeps it visible", () => {
    const laterPass = { ...task4Session(), id: "later-pass", implementationTaskId: "task-6" };
    const html = renderWorkspace(task4({ id: "task-6", title: "Chat" }), [laterPass, failedSession()], "history");
    expect(html).toContain("Verification attempts (2)");
    expect(html).toContain("Earlier attempt — superseded by the latest attempt");
    expect(html).toContain("Chat does not deliver messages");
    expect(html).toContain("Current attempt");
  });
});

describe("filtering helpers used by the overview", () => {
  it("never hides blocked tasks under All", () => {
    const rows = proveOverviewSummary([task4(), blockedTask()], sessions).rows;
    expect(filterProveRows(rows, "all").map((row) => row.id)).toEqual(expect.arrayContaining(["task-4", "task-5"]));
  });
});

describe("Execution errors are visible in Prove", () => {
  function renderWorkspace(taskValue: ProveAwaitingTask, sessionValues: ProveSession[], tab = "overview") {
    const row = summariseProveTask(taskValue, sessionValues);
    return renderToStaticMarkup(createElement(VerificationWorkspace, {
      productId: PRODUCT_ID,
      task: taskValue,
      sessions: sessionValues,
      row,
      planVersion: 4,
      planStatus: "APPROVED",
      activeTab: tab as never,
    }));
  }

  function executionFailedSession(): ProveSession {
    return {
      ...task4Session(),
      id: "task-4-attempt-2",
      status: "FAILED",
      overallVerdict: null,
      failureClass: "AI_PROVIDER_UNAVAILABLE",
      failureStage: "AGENT_EXECUTE",
      failureDetail: "upstream timeout api_key=sk-FAKE_TEST_KEY_NOT_REAL_1234567890",
      verdictReason: "AI provider unavailable",
      completedAt: new Date("2026-10-27T10:52:18.000Z"),
    } as unknown as ProveSession;
  }

  function insufficientSession(): ProveSession {
    return {
      ...task4Session(),
      id: "task-4-attempt-3",
      status: "BLOCKED",
      overallVerdict: "INCONCLUSIVE",
      failureClass: "VERIFICATION_EVIDENCE_INSUFFICIENT",
      failureStage: "AGENT_EXECUTE",
      verdictReason: "Required verification evidence is missing.",
      testCases: [
        { id: "case-1", title: "Submit a card for the feed", status: "READY", automated: false, provenance: "VERIFICATION_AGENT", acceptanceCriterionId: "ac-1" },
      ],
      evidence: [
        {
          id: "ev-1",
          testCaseId: "case-1",
          acceptanceCriterionId: null,
          type: "TEST_RESULT",
          source: "COMMAND_RUNNER",
          result: "NOT RUN",
          description: "This case is manual. A person must run it and record the result in Execution & results.",
          createdAt: new Date("2026-10-27T10:51:40.000Z"),
        },
      ],
    } as unknown as ProveSession;
  }

  it("shows a failed execution prominently on the Prove Overview with its stage and a link to details", () => {
    const summary = proveOverviewSummary([task4()], [executionFailedSession()]);
    const html = renderToStaticMarkup(createElement(ProveOverview, {
      productId: PRODUCT_ID,
      summary,
      filter: "all",
      readinessLabel: "NOT VERIFIED",
    }));
    expect(html).toContain("Verification execution failed: Implement Card Discovery Feed");
    expect(html).toContain("The process stopped at: Verification execution");
    expect(html).toContain("Open verification details");
    expect(html).not.toContain("sk-live-abcdef123456");
  });

  it("states the stage, failure code, redacted detail and non-automatic recovery in the workspace Overview", () => {
    const html = renderWorkspace(task4(), [executionFailedSession()], "overview");
    expect(html).toContain("Verification execution failed");
    expect(html).toContain("Failed stage");
    expect(html).toContain("AI_PROVIDER_UNAVAILABLE");
    expect(html).toContain("Retry never happens automatically");
    expect(html).toContain("No evidence was written before the stop");
    expect(html).not.toContain("sk-live-abcdef123456");
  });

  it("shows the technical detail and the reasons cases did not run in Execution & results", () => {
    const html = renderWorkspace(task4(), [insufficientSession()], "results");
    expect(html).toContain("Failure diagnostics");
    expect(html).toContain("Test cases that did not run (1)");
    expect(html).toContain("Submit a card for the feed");
    expect(html).toContain("This case is manual. A person must run it");
  });

  it("keeps insufficient evidence distinct from an execution failure on the Overview", () => {
    const html = renderWorkspace(task4(), [insufficientSession()], "overview");
    expect(html).toContain("Verification Inconclusive");
    expect(html).toContain("0 of 1 acceptance test case(s) ran automatically");
    expect(html).not.toContain("Verification execution failed");
    expect(html).not.toContain("Retry never happens automatically");
  });

  it("does not describe a failed-criteria verdict as an execution failure", () => {
    const html = renderWorkspace(task4(), [failedSession()], "overview");
    expect(html).toContain("Verification checks failed");
    expect(html).not.toContain("Verification execution failed");
    expect(html).not.toContain("Failed stage");
  });

  it("shows the Verification Inconclusive panel with the exact message, the evidence link and the explicit new attempt", () => {
    const html = renderWorkspace(task4(), [insufficientSession()], "overview");
    expect(html).toContain("Verification Inconclusive");
    expect(html).toContain("The previous verification attempt did not produce sufficient evidence to confirm the acceptance criteria.");
    expect(html).toContain("Review Previous Evidence");
    expect(html).toContain("Start New Verification Attempt");
    expect(html).toContain("Starting a new attempt preserves the previous results and creates a separate verification record.");
    expect(html).toContain("tab=evidence#verification-tabs");
    expect(html).toContain('id="new-verification-attempt"');
  });

  it("links the next action to the in-page control and offers no start or retry control for an inconclusive result", () => {
    const html = renderWorkspace(task4(), [insufficientSession()], "overview");
    expect(html).toContain('href="/products/prod-1/testing/tasks/task-4#new-verification-attempt"');
    expect(html).not.toContain("Start Independent Verification");
    expect(html).not.toContain("Retry Independent Verification");
  });

  it("keeps the same panel on the History tab", () => {
    const html = renderWorkspace(task4(), [insufficientSession()], "history");
    expect(html).toContain("Verification Inconclusive");
    expect(html).toContain("Start New Verification Attempt");
  });

  it("does not offer a new attempt after a human approval", () => {
    const approved = {
      ...insufficientSession(),
      status: "PASSED",
      overallVerdict: "PASS",
      failureClass: "",
      approvals: [{ id: "x", stale: false, createdAt: new Date("2026-10-26T12:00:00Z"), commitSha: TASK_4_COMMIT, staleReason: "" }],
    } as unknown as ProveSession;
    const html = renderWorkspace(task4(), [approved], "overview");
    expect(html).not.toContain("Verification Inconclusive");
    expect(html).not.toContain("Start New Verification Attempt");
  });

  it("says that recording a request starts nothing, on the inconclusive review form", () => {
    const html = renderWorkspace(task4(), [insufficientSession()], "approval");
    expect(html).toContain("Record Request For More Testing");
    expect(html).toContain("This only records your request. No verification runs.");
    expect(html).not.toContain(">Request More Testing<");
  });

  it("describes a failed-test re-run as inside the current attempt", () => {
    const html = renderWorkspace(task4(), [failedSession()], "approval");
    expect(html).toContain("Re-run failed tests");
    expect(html).toContain("Runs the failed tests again inside this attempt.");
  });
});
