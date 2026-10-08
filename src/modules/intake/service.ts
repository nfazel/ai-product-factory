import "server-only";

import { db } from "@/lib/db";
import { isAIConfigured, getAIProvider } from "@/modules/ai/provider";
import { safeErrorMessage } from "@/modules/ai/errors";
import { completeAgentRun, failAgentRun, insertAgentRun } from "@/modules/agent/repository";
import { recordActivity } from "@/modules/activity/service";
import { getCurrentActor } from "@/modules/identity/actor";
import { DomainError } from "@/modules/shared/errors";
import {
  assertAllowedUpload,
  extractRequirementText,
  MAX_PASTE_CHARS,
  writeStoredUpload,
  displayFilename,
} from "@/modules/intake/files";
import { excerptIsInSource, sourceHash } from "@/modules/intake/hash";
import { INTAKE_SYSTEM_PROMPT, intakeMessages } from "@/modules/intake/prompt";
import { assessIntakeReadiness, countsFromRecords } from "@/modules/intake/readiness";
import { intakeAnalysisSchema, type IntakeAnalysisResponse } from "@/modules/intake/schema";

const PERSON = "A person";

function person() {
  const actor = getCurrentActor();
  const name = actor.name.trim().toLowerCase();
  if (!name || name === "local user" || name.includes("agent")) return PERSON;
  return actor.name.trim();
}

function notes(values: string[]) {
  return values.map((text) => ({ id: crypto.randomUUID(), text, origin: "AI_PROPOSAL" as const }));
}

async function requireExisting(productId: string) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new DomainError("Product not found.", "NOT_FOUND");
  if (product.startMode !== "EXISTING_REQUIREMENTS") {
    throw new DomainError("Requirements intake is only used when the product starts from existing requirements.");
  }
  return product;
}

async function markAnalysesStale(productId: string) {
  await db.requirementsAnalysis.updateMany({
    where: { productId, status: "CURRENT" },
    data: { status: "STALE" },
  });
}

async function noteChangeAfterApproval(productId: string) {
  const definition = await db.productDefinition.findUnique({ where: { productId } });
  if (definition?.status === "APPROVED") {
    await db.product.update({ where: { id: productId }, data: { requirementsReviewRequired: true } });
  }
}

export async function addPastedRequirements(productId: string, title: string, text: string) {
  await requireExisting(productId);
  const sourceText = text.replace(/\r\n/g, "\n");
  if (sourceText.trim().length < 20) throw new DomainError("Paste the requirements text. A short fragment is not enough to analyse.");
  if (sourceText.length > MAX_PASTE_CHARS) throw new DomainError("The pasted requirements are too long.");
  const source = await db.requirementSource.create({
    data: {
      productId,
      kind: "PASTED_TEXT",
      title: title.trim() || "Pasted requirements",
      sourceText,
      sourceHash: sourceHash(sourceText),
      createdBy: person(),
    },
  });
  await markAnalysesStale(productId);
  await noteChangeAfterApproval(productId);
  await recordActivity({
    productId,
    type: "REQUIREMENT_UPDATED",
    description: "Added pasted requirements as source material. They are not approved.",
    actor: person(),
  });
  return source;
}

export async function addUploadedRequirements(productId: string, file: File) {
  await requireExisting(productId);
  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = displayFilename(file.name || "document");
  let ext: string;
  try {
    ext = assertAllowedUpload(file.name || filename, bytes.length);
  } catch (error) {
    throw error;
  }
  let extracted: { text: string; pageCount: number };
  try {
    extracted = await extractRequirementText(ext, bytes);
  } catch (error) {
    const message = error instanceof DomainError ? error.message : "Readable text could not be extracted.";
    await db.requirementSource.create({
      data: {
        productId,
        kind: "UPLOADED_DOCUMENT",
        title: filename,
        originalFilename: filename,
        mediaType: file.type || ext,
        sourceText: "",
        sourceHash: sourceHash(""),
        status: "EXTRACTION_FAILED",
        extractionNote: message,
        createdBy: person(),
      },
    });
    throw error instanceof DomainError ? error : new DomainError(message);
  }
  const storage = await writeStoredUpload(productId, bytes);
  const source = await db.requirementSource.create({
    data: {
      productId,
      kind: "UPLOADED_DOCUMENT",
      title: filename,
      originalFilename: filename,
      mediaType: file.type || ext,
      sourceText: extracted.text,
      sourceHash: sourceHash(extracted.text),
      storageName: storage,
      pageCount: extracted.pageCount,
      createdBy: person(),
    },
  });
  await markAnalysesStale(productId);
  await noteChangeAfterApproval(productId);
  await recordActivity({
    productId,
    type: "REQUIREMENT_UPDATED",
    description: `Stored uploaded requirements from ${filename}. The original wording was preserved.`,
    actor: person(),
  });
  return source;
}

