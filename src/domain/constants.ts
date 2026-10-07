export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STAGES = [
  "EXPLORE",
  "DEFINE",
  "BUILD",
  "PROVE",
  "SHIP",
  "LEARN",
] as const;
export type ProductStage = (typeof PRODUCT_STAGES)[number];

export const WORK_ITEM_TYPES = [
  "EPIC",
  "FEATURE",
  "STORY",
  "TASK",
  "DEFECT",
] as const;
export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

export const WORK_ITEM_STATUSES = [
  "DRAFT",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "REVIEW",
  "DONE",
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ACCEPTANCE_STATUSES = ["PENDING", "PASSED", "FAILED"] as const;
export type AcceptanceStatus = (typeof ACCEPTANCE_STATUSES)[number];

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_TYPES = [
  "STAGE_GATE",
  "REQUIREMENTS",
  "ARCHITECTURE",
  "SECURITY",
  "RELEASE",
  "PRODUCT_DISCOVERY",
  "PRODUCT_DEFINITION",
] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const AGENT_RUN_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const ACTIVITY_TYPES = [
  "PRODUCT_CREATED",
  "PRODUCT_UPDATED",
  "WORK_ITEM_CREATED",
  "WORK_ITEM_UPDATED",
  "ACCEPTANCE_CRITERION_ADDED",
  "ACCEPTANCE_CRITERION_UPDATED",
  "APPROVAL_REQUESTED",
  "APPROVAL_APPROVED",
  "APPROVAL_REJECTED",
  "DECISION_RECORDED",
  "DEPENDENCY_ADDED",
  "DISCOVERY_STARTED",
  "DISCOVERY_BRIEF_UPDATED",
  "DISCOVERY_BRIEF_EDITED",
  "ASSUMPTION_UPDATED",
  "DISCOVERY_READY_FOR_REVIEW",
  "DISCOVERY_APPROVED",
  "AGENT_RUN_COMPLETED",
  "AGENT_RUN_FAILED",
  "DEFINITION_GENERATED",
  "DEFINITION_COMMITTED",
  "DEFINITION_READY_FOR_REVIEW",
  "DEFINITION_APPROVED",
  "OUTCOME_CONFIRMED",
  "CAPABILITY_UPDATED",
  "SLICE_APPROVED",
  "REQUIREMENT_UPDATED",
  "QUESTION_ANSWERED",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const AGENT_TYPES = [
  "PRODUCT_DISCOVERY",
  "REQUIREMENTS",
  "ARCHITECTURE",
  "SECURITY",
  "PLANNING",
  "CODING",
  "TESTING",
  "REVIEW",
] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const DISCOVERY_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
  "APPROVED",
] as const;
export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number];

export const DISCOVERY_MESSAGE_ROLES = ["USER", "ASSISTANT", "SYSTEM"] as const;
export type DiscoveryMessageRole = (typeof DISCOVERY_MESSAGE_ROLES)[number];

export const PRODUCT_BRIEF_STATUSES = [
  "DRAFT",
  "READY_FOR_REVIEW",
  "APPROVED",
  "SUPERSEDED",
] as const;
export type ProductBriefStatus = (typeof PRODUCT_BRIEF_STATUSES)[number];

export const SIGNAL_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type SignalLevel = (typeof SIGNAL_LEVELS)[number];

export const ASSUMPTION_STATUSES = [
  "UNVALIDATED",
  "VALIDATED",
  "INVALIDATED",
] as const;
export type AssumptionStatus = (typeof ASSUMPTION_STATUSES)[number];

export const ASSUMPTION_IMPACTS = ["LOW", "MEDIUM", "HIGH"] as const;
export type AssumptionImpact = (typeof ASSUMPTION_IMPACTS)[number];

export const BRIEF_ORIGINS = [
  "AI_PROPOSAL",
  "HUMAN_CONFIRMED",
  "UNRESOLVED",
] as const;
export type BriefOrigin = (typeof BRIEF_ORIGINS)[number];

export const BRIEF_SECTIONS = [
  "problemStatement",
  "productVision",
  "targetUsers",
  "userNeeds",
  "desiredOutcomes",
  "valueProposition",
  "inScope",
  "outOfScope",
  "constraints",
  "risks",
  "successMeasures",
  "openQuestions",
] as const;
export type BriefSection = (typeof BRIEF_SECTIONS)[number];

