import { describe, expect, it } from "vitest";

import { nextStepView } from "@/modules/guidance/next-step-view";
import type { BlockerView, NextAction } from "@/modules/guidance/types";

const action = (over: Partial<NextAction> = {}): NextAction => ({ key: "approve-plan", label: "Approve the delivery plan", why: "Coding cannot start until the plan is approved.", role: "Product owner", href: "/products/p/build#plan", stage: "BUILD", decision: false, waitingSince: null, subjectId: null, execution: "navigate", ...over });
const blocker: BlockerView = { what: "Verification needs to be repeated", why: "The implementation changed after the independent check.", required: "Run the independent check again and approve the new result.", who: "Engineering decision required", next: "The previous check cannot be reused." };

describe("the next step bar", () => {
  it("states the action, why, who, and where to go", () => {
    expect(nextStepView(action(), null)).toMatchObject({ tone: "action", kicker: "Your next step", title: "Approve the delivery plan", body: "Coding cannot start until the plan is approved.", meta: "Product owner", href: "/products/p/build#plan", linkLabel: "Open Approve the delivery plan" });
  });
  it("says when a decision is waiting for a person", () => {
    expect(nextStepView(action({ decision: true }), null).kicker).toBe("A decision is waiting for you");
  });
  it("prefers the action over a blocker, because the action is what can be done", () => {
    expect(nextStepView(action(), blocker).tone).toBe("action");
  });
  it("explains a blocker in plain words, with no link, when there is no action", () => {
    const view = nextStepView(null, blocker);
    expect(view).toMatchObject({ tone: "blocked", kicker: "Blocked", title: "Verification needs to be repeated", href: null });
    expect(view.body).toBe("The implementation changed after the independent check. Run the independent check again and approve the new result.");
    expect(view.meta).toBe("Engineering decision required · The previous check cannot be reused.");
  });
  it("says nothing is waiting when there is neither", () => {
    expect(nextStepView(null, null)).toMatchObject({ tone: "quiet", title: "Nothing needs you right now.", href: null });
  });
});
