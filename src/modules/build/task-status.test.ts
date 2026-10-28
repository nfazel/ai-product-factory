import { describe, expect, it } from "vitest";

import { buildOverviewSummary, summariseBuildTask, type CodingTask } from "@/modules/build/task-status";

function task(overrides: Partial<CodingTask> & Pick<CodingTask, "id" | "title" | "status">): CodingTask {
  return {
    objective: "Ship the feature",
    riskLevel: null,
    executionMode: null,
    blockers: [],
    canStart: false,
    preview: null,
    workspace: null,
    trace: {
      outcome: "o",
      capability: "c",
      epic: "e",
      feature: "f",
      story: "s",
      acceptanceCriteria: [],
      architecture: "a",
      task: overrides.title,
    },
    ...overrides,
  } as CodingTask;
}

describe("build task status", () => {
  it("counts overview cards without duplicating tasks", () => {
    const summary = buildOverviewSummary([
      task({ id: "1", title: "A", status: "COMPLETED" }),
      task({ id: "2", title: "B", status: "IN_PROGRESS", workspace: { status: "ACTIVE" } as CodingTask["workspace"] }),
      task({ id: "3", title: "C", status: "BLOCKED", blockers: ["Dependency open"] }),
      task({ id: "4", title: "D", status: "PROPOSED" }),
    ]);
    expect(summary.total).toBe(4);
    expect(summary.completed).toBe(1);
    expect(summary.inProgress).toBe(1);
    expect(summary.attention).toBeGreaterThanOrEqual(1);
    expect(summary.rows.map((row) => row.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("offers start coding only when permitted", () => {
    const ready = summariseBuildTask(
      task({ id: "1", title: "Ready", status: "APPROVED", canStart: true }),
    );
    expect(ready.primaryAction?.kind).toBe("start-coding");
    expect(ready.nextAction).toBe("Start coding");

    const blocked = summariseBuildTask(
      task({ id: "2", title: "Blocked", status: "APPROVED", blockers: ["Repository missing"], canStart: false }),
    );
    expect(blocked.primaryAction).toBeNull();
    expect(blocked.whyNoAction).toContain("Repository missing");
  });

  it("keeps failed coding visible as attention without marking completed tasks", () => {
    const failed = summariseBuildTask(
      task({
        id: "1",
        title: "Failed",
        status: "IN_PROGRESS",
        workspace: {
          status: "FAILED",
          implementRuns: [{ outcome: "FAILED", status: "FAILED", error: "setup failed" }],
          plan: { status: "APPROVED" },
          evidence: [],
          approvals: [],
        } as unknown as CodingTask["workspace"],
      }),
    );
    expect(failed.codingStatus).toBe("Failed");
    expect(failed.attention).toBe(true);
    expect(failed.completed).toBe(false);
    expect(failed.primaryAction?.kind).toBe("recover-workspace");
  });

  it("prefers validate-existing when ready-for-review checks need refresh", () => {
    const row = summariseBuildTask(
      task({
        id: "1",
        title: "Card feed",
        status: "IN_PROGRESS",
        workspace: {
          status: "READY_FOR_REVIEW",
          plan: { status: "APPROVED", version: 4 },
          validateExistingOffer: true,
          codeReview: { approvable: false, reason: "Required checks are stale because source files changed after they ran." },
          evidence: [],
          approvals: [],
          implementRuns: [],
        } as unknown as CodingTask["workspace"],
      }),
    );
    expect(row.primaryAction?.kind).toBe("validate-existing");
  });

  it("surfaces plan approval when a revision is proposed on an implemented workspace", () => {
    const row = summariseBuildTask(
      task({
        id: "1",
        title: "Card feed",
        status: "IN_PROGRESS",
        workspace: {
          status: "READY_FOR_REVIEW",
          plan: { status: "PROPOSED", version: 3 },
          evidence: [],
          approvals: [],
          implementRuns: [],
        } as unknown as CodingTask["workspace"],
      }),
    );
    expect(row.primaryAction?.kind).toBe("open-plan");
    expect(row.nextAction).toBe("Review and approve execution plan");
    expect(row.codingStatus).toBe("Plan ready for approval");
    expect(row.approvalStatus).toBe("Plan awaiting approval");
    expect(row.attention).toBe(true);
  });

  it("does not offer start coding while a proposed plan still needs approval", () => {
    const row = summariseBuildTask(
      task({
        id: "1",
        title: "Card feed",
        status: "APPROVED",
        canStart: true,
        workspace: {
          status: "READY_FOR_REVIEW",
          plan: { status: "PROPOSED", version: 3 },
          evidence: [],
          approvals: [],
          implementRuns: [],
        } as unknown as CodingTask["workspace"],
      }),
    );
    expect(row.primaryAction?.kind).toBe("open-plan");
    expect(row.primaryAction?.kind).not.toBe("start-coding");
  });

  it("distinguishes verification ready after coding completes", () => {
    const row = summariseBuildTask(
      task({
        id: "1",
        title: "Done",
        status: "COMPLETED",
        workspace: {
          status: "COMPLETED",
          headCommit: "abc",
          baseCommit: "def",
          evidence: [],
          approvals: [{ stale: false }],
          plan: { status: "APPROVED" },
          implementRuns: [],
        } as unknown as CodingTask["workspace"],
      }),
    );
    expect(row.verificationStatus).toBe("Ready for Prove");
    expect(row.primaryAction?.kind).toBe("open-prove");
  });
});
