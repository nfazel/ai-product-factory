import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { included } from "@/modules/architecture/proposal";
import type { StoredArchitecture } from "@/modules/architecture/schema";
import { storedArchitectureSchema } from "@/modules/architecture/schema";
import { assertVerticalSlicePlan, findDependencyCycle } from "@/modules/architecture/validate";
import { DomainError } from "@/modules/shared/errors";

function parsePayload(value: unknown): StoredArchitecture {
  const parsed = storedArchitectureSchema.safeParse(value);
  if (!parsed.success) {
    throw new DomainError("The stored architecture proposal is not readable.");
  }
  return parsed.data;
}

export async function findOpenProposal(
  productId: string,
  kind: "ARCHITECTURE" | "IMPLEMENTATION_PLAN",
) {
  const row = await db.architectureProposal.findFirst({
    where: { productId, kind, status: { in: ["OPEN", "PARTIALLY_COMMITTED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  return { ...row, payload: parsePayload(row.payload) };
}

export async function findProposal(productId: string, proposalId: string) {
  const row = await db.architectureProposal.findFirst({
    where: { id: proposalId, productId },
  });
  if (!row) return null;
  return { ...row, payload: parsePayload(row.payload) };
}

export async function insertProposal(input: {
  productId: string;
  kind: "ARCHITECTURE" | "IMPLEMENTATION_PLAN";
  agentRunId?: string | null;
  summary: string;
  payload: StoredArchitecture;
}) {
  return db.$transaction(async (tx) => {
    await tx.architectureProposal.updateMany({
      where: {
        productId: input.productId,
        kind: input.kind,
        status: { in: ["OPEN", "PARTIALLY_COMMITTED"] },
      },
      data: { status: "SUPERSEDED" },
    });
    return tx.architectureProposal.create({
      data: {
        productId: input.productId,
        kind: input.kind,
        agentRunId: input.agentRunId ?? null,
        summary: input.summary,
        payload: input.payload as Prisma.InputJsonValue,
        status: "OPEN",
      },
    });
  });
}

export async function saveProposalPayload(
  proposalId: string,
  payload: StoredArchitecture,
  status?: "OPEN" | "PARTIALLY_COMMITTED" | "COMMITTED" | "REJECTED" | "SUPERSEDED",
) {
  return db.architectureProposal.update({
    where: { id: proposalId },
    data: {
      payload: payload as Prisma.InputJsonValue,
      summary: payload.assistantSummary,
      status,
    },
  });
}

export async function latestArchitecture(productId: string) {
  return db.solutionArchitecture.findFirst({
    where: { productId, status: { not: "SUPERSEDED" } },
    orderBy: { version: "desc" },
  });
}

export async function persistCommittedArchitecture(input: {
  productId: string;
  productSliceId: string | null;
  payload: StoredArchitecture;
}) {
  const components = input.payload.components.filter(included);
  const relationships = input.payload.relationships.filter(included);
  const technologies = input.payload.technologyDecisions.filter(included);
  const adrs = input.payload.adrs.filter(included);
  const dataDesign = input.payload.dataDesign.filter(included);
  const integrations = input.payload.integrations.filter(included);
  const findings = input.payload.securityAssessment.filter(included);
  const coverages = input.payload.nfrCoverage.filter(included);
  const questions = input.payload.architectureQuestions.filter(included);
  if (components.length === 0) {
    throw new DomainError("Accept at least one architecture component before committing.");
  }

  return db.$transaction(async (tx) => {
    const approved = await tx.solutionArchitecture.findFirst({
      where: { productId: input.productId, status: "APPROVED" },
    });
    if (approved) {
      throw new DomainError(
        "An approved solution architecture cannot be overwritten. The proposal stays available for review.",
      );
    }
    const existing = await tx.solutionArchitecture.findFirst({
      where: { productId: input.productId, status: { in: ["DRAFT", "READY_FOR_REVIEW"] } },
      orderBy: { version: "desc" },
    });
    const fields = {
      systemKind: input.payload.systemKind,
      architectureStyle: input.payload.architectureStyle,
      summary: input.payload.architectureSummary,
      rationale: input.payload.rationale,
      frontendApproach: input.payload.frontendApproach,
      backendApproach: input.payload.backendApproach,
      dataApproach: input.payload.dataApproach,
      integrationApproach: input.payload.integrationApproach,
      securityApproach: input.payload.securityApproach,
      deploymentApproach: input.payload.deploymentApproach,
      observabilityApproach: input.payload.observabilityApproach,
      productSliceId: input.productSliceId,
    };
    const architecture =
      existing ??
      (await tx.solutionArchitecture.create({
        data: {
          productId: input.productId,
          version:
            ((await tx.solutionArchitecture.aggregate({
              where: { productId: input.productId },
              _max: { version: true },
            }))._max.version ?? 0) + 1,
          status: "DRAFT",
          ...fields,
        },
      }));
    if (existing && !existing.humanLocked) {
      await tx.solutionArchitecture.update({ where: { id: existing.id }, data: fields });
    }

    await tx.architectureRelationship.deleteMany({
      where: { solutionArchitectureId: architecture.id },
    });
    await tx.nfrCoverage.deleteMany({ where: { solutionArchitectureId: architecture.id } });
    await tx.componentTrace.deleteMany({
      where: { component: { solutionArchitectureId: architecture.id, humanLocked: false } },
    });
    await tx.architectureComponent.deleteMany({
      where: { solutionArchitectureId: architecture.id, humanLocked: false },
    });
    await tx.technologyChoice.deleteMany({
      where: { solutionArchitectureId: architecture.id, humanLocked: false },
    });
    await tx.architectureDecisionRecord.deleteMany({
      where: { solutionArchitectureId: architecture.id, humanLocked: false, status: { not: "ACCEPTED" } },
    });
    await tx.dataEntity.deleteMany({ where: { solutionArchitectureId: architecture.id } });
    await tx.integrationDesign.deleteMany({ where: { solutionArchitectureId: architecture.id } });
    await tx.securityFinding.deleteMany({ where: { solutionArchitectureId: architecture.id } });
    await tx.architectureQuestion.deleteMany({
      where: { solutionArchitectureId: architecture.id, status: "OPEN" },
    });

    const componentIds = new Map<string, string>();
    for (const component of components) {
      const locked = await tx.architectureComponent.findFirst({
        where: {
          solutionArchitectureId: architecture.id,
          name: component.name,
          humanLocked: true,
        },
      });
      if (locked) {
        componentIds.set(component.tempId, locked.id);
        continue;
      }
      const created = await tx.architectureComponent.create({
        data: {
          solutionArchitectureId: architecture.id,
          name: component.name,
          type: component.type,
          description: component.description,
          responsibilities: component.responsibilities,
          technology: component.technology,
          rationale: component.rationale,
        },
      });
      componentIds.set(component.tempId, created.id);
      const traces = [
        ...component.capabilityIds.map((capabilityId) => ({ capabilityId })),
        ...component.workItemIds.map((workItemId) => ({ workItemId })),
        ...component.nfrIds.map((nfrId) => ({ nfrId })),
      ];
      if (traces.length > 0) {
        await tx.componentTrace.createMany({
          data: traces.map((trace) => ({ componentId: created.id, ...trace })),
        });
      }
    }

    for (const relationship of relationships) {
      const sourceComponentId = componentIds.get(relationship.sourceTempId);
      const targetComponentId = componentIds.get(relationship.targetTempId);
      if (!sourceComponentId || !targetComponentId || sourceComponentId === targetComponentId) {
        throw new DomainError("Invalid component reference in architecture relationship.");
      }
      await tx.architectureRelationship.create({
        data: {
          solutionArchitectureId: architecture.id,
          sourceComponentId,
          targetComponentId,
          relationshipType: relationship.relationshipType,
          description: relationship.description,
        },
      });
    }

    const adrIds = new Map<string, string>();
    for (const adr of adrs) {
      const locked = await tx.architectureDecisionRecord.findFirst({
        where: { solutionArchitectureId: architecture.id, title: adr.title, humanLocked: true },
      });
      if (locked) {
        adrIds.set(adr.tempId, locked.id);
        continue;
      }
      const created = await tx.architectureDecisionRecord.create({
        data: {
          productId: input.productId,
          solutionArchitectureId: architecture.id,
          title: adr.title,
          context: adr.context,
          decision: adr.decision,
          rationale: adr.rationale,
          alternatives: adr.alternatives,
          consequences: adr.consequences,
          status: "PROPOSED",
        },
      });
      adrIds.set(adr.tempId, created.id);
    }

    for (const choice of technologies) {
      const locked = await tx.technologyChoice.findFirst({
        where: { solutionArchitectureId: architecture.id, choice: choice.choice, humanLocked: true },
      });
      if (locked) continue;
      await tx.technologyChoice.create({
        data: {
          solutionArchitectureId: architecture.id,
          choice: choice.choice,
          reason: choice.reason,
          alternatives: choice.alternatives,
          tradeoffs: choice.tradeoffs,
          relevantConstraint: choice.relevantConstraint,
        },
      });
    }

    for (const entity of dataDesign) {
      await tx.dataEntity.create({
        data: {
          solutionArchitectureId: architecture.id,
          name: entity.name,
          description: entity.description,
          owner: entity.owner,
          classification: entity.classification,
          retention: entity.retention,
          relationships: entity.relationships,
          externalSource: entity.externalSource,
        },
      });
    }
    for (const integration of integrations) {
      await tx.integrationDesign.create({
        data: {
          solutionArchitectureId: architecture.id,
          name: integration.name,
          purpose: integration.purpose,
          direction: integration.direction,
          protocol: integration.protocol,
          authenticationAssumption: integration.authenticationAssumption,
          dataExchanged: integration.dataExchanged,
          failureConsiderations: integration.failureConsiderations,
        },
      });
    }
    for (const finding of findings) {
      await tx.securityFinding.create({
        data: {
          solutionArchitectureId: architecture.id,
          area: finding.area,
          classification: finding.classification,
          title: finding.title,
          description: finding.description,
        },
      });
    }
    for (const coverage of coverages) {
      await tx.nfrCoverage.create({
        data: {
          solutionArchitectureId: architecture.id,
          nfrId: coverage.nfrId,
          componentId: coverage.componentTempId
            ? (componentIds.get(coverage.componentTempId) ?? null)
            : null,
          adrId: coverage.adrTempId ? (adrIds.get(coverage.adrTempId) ?? null) : null,
          mechanism: coverage.mechanism,
        },
      });
    }
    for (const question of questions) {
      await tx.architectureQuestion.create({
        data: {
          productId: input.productId,
          solutionArchitectureId: architecture.id,
          question: question.question,
          reason: question.reason,
          impact: question.impact,
          status: "OPEN",
        },
      });
    }
    return architecture;
  });
}

export async function persistCommittedPlan(input: {
  productId: string;
  productSliceId: string | null;
  solutionArchitectureId: string;
  payload: StoredArchitecture;
}) {
  const tasks = input.payload.implementationPlanProposal.tasks.filter(included);
  if (tasks.length === 0) {
    throw new DomainError("Accept at least one implementation task before committing the plan.");
  }

  return db.$transaction(async (tx) => {
    const cycle = findDependencyCycle(tasks);
    if (cycle) {
      throw new DomainError(`Implementation plan has a dependency cycle: ${cycle.join(" -> ")}.`);
    }
    assertVerticalSlicePlan(tasks);
    const approvedPlan = await tx.implementationPlan.findFirst({
      where: { productId: input.productId, status: "APPROVED" },
    });
    if (approvedPlan) {
      throw new DomainError(
        "An approved implementation plan cannot be overwritten. The proposal stays available for review.",
      );
    }
    const existing = await tx.implementationPlan.findFirst({
      where: { productId: input.productId, status: { in: ["DRAFT", "READY_FOR_REVIEW"] } },
      orderBy: { version: "desc" },
    });
    if (existing) {
      await tx.implementationTask.deleteMany({ where: { implementationPlanId: existing.id } });
    }
    const version =
      existing?.version ??
      ((await tx.implementationPlan.aggregate({
        where: { productId: input.productId },
        _max: { version: true },
      }))._max.version ?? 0) + 1;
    const plan =
      existing && existing.humanLocked
        ? existing
        : existing
          ? await tx.implementationPlan.update({
              where: { id: existing.id },
              data: {
                summary: input.payload.implementationPlanProposal.summary,
                solutionArchitectureId: input.solutionArchitectureId,
                productSliceId: input.productSliceId,
              },
            })
          : await tx.implementationPlan.create({
              data: {
                productId: input.productId,
                productSliceId: input.productSliceId,
                solutionArchitectureId: input.solutionArchitectureId,
                version,
                status: "DRAFT",
                summary: input.payload.implementationPlanProposal.summary,
              },
            });

    const components = await tx.architectureComponent.findMany({
      where: { solutionArchitectureId: input.solutionArchitectureId },
    });
    const componentByTemp = new Map(
      input.payload.components.map((component) => [component.tempId, component.name]),
    );
    const componentByName = new Map(components.map((component) => [component.name, component.id]));
    const taskIds = new Map<string, string>();
    const keptLocked = await tx.implementationTask.findMany({
      where: { implementationPlanId: plan.id, humanLocked: true },
    });
    for (const task of tasks) {
      const locked = keptLocked.find((item) => item.title === task.title);
      if (locked) {
        taskIds.set(task.tempId, locked.id);
        continue;
      }
      const created = await tx.implementationTask.create({
        data: {
          implementationPlanId: plan.id,
          workItemId: task.workItemId || null,
          title: task.title,
          description: task.description,
          objective: task.objective,
          verticalSlice: task.verticalSlice,
          guidance: task.guidance,
          validation: task.validation,
          risks: task.risks,
          filesLikely: task.filesLikely,
          sequence: task.sequence,
          parallelisable: task.parallelisable,
          dependenciesIdentified: true,
          status: "PROPOSED",
          complexity: task.complexity,
        },
      });
      taskIds.set(task.tempId, created.id);
      const links = task.componentTempIds
        .map((tempId) => componentByName.get(componentByTemp.get(tempId) ?? ""))
        .filter((id): id is string => Boolean(id));
      if (links.length > 0) {
        await tx.implementationTaskComponent.createMany({
          data: links.map((componentId) => ({ taskId: created.id, componentId })),
        });
      }
    }
    for (const task of tasks) {
      const taskId = taskIds.get(task.tempId);
      if (!taskId) continue;
      for (const dependency of task.dependsOn) {
        const dependsOnId = taskIds.get(dependency);
        if (!dependsOnId) {
          throw new DomainError(`Task ${task.title} has an invalid dependency.`);
        }
        await tx.implementationTaskDependency.create({
          data: { taskId, dependsOnId },
        });
      }
    }
    const persistedCycle = findDependencyCycle(
      tasks.map((task) => ({ tempId: task.tempId, dependsOn: task.dependsOn })),
    );
    if (persistedCycle) {
      throw new DomainError(
        `Implementation plan has a dependency cycle: ${persistedCycle.join(" -> ")}.`,
      );
    }
    return plan;
  });
}

export async function architectureGraph(productId: string) {
  return db.solutionArchitecture.findFirst({
    where: { productId, status: { not: "SUPERSEDED" } },
    orderBy: [{ status: "asc" }, { version: "desc" }],
    include: {
      components: { include: { traces: { include: { capability: true, workItem: true, nfr: true, adr: true } } } },
      relationships: { include: { sourceComponent: true, targetComponent: true } },
      decisions: true,
      technologies: true,
      dataEntities: true,
      integrations: true,
      findings: true,
      questions: true,
      nfrCoverages: { include: { nfr: true, component: true, adr: true } },
    },
  });
}

export async function planGraph(productId: string) {
  return db.implementationPlan.findFirst({
    where: { productId, status: { not: "SUPERSEDED" } },
    orderBy: { version: "desc" },
    include: {
      tasks: {
        orderBy: { sequence: "asc" },
        include: {
          workItem: { include: { acceptanceCriteria: true, parent: true } },
          components: { include: { component: true } },
          dependencies: { include: { dependsOn: true } },
          dependents: { include: { task: true } },
        },
      },
    },
  });
}
