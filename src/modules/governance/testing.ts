import type { GovernanceResponse } from "@/modules/governance/schema";

const assessment =
  "The first slice is a single customer journey. Controls stay inside that journey and do not add a new platform.";

export function governanceFixture(refs: {
  componentId: string;
  adrId: string;
  taskIds: string[];
  nfrId: string;
  workItemId: string;
}): GovernanceResponse {
  return {
    assistantSummary:
      "The slice can proceed with actions on input validation and logging. This recommendation does not approve coding.",
    overallAssessment: "PASS_WITH_ACTIONS",
    securityAssessment: `${assessment} The API must scope each claim to the caller and validate uploaded files.`,
    privacyAssessment: `${assessment} Personal data in a claim notice needs a confirmed retention rule. GDPR applicability requires confirmation.`,
    engineeringAssessment: `${assessment} A modular monolith is enough. Failure of notification must not lose the claim reference.`,
    implementationPlanAssessment: `${assessment} The tasks follow the customer journey. They are not split into backend, middleware, UI, then QA.`,
    dependencyReview: `${assessment} AI REVIEW only. No scanner has verified these dependencies.`,
    findings: [
      {
        tempId: "finding-1",
        category: "SECURITY",
        severity: "MEDIUM",
        title: "Uploaded claim evidence requires file-type and size validation.",
        description: "The API can receive a file, and the plan does not name a type or size check.",
        evidence: "The claims API is the trust boundary for the notice.",
        recommendation: "Reject unexpected types and oversized files before storage.",
        dueBeforeCoding: false,
        owner: "Claims API",
        componentId: refs.componentId,
        adrId: refs.adrId,
        taskId: refs.taskIds[0] ?? "",
        nfrId: refs.nfrId,
        workItemId: refs.workItemId,
        assumptionId: "",
      },
    ],
    threats: [
      {
        tempId: "threat-1",
        title: "Unauthorised access to another customer's claim",
        description: "A reused claim reference could expose another notice.",
        affectedComponentId: refs.componentId,
        attackSurface: "Claims API",
        likelihood: "MEDIUM",
        impact: "HIGH",
        mitigation: "Scope every request to the authenticated customer.",
      },
    ],
    codingRiskAssessments: refs.taskIds.map((taskId, index) => ({
      taskId,
      riskLevel: index === 0 ? "MEDIUM" : "LOW",
      reason:
        index === 0
          ? "This task writes customer data and should be supervised."
          : "This task is a small check with a clear acceptance criterion.",
      recommendedExecutionMode: index === 0 ? "SUPERVISED" : "AUTONOMOUS",
      requiredHumanReview: index === 0,
    })),
    proposedCodingPolicy: {
      allowedPaths: ["src/claims/**"],
      restrictedPaths: ["prisma/migrations/**"],
      prohibitedActions: [
        "Modify production credentials",
        "Disable security controls",
        "Force push",
        "Merge own pull request",
        "Delete production data",
        "Commit secrets",
        "Bypass failing tests",
      ],
      requiredChecks: ["typecheck", "unit tests"],
      maxFilesPerTask: 8,
      requireTests: true,
      requireHumanReview: true,
    },
    governanceQuestions: [
      {
        tempId: "question-1",
        question: "What retention policy applies to uploaded documents?",
        reason: "Retention is not stated.",
        impact: "MEDIUM",
        topic: "PRIVACY",
        blocking: false,
      },
    ],
    evidence: [
      {
        tempId: "evidence-1",
        findingTempId: "finding-1",
        type: "AI_ANALYSIS",
        source: "AI_REVIEW",
        description: "The finding is based on the approved API boundary.",
        result: "AI REVIEW",
      },
    ],
    readinessNote: "Readiness is computed by the application, not copied from this note.",
  };
}
