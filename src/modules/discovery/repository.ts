import "server-only";

import { z } from "zod";

import { BRIEF_ORIGINS } from "@/domain/constants";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  applyAssumptionStatus,
  applyHumanEdit,
  mergeDiscoveryResponse,
} from "@/modules/discovery/merge";
import { formatAssistantContent } from "@/modules/discovery/prompt";
import type { DiscoveryResponse } from "@/modules/discovery/schema";
import type {
  AssumptionRecord,
  BriefItem,
  DiscoveryMessageRecord,
  DiscoverySessionRecord,
  FieldOrigins,
  ProductBriefRecord,
} from "@/modules/discovery/types";
import { EMPTY_FIELD_ORIGINS } from "@/modules/discovery/types";
import { DomainError } from "@/modules/shared/errors";
import type {
  AssumptionStatus,
  BriefSection,
} from "@/domain/constants";

const itemSchema = z.object({
  id: z.string(),
  text: z.string(),
  origin: z.enum(BRIEF_ORIGINS),
});

const originsSchema = z.object({
  problemStatement: z.enum(BRIEF_ORIGINS).optional(),
  productVision: z.enum(BRIEF_ORIGINS).optional(),
  valueProposition: z.enum(BRIEF_ORIGINS).optional(),
});

const briefInclude = {
  assumptions: { orderBy: { createdAt: "asc" as const } },
};

