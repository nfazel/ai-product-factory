import { describe, expect, it } from "vitest";

import { codebaseCaptured, developmentContextInstruction } from "@/modules/architecture/development-context";

describe("development context", () => {
  it("tells a greenfield agent there is no legacy codebase", () => {
    const instruction = developmentContextInstruction("GREENFIELD");
    expect(instruction).toMatch(/new application/);
    expect(instruction).toMatch(/no legacy codebase/i);
    expect(developmentContextInstruction("EXISTING_SYSTEM")).toMatch(/existing application/);
    expect(developmentContextInstruction(null)).toMatch(/Do not assume an existing repository/);
  });

  it("treats an empty repository record as not captured", () => {
    expect(codebaseCaptured(null)).toBe(false);
    expect(
      codebaseCaptured({
        repositoryName: "",
        architectureSummary: "",
        source: "MANUAL",
        languages: [],
        frameworks: [],
      }),
    ).toBe(false);
    expect(
      codebaseCaptured({
        repositoryName: "find-a-friend",
        architectureSummary: "",
        source: "MANUAL",
        languages: [],
        frameworks: [],
      }),
    ).toBe(true);
  });
});
