import { describe, expect, it } from "vitest";

import { discoveryResponseSchema } from "@/modules/discovery/schema";
import { discoveryFixture } from "@/modules/discovery/testing";

describe("discovery response schema", () => {
  it("accepts a structured discovery turn", () => {
    const parsed = discoveryResponseSchema.safeParse(discoveryFixture());
    expect(parsed.success).toBe(true);
  });

  it("rejects a stage change hidden in the response", () => {
    const parsed = discoveryResponseSchema.safeParse({
      ...discoveryFixture(),
      currentStage: "DEFINE",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects more than five questions", () => {
    const parsed = discoveryResponseSchema.safeParse(
      discoveryFixture({
        questions: ["One", "Two", "Three", "Four", "Five", "Six"],
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty assistant message", () => {
    const parsed = discoveryResponseSchema.safeParse(
      discoveryFixture({ assistantMessage: "  " }),
    );
    expect(parsed.success).toBe(false);
  });
});