export const PROSE_BRIEF_SECTIONS = [
  "problemStatement",
  "productVision",
  "valueProposition",
] as const;
export type ProseBriefSection = (typeof PROSE_BRIEF_SECTIONS)[number];

export const LIST_BRIEF_SECTIONS = [
  "targetUsers",
  "userNeeds",
  "desiredOutcomes",
  "inScope",
  "outOfScope",
  "constraints",
  "risks",
  "successMeasures",
  "openQuestions",
] as const;
export type ListBriefSection = (typeof LIST_BRIEF_SECTIONS)[number];

export const STAGE_META: Record<
  ProductStage,
  { label: string; summary: string }
> = {
  EXPLORE: {
    label: "Explore",
    summary: "Discover the problem and who it affects.",
  },
  DEFINE: {
    label: "Define",
    summary: "Shape the outcome, scope, and acceptance.",
  },
  BUILD: {
    label: "Build",
    summary: "Implement the product against the backlog.",
  },
  PROVE: {
    label: "Prove",
    summary: "Test, review, and show the product holds.",
  },
  SHIP: {
    label: "Ship",
    summary: "Prepare and release with human approval.",
  },
  LEARN: {
    label: "Learn",
    summary: "Measure what happened and decide what is next.",
  },
};

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

export const WORK_ITEM_TYPE_LABEL: Record<WorkItemType, string> = {
  EPIC: "Epic",
  FEATURE: "Feature",
  STORY: "Story",
  TASK: "Task",
  DEFECT: "Defect",
};

export const WORK_ITEM_STATUS_LABEL: Record<WorkItemStatus, string> = {
  DRAFT: "Draft",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  REVIEW: "Review",
  DONE: "Done",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const ACCEPTANCE_STATUS_LABEL: Record<AcceptanceStatus, string> = {
  PENDING: "Pending",
  PASSED: "Passed",
  FAILED: "Failed",
};

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const APPROVAL_TYPE_LABEL: Record<ApprovalType, string> = {
  STAGE_GATE: "Stage gate",
  REQUIREMENTS: "Requirements",
  ARCHITECTURE: "Architecture",
  SECURITY: "Security",
  RELEASE: "Release",
  PRODUCT_DISCOVERY: "Product discovery",
  PRODUCT_DEFINITION: "Product definition",
};

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  PRODUCT_CREATED: "Product created",
  PRODUCT_UPDATED: "Product updated",
  WORK_ITEM_CREATED: "Work item created",
  WORK_ITEM_UPDATED: "Work item updated",
  ACCEPTANCE_CRITERION_ADDED: "Acceptance criterion added",
  ACCEPTANCE_CRITERION_UPDATED: "Acceptance criterion updated",
  APPROVAL_REQUESTED: "Approval requested",
  APPROVAL_APPROVED: "Approval approved",
  APPROVAL_REJECTED: "Approval rejected",
  DECISION_RECORDED: "Decision recorded",
  DEPENDENCY_ADDED: "Dependency added",
  DISCOVERY_STARTED: "Discovery started",
  DISCOVERY_BRIEF_UPDATED: "Discovery brief updated",
  DISCOVERY_BRIEF_EDITED: "Discovery brief edited",
  ASSUMPTION_UPDATED: "Assumption updated",
  DISCOVERY_READY_FOR_REVIEW: "Discovery ready for review",
  DISCOVERY_APPROVED: "Discovery approved",
  AGENT_RUN_COMPLETED: "Agent run completed",
  AGENT_RUN_FAILED: "Agent run failed",
  DEFINITION_GENERATED: "Definition generated",
  DEFINITION_COMMITTED: "Definition committed",
  DEFINITION_READY_FOR_REVIEW: "Definition ready for review",
  DEFINITION_APPROVED: "Definition approved",
  OUTCOME_CONFIRMED: "Outcome confirmed",
  CAPABILITY_UPDATED: "Capability updated",
  SLICE_APPROVED: "First slice approved",
  REQUIREMENT_UPDATED: "Requirement updated",
  QUESTION_ANSWERED: "Question answered",
};

export const DISCOVERY_STATUS_LABEL: Record<DiscoveryStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  READY_FOR_REVIEW: "Ready for review",
  APPROVED: "Approved",
};

export const PRODUCT_BRIEF_STATUS_LABEL: Record<ProductBriefStatus, string> = {
  DRAFT: "Draft",
  READY_FOR_REVIEW: "Ready for review",
  APPROVED: "Approved",
  SUPERSEDED: "Superseded",
};

