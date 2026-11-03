import { describe, expect, it } from "vitest";

import { feedbackProgress, FEEDBACK_NEEDS_PERSON, type FeedbackFacts } from "@/modules/rework/waiting-model";

const facts = (over: Partial<FeedbackFacts> = {}): FeedbackFacts => ({ head: "CONFIRMED", scope: "NONE", amendment: "NONE", tasks: [], ...over });
const task = (over: Partial<FeedbackFacts["tasks"][number]> = {}) => ({ id: "t1", title: "Update Pass button icon", status: "PROPOSED", authorised: false, ...over });

describe("where a piece of feedback is on its way to being built", () => {
  it.each([
    [{ head: "AI_ANALYSIS" }, "CONFIRM_PROPOSAL"],
    [{ head: null }, "CONFIRM_PROPOSAL"],
    [{}, "PREPARE_SCOPE"],
    [{ scope: "REJECTED" }, "PREPARE_SCOPE"],
    [{ scope: "DRAFT" }, "APPROVE_SCOPE"],
    [{ scope: "APPROVED" }, "DRAFT_TASKS"],
    [{ scope: "APPROVED", amendment: "REJECTED" }, "DRAFT_TASKS"],
    [{ scope: "APPROVED", amendment: "DRAFTED" }, "APPROVE_TASKS"],
    [{ scope: "APPROVED", amendment: "APPROVED" }, "CREATE_TASKS"],
  ] as const)("reads %j as %s", (over, step) => {
    expect(feedbackProgress(facts(over as Partial<FeedbackFacts>)).step).toBe(step);
  });
  it("asks for authority on a created task that has none, and names the task", () => {
    const progress = feedbackProgress(facts({ scope: "APPROVED", amendment: "ACTIVATED", tasks: [task()] }));
    expect(progress).toMatchObject({ step: "AUTHORISE_TASK", taskId: "t1" });
    expect(progress.sentence).toContain("Update Pass button icon");
  });
  it("points to Build while an authorised task is not finished, and is done when it is", () => {
    const authorised = { scope: "APPROVED", amendment: "ACTIVATED" } as const;
    expect(feedbackProgress(facts({ ...authorised, tasks: [task({ authorised: true, status: "APPROVED" })] }))).toMatchObject({ step: "BUILD_TASK", taskId: "t1" });
    expect(feedbackProgress(facts({ ...authorised, tasks: [task({ authorised: true, status: "COMPLETED" })] })).step).toBe("DONE");
  });
  it("closes a rejected or cancelled thread", () => {
    expect(feedbackProgress(facts({ head: "REJECTED" })).step).toBe("CLOSED");
    expect(feedbackProgress(facts({ head: "CANCELLED" })).step).toBe("CLOSED");
  });
  it("only lists steps that need a person", () => {
    expect(FEEDBACK_NEEDS_PERSON.has("DONE")).toBe(false);
    expect(FEEDBACK_NEEDS_PERSON.has("CLOSED")).toBe(false);
    expect(FEEDBACK_NEEDS_PERSON.has("AUTHORISE_TASK")).toBe(true);
  });
});
