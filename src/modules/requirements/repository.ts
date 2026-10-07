import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { StoredProposal } from "@/modules/requirements/schema";
import { storedProposalSchema } from "@/modules/requirements/schema";
import { DomainError } from "@/modules/shared/errors";

function parsePayload(value: unknown): StoredProposal {
  const parsed = storedProposalSchema.safeParse(value);
  if (!parsed.success) {
    throw new DomainError("The stored definition proposal is not readable.");
  }
  return parsed.data;
}

export async function findDefinition(productId: string) {
  return db.productDefinition.findUnique({ where: { productId } });
}

export async function ensureDefinition(productId: string) {
  return db.productDefinition.upsert({
    where: { productId },
    update: {},
    create: { productId, status: "NOT_STARTED" },
  });
}

export async function findOpenProposal(productId: string) {
  const row = await db.definitionProposal.findFirst({
    where: { productId, status: { in: ["OPEN", "PARTIALLY_COMMITTED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  return { ...row, payload: parsePayload(row.payload) };
}

export async function findProposal(productId: string, proposalId: string) {
  const row = await db.definitionProposal.findFirst({
    where: { id: proposalId, productId },
  });
  if (!row) return null;
  return { ...row, payload: parsePayload(row.payload) };
}

export async function listRecentRequirementRuns(productId: string) {
  return db.agentRun.findMany({
    where: { productId, agentType: "REQUIREMENTS" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export async function insertProposal(input: {
  productId: string;
  agentRunId?: string | null;
  summary: string;
  payload: StoredProposal;
  seededDemo?: boolean;
}) {
  return db.$transaction(async (tx) => {
    await tx.definitionProposal.updateMany({
      where: { productId: input.productId, status: { in: ["OPEN", "PARTIALLY_COMMITTED"] } },
      data: { status: "SUPERSEDED" },
    });
    const row = await tx.definitionProposal.create({
      data: {
        productId: input.productId,
        agentRunId: input.agentRunId ?? null,
        summary: input.summary,
        payload: input.payload,
        seededDemo: input.seededDemo ?? false,
        status: "OPEN",
      },
    });
    await tx.productDefinition.upsert({
      where: { productId: input.productId },
      update: { status: "IN_PROGRESS" },
      create: { productId: input.productId, status: "IN_PROGRESS" },
    });
    return row;
  });
}

export async function saveProposalPayload(
  proposalId: string,
  payload: StoredProposal,
  status?: "OPEN" | "PARTIALLY_COMMITTED" | "COMMITTED" | "REJECTED" | "SUPERSEDED",
) {
  return db.definitionProposal.update({
    where: { id: proposalId },
    data: {
      payload,
      summary: payload.assistantSummary,
      status,
    },
  });
}

export async function saveReviewSummary(productId: string, summary: string) {
  return db.productDefinition.upsert({
    where: { productId },
    update: { reviewSummary: summary },
    create: { productId, reviewSummary: summary, status: "IN_PROGRESS" },
  });
}

function rememberCommitted(ids: Map<string, string>, items: { tempId: string; committedId: string | null }[]) {
  for (const item of items) {
    if (item.committedId) ids.set(item.tempId, item.committedId);
  }
}

async function protectedTarget(tx: Prisma.TransactionClient, replacesId: string | null) {
  if (!replacesId) return false;
  const [outcome, capability, slice, nfr, work] = await Promise.all([
    tx.productOutcome.findUnique({ where: { id: replacesId } }),
    tx.productCapability.findUnique({ where: { id: replacesId } }),
    tx.productSlice.findUnique({ where: { id: replacesId } }),
    tx.nonFunctionalRequirement.findUnique({ where: { id: replacesId } }),
    tx.workItem.findUnique({ where: { id: replacesId } }),
  ]);
  if (outcome && (outcome.humanLocked || outcome.status === "CONFIRMED" || outcome.status === "ACHIEVED")) {
    return outcome.title;
  }
  if (capability && (capability.humanLocked || capability.status === "CONFIRMED")) {
    return capability.name;
  }
  if (slice && (slice.humanLocked || slice.status === "APPROVED" || slice.status === "COMPLETED")) {
    return slice.name;
  }
  if (nfr && (nfr.humanLocked || nfr.status === "CONFIRMED")) return nfr.title;
  if (
    work &&
    (work.humanLocked || work.provenance === "HUMAN_CREATED" || work.provenance === "AI_ACCEPTED")
  ) {
    return work.title;
  }
  return false;
}

export async function commitAcceptedProposal(input: {
  productId: string;
  proposalId: string;
  payload: StoredProposal;
  sourceBriefId: string | null;
}) {
  return db.$transaction(async (tx) => {
    const payload: StoredProposal = structuredClone(input.payload);
    const skipped: string[] = [];
    const ids = new Map<string, string>();
    rememberCommitted(ids, payload.outcomes);
    rememberCommitted(ids, payload.capabilities);
    rememberCommitted(ids, payload.epics);
    rememberCommitted(ids, payload.features);
    rememberCommitted(ids, payload.stories);
    if (payload.firstSlice) rememberCommitted(ids, [payload.firstSlice]);

    const take = async <T extends { tempId: string; reviewStatus: string; committedId: string | null; replacesId: string | null }>(
      item: T,
      label: string,
    ) => {
      if (item.reviewStatus !== "ACCEPTED" || item.committedId) return false;
      const blocked = await protectedTarget(tx, item.replacesId);
      if (blocked) {
        skipped.push(`${label} "${blocked}" was left unchanged because a person has already confirmed it.`);
        item.committedId = item.replacesId;
        return false;
      }
      return true;
    };

    for (const item of payload.outcomes) {
      if (!(await take(item, "Outcome"))) continue;
      const row = await tx.productOutcome.create({
        data: {
          productId: input.productId,
          title: item.title,
          description: item.description,
          successMeasure: item.successMeasure,
          targetValue: item.targetValue,
          status: "PROPOSED",
          sourceBriefId: input.sourceBriefId,
          origin: "AI_PROPOSAL",
        },
      });
      item.committedId = row.id;
      ids.set(item.tempId, row.id);
    }

    for (const item of payload.capabilities) {
      if (!(await take(item, "Capability"))) continue;
      const outcomeId = ids.get(item.outcomeTempId);
      if (!outcomeId) {
        throw new DomainError(
          `Cannot commit ${item.tempId} because ${item.outcomeTempId} was not accepted. Nothing was committed.`,
        );
      }
      const row = await tx.productCapability.create({
        data: {
          productId: input.productId,
          outcomeId,
          name: item.name,
          description: item.description,
          priority: item.priority,
          status: "PROPOSED",
          origin: "AI_PROPOSAL",
        },
      });
      item.committedId = row.id;
      ids.set(item.tempId, row.id);
    }

    let sliceId: string | null = null;
    if (payload.firstSlice && (await take(payload.firstSlice, "First slice"))) {
      const row = await tx.productSlice.create({
        data: {
          productId: input.productId,
          name: payload.firstSlice.name,
          description: payload.firstSlice.description,
          rationale: payload.firstSlice.rationale,
          status: "PROPOSED",
          origin: "AI_PROPOSAL",
        },
      });
      payload.firstSlice.committedId = row.id;
      sliceId = row.id;
      ids.set(payload.firstSlice.tempId, row.id);
    } else if (payload.firstSlice?.committedId) {
      sliceId = payload.firstSlice.committedId;
    }

    for (const item of payload.epics) {
      if (!(await take(item, "Epic"))) continue;
      const capabilityId = ids.get(item.capabilityTempId);
      if (!capabilityId) {
        throw new DomainError(
          `Cannot commit ${item.tempId} because ${item.capabilityTempId} was not accepted. Nothing was committed.`,
        );
      }
      const row = await tx.workItem.create({
        data: {
          productId: input.productId,
          title: item.title,
          description: item.description,
          type: "EPIC",
          status: "DRAFT",
          stage: "DEFINE",
          priority: item.priority,
          capabilityId,
          provenance: "AI_ACCEPTED",
          priorityAssigned: true,
          dependenciesIdentified: true,
          assumptionsNoted: true,
        },
      });
      item.committedId = row.id;
      ids.set(item.tempId, row.id);
    }

    for (const item of payload.features) {
      if (!(await take(item, "Feature"))) continue;
      const parentId = ids.get(item.epicTempId);
      if (!parentId) {
        throw new DomainError(
          `Cannot commit ${item.tempId} because ${item.epicTempId} was not accepted. Nothing was committed.`,
        );
      }
      const epic = payload.epics.find((candidate) => candidate.tempId === item.epicTempId);
      const capabilityId = epic ? ids.get(epic.capabilityTempId) ?? null : null;
      const row = await tx.workItem.create({
        data: {
          productId: input.productId,
          parentId,
          title: item.title,
          description: item.description,
          type: "FEATURE",
          status: "DRAFT",
          stage: "DEFINE",
          priority: item.priority,
          capabilityId,
          sliceId: item.inFirstSlice ? sliceId : null,
          provenance: "AI_ACCEPTED",
          priorityAssigned: true,
          dependenciesIdentified: true,
          assumptionsNoted: true,
        },
      });
      item.committedId = row.id;
      ids.set(item.tempId, row.id);
    }

    for (const item of payload.stories) {
      if (!(await take(item, "Story"))) continue;
      const parentId = ids.get(item.featureTempId);
      if (!parentId) {
        throw new DomainError(
          `Cannot commit ${item.tempId} because ${item.featureTempId} was not accepted. Nothing was committed.`,
        );
      }
      const feature = payload.features.find((candidate) => candidate.tempId === item.featureTempId);
      const parent = feature
        ? await tx.workItem.findUnique({ where: { id: parentId } })
        : null;
      const row = await tx.workItem.create({
        data: {
          productId: input.productId,
          parentId,
          title: item.title,
          description: item.description,
          type: "STORY",
          status: "DRAFT",
          stage: "DEFINE",
          priority: item.priority,
          capabilityId: parent?.capabilityId ?? null,
          sliceId: item.inFirstSlice ? sliceId : null,
          provenance: "AI_ACCEPTED",
          persona: item.persona,
          userNeed: item.need,
          userValue: item.value,
          priorityAssigned: true,
          dependenciesIdentified: true,
          assumptionsNoted: true,
        },
      });
      item.committedId = row.id;
      ids.set(item.tempId, row.id);
    }

    for (const item of payload.acceptanceCriteria) {
      if (!(await take(item, "Acceptance criterion"))) continue;
      const workItemId = ids.get(item.storyTempId);
      if (!workItemId) {
        throw new DomainError(
          `Cannot commit ${item.tempId} because ${item.storyTempId} was not accepted. Nothing was committed.`,
        );
      }
      const row = await tx.acceptanceCriterion.create({
        data: { workItemId, description: item.description, status: "PENDING" },
      });
      item.committedId = row.id;
    }

    for (const item of payload.dependencies) {
      if (item.reviewStatus !== "ACCEPTED" || item.committedId) continue;
      const workItemId = ids.get(item.fromTempId);
      const dependsOnId = ids.get(item.toTempId);
      if (!workItemId || !dependsOnId || workItemId === dependsOnId) continue;
      const row = await tx.workItemDependency.create({
        data: { workItemId, dependsOnId },
      });
      item.committedId = row.id;
    }

    for (const item of payload.nfrs) {
      if (!(await take(item, "Non-functional requirement"))) continue;
      const row = await tx.nonFunctionalRequirement.create({
        data: {
          productId: input.productId,
          category: item.category,
          title: item.title,
          description: item.description,
          measure: item.measure,
          status: "PROPOSED",
          source: "AI_PROPOSAL",
        },
      });
      item.committedId = row.id;
    }

    for (const item of payload.questions) {
      if (!(await take(item, "Question"))) continue;
      const row = await tx.requirementQuestion.create({
        data: {
          productId: input.productId,
          workItemId: item.storyTempId ? ids.get(item.storyTempId) ?? null : null,
          question: item.question,
          reason: item.reason,
          impact: item.impact,
          status: "OPEN",
        },
      });
      item.committedId = row.id;
    }

    for (const item of payload.assumptions) {
      if (!(await take(item, "Assumption"))) continue;
      const row = await tx.requirementAssumption.create({
        data: {
          productId: input.productId,
          workItemId: item.storyTempId ? ids.get(item.storyTempId) ?? null : null,
          description: item.description,
          impact: item.impact,
          confidence: item.confidence,
          status: "UNVALIDATED",
          origin: "AI_PROPOSAL",
        },
      });
      item.committedId = row.id;
    }

    const pending = [
      ...payload.outcomes,
      ...payload.capabilities,
      ...payload.epics,
      ...payload.features,
      ...payload.stories,
      ...payload.acceptanceCriteria,
      ...payload.nfrs,
      ...payload.assumptions,
      ...payload.questions,
      ...payload.dependencies,
      ...(payload.firstSlice ? [payload.firstSlice] : []),
    ].some((item) => item.reviewStatus === "PENDING");

    await tx.definitionProposal.update({
      where: { id: input.proposalId },
      data: {
        payload,
        status: pending ? "PARTIALLY_COMMITTED" : "COMMITTED",
      },
    });
    await tx.productDefinition.upsert({
      where: { productId: input.productId },
      update: {},
      create: { productId: input.productId, status: "IN_PROGRESS" },
    });

    return { payload, skipped };
  });
}

export async function definitionSnapshot(productId: string) {
  const [
    definition,
    outcomes,
    capabilities,
    slices,
    nfrs,
    questions,
    assumptions,
    workItems,
    criteria,
    dependencyLinks,
  ] = await Promise.all([
    db.productDefinition.findUnique({ where: { productId } }),
    db.productOutcome.findMany({ where: { productId }, orderBy: { createdAt: "asc" } }),
    db.productCapability.findMany({
      where: { productId },
      orderBy: { createdAt: "asc" },
      include: { outcome: { select: { id: true, title: true, sourceBriefId: true } } },
    }),
    db.productSlice.findMany({ where: { productId }, orderBy: { createdAt: "asc" } }),
    db.nonFunctionalRequirement.findMany({ where: { productId }, orderBy: { createdAt: "asc" } }),
    db.requirementQuestion.findMany({ where: { productId }, orderBy: { createdAt: "asc" } }),
    db.requirementAssumption.findMany({ where: { productId }, orderBy: { createdAt: "asc" } }),
    db.workItem.findMany({
      where: { productId },
      orderBy: { createdAt: "asc" },
      include: {
        capability: {
          select: {
            id: true,
            name: true,
            outcome: { select: { id: true, title: true, sourceBriefId: true } },
          },
        },
        slice: { select: { id: true, name: true, status: true } },
      },
    }),
    db.acceptanceCriterion.findMany({
      where: { workItem: { productId } },
      orderBy: { createdAt: "asc" },
    }),
    db.workItemDependency.findMany({
      where: { workItem: { productId } },
      select: { workItemId: true },
    }),
  ]);
  return {
    definition,
    outcomes,
    capabilities,
    slices,
    nfrs,
    questions,
    assumptions,
    workItems,
    criteria,
    dependencyLinks,
  };
}

export async function confirmOutcome(id: string, productId: string) {
  const row = await db.productOutcome.findFirst({ where: { id, productId } });
  if (!row) throw new DomainError("Outcome not found.", "NOT_FOUND");
  return db.productOutcome.update({
    where: { id },
    data: { status: "CONFIRMED", humanLocked: true, origin: "HUMAN_CONFIRMED" },
  });
}

export async function setCapabilityStatus(
  id: string,
  productId: string,
  status: "CONFIRMED" | "REJECTED",
) {
  const row = await db.productCapability.findFirst({ where: { id, productId } });
  if (!row) throw new DomainError("Capability not found.", "NOT_FOUND");
  return db.productCapability.update({
    where: { id },
    data: {
      status,
      humanLocked: true,
      origin: status === "CONFIRMED" ? "HUMAN_CONFIRMED" : row.origin,
    },
  });
}

export async function setNfrStatus(
  id: string,
  productId: string,
  status: "CONFIRMED" | "REJECTED",
) {
  const row = await db.nonFunctionalRequirement.findFirst({ where: { id, productId } });
  if (!row) throw new DomainError("Non-functional requirement not found.", "NOT_FOUND");
  return db.nonFunctionalRequirement.update({
    where: { id },
    data: {
      status,
      humanLocked: true,
      source: status === "CONFIRMED" ? "HUMAN_CONFIRMED" : row.source,
    },
  });
}

export async function approveSlice(id: string, productId: string) {
  const row = await db.productSlice.findFirst({ where: { id, productId } });
  if (!row) throw new DomainError("First product slice not found.", "NOT_FOUND");
  if (row.status === "APPROVED") {
    throw new DomainError("This first product slice is already approved.", "CONFLICT");
  }
  return db.productSlice.update({
    where: { id },
    data: { status: "APPROVED", humanLocked: true, origin: "HUMAN_CONFIRMED" },
  });
}

export async function answerQuestion(input: {
  id: string;
  productId: string;
  answer: string;
  answeredBy: string;
}) {
  const row = await db.requirementQuestion.findFirst({
    where: { id: input.id, productId: input.productId },
  });
  if (!row) throw new DomainError("Question not found.", "NOT_FOUND");
  return db.requirementQuestion.update({
    where: { id: input.id },
    data: {
      answer: input.answer,
      answeredBy: input.answeredBy,
      status: "ANSWERED",
      resolvedAt: new Date(),
    },
  });
}

export async function markDefinitionStatus(
  productId: string,
  status: "IN_PROGRESS" | "READY_FOR_REVIEW" | "APPROVED",
) {
  return db.productDefinition.upsert({
    where: { productId },
    update: {
      status,
      approvedAt: status === "APPROVED" ? new Date() : undefined,
    },
    create: {
      productId,
      status,
      approvedAt: status === "APPROVED" ? new Date() : null,
    },
  });
}
