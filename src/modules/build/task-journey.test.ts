import { describe, expect, it } from "vitest";

import { taskJourney } from "@/modules/build/task-journey";
import type { BuildTaskRow, CodingTask } from "@/modules/build/task-status";

type Workspace = { status: string; headCommit: string; baseCommit: string; plan: { status: string } | null; approvals: { stale: boolean }[] };
const task = (status: string, workspace: Partial<Workspace> | null = null) =>
  ({ id: "t", title: "A task", status, blockers: [], workspace: workspace ? { headCommit: "", baseCommit: "base", plan: null, approvals: [], ...workspace } : null }) as unknown as CodingTask;
const summary = (over: Partial<BuildTaskRow> = {}) =>
  ({ attention: false, blockers: [], nextAction: "Do the next thing", codingTone: "neutral", primaryAction: { kind: "x", label: "x" }, ...over }) as unknown as BuildTaskRow;
const ids = (journey: ReturnType<typeof taskJourney>, state: string) => journey.steps.filter((step) => step.state === state).map((step) => step.id);

describe("a task's journey", () => {
  it("starts with approving the task, and says it is your turn", () => {
    const journey = taskJourney(task("PROPOSED"), summary(), null);
    expect(journey.current?.id).toBe("approve-task");
    expect(journey.yourTurn).toBe(true);
    expect(journey.headline).toMatch(/Approve this task/);
    expect(ids(journey, "done")).toEqual([]);
    expect(ids(journey, "upcoming")).toHaveLength(7);
  });
  it("asks for the plan once the task is approved, and says nothing is needed while it is drafted", () => {
    expect(taskJourney(task("APPROVED"), summary(), null).current?.id).toBe("plan");
    const drafting = taskJourney(task("IN_PROGRESS", { status: "ACTIVE" }), summary(), null);
    expect(drafting.current).toMatchObject({ id: "plan", state: "working" });
    expect(drafting.yourTurn).toBe(false);
    expect(drafting.detail).toMatch(/Nothing is needed from you/);
  });
  it("asks for plan approval, then for coding, and shows coding as working while the agent runs", () => {
    expect(taskJourney(task("IN_PROGRESS", { status: "ACTIVE", plan: { status: "PROPOSED" } }), summary({ attention: true, primaryAction: { kind: "open-plan", label: "x" } }), null).current).toMatchObject({ id: "approve-plan" });
    expect(taskJourney(task("APPROVED", { status: "READY", plan: { status: "APPROVED" } }), summary(), null).current?.id).toBe("code");
    const running = taskJourney(task("IN_PROGRESS", { status: "ACTIVE", plan: { status: "APPROVED" } }), summary(), null);
    expect(running.current).toMatchObject({ id: "code", state: "working" });
    expect(running.yourTurn).toBe(false);
  });
  it("asks for the review, then for the snapshot once the code is approved", () => {
    const base = { status: "READY_FOR_REVIEW", plan: { status: "COMPLETED" } };
    expect(taskJourney(task("CODE_REVIEW", base), summary(), null).current?.id).toBe("review-code");
    const approved = taskJourney(task("CODE_REVIEW", { ...base, approvals: [{ stale: false }] }), summary(), null);
    expect(approved.current?.id).toBe("record");
    expect(approved.headline).toMatch(/Record Approved Snapshot/);
    expect(taskJourney(task("CODE_REVIEW", { ...base, approvals: [{ stale: true }] }), summary(), null).current?.id).toBe("review-code");
  });
  it("treats a committed task as having done every earlier step, and moves on to verification", () => {
    const journey = taskJourney(task("COMPLETED", { status: "COMPLETED", headCommit: "new", plan: { status: "COMPLETED" } }), summary(), null);
    expect(ids(journey, "done")).toEqual(["approve-task", "plan", "approve-plan", "code", "review-code", "record"]);
    expect(journey.current?.id).toBe("verify");
    expect(journey.yourTurn).toBe(true);
  });
  it("shows verification as running, then as waiting for approval, then as finished", () => {
    const committed = task("COMPLETED", { status: "COMPLETED", headCommit: "new", plan: { status: "COMPLETED" } });
    expect(taskJourney(committed, summary(), { status: "EXECUTING", overallVerdict: null }).current).toMatchObject({ id: "verify", state: "working" });
    const passed = taskJourney(committed, summary(), { status: "PASSED", overallVerdict: "PASS" });
    expect(passed.current?.id).toBe("approve-verification");
    const concerns = taskJourney(committed, summary(), { status: "PASSED", overallVerdict: "PASS_WITH_CONCERNS" });
    expect(concerns.detail).toMatch(/concerns/);
    const finished = taskJourney(committed, summary(), { status: "PASSED", overallVerdict: "PASS", approved: true });
    expect(finished.finished).toBe(true);
    expect(finished.current).toBeNull();
    expect(ids(finished, "done")).toHaveLength(8);
  });
  it("flags a failed verification or a blocked step as needing attention, with the reason", () => {
    const committed = task("COMPLETED", { status: "COMPLETED", headCommit: "new", plan: { status: "COMPLETED" } });
    const failed = taskJourney(committed, summary(), { status: "FAILED", overallVerdict: "FAIL" });
    expect(failed.current).toMatchObject({ id: "verify", state: "attention" });
    expect(failed.detail).toMatch(/did not pass/);
    const blocked = taskJourney(task("APPROVED"), summary({ attention: true, blockers: ["Coding Policy is not approved."], primaryAction: null }), null);
    expect(blocked.current).toMatchObject({ id: "plan", state: "attention" });
    expect(blocked.detail).toBe("Coding Policy is not approved.");
  });
});
