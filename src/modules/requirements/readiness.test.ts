import { describe, expect, it } from "vitest";

import {
  assessRequirementsReadiness,
  assessStoryReadiness,
} from "@/modules/requirements/readiness";

const readyStory = {
  title: "As a policyholder I want to submit a claim online so that I can start without calling.",
  description: "The customer receives a reference.",
  persona: "policyholder",
  userNeed: "submit a claim online",
  userValue: "start without calling the contact centre",
  priorityAssigned: true,
  dependenciesIdentified: true,
  dependencyCount: 0,
  assumptionsNoted: true,
  criteria: [
    "GIVEN a customer has entered all mandatory claim information WHEN they submit the claim THEN the system creates the claim AND displays a unique claim reference.",
  ],
  highImpactOpenQuestions: 0,
  traced: true,
};

describe("definition of ready", () => {
  it("stays not ready when every field is filled with a vague criterion", () => {
    const result = assessStoryReadiness({
      ...readyStory,
      criteria: ["The system should work correctly for the customer."],
    });
    expect(result.ready).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/vague/i);
  });

  it("rejects a technical task written as a story", () => {
    const result = assessStoryReadiness({
      ...readyStory,
      persona: "developer",
      userNeed: "a database table",
      title: "As a developer I want a database table",
    });
    expect(result.ready).toBe(false);
  });

  it("is not ready while a high-impact question is open", () => {
    const result = assessStoryReadiness({ ...readyStory, highImpactOpenQuestions: 1 });
    expect(result.ready).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/high-impact question/i);
  });

  it("is ready only when the rules pass", () => {
    expect(assessStoryReadiness(readyStory).ready).toBe(true);
  });

  it("explains a low open-question area without a fake score", () => {
    const report = assessRequirementsReadiness({
      outcomes: [{ id: "o1", status: "CONFIRMED", successMeasure: "Fewer calls" }],
      capabilities: [{ outcomeId: "o1", status: "CONFIRMED" }],
      inScopeCount: 1,
      outOfScopeCount: 1,
      stories: [
        {
          userValue: true,
          criteriaCount: 1,
          testable: true,
          dependenciesIdentified: true,
        },
      ],
      openQuestionCount: 1,
      highImpactOpenQuestions: 1,
      assumptionCount: 1,
      highUnvalidatedAssumptions: 1,
      confirmedNfrs: 0,
      proposedNfrs: 1,
      sliceStatus: "PROPOSED",
      sliceStoryCount: 1,
    });
    const questions = report.areas.find((area) => area.key === "openQuestions");
    expect(questions?.level).toBe("LOW");
    expect(questions?.reason).toMatch(/high-impact/i);
    expect(report.summary).toMatch(/\d+ of 10 areas/);
    expect(report.sufficient).toBeLessThan(10);
  });
});
