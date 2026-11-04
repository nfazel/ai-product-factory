import { describe, expect, it } from "vitest";

import { draftState, planHeadline, sectionState } from "@/modules/plan/presentation";

const approved = { status: "APPROVED", approvedBy: "Local user", resolvedAt: new Date() };

describe("where a section stands", () => {
  it("is approved when the latest decision approved it, waiting when drafted, otherwise not started", () => {
    expect(sectionState({ exists: true, approval: approved })).toBe("APPROVED");
    expect(sectionState({ exists: true, approval: { ...approved, status: "PENDING" } })).toBe("WAITING");
    expect(sectionState({ exists: true, approval: null })).toBe("WAITING");
    expect(sectionState({ exists: false, approval: null })).toBe("NOT_STARTED");
  });

  it("says plainly how much of the plan is approved and what is next", () => {
    expect(planHeadline([{ title: "A", state: "APPROVED" }, { title: "B", state: "APPROVED" }])).toBe("The whole plan is approved. Building can start.");
    expect(planHeadline([{ title: "A", state: "APPROVED" }, { title: "B", state: "WAITING" }])).toBe('1 of 2 sections are approved. "B" is drafted and waiting for you.');
    expect(planHeadline([{ title: "A", state: "NOT_STARTED" }])).toBe('0 of 1 sections are approved. "A" has not been started.');
  });
});

describe("where drafting the features stands", () => {
  const base = { briefStatus: "APPROVED", briefReadyForReview: false, drafted: false, running: false, failure: "" };
  it("waits for the brief, offering its approval only once it is ready for review", () => {
    expect(draftState({ ...base, briefStatus: null })).toBe("NEEDS_BRIEF");
    expect(draftState({ ...base, briefStatus: "DRAFT" })).toBe("NEEDS_BRIEF");
    expect(draftState({ ...base, briefStatus: "READY_FOR_REVIEW", briefReadyForReview: true })).toBe("BRIEF_READY");
  });
  it("is ready, running, failed or drafted once the brief is approved, with drafted taking priority", () => {
    expect(draftState(base)).toBe("READY");
    expect(draftState({ ...base, running: true })).toBe("RUNNING");
    expect(draftState({ ...base, failure: "x" })).toBe("FAILED");
    expect(draftState({ ...base, drafted: true, running: true, failure: "x" })).toBe("DRAFTED");
    expect(draftState({ ...base, candidate: true })).toBe("CANDIDATE");
    expect(draftState({ ...base, candidate: true, drafted: true })).toBe("DRAFTED");
  });
});
