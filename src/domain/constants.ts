export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_START_MODES = ["IDEA", "EXISTING_REQUIREMENTS"] as const;
export type ProductStartMode = (typeof PRODUCT_START_MODES)[number];

export const PRODUCT_START_LABEL: Record<ProductStartMode, string> = {
  IDEA: "Idea",
  EXISTING_REQUIREMENTS: "Existing requirements",
};

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
  "SOLUTION_ARCHITECTURE",
  "IMPLEMENTATION_PLAN",
  "ENGINEERING_GOVERNANCE",
  "CODING_POLICY",
  "CODE_CHANGE",
  "VERIFICATION",
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
  "ARCHITECTURE_GENERATED",
  "ARCHITECTURE_COMMITTED",
  "ARCHITECTURE_READY_FOR_REVIEW",
  "ARCHITECTURE_APPROVED",
  "PLAN_GENERATED",
  "PLAN_COMMITTED",
  "PLAN_APPROVED",
  "ARCHITECTURE_REVIEW_REQUIRED",
  "PLAN_REVIEW_REQUIRED",
  "ADR_UPDATED",
  "CODEBASE_CONTEXT_UPDATED",
  "ARCHITECTURE_QUESTION_ANSWERED",
  "GOVERNANCE_GENERATED",
  "GOVERNANCE_COMMITTED",
  "GOVERNANCE_READY_FOR_REVIEW",
  "GOVERNANCE_APPROVED",
  "GOVERNANCE_REVIEW_REQUIRED",
  "FINDING_UPDATED",
  "CODING_RISK_OVERRIDDEN",
  "CODING_POLICY_UPDATED",
  "CODING_POLICY_APPROVED",
  "CODING_POLICY_REAPPROVAL_REQUIRED",
  "GOVERNANCE_QUESTION_ANSWERED",
  "CODING_WORKSPACE_CREATED",
  "CODING_EXECUTION_STARTED",
  "CODING_FILE_READ",
  "CODING_FILE_MODIFIED",
  "CODING_FILE_CREATED",
  "CODING_FILE_DELETED",
  "CODING_COMMAND_EXECUTED",
  "CODING_POLICY_DENIED",
  "CODING_ESCALATION_CREATED",
  "CODING_CHECKS_COMPLETED",
  "CODING_READY_FOR_REVIEW",
  "CODING_CHANGES_REQUESTED",
  "CODING_APPROVED",
  "CODING_COMMIT_CREATED",
  "CODING_WORKSPACE_ABANDONED",
  "CODING_CONTRACT_STALE",
  "CODING_TASK_APPROVED",
  "CODING_PLAN_APPROVED",
  "VERIFICATION_STARTED",
  "VERIFICATION_COMMAND_EXECUTED",
  "VERIFICATION_FILE_READ",
  "VERIFICATION_TEST_CREATED",
  "VERIFICATION_POLICY_DENIED",
  "VERIFICATION_APPROVED",
  "VERIFICATION_CHANGES_REQUESTED",
  "VERIFICATION_REJECTED",
  "VERIFICATION_MANUAL_RESULT",
  "VERIFICATION_DEFECT_CREATED",
  "VERIFICATION_STALE",
  "GITHUB_CONNECTED",
  "BRANCH_PUBLISHED",
  "PULL_REQUEST_CREATED",
  "PULL_REQUEST_REFRESHED",
  "CI_CHANGED",
  "REVIEW_RECEIVED",
  "CHANGES_REQUESTED",
  "REVISION_INITIATED",
  "BRANCH_UPDATED",
  "PULL_REQUEST_READY",
  "PULL_REQUEST_MERGED",
  "RELEASE_CANDIDATE_CREATED",
  "RELEASE_EVIDENCE_ADDED",
  "RELEASE_RISK_IDENTIFIED",
  "RELEASE_RISK_ACCEPTED",
  "DEPLOYMENT_PLAN_CREATED",
  "DEPLOYMENT_PLAN_APPROVED",
  "RELEASE_APPROVED",
  "RELEASE_APPROVAL_STALE",
  "DEPLOYMENT_STARTED",
  "DEPLOYMENT_SUCCEEDED",
  "DEPLOYMENT_FAILED",
  "ROLLBACK_RECORDED",
  "POST_DEPLOYMENT_CHECK",
  "RELEASE_ISSUE_CREATED",
  "MOVED_TO_LEARN",
  "OUTCOME_OBSERVATION",
  "LEARNING_DECISION",
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
    summary: "Code individual implementation tasks and verify each one.",
  },
  PROVE: {
    label: "Prove",
    summary: "Assess the approved product slice as an integrated release candidate.",
  },
  SHIP: {
    label: "Ship",
    summary: "Release an approved candidate through a human-controlled deployment.",
  },
  LEARN: {
    label: "Learn",
    summary: "Observe the product and operational outcome after release.",
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
  PRODUCT_DISCOVERY: "Product Brief",
  PRODUCT_DEFINITION: "Product Definition",
  SOLUTION_ARCHITECTURE: "Design",
  IMPLEMENTATION_PLAN: "Delivery plan",
  ENGINEERING_GOVERNANCE: "Engineering review",
  CODING_POLICY: "Coding rules",
  CODE_CHANGE: "Code change",
  VERIFICATION: "Verification",
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
  ARCHITECTURE_GENERATED: "Architecture generated",
  ARCHITECTURE_COMMITTED: "Architecture committed",
  ARCHITECTURE_READY_FOR_REVIEW: "Architecture ready for review",
  ARCHITECTURE_APPROVED: "Architecture approved",
  PLAN_GENERATED: "Delivery plan generated",
  PLAN_COMMITTED: "Delivery plan committed",
  PLAN_APPROVED: "Delivery plan approved",
  ARCHITECTURE_REVIEW_REQUIRED: "Design needs review again",
  PLAN_REVIEW_REQUIRED: "Delivery plan needs review again",
  ADR_UPDATED: "Architecture decision updated",
  CODEBASE_CONTEXT_UPDATED: "Codebase context updated",
  ARCHITECTURE_QUESTION_ANSWERED: "Architecture question answered",
  GOVERNANCE_GENERATED: "Governance review generated",
  GOVERNANCE_COMMITTED: "Governance review committed",
  GOVERNANCE_READY_FOR_REVIEW: "Governance review ready for review",
  GOVERNANCE_APPROVED: "Governance review approved",
  GOVERNANCE_REVIEW_REQUIRED: "Engineering review needs attention",
  FINDING_UPDATED: "Governance finding updated",
  CODING_RISK_OVERRIDDEN: "Coding risk overridden",
  CODING_POLICY_UPDATED: "Coding policy updated",
  CODING_POLICY_APPROVED: "Coding policy approved",
  CODING_POLICY_REAPPROVAL_REQUIRED: "Coding rules need approval again",
  GOVERNANCE_QUESTION_ANSWERED: "Governance question answered",
  CODING_WORKSPACE_CREATED: "Coding workspace created",
  CODING_EXECUTION_STARTED: "Coding execution started",
  CODING_FILE_READ: "Coding file read",
  CODING_FILE_MODIFIED: "Coding file modified",
  CODING_FILE_CREATED: "Coding file created",
  CODING_FILE_DELETED: "Coding file deleted",
  CODING_COMMAND_EXECUTED: "Coding command executed",
  CODING_POLICY_DENIED: "Coding policy denied",
  CODING_ESCALATION_CREATED: "Coding escalation created",
  CODING_CHECKS_COMPLETED: "Coding checks completed",
  CODING_READY_FOR_REVIEW: "Coding ready for review",
  CODING_APPROVED: "Code changes approved",
  CODING_CHANGES_REQUESTED: "Coding changes requested",
  CODING_COMMIT_CREATED: "Coding commit created",
  CODING_WORKSPACE_ABANDONED: "Coding workspace abandoned",
  CODING_CONTRACT_STALE: "Approved coding instructions are out of date",
  CODING_TASK_APPROVED: "Implementation task approved",
  CODING_PLAN_APPROVED: "Coding execution plan approved",
  VERIFICATION_STARTED: "Verification started",
  VERIFICATION_COMMAND_EXECUTED: "Verification command executed",
  VERIFICATION_FILE_READ: "Verification file read",
  VERIFICATION_TEST_CREATED: "Verification test created",
  VERIFICATION_POLICY_DENIED: "Verification policy denied",
  VERIFICATION_APPROVED: "Verification approved",
  VERIFICATION_CHANGES_REQUESTED: "More testing requested",
  VERIFICATION_REJECTED: "Verification rejected",
  VERIFICATION_MANUAL_RESULT: "Manual verification result",
  VERIFICATION_DEFECT_CREATED: "Verification defect recorded",
  VERIFICATION_STALE: "Verification needs to be repeated",
  GITHUB_CONNECTED: "GitHub connected",
  BRANCH_PUBLISHED: "Branch published",
  PULL_REQUEST_CREATED: "Pull request created",
  PULL_REQUEST_REFRESHED: "Pull request refreshed",
  CI_CHANGED: "CI changed",
  REVIEW_RECEIVED: "Review received",
  CHANGES_REQUESTED: "Changes requested",
  REVISION_INITIATED: "Revision initiated",
  BRANCH_UPDATED: "Branch updated",
  PULL_REQUEST_READY: "Pull request ready for human merge",
  PULL_REQUEST_MERGED: "Pull request merged",
  RELEASE_CANDIDATE_CREATED: "Release candidate created",
  RELEASE_EVIDENCE_ADDED: "Release evidence added",
  RELEASE_RISK_IDENTIFIED: "Release risk identified",
  RELEASE_RISK_ACCEPTED: "Release risk accepted",
  DEPLOYMENT_PLAN_CREATED: "Deployment plan created",
  DEPLOYMENT_PLAN_APPROVED: "Deployment plan approved",
  RELEASE_APPROVED: "Release approved",
  RELEASE_APPROVAL_STALE: "Release approval needs review again",
  DEPLOYMENT_STARTED: "Deployment started",
  DEPLOYMENT_SUCCEEDED: "Deployment succeeded",
  DEPLOYMENT_FAILED: "Deployment failed",
  ROLLBACK_RECORDED: "Rollback recorded",
  POST_DEPLOYMENT_CHECK: "Post-deployment check",
  RELEASE_ISSUE_CREATED: "Release issue created",
  MOVED_TO_LEARN: "Moved to Learn",
  OUTCOME_OBSERVATION: "Outcome observation",
  LEARNING_DECISION: "Learning decision",
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
    responsibility:
      "Propose a solution architecture and an implementation plan for an approved product slice. It does not write production code.",
  },
  SECURITY: {
    name: "Security & Engineering Governance Agent",
    responsibility:
      "Independently review an approved architecture and implementation plan before coding. It does not write production code or approve its own review.",
  },
  PLANNING: {
    name: "Planning Agent",
    responsibility: "Turn approved scope into a delivery plan.",
  },
  CODING: {
    name: "Coding Agent",
    responsibility:
      "Execute one approved implementation task inside an isolated repository workspace. It cannot approve its own code, push, or merge.",
  },
  TESTING: {
    name: "Testing & Verification Agent",
    responsibility:
      "Independently verify one completed implementation against the approved acceptance criteria. It does not trust the Coding Agent's self-review, and it cannot approve itself, change production code, push, or merge.",
  },
  REVIEW: {
    name: "Review Agent",
    responsibility: "Review changes and surface risks before release.",
  },
};

