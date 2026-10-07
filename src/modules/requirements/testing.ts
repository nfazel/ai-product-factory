import type { RequirementsResponse } from "@/modules/requirements/schema";

export function requirementsFixture(
  overrides: Partial<RequirementsResponse> = {},
): RequirementsResponse {
  const base: RequirementsResponse = {
    assistantSummary:
      "A customer can submit a straightforward claim and receive a reference. Everything else waits.",
    proposedOutcomes: [
      {
        tempId: "outcome-1",
        title: "Reduce the effort to open a straightforward claim",
        description: "A policyholder finishes first notice without calling the contact centre.",
        successMeasure: "Share of straightforward notices completed without handler assistance.",
        targetValue: "",
      },
    ],
    proposedCapabilities: [
      {
        tempId: "capability-1",
        outcomeTempId: "outcome-1",
        name: "Digital Claim Submission",
        description: "Lets a customer submit the mandatory notice details and receive a reference.",
        priority: "HIGH",
      },
    ],
    proposedEpics: [
      {
        tempId: "epic-1",
        capabilityTempId: "capability-1",
        title: "Digital claims experience",
        description: "The first digital path from notice to a handler queue.",
        priority: "HIGH",
      },
    ],
    proposedFeatures: [
      {
        tempId: "feature-1",
        epicTempId: "epic-1",
        title: "Create claim",
        description: "Capture the mandatory notice and confirm it was received.",
        priority: "HIGH",
        inFirstSlice: true,
      },
    ],
    proposedStories: [
      {
        tempId: "story-1",
        featureTempId: "feature-1",
        title: "As a policyholder I want to submit a claim online so that I can start without calling.",
        description: "The customer enters the mandatory details and receives a claim reference.",
        persona: "policyholder",
        need: "submit a claim online",
        value: "start the claim without calling the contact centre",
        priority: "HIGH",
        inFirstSlice: true,
      },
    ],
    proposedAcceptanceCriteria: [
      {
        tempId: "ac-1",
        storyTempId: "story-1",
        description:
          "GIVEN a customer has entered all mandatory claim information WHEN they submit the claim THEN the system creates the claim AND displays a unique claim reference AND confirms successful submission.",
      },
    ],
    proposedNFRs: [
      {
        tempId: "nfr-1",
        category: "USABILITY",
        title: "A customer can tell that submission succeeded",
        description: "The confirmation state is visible without a phone call.",
        measure: "Target response-time requirement needs confirmation.",
      },
    ],
    proposedFirstSlice: {
      tempId: "slice-1",
      name: "Submit a simple claim and receive confirmation",
      description: "A customer submits a straightforward claim and sees a reference.",
      rationale: "It serves a real user, tests the digital-notice assumption, and can be demonstrated end to end.",
    },
    assumptions: [
      {
        tempId: "assumption-1",
        description: "Customers will finish first notice online without calling.",
        impact: "HIGH",
        confidence: "LOW",
        storyTempId: "story-1",
      },
    ],
    dependencies: [],
    openQuestions: [
      {
        tempId: "question-1",
        storyTempId: "",
        question: "Which claim types must stay with the call centre?",
        reason: "The brief names complex injury as out of scope and the boundary may still move.",
        impact: "MEDIUM",
      },
    ],
    readinessAssessment: {
      summary: "The first slice is coherent. The adoption assumption is still unvalidated.",
      notes: ["Do not treat the unvalidated adoption assumption as a requirement."],
    },
  };
  return { ...base, ...overrides };
}