export const SIGNAL_LEVEL_LABEL: Record<SignalLevel, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const ASSUMPTION_STATUS_LABEL: Record<AssumptionStatus, string> = {
  UNVALIDATED: "Unvalidated",
  VALIDATED: "Validated",
  INVALIDATED: "Invalidated",
};

export const OUTCOME_STATUSES = [
  "PROPOSED",
  "CONFIRMED",
  "ACHIEVED",
  "RETIRED",
] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export const CAPABILITY_STATUSES = ["PROPOSED", "CONFIRMED", "REJECTED"] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export const SLICE_STATUSES = [
  "PROPOSED",
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
] as const;
export type SliceStatus = (typeof SLICE_STATUSES)[number];

export const NFR_CATEGORIES = [
  "PERFORMANCE",
  "SECURITY",
  "PRIVACY",
  "ACCESSIBILITY",
  "AVAILABILITY",
  "SCALABILITY",
  "AUDITABILITY",
  "COMPLIANCE",
  "USABILITY",
  "OTHER",
] as const;
export type NfrCategory = (typeof NFR_CATEGORIES)[number];

export const REQUIREMENT_ITEM_STATUSES = [
  "PROPOSED",
  "CONFIRMED",
  "REJECTED",
] as const;
export type RequirementItemStatus = (typeof REQUIREMENT_ITEM_STATUSES)[number];

export const QUESTION_STATUSES = ["OPEN", "ANSWERED", "CLOSED"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const DEFINITION_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
  "APPROVED",
] as const;
export type DefinitionStatus = (typeof DEFINITION_STATUSES)[number];

export const PROPOSAL_STATUSES = [
  "OPEN",
  "PARTIALLY_COMMITTED",
  "COMMITTED",
  "REJECTED",
  "SUPERSEDED",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const WORK_ITEM_PROVENANCE = [
  "HUMAN_CREATED",
  "AI_PROPOSAL",
  "AI_ACCEPTED",
] as const;
export type WorkItemProvenance = (typeof WORK_ITEM_PROVENANCE)[number];

export const REQUIREMENT_ORIGINS = [
  "AI_PROPOSAL",
  "HUMAN_CONFIRMED",
  "HUMAN_CREATED",
] as const;
export type RequirementOrigin = (typeof REQUIREMENT_ORIGINS)[number];

export const DEFINITION_SECTIONS = [
  "outcomes",
  "capabilities",
  "epics",
  "features",
  "stories",
  "acceptanceCriteria",
  "nfrs",
  "firstSlice",
  "assumptions",
  "questions",
  "dependencies",
] as const;
export type DefinitionSection = (typeof DEFINITION_SECTIONS)[number];

export const REVIEW_STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const READINESS_AREAS = [
  { key: "outcomeClarity", label: "Outcome clarity" },
  { key: "capabilityCoverage", label: "Capability coverage" },
  { key: "scopeClarity", label: "Scope clarity" },
  { key: "storyQuality", label: "Story quality" },
  { key: "acceptanceQuality", label: "Acceptance criteria quality" },
  { key: "dependencies", label: "Dependencies" },
  { key: "openQuestions", label: "Open questions" },
  { key: "assumptions", label: "Assumptions" },
  { key: "nonFunctional", label: "Non-functional requirements" },
  { key: "firstSlice", label: "First-slice coherence" },
] as const;
export type ReadinessAreaKey = (typeof READINESS_AREAS)[number]["key"];

export const BRIEF_ORIGIN_LABEL: Record<BriefOrigin, string> = {
  AI_PROPOSAL: "Proposed",
  HUMAN_CONFIRMED: "Confirmed",
  UNRESOLVED: "Unresolved",
};

export const OUTCOME_STATUS_LABEL: Record<OutcomeStatus, string> = {
  PROPOSED: "Proposed",
  CONFIRMED: "Confirmed",
  ACHIEVED: "Achieved",
  RETIRED: "Retired",
};

export const CAPABILITY_STATUS_LABEL: Record<CapabilityStatus, string> = {
  PROPOSED: "Proposed",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
};

export const SLICE_STATUS_LABEL: Record<SliceStatus, string> = {
  PROPOSED: "Proposed",
  APPROVED: "Approved",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

export const NFR_CATEGORY_LABEL: Record<NfrCategory, string> = {
  PERFORMANCE: "Performance",
  SECURITY: "Security",
  PRIVACY: "Privacy",
  ACCESSIBILITY: "Accessibility",
  AVAILABILITY: "Availability",
  SCALABILITY: "Scalability",
  AUDITABILITY: "Auditability",
  COMPLIANCE: "Compliance",
  USABILITY: "Usability",
  OTHER: "Other",
};

export const REQUIREMENT_ITEM_STATUS_LABEL: Record<RequirementItemStatus, string> = {
  PROPOSED: "Proposed",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
};

export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  OPEN: "Open",
  ANSWERED: "Answered",
  CLOSED: "Closed",
};

export const DEFINITION_STATUS_LABEL: Record<DefinitionStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  READY_FOR_REVIEW: "Ready for review",
  APPROVED: "Approved",
};

