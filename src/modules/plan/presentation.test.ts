import { describe, expect, it } from "vitest";

import { draftState, planHeadline, sectionState, technicalState, technicalSteps } from "@/modules/plan/presentation";

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

describe("where drafting the technical plan stands", () => {
  const base = { featuresDrafted: true, design: false, work: false, rules: false, running: false, failure: "" };
  it("waits for the features, then pauses for the person to confirm them", () => {
    expect(technicalState({ ...base, featuresDrafted: false })).toBe("NOT_YET");
    expect(technicalState(base)).toBe("CONFIRM");
  });
  it("is running, failed, partly done or done, with done taking priority", () => {
    expect(technicalState({ ...base, running: true })).toBe("RUNNING");
    expect(technicalState({ ...base, failure: "x" })).toBe("FAILED");
    expect(technicalState({ ...base, design: true })).toBe("PARTIAL");
    expect(technicalState({ ...base, design: true, running: true })).toBe("RUNNING");
    expect(technicalState({ ...base, design: true, work: true, rules: true, running: true, failure: "x" })).toBe("DRAFTED");
  });
  it("marks the step being drafted now only while running", () => {
    expect(technicalSteps({ design: true, work: false, rules: false, running: true }).map((step) => step.current)).toEqual([false, true, false]);
    expect(technicalSteps({ design: true, work: false, rules: false, running: false }).some((step) => step.current)).toBe(false);
  });
});
