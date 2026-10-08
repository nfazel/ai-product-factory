import type { FindingCategoryName, GovernanceSection, GovernanceTopicName } from "@/domain/constants";
import type { GovernanceResponse, StoredGovernance } from "@/modules/governance/schema";
import { toStoredGovernance } from "@/modules/governance/schema";

type Reviewable = {
  reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
  edited: boolean;
};

export const SECTION_CATEGORIES: Record<GovernanceSection, FindingCategoryName[]> = {
  security: ["SECURITY", "DEPENDENCY", "INTEGRATION", "COMPLIANCE"],
  privacy: ["PRIVACY", "DATA"],
  plan: ["DELIVERY", "TESTABILITY"],
  architecture: ["ARCHITECTURE", "RELIABILITY", "OBSERVABILITY", "MAINTAINABILITY", "OPERABILITY", "OTHER"],
  task: [],
};

export const SECTION_TOPICS: Record<GovernanceSection, GovernanceTopicName[]> = {
  security: ["SECURITY"],
  privacy: ["PRIVACY"],
  plan: ["PLAN"],
  architecture: ["ARCHITECTURE"],
  task: [],
};

function locked(item: Reviewable) {
  return item.reviewStatus !== "PENDING" || item.edited;
}

export function mergeGovernanceSection(
  current: StoredGovernance,
  response: GovernanceResponse,
  section: GovernanceSection,
  taskId = "",
): StoredGovernance {
  const incoming = toStoredGovernance(response);
  const categories = new Set(SECTION_CATEGORIES[section]);
  const topics = new Set(SECTION_TOPICS[section]);
  const next: StoredGovernance = {
    ...current,
    assistantSummary: incoming.assistantSummary || current.assistantSummary,
  };

  if (section === "security") {
    next.securityAssessment = incoming.securityAssessment;
    next.dependencyReview = incoming.dependencyReview;
    next.threats = [
      ...current.threats.filter(locked),
      ...incoming.threats.filter((item) => !current.threats.some((kept) => locked(kept) && kept.tempId === item.tempId)),
    ];
  }
  if (section === "privacy") next.privacyAssessment = incoming.privacyAssessment;
  if (section === "architecture") next.engineeringAssessment = incoming.engineeringAssessment;
  if (section === "plan") next.implementationPlanAssessment = incoming.implementationPlanAssessment;

  next.findings = [
    ...current.findings.filter((item) => locked(item) || !categories.has(item.category)),
    ...incoming.findings.filter((item) => categories.has(item.category)),
  ];
  next.governanceQuestions = [
    ...current.governanceQuestions.filter((item) => locked(item) || !topics.has(item.topic)),
    ...incoming.governanceQuestions.filter((item) => topics.has(item.topic)),
  ];
  next.evidence = [
    ...current.evidence.filter(locked),
    ...incoming.evidence.filter(
      (item) => !current.evidence.some((kept) => locked(kept) && kept.tempId === item.tempId),
    ),
  ];

  if (section === "plan") {
    const kept = current.codingRiskAssessments.filter(locked);
    const keptIds = new Set(kept.map((item) => item.taskId));
    next.codingRiskAssessments = [
      ...kept,
      ...incoming.codingRiskAssessments.filter((item) => !keptIds.has(item.taskId)),
    ];
    if (!current.policyEdited) next.proposedCodingPolicy = incoming.proposedCodingPolicy;
  }
  if (section === "task" && taskId) {
    const kept = current.codingRiskAssessments.filter(
      (item) => locked(item) || item.taskId !== taskId,
    );
    const replacement = incoming.codingRiskAssessments.find((item) => item.taskId === taskId);
    next.codingRiskAssessments = replacement
      ? [...kept.filter((item) => item.taskId !== taskId), replacement]
      : kept;
  }
  return next;
}

export function acceptAllGovernance(payload: StoredGovernance): StoredGovernance {
  const accept = <T extends Reviewable>(items: T[]) =>
    items.map((item) =>
      item.reviewStatus === "REJECTED" ? item : { ...item, reviewStatus: "ACCEPTED" as const },
    );
  return {
    ...payload,
    findings: accept(payload.findings),
    threats: accept(payload.threats),
    codingRiskAssessments: accept(payload.codingRiskAssessments),
    governanceQuestions: accept(payload.governanceQuestions),
    evidence: accept(payload.evidence),
  };
}

export function setGovernanceReviewStatus(
  payload: StoredGovernance,
  section: "findings" | "threats" | "codingRiskAssessments" | "governanceQuestions" | "evidence",
  tempId: string,
  status: "ACCEPTED" | "REJECTED",
): StoredGovernance {
  const items = payload[section].map((item) => {
    const id = "tempId" in item ? item.tempId : item.taskId;
    if (id !== tempId) return item;
    return { ...item, reviewStatus: status };
  });
  return { ...payload, [section]: items };
}