export const PROVENANCE_LABEL: Record<WorkItemProvenance, string> = {
  HUMAN_CREATED: "Human created",
  AI_PROPOSAL: "AI proposed",
  AI_ACCEPTED: "AI generated, human accepted",
};

export const REQUIREMENT_ORIGIN_LABEL: Record<RequirementOrigin, string> = {
  AI_PROPOSAL: "AI proposed",
  HUMAN_CONFIRMED: "Human confirmed",
  HUMAN_CREATED: "Human created",
};

export const DEFINITION_SECTION_LABEL: Record<DefinitionSection, string> = {
  outcomes: "Outcomes",
  capabilities: "Capabilities",
  epics: "Epics",
  features: "Features",
  stories: "Stories",
  acceptanceCriteria: "Acceptance criteria",
  nfrs: "Non-functional requirements",
  firstSlice: "First product slice",
  assumptions: "Assumptions",
  questions: "Open questions",
  dependencies: "Dependencies",
};

export const BRIEF_SECTION_LABEL: Record<BriefSection, string> = {
  problemStatement: "Problem",
  productVision: "Vision",
  targetUsers: "Target users",
  userNeeds: "User needs",
  desiredOutcomes: "Desired outcomes",
  valueProposition: "Value proposition",
  inScope: "Scope",
  outOfScope: "Out of scope",
  constraints: "Constraints",
  risks: "Risks",
  successMeasures: "Success measures",
  openQuestions: "Open questions",
};

export const CLARITY_AREAS = [
  { key: "problemClarity", label: "Problem clarity" },
  { key: "userClarity", label: "User clarity" },
  { key: "outcomeClarity", label: "Outcome clarity" },
  { key: "scopeClarity", label: "Scope clarity" },
  { key: "riskClarity", label: "Risk clarity" },
] as const;

export const AGENT_CATALOG: Record<
  AgentType,
  { name: string; responsibility: string }
> = {
  PRODUCT_DISCOVERY: {
    name: "Product Discovery Agent",
    responsibility: "Explore problems, users, and opportunities.",
  },
  REQUIREMENTS: {
    name: "Requirements Agent",
    responsibility:
      "Turn an approved product brief into an outcome-driven, traceable product definition.",
  },
  ARCHITECTURE: {
    name: "Architecture Agent",
    responsibility: "Propose structure, boundaries, and technical options.",
  },
  SECURITY: {
    name: "Security Agent",
    responsibility: "Raise security concerns before work is approved.",
  },
  PLANNING: {
    name: "Planning Agent",
    responsibility: "Turn approved scope into a delivery plan.",
  },
  CODING: {
    name: "Coding Agent",
    responsibility: "Implement approved work under human review.",
  },
  TESTING: {
    name: "Testing Agent",
    responsibility: "Design and report tests against acceptance criteria.",
  },
  REVIEW: {
    name: "Review Agent",
    responsibility: "Review changes and surface risks before release.",
  },
};

/** Parents allowed for each work item type. Null means a parent is forbidden. */
export const ALLOWED_PARENTS: Record<WorkItemType, WorkItemType[] | null> = {
  EPIC: null,
  FEATURE: ["EPIC"],
  STORY: ["FEATURE"],
  TASK: ["STORY", "FEATURE", "EPIC"],
  DEFECT: ["STORY", "FEATURE", "EPIC", "TASK"],
};

export function stageState(
  stage: ProductStage,
  current: ProductStage,
): "completed" | "current" | "upcoming" {
  const currentIndex = PRODUCT_STAGES.indexOf(current);
  const index = PRODUCT_STAGES.indexOf(stage);
  if (index < currentIndex) return "completed";
  if (index === currentIndex) return "current";
  return "upcoming";
}

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}

export function isApprovalType(value: string): value is ApprovalType {
  return (APPROVAL_TYPES as readonly string[]).includes(value);
}
