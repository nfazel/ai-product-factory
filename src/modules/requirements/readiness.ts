import type { ReadinessAreaKey, SignalLevel } from "@/domain/constants";

const VAGUE_CRITERION =
  /\b(works correctly|should work|as expected|user[- ]friendly|tbd|todo|properly|appropriately|and so on)\b/i;

const OBSERVABLE =
  /\b(given|when|then|displays?|creates?|shows?|rejects?|confirms?|saves?|prevents?|allows?|receives?|returns?|records?|sends?|notifies?|validates?|required|must)\b/i;

const TECHNICAL_STORY =
  /\b(as a developer|database table|rest api|graphql|react component|postgresql)\b/i;

export type StoryReadinessInput = {
  title: string;
  description: string;
  persona: string;
  userNeed: string;
  userValue: string;
  priorityAssigned: boolean;
  dependenciesIdentified: boolean;
  dependencyCount: number;
  assumptionsNoted: boolean;
  criteria: string[];
  highImpactOpenQuestions: number;
  traced: boolean;
};

export type StoryReadiness = {
  ready: boolean;
  reasons: string[];
};

export function isTestableCriterion(text: string) {
  const value = text.trim();
  if (value.length < 24) return false;
  if (VAGUE_CRITERION.test(value)) return false;
  return OBSERVABLE.test(value);
}

export function hasUserValueStatement(story: {
  title: string;
  description: string;
  persona: string;
  userNeed: string;
  userValue: string;
}) {
  const combined = `${story.persona} ${story.userNeed} ${story.title} ${story.description}`;
  if (TECHNICAL_STORY.test(combined)) return false;
  if (story.persona.trim() && story.userNeed.trim() && story.userValue.trim()) {
    return true;
  }
  return /as an?\s+.+\bi want\b.+\bso that\b/i.test(
    `${story.title} ${story.description}`,
  );
}

export function assessStoryReadiness(story: StoryReadinessInput): StoryReadiness {
  const reasons: string[] = [];
  if (!hasUserValueStatement(story)) {
    reasons.push("The story does not state who it is for, what they need, and why it matters.");
  }
  if (story.criteria.length === 0) {
    reasons.push("Acceptance criteria are missing.");
  } else if (story.criteria.some((criterion) => !isTestableCriterion(criterion))) {
    reasons.push("At least one acceptance criterion is too vague to test.");
  }
  if (!story.dependenciesIdentified && story.dependencyCount === 0) {
    reasons.push("Dependencies have not been identified. Record them, or record that there are none.");
  }
  if (story.highImpactOpenQuestions > 0) {
    reasons.push("A high-impact question is still open.");
  }
  if (!story.assumptionsNoted) {
    reasons.push("High-impact assumptions are not marked as visible on this story.");
  }
  if (!story.traced) {
    reasons.push("Traceability back to a feature, epic, capability, outcome, and product brief is incomplete.");
  }
  if (!story.priorityAssigned) {
    reasons.push("Priority has not been explicitly assigned.");
  }
  return { ready: reasons.length === 0, reasons };
}

export type ReadinessInput = {
  outcomes: { id: string; status: string; successMeasure: string }[];
  capabilities: { outcomeId: string; status: string }[];
  inScopeCount: number;
  outOfScopeCount: number;
  stories: {
    userValue: boolean;
    criteriaCount: number;
    testable: boolean;
    dependenciesIdentified: boolean;
  }[];
  openQuestionCount: number;
  highImpactOpenQuestions: number;
  assumptionCount: number;
  highUnvalidatedAssumptions: number;
  confirmedNfrs: number;
  proposedNfrs: number;
  sliceStatus: string | null;
  sliceStoryCount: number;
};

export type ReadinessArea = {
  key: ReadinessAreaKey;
  label: string;
  level: SignalLevel;
  reason: string;
};

export type ReadinessReport = {
  areas: ReadinessArea[];
  sufficient: number;
  total: number;
  summary: string;
};

function area(
  key: ReadinessAreaKey,
  label: string,
  level: SignalLevel,
  reason: string,
): ReadinessArea {
  return { key, label, level, reason };
}

