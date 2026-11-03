import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TaskJourneyCard } from "@/components/build/task-journey";
import type { Journey, JourneyStep, JourneyStepId, JourneyState } from "@/modules/build/task-journey";

const ORDER: JourneyStepId[] = ["approve-task", "plan", "approve-plan", "code", "review-code", "record", "verify", "approve-verification"];
const journey = (current: JourneyStepId | null, state: JourneyState, over: Partial<Journey> = {}): Journey => {
  const at = current ? ORDER.indexOf(current) : ORDER.length;
  const steps: JourneyStep[] = ORDER.map((id, index) => ({ id, label: id.replace("-", " "), state: index < at ? "done" : id === current ? state : "upcoming" }));
  return { steps, current: steps.find((step) => step.id === current) ?? null, headline: "Read the plan and approve it.", detail: "Check the files.", yourTurn: state !== "working", finished: current === null, ...over };
};
const render = (value: Journey, children?: string, blockers: string[] = []) => renderToStaticMarkup(createElement(TaskJourneyCard, { journey: value, blockers }, children ? createElement("button", null, children) : undefined));

describe("the next step card", () => {
  it("says what to do in one sentence and puts the button under it", () => {
    const html = render(journey("approve-plan", "current"), "Approve Execution Plan");
    expect(html).toContain("Your next step");
    expect(html).toContain("Read the plan and approve it.");
    expect(html.indexOf("Read the plan and approve it.")).toBeLessThan(html.indexOf("Approve Execution Plan"));
  });
  it("marks finished steps, the current step and later steps, in words for screen readers too", () => {
    const html = render(journey("review-code", "current"));
    expect(html.match(/✓/g)).toHaveLength(4);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("(your turn)");
    expect(html).toContain("(done)");
    expect(html).toContain("(later)");
  });
  it("shows no button while the system is working, and says nothing is needed", () => {
    const html = render(journey("code", "working", { headline: "The Coding Agent is writing the change.", detail: "Nothing is needed from you.", yourTurn: false }), "Start coding");
    expect(html).toContain("In progress");
    expect(html).toContain("Nothing is needed from you.");
    expect(html).not.toContain("Start coding");
  });
  it("shows blockers only when it is the person's turn, and marks attention", () => {
    const html = render(journey("plan", "attention", { headline: "This step needs attention: create the plan.", detail: "Coding Policy is not approved." }), "Start coding", ["Coding Policy is not approved."]);
    expect(html).toContain("Needs attention");
    expect(html).toContain("Coding Policy is not approved.");
  });
  it("says everything is done when the journey is finished", () => {
    const html = render(journey(null, "done", { headline: "Everything for this task is done.", detail: "It is built.", yourTurn: false }));
    expect(html).toContain("All done");
    expect(html.match(/✓/g)).toHaveLength(8);
  });
});

describe("step links", () => {
  it("links every step that is not done and leaves finished steps as plain text", () => {
    const journey = { steps: [
      { id: "approve-task", label: "Approve the task", state: "done" },
      { id: "plan", label: "Create the plan", state: "current" },
      { id: "code", label: "Write the code", state: "upcoming" },
    ], current: { id: "plan", label: "Create the plan", state: "current" }, headline: "h", detail: "", yourTurn: true, finished: false } as unknown as Journey;
    const html = renderToStaticMarkup(createElement(TaskJourneyCard, { journey, hrefs: { "approve-task": "#a", plan: "#next-step", code: "#task-work" } }));
    expect(html).toContain('href="#next-step"');
    expect(html).toContain('href="#task-work"');
    expect(html).not.toContain('href="#a"');
  });
});
