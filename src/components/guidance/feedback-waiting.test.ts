import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => createElement("a", { href }, children) }));
vi.mock("@/lib/db", () => ({ db: {} }));
import { FeedbackWaitingList } from "./feedback-waiting";
import type { FeedbackWaitingItem } from "@/modules/rework/waiting";

const item = (over: Partial<FeedbackWaitingItem> = {}): FeedbackWaitingItem => ({ feedbackId: "f1", feature: "Card Discovery Feed", text: "Change the Pass button from a cross to a circle", step: "CONFIRM_PROPOSAL", sentence: "The AI has replied.", href: "/products/p/build#feature-reviews", ...over });
const render = (items: FeedbackWaitingItem[]) => renderToStaticMarkup(createElement(FeedbackWaitingList, { items }));

describe("feedback waiting for you", () => {
  it("shows nothing when nothing is waiting", () => {
    expect(render([])).toBe("");
  });
  it("shows what was said, which feature, what is waiting, and where to go", () => {
    const html = render([item()]);
    expect(html).toContain("Change the Pass button from a cross to a circle");
    expect(html).toContain("Card Discovery Feed");
    expect(html).toContain("The AI has replied.");
    expect(html).toContain('href="/products/p/build#feature-reviews"');
    expect(html).toContain("Open the feedback in Build");
  });
  it("links a task step straight to the task", () => {
    const html = render([item({ step: "AUTHORISE_TASK", href: "/products/p/build/tasks/t1" })]);
    expect(html).toContain('href="/products/p/build/tasks/t1"');
    expect(html).toContain("Open the task");
  });
  it("shows three and says how many more", () => {
    const html = render([1, 2, 3, 4, 5].map((n) => item({ feedbackId: `f${n}` })));
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html).toContain("And 2 more.");
  });
  it("escapes feedback text", () => {
    expect(render([item({ text: "<script>alert(1)</script>" })])).not.toContain("<script>");
  });
});
