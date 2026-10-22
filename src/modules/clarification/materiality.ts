export const CLARIFICATION_KINDS = ["INTAKE", "REQUIREMENT", "ARCHITECTURE", "GOVERNANCE", "RELEASE"] as const;

export type ClarificationKindName = (typeof CLARIFICATION_KINDS)[number];

export const CLARIFICATION_REVIEW_PREFIX = "CLARIFICATION REVIEW.";

export const CLARIFICATION_REVIEW_REASON =
  "CLARIFICATION REVIEW. A clarification answer changed after this was saved. This version was not rewritten.";

export type ClarificationReviewTarget =
  | "BRIEF"
  | "DEFINITION"
  | "DESIGN"
  | "DELIVERY"
  | "GOVERNANCE"
  | "PLAN"
  | "RELEASE";

export type AnswerMateriality = "NON_MATERIAL" | "POTENTIALLY_MATERIAL";

export type AnswerDisplay = "UNANSWERED" | "ANSWERED" | "ANSWER_UPDATED";

const TARGET_ORDER: ClarificationReviewTarget[] = [
  "BRIEF",
  "DEFINITION",
  "DESIGN",
  "DELIVERY",
  "GOVERNANCE",
  "PLAN",
  "RELEASE",
];

const DOWNSTREAM: Record<ClarificationKindName, ClarificationReviewTarget[]> = {
  INTAKE: ["BRIEF", "DEFINITION", "DESIGN", "DELIVERY", "GOVERNANCE", "PLAN"],
  REQUIREMENT: ["DEFINITION", "DESIGN", "DELIVERY", "GOVERNANCE", "PLAN"],
  ARCHITECTURE: ["DESIGN", "DELIVERY", "GOVERNANCE", "PLAN"],
  GOVERNANCE: ["GOVERNANCE", "PLAN"],
  RELEASE: ["RELEASE"],
};

export function normaliseAnswer(value: string) {
  return value
    .toLowerCase()
    .replace(/[.,;:!?'"()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function answerMateriality(previous: string, next: string): AnswerMateriality {
  if (normaliseAnswer(previous) === normaliseAnswer(next)) return "NON_MATERIAL";
  return "POTENTIALLY_MATERIAL";
}

export function answerDisplay(input: { answer: string; revisions: number }): AnswerDisplay {
  if (!input.answer.trim()) return "UNANSWERED";
  if (input.revisions > 1) return "ANSWER_UPDATED";
  return "ANSWERED";
}

export function isClarificationReview(reason: string) {
  return reason.includes(CLARIFICATION_REVIEW_PREFIX);
}

export type ClarificationImpact = {
  target: ClarificationReviewTarget;
  label: string;
};

export type ImpactArtefact = {
  id: string;
  label: string;
  updatedAt: Date;
  direct?: boolean;
};

export function clarificationImpacts(input: {
  kind: ClarificationKindName;
  answeredAt: Date;
  brief?: ImpactArtefact | null;
  definition?: ImpactArtefact | null;
  designs?: ImpactArtefact[];
  deliveryPlans?: ImpactArtefact[];
  reviews?: ImpactArtefact[];
  executionPlans?: ImpactArtefact[];
  releases?: ImpactArtefact[];
}): ClarificationImpact[] {
  const allowed = new Set(DOWNSTREAM[input.kind]);
  const grouped: Record<ClarificationReviewTarget, ImpactArtefact[]> = {
    BRIEF: input.brief ? [input.brief] : [],
    DEFINITION: input.definition ? [input.definition] : [],
    DESIGN: input.designs ?? [],
    DELIVERY: input.deliveryPlans ?? [],
    GOVERNANCE: input.reviews ?? [],
    PLAN: input.executionPlans ?? [],
    RELEASE: input.releases ?? [],
  };
  const impacts: ClarificationImpact[] = [];
  for (const target of TARGET_ORDER) {
    if (!allowed.has(target)) continue;
    for (const artefact of grouped[target]) {
      const used = artefact.direct || artefact.updatedAt.getTime() >= input.answeredAt.getTime();
      if (!used) continue;
      impacts.push({ target, label: artefact.label });
    }
  }
  return impacts;
}

export type ClarificationNextReview = {
  target: ClarificationReviewTarget;
  key:
    | "review-brief"
    | "review-definition"
    | "review-design"
    | "review-plan"
    | "review-open-findings"
    | "revise-execution-plan"
    | "review-release";
  label: string;
  why: string;
};

const NEXT: Record<ClarificationReviewTarget, Omit<ClarificationNextReview, "target">> = {
  BRIEF: {
    key: "review-brief",
    label: "Review Product Brief",
    why: "A clarification answer changed after the Product Brief was saved. The brief was not rewritten.",
  },
  DEFINITION: {
    key: "review-definition",
    label: "Review Product Definition",
    why: "A clarification answer changed after the Product Definition was saved. The approved version was not rewritten.",
  },
  DESIGN: {
    key: "review-design",
    label: "Review Impacted Design",
    why: "A clarification answer changed after the design was saved. The approved design was not rewritten.",
  },
  DELIVERY: {
    key: "review-plan",
    label: "Review Delivery Plan",
    why: "A clarification answer changed after the delivery plan was saved. The approved plan was not rewritten.",
  },
  GOVERNANCE: {
    key: "review-open-findings",
    label: "Review Governance",
    why: "A clarification answer changed after the engineering review was saved. The approved review was not rewritten.",
  },
  PLAN: {
    key: "revise-execution-plan",
    label: "Revise Execution Plan",
    why: "A clarification answer changed after the execution plan was approved. Coding cannot continue on that plan until it is reviewed.",
  },
  RELEASE: {
    key: "review-release",
    label: "Review Release",
    why: "A clarification answer changed after the release candidate was saved. The release was not changed.",
  },
};

export function earliestClarificationReview(
  flags: Partial<Record<ClarificationReviewTarget, boolean>>,
): ClarificationNextReview | null {
  const target = TARGET_ORDER.find((item) => flags[item]);
  if (!target) return null;
  return { target, ...NEXT[target] };
}
