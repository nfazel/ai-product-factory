import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/server/actions/plan", () => ({ approveBriefAndDraftAction: async () => ({ status: "idle" }), draftFeaturesAction: async () => ({ status: "idle" }), approvePlanAction: async () => ({ status: "idle" }), approvePlanAndStartAction: async () => ({ status: "idle" }), confirmFeaturesAction: async () => ({ status: "idle" }) }));

import { PlanPage } from "@/components/plan/plan-view";
import type { PlanView } from "@/modules/plan/view";

const section = (key: string, title: string, state: PlanView["sections"][number]["state"], approvedBy: string | null = null) => ({ key, title, state, approvedBy, detailsHref: `/products/p/${key}`, detailsLabel: `Open ${key}` });

const plan = (over: Partial<PlanView> = {}): PlanView => ({
  productId: "p",
  planApproval: { offered: false, blockers: [] },
  draft: { state: "DRAFTED", reason: "" },
  technical: { state: "DRAFTED", reason: "", steps: [{ label: "The design", done: true, current: false }, { label: "The work", done: true, current: false }, { label: "The rules", done: true, current: false }] },
  sections: [section("brief", "What this is", "APPROVED", "Local user"), section("features", "What it will do", "WAITING"), section("architecture", "How it will be built", "NOT_STARTED"), section("work", "The work", "NOT_STARTED"), section("rules", "The rules", "NOT_STARTED")],
  brief: { problem: "Friends cannot settle bets.", vision: "A betting app for friends.", value: "Fun without money.", users: "Friend groups" },
  outcomes: [{ title: "Friends place bets", measure: "20 bets a week" }],
  features: [{ id: "f1", title: "Registration", stories: [{ id: "s1", title: "As a user I can register", criteria: ["A valid email creates an account"] }] }],
  architecture: null,
  tasks: [{ id: "t1", title: "Set up the project", risk: "LOW" }],
  rules: { allowed: ["src/**"], restricted: ["prisma/**"], checks: ["npm run build"], maxFiles: 8 },
  openPoints: [{ kind: "Question", text: "Which payment provider?", why: "Affects the design." }],
  ...over,
});

describe("the Plan page", () => {
  it("shows every section with its state, who approved it, and a link to the page where it is approved", () => {
    const html = renderToStaticMarkup(createElement(PlanPage, { plan: plan() }));
    for (const text of ["Your plan", "What this is", "What it will do", "How it will be built", "The work", "The rules", "Open points"]) expect(html).toContain(text);
    expect(html).toContain("Approved");
    expect(html).toContain("Approved by Local user");
    expect(html).toContain("Drafted, not approved");
    expect(html).toContain('href="/products/p/features"');
    expect(html).toContain("1 of 5 sections are approved");
  });

  it("shows the content of each part in plain words", () => {
    const html = renderToStaticMarkup(createElement(PlanPage, { plan: plan() }));
    for (const text of ["Friends cannot settle bets.", "measured by 20 bets a week", "A valid email creates an account", "Set up the project", "low risk", "src/**", "prisma/**", "npm run build", "Which payment provider?"]) expect(html).toContain(text);
  });

  it("says so, instead of showing nothing, when a part does not exist yet", () => {
    const empty = plan({ brief: null, outcomes: [], features: [], tasks: [], rules: null, openPoints: [] });
    const html = renderToStaticMarkup(createElement(PlanPage, { plan: empty }));
    for (const text of ["No brief yet", "No features yet", "No design yet", "No tasks yet", "No coding rules yet", "Nothing is open"]) expect(html).toContain(text);
  });

  it("does not offer to approve anything when nothing is offered, because approving the whole plan is not built yet", () => {
    const html = renderToStaticMarkup(createElement(PlanPage, { plan: plan() }));
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Approve plan");
  });

describe("the card that says what to do about drafting the features", () => {
  const card = (state: PlanView["draft"]["state"], reason = "") => renderToStaticMarkup(createElement(PlanPage, { plan: plan({ draft: { state, reason } }) }));

  it("sends a person with no brief to the interview", () => {
    const html = card("NEEDS_BRIEF");
    expect(html).toContain("Start by describing the product");
    expect(html).toContain('href="/products/p/discovery"');
    expect(html).not.toContain("<button");
  });

  it("offers the first decision when the brief is ready, saying what approving does", () => {
    const html = card("BRIEF_READY");
    expect(html).toContain("Approve the brief and draft the features");
    expect(html).toContain("first of your two decisions");
  });

  it("offers to draft the features once the brief is approved, and to try again with the reason after a failure", () => {
    expect(card("READY")).toContain("Draft the features");
    const failed = card("FAILED", "The model is temporarily unavailable. It was tried 3 times.");
    expect(failed).toContain("Drafting the features stopped");
    expect(failed).toContain("It was tried 3 times.");
    expect(failed).toContain("Try again");
  });

  it("shows progress while drafting, and says plainly that nothing is confirmed once it is done", () => {
    const running = card("RUNNING");
    expect(running).toContain("Drafting the features");
    expect(running).not.toContain("<button");
    expect(card("CANDIDATE")).toContain("One more step makes them reviewable");
  });
});

  const technical = (state: PlanView["technical"]["state"], over: Partial<PlanView["technical"]> = {}) =>
    renderToStaticMarkup(createElement(PlanPage, { plan: plan({ technical: { ...plan().technical, state, ...over } }) }));

  it("pauses once after the features to ask whether they are right, and says it is not an approval", () => {
    const html = technical("CONFIRM");
    expect(html).toContain("Are these the right features?");
    expect(html).toContain("These look right, draft the rest");
    expect(html).toContain("not an approval");
  });

  it("shows which technical part is being drafted, and offers to carry on or try again", () => {
    const running = technical("RUNNING", { steps: [{ label: "The design", done: true, current: false }, { label: "The work", done: false, current: true }, { label: "The rules", done: false, current: false }] });
    expect(running).toContain("Done: The design");
    expect(running).toContain("Drafting now: The work");
    expect(running).toContain("Waiting: The rules");
    expect(running).not.toContain("<button");
    expect(technical("PARTIAL")).toContain("Carry on");
    const failed = technical("FAILED", { reason: "The model is unavailable." });
    expect(failed).toContain("The model is unavailable.");
    expect(failed).toContain("Try again");
    expect(technical("DRAFTED")).toContain("says whether it is approved");
  });

  it("asks for the development context, with a link, before the design is drafted", () => {
    const html = technical("NEEDS_CONTEXT", { reason: "Describe that codebase so the design starts from it." });
    expect(html).toContain("One thing before the design");
    expect(html).toContain("Describe that codebase");
    expect(html).toContain('href="/products/p/build#context"');
    expect(html).not.toContain("<button");
  });

  const offered = (blockers: PlanView["planApproval"]["blockers"] = []) =>
    renderToStaticMarkup(createElement(PlanPage, { plan: plan({ planApproval: { offered: true, blockers } }) }));

  it("offers the two approval buttons once everything is drafted, and says what approving records", () => {
    const html = offered();
    expect(html).toContain("Approve plan");
    expect(html).toContain("Approve and start building");
    expect(html).toContain("The AI approves nothing");
  });

  it("names the section that blocks the approval, links to it, and offers no button", () => {
    const html = offered([{ section: "rules", reason: "A critical finding in the review is still open." }]);
    expect(html).toContain("It cannot be approved yet");
    expect(html).toContain('href="#rules"');
    expect(html).toContain("A critical finding in the review is still open.");
    expect(html).not.toContain("Approve and start building");
  });
});
