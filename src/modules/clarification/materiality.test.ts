import { describe, expect, it } from "vitest";

import {
  answerDisplay,
  answerMateriality,
  clarificationImpacts,
  earliestClarificationReview,
} from "@/modules/clarification/materiality";

describe("clarification answer materiality", () => {
  it("treats punctuation and spacing as non-material", () => {
    expect(answerMateriality("London UK", "London, UK")).toBe("NON_MATERIAL");
    expect(answerMateriality("London, UK", "london uk")).toBe("NON_MATERIAL");
  });

  it("treats a different place or scope as potentially material", () => {
    expect(answerMateriality("London", "Manchester")).toBe("POTENTIALLY_MATERIAL");
    expect(answerMateriality("Users within 10 miles", "Users anywhere in the UK")).toBe("POTENTIALLY_MATERIAL");
  });

  it("derives unanswered, answered, and updated from the saved history", () => {
    expect(answerDisplay({ answer: "", revisions: 0 })).toBe("UNANSWERED");
    expect(answerDisplay({ answer: "London", revisions: 1 })).toBe("ANSWERED");
    expect(answerDisplay({ answer: "Manchester", revisions: 2 })).toBe("ANSWER_UPDATED");
  });

  it("lists only artefacts that exist and could have used the answer", () => {
    const answeredAt = new Date("2026-10-09T00:00:00.000Z");
    const impacts = clarificationImpacts({
      kind: "REQUIREMENT",
      answeredAt,
      definition: { id: "def", label: "Product Definition", updatedAt: new Date("2026-10-10T00:00:00.000Z") },
      designs: [{ id: "des", label: "Design v1", updatedAt: new Date("2026-10-08T00:00:00.000Z") }],
      executionPlans: [{ id: "plan", label: "Execution Plan v2", updatedAt: new Date("2026-10-11T00:00:00.000Z") }],
    });
    expect(impacts.map((impact) => impact.label)).toEqual(["Product Definition", "Execution Plan v2"]);
  });

  it("does not invent a downstream artefact", () => {
    expect(clarificationImpacts({
      kind: "REQUIREMENT",
      answeredAt: new Date("2026-10-09T00:00:00.000Z"),
    })).toEqual([]);
  });

  it("chooses the earliest affected artefact for the next action", () => {
    expect(earliestClarificationReview({ DEFINITION: true, PLAN: true })?.key).toBe("review-definition");
    expect(earliestClarificationReview({ PLAN: true })?.label).toBe("Revise Execution Plan");
    expect(earliestClarificationReview({})).toBeNull();
  });
});
