import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/products/p/build" }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => createElement("a", { href }, children) }));
vi.mock("@/server/actions/verification", () => ({}));
vi.mock("@/server/actions/definition", () => ({}));
vi.mock("@/server/actions/product", () => ({}));
import { NextStepBarContent } from "./next-step-bar";
import type { BlockerView, NextAction } from "@/modules/guidance/types";

const action: NextAction = { key: "approve-plan", label: "Approve the delivery plan", why: "Coding cannot start until it is approved.", role: "Product owner", href: "/products/p/build#plan", stage: "BUILD", decision: true, waitingSince: null, subjectId: null, execution: "navigate" };
const blocker: BlockerView = { what: "Verification needs to be repeated", why: "It changed.", required: "Run it again.", who: "Engineering", next: "Cannot be reused." };
const render = (a: NextAction | null, b: BlockerView | null) => renderToStaticMarkup(createElement(NextStepBarContent, { productId: "p", action: a, blocker: b }));

describe("the next step bar on a product page", () => {
  it("shows the action with a link to where it is done", () => {
    const html = render(action, null);
    expect(html).toContain("A decision is waiting for you");
    expect(html).toContain("Approve the delivery plan");
    expect(html).toContain('href="/products/p/build#plan"');
  });
  it("shows a blocker without a link", () => {
    const html = render(null, blocker);
    expect(html).toContain("Blocked");
    expect(html).toContain("Verification needs to be repeated");
    expect(html).not.toContain("<a ");
  });
  it("is labelled for screen readers", () => {
    expect(render(null, null)).toContain('aria-label="Next step"');
  });
});
