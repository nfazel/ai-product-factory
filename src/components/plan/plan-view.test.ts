import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlanPage } from "@/components/plan/plan-view";
import type { PlanView } from "@/modules/plan/view";

const section = (key: string, title: string, state: PlanView["sections"][number]["state"], approvedBy: string | null = null) => ({ key, title, state, approvedBy, detailsHref: `/products/p/${key}`, detailsLabel: `Open ${key}` });

const plan = (over: Partial<PlanView> = {}): PlanView => ({
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
});
