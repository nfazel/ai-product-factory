import { describe, expect, it } from "vitest";

import { architectureResponseSchema } from "@/modules/architecture/schema";
import { architectureFixture } from "@/modules/architecture/testing";
import {
  assertArchitectureGraph,
  assertVerticalSlicePlan,
  findDependencyCycle,
} from "@/modules/architecture/validate";

const refs = {
  nfrId: "nfr-real",
  capabilityId: "capability-real",
  storyId: "story-real",
};

const known = {
  nfrIds: new Set([refs.nfrId]),
  capabilityIds: new Set([refs.capabilityId]),
  workItemIds: new Set([refs.storyId]),
};

describe("architecture structured output", () => {
  it("accepts a vertical-slice proposal and rejects a malformed one", () => {
    const fixture = architectureFixture(refs);
    expect(architectureResponseSchema.safeParse(fixture).success).toBe(true);
    expect(assertArchitectureGraph(fixture, known)).toBeUndefined();
    const malformed = { ...fixture, components: [] };
    expect(architectureResponseSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects a relationship that points at an unknown component", () => {
    const fixture = architectureFixture(refs);
    fixture.relationships[0].targetTempId = "component-9";
    expect(() => assertArchitectureGraph(fixture, known)).toThrow(/invalid component reference/i);
  });

  it("rejects a dependency cycle and a layer-cake plan", () => {
    const fixture = architectureFixture(refs);
    fixture.implementationPlanProposal.tasks[0].dependsOn = ["task-2"];
    expect(findDependencyCycle(fixture.implementationPlanProposal.tasks)?.length).toBeGreaterThan(0);
    expect(() => assertArchitectureGraph(fixture, known)).toThrow(/dependency cycle/i);

    const layered = architectureFixture(refs);
    layered.implementationPlanProposal.tasks = layered.implementationPlanProposal.tasks.map(
      (task, index) => ({
        ...task,
        title: ["Build all database", "Build all backend", "Build all frontend", "Test everything"][
          index
        ] ?? task.title,
        verticalSlice: "database layer",
        dependsOn: [],
      }),
    );
    expect(() => assertVerticalSlicePlan(layered.implementationPlanProposal.tasks)).toThrow(
      /vertical slices/i,
    );
  });
});
