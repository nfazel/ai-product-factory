import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/server/actions/plan", () => ({ approveBriefAndDraftAction: async () => ({ status: "idle" }), draftFeaturesAction: async () => ({ status: "idle" }) }));

import { PlanPage } from "@/components/plan/plan-view";
import type { PlanView } from "@/modules/plan/view";

const section = (key: string, title: string, state: PlanView["sections"][number]["state"], approvedBy: string | null = null) => ({ key, title, state, approvedBy, detailsHref: `/products/p/${key}`, detailsLabel: `Open ${key}` });

const plan = (over: Partial<PlanView> = {}): PlanView => ({
  productId: "p",
  draft: { state: "DRAFTED", reason: "" },
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

  it("does not offer to approve anything, because approving the whole plan is not built yet", () => {
    const html = renderToStaticMarkup(createElement(PlanPage, { plan: plan() }));
    expect(html).not.toContain("<button");
    expect(html).toContain("next piece of work");
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
    expect(card("DRAFTED")).toContain("Nothing is confirmed yet");
    expect(card("CANDIDATE")).toContain("One more step makes them reviewable");
  });
});
});