export async function analyseRequirements(productId: string) {
  const product = await requireExisting(productId);
  const sources = await db.requirementSource.findMany({
    where: { productId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  const usable = sources.filter((source) => source.sourceText.trim().length > 0);
  if (usable.length === 0) throw new DomainError("Add requirements before analysing them.");
  if (!isAIConfigured()) {
    throw new DomainError("Requirements analysis is not configured. Add OPENAI_API_KEY on the server. No analysis was created.");
  }
  const startedAt = new Date();
  const run = await insertAgentRun({
    productId,
    workItemId: null,
    agentType: "REQUIREMENTS",
    input: {
      purpose: "existing-requirements-analysis",
      sourceIds: usable.map((source) => source.id),
      sourceHashes: usable.map((source) => source.sourceHash),
    },
    startedAt,
  });
  try {
    const keyed = usable.map((source, index) => ({
      key: `s${index + 1}`,
      source,
    }));
    const generated = await getAIProvider().generate({
      systemPrompt: INTAKE_SYSTEM_PROMPT,
      messages: intakeMessages(
        keyed.map((item) => ({
          key: item.key,
          title: item.source.title,
          pageCount: item.source.pageCount,
          text: item.source.sourceText,
        })),
      ),
      responseSchema: intakeAnalysisSchema,
      schemaName: "existing_requirements_analysis",
      temperature: 0.1,
    });
    const parsed = intakeAnalysisSchema.safeParse(generated.data);
    if (!parsed.success) {
      throw new DomainError("The analysis did not match the required structure. Nothing was saved. You can retry.");
    }
    const analysis = await persistAnalysis(product, keyed, parsed.data, run.id);
    const completedAt = new Date();
    await completeAgentRun(run.id, {
      output: {
        purpose: "existing-requirements-analysis",
        analysisId: analysis.id,
        version: analysis.version,
        requirementCount: analysis.requirementCount,
        findingCount: analysis.findingCount,
        model: generated.model,
        usage: generated.usage,
      },
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
      estimatedCost: null,
    });
    await recordActivity({
      productId,
      type: "REQUIREMENT_UPDATED",
      description: `Analysed ${analysis.requirementCount} source requirements. They are not approved.`,
      actor: "Requirements analysis",
    });
    return analysis;
  } catch (error) {
    const completedAt = new Date();
    await failAgentRun(run.id, {
      output: { error: safeErrorMessage(error), purpose: "existing-requirements-analysis" },
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
    });
    if (error instanceof DomainError) throw error;
    throw new DomainError(safeErrorMessage(error));
  }
}

async function persistAnalysis(
  product: { id: string },
  keyed: { key: string; source: { id: string; sourceText: string; sourceHash: string; pageCount: number } }[],
  response: IntakeAnalysisResponse,
  agentRunId: string,
) {
  const byKey = new Map(keyed.map((item) => [item.key, item.source]));
  const quoted = response.requirements.filter((item) => {
    const source = byKey.get(item.sourceKey);
    return source ? excerptIsInSource(source.sourceText, item.excerpt) : false;
  });
  if (quoted.length === 0) {
    throw new DomainError("The analysis did not quote the supplied requirements. Nothing was saved.");
  }
  const questions = [...response.questions];
  if (!response.brief.problem.trim()) {
    questions.push({
      question: "The supplied requirements do not state the business problem this change is intended to solve. What problem should the product address?",
      reason: "A Product Brief needs a problem a person can approve. It was not invented.",
      priority: "HIGH",
      requirementKeys: [],
    });
  }
  if (response.brief.outcomes.length === 0) {
    questions.push({
      question: "The supplied requirements do not state the business outcome this change is intended to achieve. What outcome matters?",
      reason: "An outcome was not present in the source, so none was invented.",
      priority: "HIGH",
      requirementKeys: [],
    });
  }
  const previous = await db.requirementsAnalysis.aggregate({ where: { productId: product.id }, _max: { version: true } });
  const version = (previous._max.version ?? 0) + 1;
  await db.requirementsAnalysis.updateMany({ where: { productId: product.id, status: "CURRENT" }, data: { status: "STALE" } });
  const analysis = await db.requirementsAnalysis.create({
    data: {
      productId: product.id,
      version,
      status: "CURRENT",
      agentRunId,
      problem: response.brief.problem.trim(),
      value: response.brief.value.trim(),
      users: response.brief.users,
      needs: response.brief.needs,
      outcomes: response.brief.outcomes,
      assumptions: response.brief.assumptions,
      constraints: response.brief.constraints,
      risks: response.brief.risks,
      scope: response.brief.scope,
      successMeasures: response.brief.successMeasures,
      suggestedCapabilities: response.suggestedCapabilities,
      missingProblem: !response.brief.problem.trim(),
      missingOutcome: response.brief.outcomes.length === 0,
      sources: {
        create: keyed.map((item) => ({ sourceId: item.source.id, sourceHash: item.source.sourceHash })),
      },
    },
  });
  const created = [];
  for (const [index, item] of quoted.entries()) {
    const source = byKey.get(item.sourceKey)!;
    const page = item.pageNumber != null && source.pageCount > 0 && item.pageNumber <= source.pageCount ? item.pageNumber : null;
    const row = await db.sourceRequirement.create({
      data: {
        productId: product.id,
        sourceId: source.id,
        analysisId: analysis.id,
        identifier: item.identifier?.trim() || `R-${index + 1}`,
        sourceText: item.excerpt.trim(),
        sectionHeading: item.sectionHeading,
        pageNumber: page,
        blockIndex: item.blockIndex,
        requirementType: item.requirementType,
        interpretation: item.interpretation,
        confidence: item.confidence,
        suggestedCapability: item.suggestedCapability,
      },
    });
    created.push({ key: item.key, id: row.id, sourceText: row.sourceText });
  }
  const idByKey = new Map(created.map((item) => [item.key, item.id]));
  const normalized = new Map<string, string[]>();
  for (const item of created) {
    const key = item.sourceText.replace(/\s+/g, " ").trim().toLowerCase();
    normalized.set(key, [...(normalized.get(key) ?? []), item.id]);
  }
  for (const finding of response.findings) {
    const title = finding.findingType === "CONFLICT" && !finding.title.toLowerCase().startsWith("possible conflict")
      ? `Possible conflict: ${finding.title}`
      : finding.findingType === "DUPLICATE" && !finding.title.toLowerCase().startsWith("potential duplication")
        ? `Potential duplication: ${finding.title}`
        : finding.title;
    await db.requirementFinding.create({
      data: {
        productId: product.id,
        analysisId: analysis.id,
        findingType: finding.findingType,
        severity: finding.severity,
        title,
        explanation: finding.explanation,
        gapNote: finding.gapNote,
        links: {
          create: finding.requirementKeys
            .map((key) => idByKey.get(key))
            .filter((id): id is string => Boolean(id))
            .map((sourceRequirementId) => ({ sourceRequirementId })),
        },
      },
    });
  }
  for (const [, ids] of normalized) {
    if (ids.length < 2) continue;
    await db.requirementFinding.create({
      data: {
        productId: product.id,
        analysisId: analysis.id,
        findingType: "DUPLICATE",
        severity: "MEDIUM",
        title: "Potential duplication",
        explanation: "The same wording appears more than once. A person decides whether these are duplicates. Neither source requirement was deleted.",
        links: { create: ids.map((sourceRequirementId) => ({ sourceRequirementId })) },
      },
    });
  }
  for (const question of questions) {
    await db.intakeQuestion.create({
      data: {
        productId: product.id,
        analysisId: analysis.id,
        question: question.question,
        reason: question.reason,
        priority: question.priority,
        links: {
          create: question.requirementKeys
            .map((key) => idByKey.get(key))
            .filter((id): id is string => Boolean(id))
            .map((sourceRequirementId) => ({ sourceRequirementId })),
        },
      },
    });
  }
  return { id: analysis.id, version, requirementCount: created.length, findingCount: response.findings.length };
}

export async function confirmRequirement(productId: string, requirementId: string, confirmation: "CONFIRMED" | "NEEDS_CHANGE" | "REJECTED", interpretation: string) {
  await requireExisting(productId);
  const row = await db.sourceRequirement.findFirst({ where: { id: requirementId, productId } });
  if (!row) throw new DomainError("Requirement not found.", "NOT_FOUND");
  const updated = await db.sourceRequirement.update({
    where: { id: row.id },
    data: {
      confirmation,
      confirmedInterpretation: confirmation === "REJECTED" ? "" : interpretation.trim() || row.interpretation,
      confirmedBy: person(),
      confirmedAt: new Date(),
    },
  });
  if (updated.sourceText !== row.sourceText) {
    throw new DomainError("The source wording cannot be changed.");
  }
  await recordActivity({
    productId,
    type: "REQUIREMENT_UPDATED",
    description: `A person marked a requirement interpretation ${confirmation.replaceAll("_", " ").toLowerCase()}. The source wording was not changed.`,
    actor: person(),
  });
  return updated;
}

export async function answerIntakeQuestion(productId: string, questionId: string, answer: string) {
  await requireExisting(productId);
  const question = await db.intakeQuestion.findFirst({ where: { id: questionId, productId } });
  if (!question) throw new DomainError("Question not found.", "NOT_FOUND");
  if (answer.trim().length < 2) throw new DomainError("Write an answer before saving it.");
  return db.intakeQuestion.update({
    where: { id: question.id },
    data: { status: "ANSWERED", answer: answer.trim(), answeredBy: person(), answeredAt: new Date() },
  });
}

export async function addressFinding(productId: string, findingId: string, status: "ADDRESSED" | "DISMISSED") {
  await requireExisting(productId);
  const finding = await db.requirementFinding.findFirst({ where: { id: findingId, productId } });
  if (!finding) throw new DomainError("Finding not found.", "NOT_FOUND");
  const updated = await db.requirementFinding.update({ where: { id: finding.id }, data: { status } });
  await recordActivity({
    productId,
    type: "REQUIREMENT_UPDATED",
    description: `A person marked a requirement finding ${status.toLowerCase()}. The source wording was not changed.`,
    actor: person(),
  });
  return updated;
}

export async function setRequirementDisposition(productId: string, requirementId: string, disposition: "IN_SCOPE" | "OUT_OF_SCOPE" | "DEFERRED" | "DUPLICATE" | "SUPERSEDED" | "NOT_A_REQUIREMENT", reason: string) {
  await requireExisting(productId);
  const row = await db.sourceRequirement.findFirst({ where: { id: requirementId, productId } });
  if (!row) throw new DomainError("Requirement not found.", "NOT_FOUND");
  if (disposition !== "IN_SCOPE" && reason.trim().length < 3) {
    throw new DomainError("A short reason is required when a requirement is not in scope.");
  }
  return db.sourceRequirement.update({
    where: { id: row.id },
    data: { disposition, dispositionReason: reason.trim(), dispositionBy: person() },
  });
}

export async function addTraceLink(productId: string, requirementId: string, targetKind: "PRODUCT_OUTCOME" | "PRODUCT_CAPABILITY" | "WORK_ITEM" | "ACCEPTANCE_CRITERION" | "NFR", targetId: string) {
  await requireExisting(productId);
  const requirement = await db.sourceRequirement.findFirst({ where: { id: requirementId, productId } });
  if (!requirement) throw new DomainError("Requirement not found.", "NOT_FOUND");
  await assertTarget(productId, targetKind, targetId);
  return db.requirementTraceLink.upsert({
    where: {
      sourceRequirementId_targetKind_targetId: { sourceRequirementId: requirement.id, targetKind, targetId },
    },
    create: {
      productId,
      sourceRequirementId: requirement.id,
      targetKind,
      targetId,
      provenance: "HUMAN_CONFIRMED",
      createdBy: person(),
    },
    update: { provenance: "HUMAN_CONFIRMED", createdBy: person() },
  });
}

async function assertTarget(productId: string, targetKind: string, targetId: string) {
  if (targetKind === "PRODUCT_OUTCOME") {
    const row = await db.productOutcome.findFirst({ where: { id: targetId, productId } });
    if (!row) throw new DomainError("Outcome not found.", "NOT_FOUND");
  } else if (targetKind === "PRODUCT_CAPABILITY") {
    const row = await db.productCapability.findFirst({ where: { id: targetId, productId } });
    if (!row) throw new DomainError("Capability not found.", "NOT_FOUND");
  } else if (targetKind === "WORK_ITEM") {
    const row = await db.workItem.findFirst({ where: { id: targetId, productId } });
    if (!row) throw new DomainError("Story not found.", "NOT_FOUND");
  } else if (targetKind === "ACCEPTANCE_CRITERION") {
    const row = await db.acceptanceCriterion.findFirst({ where: { id: targetId, workItem: { productId } } });
    if (!row) throw new DomainError("Acceptance criterion not found.", "NOT_FOUND");
  } else if (targetKind === "NFR") {
    const row = await db.nonFunctionalRequirement.findFirst({ where: { id: targetId, productId } });
    if (!row) throw new DomainError("Non-functional requirement not found.", "NOT_FOUND");
  }
}

export async function syncSuggestedLinks(productId: string) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product || product.startMode !== "EXISTING_REQUIREMENTS") return;
  const [requirements, capabilities] = await Promise.all([
    db.sourceRequirement.findMany({ where: { productId, confirmation: "CONFIRMED", suggestedCapability: { not: "" } } }),
    db.productCapability.findMany({ where: { productId } }),
  ]);
  for (const requirement of requirements) {
    const match = capabilities.find((item) => item.name.trim().toLowerCase() === requirement.suggestedCapability.trim().toLowerCase());
    if (!match) continue;
    await db.requirementTraceLink.upsert({
      where: {
        sourceRequirementId_targetKind_targetId: {
          sourceRequirementId: requirement.id,
          targetKind: "PRODUCT_CAPABILITY",
          targetId: match.id,
        },
      },
      create: {
        productId,
        sourceRequirementId: requirement.id,
        targetKind: "PRODUCT_CAPABILITY",
        targetId: match.id,
        provenance: "AI_PROPOSED",
        createdBy: "Requirements analysis",
      },
      update: {},
    });
  }
}

export async function listMaterialUnmapped(productId: string) {
  const rows = await db.sourceRequirement.findMany({
    where: {
      productId,
      confirmation: "CONFIRMED",
      disposition: { in: ["UNSET", "IN_SCOPE"] },
      source: { status: "ACTIVE" },
    },
    include: { traces: true },
  });
  return rows.filter((row) => row.traces.length === 0);
}

export async function draftBriefFromRequirements(productId: string) {
  const product = await requireExisting(productId);
  const analysis = await db.requirementsAnalysis.findFirst({
    where: { productId, status: "CURRENT" },
    orderBy: { version: "desc" },
    include: { questions: { where: { status: "OPEN" } } },
  });
  if (!analysis) throw new DomainError("Analyse the requirements before drafting a Product Brief.");
  const existing = await db.productBrief.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } });
  if (existing?.status === "APPROVED") {
    throw new DomainError("The Product Brief is already approved. A new analysis does not replace it.");
  }
  if (existing && existing.fromRequirements) {
    return existing;
  }
  const session = await db.discoverySession.upsert({
    where: { productId },
    create: {
      productId,
      status: "IN_PROGRESS",
      initialIdea: "Existing requirements were supplied. Blank-sheet discovery was not used.",
    },
    update: {},
  });
  const version = (existing?.version ?? 0) + 1;
  if (existing) {
    await db.productBrief.update({ where: { id: existing.id }, data: { status: "SUPERSEDED" } });
  }
  const brief = await db.productBrief.create({
    data: {
      productId,
      sessionId: session.id,
      version,
      problemStatement: analysis.problem,
      productVision: "",
      valueProposition: analysis.value,
      targetUsers: notes(asStrings(analysis.users)),
      userNeeds: notes(asStrings(analysis.needs)),
      desiredOutcomes: notes(asStrings(analysis.outcomes)),
      constraints: notes(asStrings(analysis.constraints)),
      risks: notes(asStrings(analysis.risks)),
      inScope: notes(asStrings(analysis.scope)),
      successMeasures: notes(asStrings(analysis.successMeasures)),
      openQuestions: notes(analysis.questions.map((item) => item.question)),
      fromRequirements: true,
      readyForReview: false,
      status: "DRAFT",
      fieldOrigins: {
        problemStatement: analysis.problem ? "AI_PROPOSAL" : "UNRESOLVED",
        productVision: "UNRESOLVED",
        valueProposition: analysis.value ? "AI_PROPOSAL" : "UNRESOLVED",
      },
    },
  });
  if (product.problemStatement.trim().length === 0 && analysis.problem.trim()) {
    await db.product.update({ where: { id: productId }, data: { problemStatement: analysis.problem } });
  }
  await recordActivity({
    productId,
    type: "DISCOVERY_BRIEF_UPDATED",
    description: "Drafted a Product Brief from the supplied requirements. A person still reviews and approves it.",
    actor: person(),
  });
  return brief;
}

