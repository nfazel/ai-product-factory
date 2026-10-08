import { describe, expect, it } from "vitest";

import { assessTechnicalReadiness, codingReadinessLabel } from "@/modules/architecture/readiness";

const complete = {
  summary: "A modular monolith carries the first claim slice from screen to database.",
  architectureStyle: "Modular monolith",
  rationale: "One journey does not justify several deployable services.",
  integrationApproach: "No external integration is required for the first slice.",
  technologyCount: 1,
  technologiesWithAlternatives: 1,
  dataEntities: 1,
  dataWithOwner: 1,
  integrations: 0,
  integrationsComplete: 0,
  securityAreas: 6,
  nfrCount: 1,
  coveredNfrs: 1,
  openQuestions: 0,
  highOpenQuestions: 0,
  tasks: 2,
  tasksWithObjective: 2,
  tasksWithSlice: 2,
  tasksWithValidation: 2,
  tasksWithDependenciesIdentified: 2,
};

describe("technical readiness", () => {
  it("counts only areas that are sufficiently understood and explains the rest", () => {
    const ready = assessTechnicalReadiness(complete);
    expect(ready.summary).toBe("10 of 10 areas sufficiently understood.");
    expect(ready.sufficient).toBe(10);

    const thin = assessTechnicalReadiness({
      ...complete,
      summary: "Short",
      architectureStyle: "",
      rationale: "",
      technologyCount: 0,
      technologiesWithAlternatives: 0,
      dataEntities: 0,
      dataWithOwner: 0,
      integrationApproach: "",
      securityAreas: 1,
      nfrCount: 2,
      coveredNfrs: 0,
      openQuestions: 1,
      highOpenQuestions: 1,
      tasks: 1,
      tasksWithObjective: 0,
      tasksWithSlice: 0,
      tasksWithValidation: 0,
      tasksWithDependenciesIdentified: 0,
    });
    expect(thin.sufficient).toBeLessThan(10);
    expect(thin.areas.filter((area) => area.level !== "HIGH").every((area) => area.explanation)).toBe(
      true,
    );
    expect(thin.summary).toBe(`${thin.sufficient} of 10 areas sufficiently understood.`);
  });

  it("keeps coding readiness false until both approvals exist", () => {
    expect(codingReadinessLabel(false)).toBe("NOT READY");
    expect(codingReadinessLabel(true)).toBe("CODING READY");
  });
});
