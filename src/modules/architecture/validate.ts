import type { ArchitectureResponse } from "@/modules/architecture/schema";
import { DomainError } from "@/modules/shared/errors";

const LAYER_CAKE =
  /\b(all|entire)\b.{0,40}\b(database|backend|frontend|middleware|ui)\b|\b(database|backend|frontend|middleware)\s+layer\b|\bbuild (the )?(whole|entire) (system|platform)\b/i;

export type ArchitectureReferenceSets = {
  nfrIds: Set<string>;
  capabilityIds: Set<string>;
  workItemIds: Set<string>;
};

export function findDependencyCycle(
  tasks: { tempId: string; dependsOn: string[] }[],
): string[] | null {
  const graph = new Map(tasks.map((task) => [task.tempId, task.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function walk(id: string, stack: string[]): string[] | null {
    if (!graph.has(id)) return null;
    if (visiting.has(id)) return [...stack, id];
    if (visited.has(id)) return null;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) {
      const cycle = walk(next, [...stack, id]);
      if (cycle) return cycle;
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const task of tasks) {
    const cycle = walk(task.tempId, []);
    if (cycle) return cycle;
  }
  return null;
}

export function assertVerticalSlicePlan(
  tasks: { title: string; verticalSlice: string }[],
) {
  if (tasks.length === 0) {
    throw new DomainError("An implementation plan needs at least one task.");
  }
  const offenders = tasks.filter(
    (task) =>
      !task.verticalSlice.trim() ||
      LAYER_CAKE.test(task.title) ||
      LAYER_CAKE.test(task.verticalSlice),
  );
  if (offenders.length > 0) {
    throw new DomainError(
      "Implementation plans must be vertical slices. Do not plan all of the database, then all of the backend, then all of the frontend.",
    );
  }
}

export function assertArchitectureGraph(
  response: ArchitectureResponse,
  refs: ArchitectureReferenceSets,
) {
  const components = new Set(response.components.map((item) => item.tempId));
  const adrs = new Set(response.adrs.map((item) => item.tempId));
  if (components.size !== response.components.length) {
    throw new DomainError("Architecture component ids must be unique.");
  }

  for (const component of response.components) {
    for (const id of component.capabilityIds) {
      if (!refs.capabilityIds.has(id)) {
        throw new DomainError(`Component ${component.name} references a missing capability.`);
      }
    }
    for (const id of component.workItemIds) {
      if (!refs.workItemIds.has(id)) {
        throw new DomainError(`Component ${component.name} references a missing work item.`);
      }
    }
    for (const id of component.nfrIds) {
      if (!refs.nfrIds.has(id)) {
        throw new DomainError(`Component ${component.name} references a missing non-functional requirement.`);
      }
    }
  }

  for (const relationship of response.relationships) {
    if (
      !components.has(relationship.sourceTempId) ||
      !components.has(relationship.targetTempId)
    ) {
      throw new DomainError("Invalid component reference in architecture relationship.");
    }
    if (relationship.sourceTempId === relationship.targetTempId) {
      throw new DomainError("Invalid component reference in architecture relationship.");
    }
  }

  for (const coverage of response.nfrCoverage) {
    if (!refs.nfrIds.has(coverage.nfrId)) {
      throw new DomainError("NFR coverage references a missing non-functional requirement.");
    }
    if (coverage.componentTempId && !components.has(coverage.componentTempId)) {
      throw new DomainError("NFR coverage references a missing component.");
    }
    if (coverage.adrTempId && !adrs.has(coverage.adrTempId)) {
      throw new DomainError("NFR coverage references a missing architecture decision.");
    }
  }

  const tasks = response.implementationPlanProposal.tasks;
  const taskIds = new Set(tasks.map((task) => task.tempId));
  if (taskIds.size !== tasks.length) {
    throw new DomainError("Implementation task ids must be unique.");
  }
  for (const task of tasks) {
    if (task.workItemId && !refs.workItemIds.has(task.workItemId)) {
      throw new DomainError(`Task ${task.title} references a missing story or feature.`);
    }
    for (const componentId of task.componentTempIds) {
      if (!components.has(componentId)) {
        throw new DomainError(`Task ${task.title} references a missing component.`);
      }
    }
    for (const dependency of task.dependsOn) {
      if (!taskIds.has(dependency) || dependency === task.tempId) {
        throw new DomainError(`Task ${task.title} has an invalid dependency.`);
      }
    }
  }

  const cycle = findDependencyCycle(tasks);
  if (cycle) {
    throw new DomainError(
      `Implementation plan has a dependency cycle: ${cycle.join(" -> ")}.`,
    );
  }
  assertVerticalSlicePlan(tasks);
  assertExistingSystemCare(response);
}

function assertExistingSystemCare(response: ArchitectureResponse) {
  if (response.systemKind !== "EXISTING_SYSTEM") return;
  const text = [
    response.architectureSummary,
    response.rationale,
    ...response.adrs.map((item) => `${item.decision} ${item.title}`),
  ].join(" ");
  if (!/rewrite|full replacement|replace the existing/i.test(text)) return;
  const explained = response.adrs.some((item) => {
    const body = `${item.rationale} ${item.consequences} ${item.alternatives} ${item.context}`;
    return (
      /reason/i.test(body) &&
      /benefit/i.test(body) &&
      /cost/i.test(body) &&
      /risk/i.test(body) &&
      /migration/i.test(body) &&
      /alternative/i.test(body)
    );
  });
  if (!explained) {
    throw new DomainError(
      "A replacement recommendation for an existing system must state the reason, benefit, cost, risk, migration implications, and alternative.",
    );
  }
}
