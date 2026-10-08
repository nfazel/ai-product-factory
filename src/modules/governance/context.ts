import "server-only";

import { db } from "@/lib/db";
import { findCurrentBrief } from "@/modules/discovery/repository";
import type { GovernanceRefs } from "@/modules/governance/validate";

export async function loadGovernanceContext(productId: string) {
  const [product, brief, definition, outcomes, capabilities, slice, nfrs, assumptions, architecture, plan, questions] =
    await Promise.all([
      db.product.findUnique({ where: { id: productId } }),
      findCurrentBrief(productId),
      db.productDefinition.findUnique({ where: { productId } }),
      db.productOutcome.findMany({ where: { productId } }),
      db.productCapability.findMany({ where: { productId } }),
      db.productSlice.findFirst({ where: { productId, status: "APPROVED" }, orderBy: { createdAt: "asc" } }),
      db.nonFunctionalRequirement.findMany({ where: { productId } }),
      db.requirementAssumption.findMany({ where: { productId } }),
      db.solutionArchitecture.findFirst({
        where: { productId, status: "APPROVED" },
        orderBy: { version: "desc" },
        include: {
          components: true,
          decisions: true,
          technologies: true,
          dataEntities: true,
          integrations: true,
          findings: true,
        },
      }),
      db.implementationPlan.findFirst({
        where: { productId, status: "APPROVED" },
        orderBy: { version: "desc" },
        include: {
          tasks: {
            orderBy: { sequence: "asc" },
            include: { dependencies: true, components: true },
          },
        },
      }),
      db.architectureQuestion.findMany({ where: { productId, status: "OPEN" } }),
    ]);

  const codebase = await db.codebaseContext.findUnique({ where: { productId } });
  const workItems = await db.workItem.findMany({
    where: { productId },
    select: { id: true, type: true, title: true, description: true },
  });

  const refs: GovernanceRefs = {
    componentIds: new Set(architecture?.components.map((item) => item.id) ?? []),
    adrIds: new Set(architecture?.decisions.map((item) => item.id) ?? []),
    taskIds: new Set(plan?.tasks.map((item) => item.id) ?? []),
    nfrIds: new Set(nfrs.map((item) => item.id)),
    workItemIds: new Set(workItems.map((item) => item.id)),
    assumptionIds: new Set(assumptions.map((item) => item.id)),
  };

  return {
    productName: product?.name ?? "",
    refs,
    context: {
      product: product
        ? {
            name: product.name,
            vision: product.vision,
            problemStatement: product.problemStatement,
            targetUsers: product.targetUsers,
            stage: product.currentStage,
          }
        : null,
      brief: brief
        ? {
            status: brief.status,
            problemStatement: brief.problemStatement,
            productVision: brief.productVision,
            risks: brief.risks.map((item) => item.text),
            constraints: brief.constraints.map((item) => item.text),
            openQuestions: brief.openQuestions.map((item) => item.text),
          }
        : null,
      definitionStatus: definition?.status ?? null,
      outcomes: outcomes.map((item) => ({ id: item.id, title: item.title })),
      capabilities: capabilities.map((item) => ({ id: item.id, name: item.name })),
      slice: slice ? { id: slice.id, name: slice.name, description: slice.description } : null,
      nonFunctionalRequirements: nfrs.map((item) => ({
        id: item.id,
        category: item.category,
        title: item.title,
        description: item.description,
      })),
      assumptions: assumptions.map((item) => ({
        id: item.id,
        description: item.description,
        impact: item.impact,
        status: item.status,
      })),
      workItems,
      architecture: architecture
        ? {
            id: architecture.id,
            style: architecture.architectureStyle,
            summary: architecture.summary,
            rationale: architecture.rationale,
            securityApproach: architecture.securityApproach,
            deploymentApproach: architecture.deploymentApproach,
            observabilityApproach: architecture.observabilityApproach,
            components: architecture.components.map((item) => ({
              id: item.id,
              name: item.name,
              type: item.type,
              responsibilities: item.responsibilities,
            })),
            decisions: architecture.decisions.map((item) => ({
              id: item.id,
              title: item.title,
              decision: item.decision,
              status: item.status,
            })),
            technologies: architecture.technologies.map((item) => ({
              choice: item.choice,
              reason: item.reason,
            })),
            dataEntities: architecture.dataEntities.map((item) => ({
              name: item.name,
              classification: item.classification,
              retention: item.retention,
            })),
            integrations: architecture.integrations.map((item) => ({
              name: item.name,
              purpose: item.purpose,
              failureConsiderations: item.failureConsiderations,
            })),
            initialSecurityAssessment: architecture.findings.map((item) => ({
              area: item.area,
              classification: item.classification,
              title: item.title,
              note: "Initial Architecture Security Assessment from the Architecture Agent. This is not the governance review.",
            })),
          }
        : null,
      implementationPlan: plan
        ? {
            id: plan.id,
            summary: plan.summary,
            tasks: plan.tasks.map((task) => ({
              id: task.id,
              title: task.title,
              objective: task.objective,
              verticalSlice: task.verticalSlice,
              validation: task.validation,
              sequence: task.sequence,
              dependsOn: task.dependencies.map((item) => item.dependsOnId),
              componentIds: task.components.map((item) => item.componentId),
            })),
          }
        : null,
      openArchitectureQuestions: questions.map((item) => item.question),
      codebase: codebase
        ? {
            source: codebase.source,
            systemKind: codebase.systemKind,
            repositoryName: codebase.repositoryName,
            languages: codebase.languages,
            frameworks: codebase.frameworks,
            summary: codebase.architectureSummary,
            constraints: codebase.constraints,
          }
        : null,
    },
  };
}