type BriefRow = Prisma.ProductBriefGetPayload<{ include: typeof briefInclude }>;
type Tx = Prisma.TransactionClient;

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function parseItems(value: unknown): BriefItem[] {
  const parsed = z.array(itemSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseFieldOrigins(value: unknown): FieldOrigins {
  const parsed = originsSchema.safeParse(value);
  if (!parsed.success) return { ...EMPTY_FIELD_ORIGINS };
  return {
    problemStatement: parsed.data.problemStatement ?? "UNRESOLVED",
    productVision: parsed.data.productVision ?? "UNRESOLVED",
    valueProposition: parsed.data.valueProposition ?? "UNRESOLVED",
  };
}

function toAssumption(row: BriefRow["assumptions"][number]): AssumptionRecord {
  return {
    id: row.id,
    briefId: row.briefId,
    description: row.description,
    impact: row.impact,
    confidence: row.confidence,
    status: row.status,
    origin: row.origin,
  };
}

export function toBrief(row: BriefRow): ProductBriefRecord {
  return {
    id: row.id,
    productId: row.productId,
    sessionId: row.sessionId,
    version: row.version,
    problemStatement: row.problemStatement,
    productVision: row.productVision,
    valueProposition: row.valueProposition,
    fieldOrigins: parseFieldOrigins(row.fieldOrigins),
    targetUsers: parseItems(row.targetUsers),
    userNeeds: parseItems(row.userNeeds),
    desiredOutcomes: parseItems(row.desiredOutcomes),
    inScope: parseItems(row.inScope),
    outOfScope: parseItems(row.outOfScope),
    constraints: parseItems(row.constraints),
    risks: parseItems(row.risks),
    successMeasures: parseItems(row.successMeasures),
    openQuestions: parseItems(row.openQuestions),
    assumptions: row.assumptions.map(toAssumption),
    problemClarity: row.problemClarity,
    userClarity: row.userClarity,
    outcomeClarity: row.outcomeClarity,
    scopeClarity: row.scopeClarity,
    riskClarity: row.riskClarity,
    readyForReview: row.readyForReview,
    readinessReason: row.readinessReason,
    status: row.status,
  };
}

function briefWrite(brief: ProductBriefRecord): Prisma.ProductBriefUpdateInput {
  return {
    problemStatement: brief.problemStatement,
    productVision: brief.productVision,
    valueProposition: brief.valueProposition,
    fieldOrigins: toJson(brief.fieldOrigins),
    targetUsers: toJson(brief.targetUsers),
    userNeeds: toJson(brief.userNeeds),
    desiredOutcomes: toJson(brief.desiredOutcomes),
    inScope: toJson(brief.inScope),
    outOfScope: toJson(brief.outOfScope),
    constraints: toJson(brief.constraints),
    risks: toJson(brief.risks),
    successMeasures: toJson(brief.successMeasures),
    openQuestions: toJson(brief.openQuestions),
    problemClarity: brief.problemClarity,
    userClarity: brief.userClarity,
    outcomeClarity: brief.outcomeClarity,
    scopeClarity: brief.scopeClarity,
    riskClarity: brief.riskClarity,
    readyForReview: brief.readyForReview,
    readinessReason: brief.readinessReason,
    status: brief.status,
  };
}

function toSession(row: {
  id: string;
  productId: string;
  status: DiscoverySessionRecord["status"];
  initialIdea: string;
  optionalContext: string;
  knownConstraints: string;
  knownUsers: string;
  desiredOutcome: string;
  seededDemo: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): DiscoverySessionRecord {
  return row;
}

export async function findDiscoverySession(productId: string) {
  const row = await db.discoverySession.findUnique({ where: { productId } });
  return row ? toSession(row) : null;
}

export async function listDiscoveryMessages(sessionId: string) {
  const rows = await db.discoveryMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row): DiscoveryMessageRecord => row);
}

export async function listBriefVersions(productId: string) {
  return db.productBrief.findMany({
    where: { productId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, createdAt: true },
  });
}

export async function findCurrentBrief(productId: string) {
  const row = await db.productBrief.findFirst({
    where: { productId, status: { not: "SUPERSEDED" } },
    orderBy: { version: "desc" },
    include: briefInclude,
  });
  return row ? toBrief(row) : null;
}

export async function findBriefByVersion(productId: string, version: number) {
  const row = await db.productBrief.findUnique({
    where: { productId_version: { productId, version } },
    include: briefInclude,
  });
  return row ? toBrief(row) : null;
}

export async function latestDiscoveryRun(productId: string) {
  return db.agentRun.findFirst({
    where: { productId, agentType: "PRODUCT_DISCOVERY" },
    orderBy: { createdAt: "desc" },
  });
}

export async function appendDiscoveryMessage(input: {
  sessionId: string;
  role: DiscoveryMessageRecord["role"];
  content: string;
}) {
  return db.discoveryMessage.create({ data: input });
}

export async function createDiscoverySession(input: {
  productId: string;
  initialIdea: string;
  optionalContext: string;
  knownConstraints: string;
  knownUsers: string;
  desiredOutcome: string;
  intake: string;
}) {
  return db.$transaction(async (tx) => {
    const session = await tx.discoverySession.create({
      data: {
        productId: input.productId,
        status: "IN_PROGRESS",
        initialIdea: input.initialIdea,
        optionalContext: input.optionalContext,
        knownConstraints: input.knownConstraints,
        knownUsers: input.knownUsers,
        desiredOutcome: input.desiredOutcome,
        startedAt: new Date(),
      },
    });
    const brief = await tx.productBrief.create({
      data: {
        productId: input.productId,
        sessionId: session.id,
        version: 1,
        status: "DRAFT",
        fieldOrigins: toJson(EMPTY_FIELD_ORIGINS),
      },
    });
    await tx.discoveryMessage.create({
      data: { sessionId: session.id, role: "USER", content: input.intake },
    });
    return { sessionId: session.id, briefId: brief.id };
  });
}

async function loadCurrentRow(tx: Tx, productId: string) {
  const row = await tx.productBrief.findFirst({
    where: { productId, status: { not: "SUPERSEDED" } },
    orderBy: { version: "desc" },
    include: briefInclude,
  });
  if (!row) throw new DomainError("Product brief not found.", "NOT_FOUND");
  return row;
}

async function copyApprovedBrief(tx: Tx, source: BriefRow) {
  const max = await tx.productBrief.aggregate({
    where: { productId: source.productId },
    _max: { version: true },
  });
  const created = await tx.productBrief.create({
    data: {
      productId: source.productId,
      sessionId: source.sessionId,
      version: (max._max.version ?? source.version) + 1,
      problemStatement: source.problemStatement,
      productVision: source.productVision,
      valueProposition: source.valueProposition,
      fieldOrigins: source.fieldOrigins ?? toJson(EMPTY_FIELD_ORIGINS),
      targetUsers: source.targetUsers ?? [],
      userNeeds: source.userNeeds ?? [],
      desiredOutcomes: source.desiredOutcomes ?? [],
      inScope: source.inScope ?? [],
      outOfScope: source.outOfScope ?? [],
      constraints: source.constraints ?? [],
      risks: source.risks ?? [],
      successMeasures: source.successMeasures ?? [],
      openQuestions: source.openQuestions ?? [],
      problemClarity: source.problemClarity,
      userClarity: source.userClarity,
      outcomeClarity: source.outcomeClarity,
      scopeClarity: source.scopeClarity,
      riskClarity: source.riskClarity,
      readyForReview: false,
      readinessReason: source.readinessReason,
      status: "DRAFT",
      assumptions: {
        create: source.assumptions.map((item) => ({
          description: item.description,
          impact: item.impact,
          confidence: item.confidence,
          status: item.status,
          origin: item.origin,
        })),
      },
    },
    include: briefInclude,
  });
  await tx.productBrief.update({
    where: { id: source.id },
    data: { status: "SUPERSEDED" },
  });
  if (source.sessionId) {
    await tx.discoverySession.update({
      where: { id: source.sessionId },
      data: { status: "IN_PROGRESS", completedAt: null },
    });
  }
  return created;
}

async function writeAssumptions(tx: Tx, briefId: string, assumptions: AssumptionRecord[]) {
  for (const assumption of assumptions) {
    const data = {
      description: assumption.description,
      impact: assumption.impact,
      confidence: assumption.confidence,
      status: assumption.status,
      origin: assumption.origin,
    };
    await tx.assumption.upsert({
      where: { id: assumption.id },
      create: { id: assumption.id, briefId, ...data },
      update: data,
    });
  }
}

export async function applyDiscoveryTurn(input: {
  sessionId: string;
  response: DiscoveryResponse;
}) {
  return db.$transaction(async (tx) => {
    const session = await tx.discoverySession.findUnique({
      where: { id: input.sessionId },
    });
    if (!session) throw new DomainError("Discovery session not found.", "NOT_FOUND");
    let row = await loadCurrentRow(tx, session.productId);
    if (row.sessionId !== session.id) {
      throw new DomainError("Discovery brief does not belong to this session.");
    }
    const previousStatus = session.status;
    if (row.status === "APPROVED") {
      row = await copyApprovedBrief(tx, row);
    }
    const merged = mergeDiscoveryResponse(toBrief(row), input.response);
    await tx.productBrief.update({
      where: { id: row.id },
      data: briefWrite(merged),
    });
    await writeAssumptions(tx, row.id, merged.assumptions);
    await tx.discoveryMessage.create({
      data: {
        sessionId: session.id,
        role: "ASSISTANT",
        content: formatAssistantContent(input.response),
      },
    });
    const ready = input.response.discoveryAssessment.readyForReview;
    await tx.discoverySession.update({
      where: { id: session.id },
      data: {
        status: ready ? "READY_FOR_REVIEW" : "IN_PROGRESS",
        completedAt: null,
      },
    });
    return {
      productId: session.productId,
      briefId: row.id,
      version: row.version,
      becameReady: ready && previousStatus !== "READY_FOR_REVIEW",
    };
  });
}

async function reopenIfNeeded(tx: Tx, sessionId: string, status: DiscoverySessionRecord["status"]) {
  if (status === "APPROVED" || status === "READY_FOR_REVIEW") {
    await tx.discoverySession.update({
      where: { id: sessionId },
      data: { status: "IN_PROGRESS", completedAt: null },
    });
  }
}

export async function saveBriefEdit(input: {
  productId: string;
  section: BriefSection;
  value: string;
}) {
  return db.$transaction(async (tx) => {
    const session = await tx.discoverySession.findUnique({
      where: { productId: input.productId },
    });
    if (!session) {
      throw new DomainError("Start product discovery before editing the brief.");
    }
    let row = await loadCurrentRow(tx, input.productId);
    if (row.status === "APPROVED") row = await copyApprovedBrief(tx, row);
    const next = applyHumanEdit(toBrief(row), input.section, input.value);
    await tx.productBrief.update({ where: { id: row.id }, data: briefWrite(next) });
    await reopenIfNeeded(tx, session.id, session.status);
    return { version: row.version, section: input.section };
  });
}

export async function saveAssumptionStatus(input: {
  productId: string;
  assumptionId: string;
  status: AssumptionStatus;
}) {
  return db.$transaction(async (tx) => {
    const session = await tx.discoverySession.findUnique({
      where: { productId: input.productId },
    });
    if (!session) throw new DomainError("Discovery session not found.", "NOT_FOUND");
    const assumption = await tx.assumption.findUnique({
      where: { id: input.assumptionId },
      include: { brief: true },
    });
    if (!assumption || assumption.brief.productId !== input.productId) {
      throw new DomainError("Assumption not found.", "NOT_FOUND");
    }
    if (assumption.brief.status === "SUPERSEDED") {
      throw new DomainError("This brief version is historical and cannot be edited.");
    }
    let row = await loadCurrentRow(tx, input.productId);
    let targetId = assumption.id;
    if (row.status === "APPROVED") {
      const description = assumption.description;
      row = await copyApprovedBrief(tx, row);
      const moved = row.assumptions.find((item) => item.description === description);
      if (!moved) throw new DomainError("Assumption not found on the new brief.", "NOT_FOUND");
      targetId = moved.id;
    }
    const next = applyAssumptionStatus(toBrief(row), targetId, input.status);
    if (!next) throw new DomainError("Assumption not found.", "NOT_FOUND");
    await tx.assumption.update({
      where: { id: targetId },
      data: { status: input.status, origin: "HUMAN_CONFIRMED" },
    });
    await tx.productBrief.update({
      where: { id: row.id },
      data: { status: "DRAFT", readyForReview: false },
    });
    await reopenIfNeeded(tx, session.id, session.status);
    return {
      version: row.version,
      description: assumption.description,
      status: input.status,
    };
  });
}

export async function markDiscoveryApproved(input: {
  productId: string;
  briefId: string;
}) {
  const completedAt = new Date();
  await db.$transaction([
    db.discoverySession.update({
      where: { productId: input.productId },
      data: { status: "APPROVED", completedAt },
    }),
    db.productBrief.update({
      where: { id: input.briefId },
      data: { status: "APPROVED" },
    }),
  ]);
}
