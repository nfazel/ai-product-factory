import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CollapsedGroup, nextStepHash } from "@/components/build/collapsed-group";

const render = (open?: boolean) => renderToStaticMarkup(createElement(CollapsedGroup, { id: "delivery-plan", title: "Delivery plan", summary: "Slices", open }, createElement("p", null, "Inside")));

describe("a collapsed group", () => {
  it("is closed by default, shows its title and summary, and still contains its content", () => {
    const html = render();
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toContain("Delivery plan");
    expect(html).toContain("Slices");
    expect(html).toContain("Inside");
    expect(html).toContain('id="delivery-plan"');
  });
  it("is open when told the next step points inside it", () => {
    expect(render(true)).toMatch(/<details[^>]* open/);
  });
  it("reads the group a next step points to from its destination", () => {
    expect(nextStepHash("/products/p/build#plan")).toBe("plan");
    expect(nextStepHash("/products/p/build#execution-plan")).toBe("execution-plan");
    expect(nextStepHash("/products/p/build")).toBe("");
    expect(nextStepHash(null)).toBe("");
    expect(nextStepHash(undefined)).toBe("");
  });
});