export const COMPONENT_TYPES = [
  "USER_INTERFACE",
  "SERVICE",
  "API",
  "DATABASE",
  "QUEUE",
  "CACHE",
  "EXTERNAL_SYSTEM",
  "AI_SERVICE",
  "IDENTITY",
  "STORAGE",
  "OBSERVABILITY",
  "OTHER",
] as const;
export type ComponentTypeName = (typeof COMPONENT_TYPES)[number];

export const COMPONENT_TYPE_LABEL: Record<ComponentTypeName, string> = {
  USER_INTERFACE: "User interface",
  SERVICE: "Service",
  API: "API",
  DATABASE: "Database",
  QUEUE: "Queue",
  CACHE: "Cache",
  EXTERNAL_SYSTEM: "External system",
  AI_SERVICE: "AI service",
  IDENTITY: "Identity",
  STORAGE: "Storage",
  OBSERVABILITY: "Observability",
  OTHER: "Other",
};

export const RELATIONSHIP_TYPES = [
  "CALLS",
  "READS_FROM",
  "WRITES_TO",
  "PUBLISHES_TO",
  "SUBSCRIBES_TO",
  "AUTHENTICATES_WITH",
  "INTEGRATES_WITH",
] as const;
export type RelationshipTypeName = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_TYPE_LABEL: Record<RelationshipTypeName, string> = {
  CALLS: "Calls",
  READS_FROM: "Reads from",
  WRITES_TO: "Writes to",
  PUBLISHES_TO: "Publishes to",
  SUBSCRIBES_TO: "Subscribes to",
  AUTHENTICATES_WITH: "Authenticates with",
  INTEGRATES_WITH: "Integrates with",
};

