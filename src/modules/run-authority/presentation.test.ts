import { describe, expect, it } from "vitest";

import { authorityStatus, presentTasks, runHeadline, type TaskFacts } from "@/modules/run-authority/presentation";

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 4, 10, minutes));
const task = (over: Partial<TaskFacts> = {}): TaskFacts => ({ id: "t1", title: "Build login", status: "PROPOSED", verdict: null, handedBack: null, ...over });

describe("what the screen says about each task", () => {
  it("shows a task as done only when it is completed and verification passed", () => {
    const states = presentTasks({ running: false, currentTaskId: null, lastRunStartedAt: null, tasks: [
      task({ id: "a", status: "COMPLETED", verdict: "PASS" }),
      task({ id: "b", status: "COMPLETED", verdict: "PASS_WITH_CONCERNS" }),
      task({ id: "c", status: "COMPLETED", verdict: "FAIL" }),
      task({ id: "d", status: "COMPLETED", verdict: null }),
      task({ id: "e", status: "APPROVED", verdict: "PASS" }),
    ] }).map((item) => item.state);
    expect(states).toEqual(["DONE", "DONE", "WAITING", "WAITING", "WAITING"]);
  });

  it("shows the reason when the Builder handed a task back, until the next run begins", () => {
    const handed = { at: at(5), reason: "This task is MEDIUM risk, so it needs you." };
    const during = presentTasks({ running: false, currentTaskId: null, lastRunStartedAt: at(1), tasks: [task({ handedBack: handed })] })[0];
    expect(during).toMatchObject({ state: "NEEDS_YOU", reason: handed.reason });
    const after = presentTasks({ running: true, currentTaskId: null, lastRunStartedAt: at(9), tasks: [task({ handedBack: handed })] })[0];
    expect(after.state).toBe("WAITING");
  });

  it("marks only the task being worked on as working, and only while the run is going", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    expect(presentTasks({ running: true, currentTaskId: "b", lastRunStartedAt: null, tasks }).map((item) => item.state)).toEqual(["WAITING", "WORKING"]);
    expect(presentTasks({ running: false, currentTaskId: "b", lastRunStartedAt: null, tasks }).map((item) => item.state)).toEqual(["WAITING", "WAITING"]);
  });

  it("never shows a done task as needing the person, even with an old hand-back", () => {
    const [view] = presentTasks({ running: false, currentTaskId: null, lastRunStartedAt: null, tasks: [task({ status: "COMPLETED", verdict: "PASS", handedBack: { at: at(1), reason: "old" } })] });
    expect(view.state).toBe("DONE");
  });
});

describe("the authority's status and the headline", () => {
  it("is stopped when revoked, expired when out of time, otherwise active", () => {
    expect(authorityStatus({ revoked: true, expiresAt: at(60), now: at(1) })).toBe("STOPPED");
    expect(authorityStatus({ revoked: false, expiresAt: at(1), now: at(1) })).toBe("EXPIRED");
    expect(authorityStatus({ revoked: false, expiresAt: at(60), now: at(1) })).toBe("ACTIVE");
  });

  it("says plainly where the run is", () => {
    const views = presentTasks({ running: false, currentTaskId: null, lastRunStartedAt: null, tasks: [task({ id: "a", status: "COMPLETED", verdict: "PASS" }), task({ id: "b", title: "Chat" })] });
    expect(runHeadline({ status: "ACTIVE", running: true, tasks: views })).toBe("The Builder is building. 1 of 2 tasks are done.");
    expect(runHeadline({ status: "ACTIVE", running: false, tasks: views })).toBe("The Builder is ready to continue. 1 of 2 tasks are done.");
    expect(runHeadline({ status: "STOPPED", running: false, tasks: views })).toContain("was stopped");
    expect(runHeadline({ status: "EXPIRED", running: false, tasks: views })).toContain("run out");
    const waiting = presentTasks({ running: false, currentTaskId: null, lastRunStartedAt: null, tasks: [task({ handedBack: { at: at(2), reason: "r" } })] });
    expect(runHeadline({ status: "ACTIVE", running: false, tasks: waiting })).toContain('needs you on "Build login"');
    const all = presentTasks({ running: false, currentTaskId: null, lastRunStartedAt: null, tasks: [task({ status: "COMPLETED", verdict: "PASS" })] });
    expect(runHeadline({ status: "ACTIVE", running: false, tasks: all })).toContain("All 1 tasks are built and verified");
  });
});