export function assessRequirementsReadiness(input: ReadinessInput): ReadinessReport {
  const confirmedOutcomes = input.outcomes.filter(
    (outcome) => outcome.status === "CONFIRMED" && outcome.successMeasure.trim(),
  );
  const measured = input.outcomes.filter((outcome) => outcome.successMeasure.trim());
  const outcomeClarity = area(
    "outcomeClarity",
    "Outcome clarity",
    confirmedOutcomes.length > 0 ? "HIGH" : measured.length > 0 ? "MEDIUM" : "LOW",
    confirmedOutcomes.length > 0
      ? "At least one outcome is confirmed and has a success measure."
      : measured.length > 0
        ? "Outcomes describe a result, but a person has not confirmed them yet."
        : "No outcome yet describes a result and how it would be recognised.",
  );

  const covered = confirmedOutcomes.every((outcome) =>
    input.capabilities.some(
      (capability) =>
        capability.outcomeId === outcome.id && capability.status === "CONFIRMED",
    ),
  );
  const capabilityCoverage = area(
    "capabilityCoverage",
    "Capability coverage",
    input.capabilities.length === 0
      ? "LOW"
      : confirmedOutcomes.length > 0 && covered
        ? "HIGH"
        : "MEDIUM",
    input.capabilities.length === 0
      ? "No capability describes what the product must enable."
      : confirmedOutcomes.length > 0 && covered
        ? "Each confirmed outcome has a confirmed capability."
        : "Capabilities exist, but they are not yet confirmed against every confirmed outcome.",
  );

  const scopeClarity = area(
    "scopeClarity",
    "Scope clarity",
    input.inScopeCount > 0 && input.outOfScopeCount > 0
      ? "HIGH"
      : input.inScopeCount > 0 || input.outOfScopeCount > 0
        ? "MEDIUM"
        : "LOW",
    input.inScopeCount > 0 && input.outOfScopeCount > 0
      ? "The approved brief says what is in scope and what is out."
      : input.inScopeCount > 0 || input.outOfScopeCount > 0
        ? "Scope is only half stated. In scope and out of scope both need to be explicit."
        : "The brief does not yet separate in-scope work from out-of-scope work.",
  );

  const goodStories = input.stories.filter((story) => story.userValue).length;
  const storyQuality = area(
    "storyQuality",
    "Story quality",
    input.stories.length === 0
      ? "LOW"
      : goodStories === input.stories.length
        ? "HIGH"
        : goodStories > 0
          ? "MEDIUM"
          : "LOW",
    input.stories.length === 0
      ? "No user-valued stories have been written for the first slice."
      : goodStories === input.stories.length
        ? "Each story says who it helps and why."
        : "Some stories are missing a user, a need, or a reason, or they describe technical work.",
  );

  const withCriteria = input.stories.filter((story) => story.criteriaCount > 0);
  const testable = input.stories.filter((story) => story.criteriaCount > 0 && story.testable);
  const acceptanceQuality = area(
    "acceptanceQuality",
    "Acceptance criteria quality",
    input.stories.length === 0 || withCriteria.length === 0
      ? "LOW"
      : testable.length === input.stories.length
        ? "HIGH"
        : "MEDIUM",
    input.stories.length === 0 || withCriteria.length === 0
      ? "Stories do not yet have acceptance criteria."
      : testable.length === input.stories.length
        ? "Every story has acceptance criteria that describe observable behaviour."
        : "Some acceptance criteria are missing or too vague to test.",
  );

  const depsKnown = input.stories.filter((story) => story.dependenciesIdentified).length;
  const dependencies = area(
    "dependencies",
    "Dependencies",
    input.stories.length === 0
      ? "LOW"
      : depsKnown === input.stories.length
        ? "HIGH"
        : depsKnown > 0
          ? "MEDIUM"
          : "LOW",
    input.stories.length === 0
      ? "There are no stories whose dependencies can be checked."
      : depsKnown === input.stories.length
        ? "Each story records its dependencies, including when there are none."
        : "Some stories do not say what they depend on.",
  );

  const openQuestions = area(
    "openQuestions",
    "Open questions",
    input.highImpactOpenQuestions > 0
      ? "LOW"
      : input.openQuestionCount > 0
        ? "MEDIUM"
        : "HIGH",
    input.highImpactOpenQuestions > 0
      ? "A high-impact question is still unanswered, so related stories stay not ready."
      : input.openQuestionCount > 0
        ? "Open questions remain, and none of them are high impact."
        : "No requirement questions are still open.",
  );

  const assumptions = area(
    "assumptions",
    "Assumptions",
    input.assumptionCount === 0
      ? "LOW"
      : input.highUnvalidatedAssumptions > 0
        ? "MEDIUM"
        : "HIGH",
    input.assumptionCount === 0
      ? "No assumptions are recorded, so uncertainty is invisible."
      : input.highUnvalidatedAssumptions > 0
        ? "High-impact assumptions are visible and still unvalidated. They have not been turned into requirements."
        : "Assumptions are recorded, and no high-impact assumption is still unvalidated.",
  );

  const nonFunctional = area(
    "nonFunctional",
    "Non-functional requirements",
    input.confirmedNfrs > 0 ? "HIGH" : input.proposedNfrs > 0 ? "MEDIUM" : "LOW",
    input.confirmedNfrs > 0
      ? "At least one non-functional requirement is confirmed."
      : input.proposedNfrs > 0
        ? "Non-functional requirements are proposed. Numeric targets still need a person where the brief does not already state them."
        : "No non-functional requirements have been recorded.",
  );

  const firstSlice = area(
    "firstSlice",
    "First-slice coherence",
    input.sliceStatus === "APPROVED" && input.sliceStoryCount > 0
      ? "HIGH"
      : input.sliceStatus && input.sliceStoryCount > 0
        ? "MEDIUM"
        : "LOW",
    input.sliceStatus === "APPROVED" && input.sliceStoryCount > 0
      ? "An approved first slice contains at least one story a person can demonstrate."
      : input.sliceStatus && input.sliceStoryCount > 0
        ? "A first slice is described and contains stories, and a person has not approved it yet."
        : "The smallest end-to-end slice is not yet tied to a story.",
  );

  const areas = [
    outcomeClarity,
    capabilityCoverage,
    scopeClarity,
    storyQuality,
    acceptanceQuality,
    dependencies,
    openQuestions,
    assumptions,
    nonFunctional,
    firstSlice,
  ];
  const sufficient = areas.filter((item) => item.level !== "LOW").length;
  return {
    areas,
    sufficient,
    total: areas.length,
    summary: `${sufficient} of ${areas.length} areas sufficiently understood.`,
  };
}