export const ADR_STATUSES = ["PROPOSED", "ACCEPTED", "REJECTED", "SUPERSEDED"] as const;
export type AdrStatusName = (typeof ADR_STATUSES)[number];

export const ADR_STATUS_LABEL: Record<AdrStatusName, string> = {
  PROPOSED: "Proposed",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
};

export const ARCHITECTURE_STATUSES = [
  "DRAFT",
  "READY_FOR_REVIEW",
  "APPROVED",
  "SUPERSEDED",
] as const;
export type ArchitectureStatusName = (typeof ARCHITECTURE_STATUSES)[number];

export const ARCHITECTURE_STATUS_LABEL: Record<ArchitectureStatusName, string> = {
  DRAFT: "Draft",
  READY_FOR_REVIEW: "Ready for review",
  APPROVED: "Approved",
  SUPERSEDED: "Superseded",
};

export const SECURITY_AREAS = [
  "AUTHENTICATION",
  "AUTHORISATION",
  "SENSITIVE_DATA",
  "ENCRYPTION",
  "SECRETS",
  "AUDITABILITY",
  "EXTERNAL_INTEGRATIONS",
  "DATA_RETENTION",
  "PRIVACY",
  "THREATS",
  "COMPLIANCE",
] as const;
export type SecurityAreaName = (typeof SECURITY_AREAS)[number];

