import { describe, expect, it } from "vitest";

import { CODING_SYSTEM_PROMPT } from "@/modules/coding/prompt";

describe("the Coding Agent's standing rules for tests and scripts", () => {
  it("places tests inside allowed folders, adds new scripts instead of changing existing ones, and keeps required checks", () => {
    expect(CODING_SYSTEM_PROMPT).toMatch(/test files inside a folder the execution contract allows/);
    expect(CODING_SYSTEM_PROMPT).toMatch(/new package\.json script for new tests, and never change or remove an existing script/);
    expect(CODING_SYSTEM_PROMPT).toMatch(/keep the checks the task needs/);
  });
});
