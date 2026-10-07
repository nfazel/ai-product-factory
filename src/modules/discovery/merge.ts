import {
  LIST_BRIEF_SECTIONS,
  PROSE_BRIEF_SECTIONS,
  type AssumptionStatus,
  type BriefSection,
  type ListBriefSection,
  type ProseBriefSection,
  type SignalLevel,
} from "@/domain/constants";
import type { DiscoveryResponse } from "@/modules/discovery/schema";
import type {
  AssumptionRecord,
  BriefItem,
  ProductBriefRecord,
} from "@/modules/discovery/types";

export function isProseSection(section: BriefSection): section is ProseBriefSection {
  return (PROSE_BRIEF_SECTIONS as readonly string[]).includes(section);
}

export function isListSection(section: BriefSection): section is ListBriefSection {
  return (LIST_BRIEF_SECTIONS as readonly string[]).includes(section);
}

export function countSufficientClarity(levels: SignalLevel[]) {
  return levels.filter((level) => level === "MEDIUM" || level === "HIGH").length;
}

export function readinessSummary(count: number) {
  return `${count} of 5 areas sufficiently understood.`;
}

function newId() {
  return crypto.randomUUID();
}

function sameText(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function mergeProse(current: string, origin: ProductBriefRecord["fieldOrigins"]["problemStatement"], incoming: string) {
  const next = incoming.trim();
  if (!next || origin === "HUMAN_CONFIRMED") {
    return { value: current, origin };
  }
  return { value: next, origin: "AI_PROPOSAL" as const };
}

function mergeList(current: BriefItem[], incoming: string[]) {
  if (incoming.length === 0) return current;
  const confirmed = current.filter((item) => item.origin === "HUMAN_CONFIRMED");
  const proposed = incoming
    .map((text) => text.trim())
    .filter(Boolean)
    .filter((text) => !confirmed.some((item) => sameText(item.text, text)))
    .map((text) => ({ id: newId(), text, origin: "AI_PROPOSAL" as const }));
  return [...confirmed, ...proposed];
}

function appendUnique(items: BriefItem[], extra: string[]) {
  const additions = extra
    .map((text) => text.trim())
    .filter(Boolean)
    .filter((text) => !items.some((item) => sameText(item.text, text)))
    .map((text) => ({ id: newId(), text, origin: "AI_PROPOSAL" as const }));
  return additions.length ? [...items, ...additions] : items;
}

function assumptionLocked(assumption: AssumptionRecord) {
  return (
    assumption.origin === "HUMAN_CONFIRMED" ||
    assumption.status === "VALIDATED" ||
    assumption.status === "INVALIDATED"
  );
}

export function mergeAssumptions(
  current: AssumptionRecord[],
  incoming: { description: string; impact: AssumptionRecord["impact"]; confidence: SignalLevel }[],
) {
  if (incoming.length === 0) return current;
  const next = current.map((item) => ({ ...item }));
  for (const proposal of incoming) {
    const description = proposal.description.trim();
    if (!description) continue;
    const existing = next.find((item) => sameText(item.description, description));
    if (!existing) {
      next.push({
        id: newId(),
        briefId: current[0]?.briefId ?? "",
        description,
        impact: proposal.impact,
        confidence: proposal.confidence,
        status: "UNVALIDATED",
        origin: "AI_PROPOSAL",
      });
      continue;
    }
    if (assumptionLocked(existing)) continue;
    existing.description = description;
    existing.impact = proposal.impact;
    existing.confidence = proposal.confidence;
    existing.status = "UNVALIDATED";
    existing.origin = "AI_PROPOSAL";
  }
  return next;
}

function nextStatus(ready: boolean): ProductBriefRecord["status"] {
  return ready ? "READY_FOR_REVIEW" : "DRAFT";
}

export function mergeDiscoveryResponse(
  brief: ProductBriefRecord,
  response: DiscoveryResponse,
): ProductBriefRecord {
  const updates = response.briefUpdates;
  const problem = mergeProse(
    brief.problemStatement,
    brief.fieldOrigins.problemStatement,
    updates.problemStatement,
  );
  const vision = mergeProse(
    brief.productVision,
    brief.fieldOrigins.productVision,
    updates.productVision,
  );
  const value = mergeProse(
    brief.valueProposition,
    brief.fieldOrigins.valueProposition,
    updates.valueProposition,
  );
  const assessment = response.discoveryAssessment;
  const assumptions = mergeAssumptions(brief.assumptions, [
    ...updates.assumptions,
    ...response.assumptionsIdentified.map((description) => ({
      description,
      impact: "MEDIUM" as const,
      confidence: "LOW" as const,
    })),
  ]);

  return {
    ...brief,
    problemStatement: problem.value,
    productVision: vision.value,
    valueProposition: value.value,
    fieldOrigins: {
      problemStatement: problem.origin,
      productVision: vision.origin,
      valueProposition: value.origin,
    },
    targetUsers: mergeList(brief.targetUsers, updates.targetUsers),
    userNeeds: mergeList(brief.userNeeds, updates.userNeeds),
    desiredOutcomes: mergeList(brief.desiredOutcomes, updates.desiredOutcomes),
    inScope: mergeList(brief.inScope, updates.inScope),
    outOfScope: mergeList(brief.outOfScope, updates.outOfScope),
    constraints: mergeList(brief.constraints, updates.constraints),
    risks: appendUnique(mergeList(brief.risks, updates.risks), response.risksIdentified),
    successMeasures: mergeList(brief.successMeasures, updates.successMeasures),
    openQuestions: mergeList(brief.openQuestions, updates.openQuestions),
    assumptions: assumptions.map((item) => ({ ...item, briefId: brief.id })),
    problemClarity: assessment.problemClarity,
    userClarity: assessment.userClarity,
    outcomeClarity: assessment.outcomeClarity,
    scopeClarity: assessment.scopeClarity,
    riskClarity: assessment.riskClarity,
    readyForReview: assessment.readyForReview,
    readinessReason: assessment.reason,
    status: nextStatus(assessment.readyForReview),
  };
}

export function applyHumanEdit(
  brief: ProductBriefRecord,
  section: BriefSection,
  value: string,
): ProductBriefRecord {
  const reset = { readyForReview: false, status: "DRAFT" as const };
  if (isProseSection(section)) {
    return {
      ...brief,
      [section]: value.trim(),
      fieldOrigins: {
        ...brief.fieldOrigins,
        [section]: "HUMAN_CONFIRMED",
      },
      ...reset,
    };
  }
  const items = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ id: newId(), text, origin: "HUMAN_CONFIRMED" as const }));
  return { ...brief, [section]: items, ...reset };
}

export function applyAssumptionStatus(
  brief: ProductBriefRecord,
  assumptionId: string,
  status: AssumptionStatus,
) {
  const existing = brief.assumptions.find((item) => item.id === assumptionId);
  if (!existing) return null;
  return {
    ...brief,
    readyForReview: false,
    status: "DRAFT" as const,
    assumptions: brief.assumptions.map((item) =>
      item.id === assumptionId
        ? { ...item, status, origin: "HUMAN_CONFIRMED" as const }
        : item,
    ),
  };
}