export const SECURITY_AREA_LABEL: Record<SecurityAreaName, string> = {
  AUTHENTICATION: "Authentication",
  AUTHORISATION: "Authorisation",
  SENSITIVE_DATA: "Sensitive data",
  ENCRYPTION: "Encryption",
  SECRETS: "Secrets",
  AUDITABILITY: "Auditability",
  EXTERNAL_INTEGRATIONS: "External integrations",
  DATA_RETENTION: "Data retention",
  PRIVACY: "Privacy",
  THREATS: "Threat considerations",
  COMPLIANCE: "Compliance considerations",
};

export const SECURITY_CLASSIFICATIONS = [
  "INFORMATION",
  "CONCERN",
  "DECISION_REQUIRED",
  "BLOCKER",
] as const;
export type SecurityClassificationName = (typeof SECURITY_CLASSIFICATIONS)[number];

export const SECURITY_CLASSIFICATION_LABEL: Record<SecurityClassificationName, string> = {
  INFORMATION: "Information",
  CONCERN: "Concern",
  DECISION_REQUIRED: "Decision required",
  BLOCKER: "Blocker",
};

export const DATA_CLASSIFICATIONS = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
] as const;
export type DataClassificationName = (typeof DATA_CLASSIFICATIONS)[number];

export const INTEGRATION_DIRECTIONS = ["INBOUND", "OUTBOUND", "BIDIRECTIONAL"] as const;
export type IntegrationDirectionName = (typeof INTEGRATION_DIRECTIONS)[number];

export const TASK_COMPLEXITIES = ["SMALL", "MEDIUM", "LARGE", "UNKNOWN"] as const;
export type TaskComplexityName = (typeof TASK_COMPLEXITIES)[number];

export const IMPLEMENTATION_TASK_STATUSES = [
  "PROPOSED",
  "APPROVED",
  "IN_PROGRESS",
  "CODE_REVIEW",
  "COMPLETED",
  "BLOCKED",
] as const;
export type ImplementationTaskStatusName = (typeof IMPLEMENTATION_TASK_STATUSES)[number];

