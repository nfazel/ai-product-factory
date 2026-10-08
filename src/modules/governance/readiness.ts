import type { FindingCategoryName, SignalLevel } from "@/domain/constants";
import { GOVERNANCE_READINESS_AREAS } from "@/domain/constants";

export type GovernanceReadinessInput = {
  securityAssessment: string;
  privacyAssessment: string;
  engineeringAssessment: string;
  implementationPlanAssessment: string;
  findings: { category: FindingCategoryName; severity: string; status: string }[];
  questions: { status: string; blocking: boolean }[];
  taskCount: number;
  assessedTaskCount: number;
  unresolvedProhibited: number;
};

export type GovernanceReadiness = {
  summary: string;
  sufficient: number;
  areas: {
    key: string;
    label: string;
    level: SignalLevel;
    explanation: string;
  }[];
};

function openIn(
  findings: GovernanceReadinessInput["findings"],
  categories: FindingCategoryName[],
) {
  return findings.filter(
    (finding) => categories.includes(finding.category) && finding.status === "OPEN",
  );
}

function reviewedLevel(
  assessment: string,
  openFindings: number,
): { level: SignalLevel; explanation: string } {
  const reviewed = assessment.trim().length > 40;
  if (reviewed && openFindings === 0) {
    return {
      level: "HIGH",
      explanation: "This area was reviewed and no finding is still open.",
    };
  }
  if (reviewed || openFindings > 0) {
    return {
      level: "MEDIUM",
      explanation:
        openFindings > 0
          ? "The review covers this area, and at least one finding is still open."
          : "The written assessment is too thin to treat this area as understood.",
    };
  }
  return {
    level: "LOW",
    explanation: "This area has no written assessment and no findings yet.",
  };
}

export function assessGovernanceReadiness(input: GovernanceReadinessInput): GovernanceReadiness {
  const security = reviewedLevel(input.securityAssessment, openIn(input.findings, ["SECURITY", "INTEGRATION", "COMPLIANCE", "DEPENDENCY"]).length);
  const privacy = reviewedLevel(input.privacyAssessment, openIn(input.findings, ["PRIVACY"]).length);
  const architecture = reviewedLevel(input.engineeringAssessment, openIn(input.findings, ["ARCHITECTURE", "MAINTAINABILITY"]).length);
  const reliability = reviewedLevel(input.engineeringAssessment, openIn(input.findings, ["RELIABILITY"]).length);
  const observability = reviewedLevel(input.engineeringAssessment, openIn(input.findings, ["OBSERVABILITY", "OPERABILITY"]).length);
  const data = reviewedLevel(
    input.privacyAssessment.length > 40 || input.engineeringAssessment.length > 40
      ? input.privacyAssessment || input.engineeringAssessment
      : "",
    openIn(input.findings, ["DATA"]).length,
  );
  const plan = reviewedLevel(input.implementationPlanAssessment, openIn(input.findings, ["DELIVERY"]).length);
  const testability = reviewedLevel(input.implementationPlanAssessment, openIn(input.findings, ["TESTABILITY"]).length);

  const coding =
    input.taskCount > 0 && input.assessedTaskCount === input.taskCount && input.unresolvedProhibited === 0
      ? {
          level: "HIGH" as const,
          explanation: "Every implementation task has a coding-risk recommendation, and no prohibited task is unresolved.",
        }
      : input.assessedTaskCount > 0
        ? {
            level: "MEDIUM" as const,
            explanation:
              input.unresolvedProhibited > 0
                ? "A prohibited task still needs a human resolution."
                : "Some implementation tasks do not have a coding-risk recommendation yet.",
          }
        : {
            level: "LOW" as const,
            explanation: "No implementation task has a coding-risk recommendation.",
          };

  const openQuestions = input.questions.filter((question) => question.status === "OPEN");
  const blocking = openQuestions.filter((question) => question.blocking);
  const questions =
    openQuestions.length === 0
      ? {
          level: "HIGH" as const,
          explanation: "No governance question is open.",
        }
      : blocking.length === 0
        ? {
            level: "MEDIUM" as const,
            explanation: "An open question remains. It is not marked as blocking coding.",
          }
        : {
            level: "LOW" as const,
            explanation: "A blocking governance question is still open.",
          };

  const byKey: Record<string, { level: SignalLevel; explanation: string }> = {
    security,
    privacy,
    architectureQuality: architecture,
    reliability,
    observability,
    dataProtection: data,
    planQuality: plan,
    testability,
    codingSuitability: coding,
    openQuestions: questions,
  };

  const areas = GOVERNANCE_READINESS_AREAS.map((area) => ({
    key: area.key,
    label: area.label,
    level: byKey[area.key].level,
    explanation: byKey[area.key].explanation,
  }));
  const sufficient = areas.filter((area) => area.level === "HIGH").length;
  return {
    sufficient,
    summary: `${sufficient} of ${GOVERNANCE_READINESS_AREAS.length} areas sufficiently understood.`,
    areas,
  };
}
