import { describe, expect, it } from "vitest";

import { planHeadline, sectionState } from "@/modules/plan/presentation";

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