export const SYSTEM_KINDS = ["GREENFIELD", "EXISTING_SYSTEM"] as const;
export type SystemKindName = (typeof SYSTEM_KINDS)[number];

export const SYSTEM_KIND_LABEL: Record<SystemKindName, string> = {
  GREENFIELD: "Greenfield",
  EXISTING_SYSTEM: "Existing system",
};

export const CODEBASE_SOURCES = ["MANUAL", "DEMO", "LOCAL_ANALYSIS", "FUTURE_GITHUB"] as const;
export type CodebaseSourceName = (typeof CODEBASE_SOURCES)[number];

export const ARCHITECTURE_SECTIONS = [
  "summary",
  "components",
  "security",
  "data",
  "tasks",
  "alternatives",
] as const;
export type ArchitectureSection = (typeof ARCHITECTURE_SECTIONS)[number];

export const ARCHITECTURE_SECTION_LABEL: Record<ArchitectureSection, string> = {
  summary: "Architecture summary",
  components: "Components and relationships",
  security: "Security assessment",
  data: "Data architecture",
  tasks: "Implementation tasks",
  alternatives: "Architecture alternatives",
};

export const GOVERNANCE_ASSESSMENTS = ["PASS", "PASS_WITH_ACTIONS", "BLOCKED"] as const;
export type GovernanceAssessmentName = (typeof GOVERNANCE_ASSESSMENTS)[number];

export const GOVERNANCE_ASSESSMENT_LABEL: Record<GovernanceAssessmentName, string> = {
  PASS: "Pass",
  PASS_WITH_ACTIONS: "Pass with actions",
  BLOCKED: "Blocked",
};

export const GOVERNANCE_REVIEW_STATUSES = [
  "DRAFT",
  "READY_FOR_REVIEW",
  "APPROVED",
  "SUPERSEDED",
] as const;
export type GovernanceReviewStatusName = (typeof GOVERNANCE_REVIEW_STATUSES)[number];

export const FINDING_CATEGORIES = [
  "SECURITY",
  "PRIVACY",
  "ARCHITECTURE",
  "RELIABILITY",
  "OBSERVABILITY",
  "DATA",
  "INTEGRATION",
  "TESTABILITY",
  "MAINTAINABILITY",
  "DEPENDENCY",
  "DELIVERY",
  "COMPLIANCE",
  "OPERABILITY",
  "OTHER",
] as const;
export type FindingCategoryName = (typeof FINDING_CATEGORIES)[number];

export const FINDING_CATEGORY_LABEL: Record<FindingCategoryName, string> = {
  SECURITY: "Security",
  PRIVACY: "Privacy",
  ARCHITECTURE: "Architecture",
  RELIABILITY: "Reliability",
  OBSERVABILITY: "Observability",
  DATA: "Data",
  INTEGRATION: "Integration",
  TESTABILITY: "Testability",
  MAINTAINABILITY: "Maintainability",
  DEPENDENCY: "Dependency",
  DELIVERY: "Delivery",
  COMPLIANCE: "Compliance",
  OPERABILITY: "Operability",
  OTHER: "Other",
};

export const FINDING_SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type FindingSeverityName = (typeof FINDING_SEVERITIES)[number];

export const FINDING_SEVERITY_LABEL: Record<FindingSeverityName, string> = {
  INFO: "Info",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const FINDING_STATUSES = [
  "OPEN",
  "ACCEPTED",
  "MITIGATED",
  "RISK_ACCEPTED",
  "CLOSED",
] as const;
export type FindingStatusName = (typeof FINDING_STATUSES)[number];

export const FINDING_STATUS_LABEL: Record<FindingStatusName, string> = {
  OPEN: "Open",
  ACCEPTED: "Accepted",
  MITIGATED: "Mitigated",
  RISK_ACCEPTED: "Risk accepted",
  CLOSED: "Closed",
};

export const THREAT_LIKELIHOODS = ["LOW", "MEDIUM", "HIGH"] as const;
export type ThreatLikelihoodName = (typeof THREAT_LIKELIHOODS)[number];

export const THREAT_IMPACTS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type ThreatImpactName = (typeof THREAT_IMPACTS)[number];

export const THREAT_STATUSES = ["OPEN", "MITIGATED", "ACCEPTED", "CLOSED"] as const;
export type ThreatStatusName = (typeof THREAT_STATUSES)[number];

export const THREAT_STATUS_LABEL: Record<ThreatStatusName, string> = {
  OPEN: "Open",
  MITIGATED: "Mitigated",
  ACCEPTED: "Accepted",
  CLOSED: "Closed",
};

export const CODING_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "PROHIBITED"] as const;
export type CodingRiskLevelName = (typeof CODING_RISK_LEVELS)[number];