export async function prepareRequirementsBrief(productId: string) {
  await requireExisting(productId);
  const brief = await db.productBrief.findFirst({
    where: { productId, status: { not: "SUPERSEDED" } },
    orderBy: { version: "desc" },
  });
  if (!brief?.fromRequirements) throw new DomainError("Draft the Product Brief from the requirements first.");
  const outcomes = noteTexts(brief.desiredOutcomes);
  if (!brief.problemStatement.trim() || outcomes.length === 0) {
    throw new DomainError("The brief still lacks a problem or an outcome. Answer that question instead of inventing one.");
  }
  await db.discoverySession.update({ where: { productId }, data: { status: "READY_FOR_REVIEW" } });
  return db.productBrief.update({
    where: { id: brief.id },
    data: { status: "READY_FOR_REVIEW", readyForReview: true },
  });
}

export async function acknowledgeRequirementsChange(productId: string) {
  await requireExisting(productId);
  await db.product.update({ where: { id: productId }, data: { requirementsReviewRequired: false } });
  await recordActivity({
    productId,
    type: "REQUIREMENT_UPDATED",
    description: "A person reviewed requirements that changed after definition approval. The definition was not changed automatically.",
    actor: person(),
  });
}

export async function getIntakeWorkspace(productId: string) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return null;
  const [sources, latest] = await Promise.all([
    db.requirementSource.findMany({ where: { productId }, orderBy: { createdAt: "asc" } }),
    db.requirementsAnalysis.findFirst({
      where: { productId },
      orderBy: { version: "desc" },
      include: {
        sources: true,
        requirements: { orderBy: { createdAt: "asc" }, include: { traces: true, source: true } },
        findings: { include: { links: true }, orderBy: { createdAt: "asc" } },
        questions: { orderBy: { createdAt: "asc" }, include: { links: true } },
      },
    }),
  ]);
  const active = sources.filter((source) => source.status === "ACTIVE" && source.sourceText.trim().length > 0);
  const current =
    latest?.status === "CURRENT" &&
    active.every((source) => latest.sources.some((link) => link.sourceId === source.id && link.sourceHash === source.sourceHash));
  const requirements = latest?.requirements ?? [];
  const findings = latest?.findings ?? [];
  const questions = latest?.questions ?? [];
  const readiness = assessIntakeReadiness({
    activeSources: active.length,
    extractionFailed: sources.some((source) => source.status === "EXTRACTION_FAILED"),
    analysed: Boolean(current),
    stale: Boolean(latest) && !current,
    requirements: current ? requirements.map((item) => ({ confirmation: item.confirmation, disposition: item.disposition })) : [],
    findings: current ? findings.map((item) => ({ findingType: item.findingType, severity: item.severity, status: item.status })) : [],
    questions: current ? questions.map((item) => ({ priority: item.priority, status: item.status })) : [],
  });
  const summary = countsFromRecords({
    requirements: (current ? requirements : []).map((item) => ({ requirementType: item.requirementType })),
    findings: (current ? findings : []).map((item) => ({ findingType: item.findingType })),
    suggestedCapabilities: current ? asStrings(latest?.suggestedCapabilities) : [],
  });
  const confirmed = requirements.filter((item) => item.confirmation === "CONFIRMED");
  const mapped = confirmed.filter((item) => item.traces.length > 0 || !["UNSET", "IN_SCOPE"].includes(item.disposition));
  return {
    product,
    sources,
    analysis: latest,
    current: Boolean(current),
    requirements,
    findings,
    questions,
    readiness,
    summary,
    counts: {
      supplied: requirements.length,
      confirmed: confirmed.length,
      needsAttention: requirements.filter((item) => item.confirmation === "UNREVIEWED" || item.confirmation === "NEEDS_CHANGE").length,
      mapped: mapped.length,
      deferred: requirements.filter((item) => ["OUT_OF_SCOPE", "DEFERRED", "DUPLICATE", "SUPERSEDED", "NOT_A_REQUIREMENT"].includes(item.disposition)).length,
    },
    configured: isAIConfigured(),
  };
}

function asStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function noteTexts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    if (item && typeof item === "object" && "text" in item && typeof item.text === "string" && item.text.trim()) {
      return [item.text.trim()];
    }
    return [];
  });
}

export async function definitionIntakeLines(productId: string) {
  const empty = { confirmed: [] as string[], rejected: [] as string[], warnings: [] as string[] };
  const product = await db.product.findUnique({ where: { id: productId }, select: { startMode: true } });
  if (!product || product.startMode !== "EXISTING_REQUIREMENTS") return empty;
  const analysis = await db.requirementsAnalysis.findFirst({
    where: { productId, status: "CURRENT" },
    include: { sources: true },
  });
  if (!analysis) {
    const stale = await db.requirementsAnalysis.findFirst({ where: { productId, status: "STALE" }, select: { id: true } });
    if (!stale) return empty;
    return {
      ...empty,
      warnings: ["The requirements changed after analysis. The previous interpretation was not applied."],
    };
  }
  const sources = await db.requirementSource.findMany({ where: { productId, status: "ACTIVE" } });
  const fresh = sources
    .filter((source) => source.sourceText.trim().length > 0)
    .every((source) => analysis.sources.some((link) => link.sourceId === source.id && link.sourceHash === source.sourceHash));
  if (!fresh) {
    return {
      ...empty,
      warnings: ["The requirements changed after analysis. The previous interpretation was not applied."],
    };
  }
  const [requirements, findings, answers] = await Promise.all([
    db.sourceRequirement.findMany({ where: { analysisId: analysis.id } }),
    db.requirementFinding.findMany({ where: { analysisId: analysis.id, status: "OPEN", severity: "HIGH" } }),
    db.intakeQuestion.findMany({ where: { analysisId: analysis.id, status: "ANSWERED" } }),
  ]);
  const usable = requirements.filter((item) => item.confirmation === "CONFIRMED" && ["UNSET", "IN_SCOPE"].includes(item.disposition));
  return {
    confirmed: usable.map(
      (item) =>
        `${item.identifier}: SOURCE: ${item.sourceText}\nCONFIRMED INTERPRETATION: ${item.confirmedInterpretation || item.interpretation}`,
    ),
    rejected: requirements.filter((item) => item.confirmation === "REJECTED").map((item) => item.sourceText),
    warnings: [
      ...findings.map((item) => `${item.title}. ${item.explanation}`),
      ...answers.map((item) => `Human answer: ${item.question} — ${item.answer}`),
    ],
  };
}
