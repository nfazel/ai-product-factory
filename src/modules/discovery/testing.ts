import type { DiscoveryResponse } from "@/modules/discovery/schema";

const emptyUpdates: DiscoveryResponse["briefUpdates"] = {
  problemStatement: "",
  productVision: "",
  targetUsers: [],
  userNeeds: [],
  desiredOutcomes: [],
  valueProposition: "",
  assumptions: [],
  constraints: [],
  risks: [],
  openQuestions: [],
  inScope: [],
  outOfScope: [],
  successMeasures: [],
};

export function discoveryFixture(
  overrides: Partial<DiscoveryResponse> = {},
): DiscoveryResponse {
  const baseUpdates: DiscoveryResponse["briefUpdates"] = {
    ...emptyUpdates,
    problemStatement:
      "Handlers rebuild each claim from email, phone notes, and a separate policy system.",
    targetUsers: ["Claims handlers"],
    assumptions: [
      {
        description: "Customers will file online without help.",
        impact: "HIGH",
        confidence: "LOW",
      },
    ],
    risks: ["Handlers may ignore a customer-submitted notice."],
    successMeasures: ["70% of new notices are completed without assistance."],
  };
  const baseAssessment: DiscoveryResponse["discoveryAssessment"] = {
    problemClarity: "MEDIUM",
    userClarity: "LOW",
    outcomeClarity: "LOW",
    scopeClarity: "LOW",
    riskClarity: "LOW",
    readyForReview: false,
    reason: "The problem is partly understood and the users are not.",
  };

  return {
    assistantMessage:
      "The problem is only partly understood, so I am not proposing a solution yet.",
    questions: ["Who feels this problem first?"],
    assumptionsIdentified: [],
    risksIdentified: [],
    ...overrides,
    briefUpdates: {
      ...baseUpdates,
      ...overrides.briefUpdates,
    },
    discoveryAssessment: {
      ...baseAssessment,
      ...overrides.discoveryAssessment,
    },
  };
}