export const CODING_RISK_LABEL: Record<CodingRiskLevelName, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  PROHIBITED: "Prohibited",
};

export const CODING_EXECUTION_MODES = ["AUTONOMOUS", "SUPERVISED", "HUMAN_ONLY"] as const;
export type CodingExecutionModeName = (typeof CODING_EXECUTION_MODES)[number];

export const CODING_EXECUTION_LABEL: Record<CodingExecutionModeName, string> = {
  AUTONOMOUS: "Autonomous",
  SUPERVISED: "Supervised",
  HUMAN_ONLY: "Human only",
};

export const EVIDENCE_TYPES = [
  "AI_ANALYSIS",
  "HUMAN_CONFIRMATION",
  "TEST_RESULT",
  "STATIC_ANALYSIS",
  "DEPENDENCY_SCAN",
  "SECURITY_SCAN",
  "DOCUMENT",
] as const;
export type EvidenceTypeName = (typeof EVIDENCE_TYPES)[number];

export const EVIDENCE_TYPE_LABEL: Record<EvidenceTypeName, string> = {
  AI_ANALYSIS: "AI review",
  HUMAN_CONFIRMATION: "Human confirmation",
  TEST_RESULT: "Test result",
  STATIC_ANALYSIS: "Static analysis",
  DEPENDENCY_SCAN: "Dependency scan",
  SECURITY_SCAN: "Security scan",
  DOCUMENT: "Document",
};

export const GOVERNANCE_TOPICS = [
  "SECURITY",
  "PRIVACY",
  "PLAN",
  "ARCHITECTURE",
  "GENERAL",
] as const;
export type GovernanceTopicName = (typeof GOVERNANCE_TOPICS)[number];

export const GOVERNANCE_SECTIONS = [
  "security",
  "privacy",
  "plan",
  "architecture",
  "task",
] as const;
export type GovernanceSection = (typeof GOVERNANCE_SECTIONS)[number];

export const GOVERNANCE_SECTION_LABEL: Record<GovernanceSection, string> = {
  security: "Security",
  privacy: "Privacy",
  plan: "Delivery plan",
  architecture: "Architecture",
  task: "Implementation task",
};

export const GOVERNANCE_READINESS_AREAS = [
  { key: "security", label: "Security" },
  { key: "privacy", label: "Privacy" },
  { key: "architectureQuality", label: "Architecture quality" },
  { key: "reliability", label: "Reliability" },
  { key: "observability", label: "Observability" },
  { key: "dataProtection", label: "Data protection" },
  { key: "planQuality", label: "Delivery plan quality" },
  { key: "testability", label: "Testability" },
  { key: "codingSuitability", label: "AI coding suitability" },
  { key: "openQuestions", label: "Open governance questions" },
] as const;

export const TECHNICAL_READINESS_AREAS = [
  { key: "architectureClarity", label: "Architecture clarity" },
  { key: "technologyDecisions", label: "Technology decisions" },
  { key: "dataDesign", label: "Data design" },
  { key: "integrationDesign", label: "Integration design" },
  { key: "securityConsiderations", label: "Security considerations" },
  { key: "nfrCoverage", label: "NFR coverage" },
  { key: "openQuestions", label: "Open architecture questions" },
  { key: "taskQuality", label: "Implementation task quality" },
  { key: "taskDependencies", label: "Task dependencies" },
  { key: "validationStrategy", label: "Validation strategy" },
] as const;

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
