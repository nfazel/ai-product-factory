import type { ProductStage } from "@/domain/constants";
import type { ClarificationNextReview } from "@/modules/clarification/materiality";

export const STAGE_PROGRESS = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "WAITING_FOR_YOU",
  "BLOCKED",
  "READY_TO_MOVE",
  "COMPLETED",
] as const;

export type StageProgress = (typeof STAGE_PROGRESS)[number];

export const STAGE_PROGRESS_LABEL: Record<StageProgress, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  WAITING_FOR_YOU: "Waiting for you",
  BLOCKED: "Blocked",
  READY_TO_MOVE: "Ready to move",
  COMPLETED: "Completed",
};

export type TaskSnapshot = {
  id: string;
  title: string;
  status: "PROPOSED" | "APPROVED" | "IN_PROGRESS" | "CODE_REVIEW" | "COMPLETED" | "BLOCKED";
  humanOnly: boolean;
  prohibited: boolean;
  contractStale: boolean;
  codeApproval: "NONE" | "CURRENT" | "STALE";
  workspace: "NONE" | "OPEN" | "DONE";
  executionPlan: "NONE" | "PROPOSED" | "APPROVED" | "EXECUTING" | "COMPLETED" | "ESCALATED" | "CHANGES_REQUESTED";
  codingRun: "NONE" | "READY" | "RUNNING" | "WAITING" | "FAILED" | "COMPLETED";
  contractBlocked: boolean;
  providerBlocked: boolean;
  repairAvailable: boolean;
  persistenceRecovery: boolean;
  planIncomplete: boolean;
  implementationIncomplete: boolean;
  outOfScope: boolean;
  revisedPlanReady: boolean;
  published: boolean;
  /** MISSING means the remote base branch has not been created. READY leaves the existing pull request action unchanged. */
  remoteMain?: "READY" | "MISSING" | "OTHER_DEFAULT";
  pullRequest: "NONE" | "OPEN" | "MERGED" | "DEMO";
  pullRequestNext?: { key: string; label: string; why: string };
  verification: "NONE" | "RUNNING" | "RETRYABLE" | "REVIEW" | "AWAITING" | "FAILED" | "APPROVED" | "STALE" | "DEMO";
  updatedAt: string | null;
};

export type GuidanceSnapshot = {
  productId: string;
  name: string;
  stage: ProductStage;
  sample: boolean;
  startMode: "IDEA" | "EXISTING_REQUIREMENTS";
  requirementsChanged: boolean;
  developmentContext: "UNSET" | "GREENFIELD" | "EXISTING_SYSTEM";
  codebaseCaptured: boolean;
  repositoryReady: boolean;
  githubAccountConnected: boolean;
  productRepositoryMapped: boolean;
  githubConnected: boolean;
  clarificationReview: ClarificationNextReview | null;
  intake: {
    activeSources: number;
    extractionFailed: boolean;
    analysed: boolean;
    stale: boolean;
    unreviewed: number;
    needsChange: number;
    blockingFindings: number;
    openQuestions: number;
    materialUnmapped: number;
    updatedAt: string | null;
  };
  discovery: {
    started: boolean;
    briefStatus: "NONE" | "DRAFT" | "READY_FOR_REVIEW" | "APPROVED";
    readyForReview: boolean;
    openQuestions: number;
    demo: boolean;
    needsReview: boolean;
    updatedAt: string | null;
  };
  definition: {
    exists: boolean;
    status: "NONE" | "NOT_STARTED" | "IN_PROGRESS" | "READY_FOR_REVIEW" | "APPROVED";
    approved: boolean;
    proposalOpen: boolean;
    proposedOutcomes: number;
    proposedCapabilities: number;
    slice: "NONE" | "PROPOSED" | "APPROVED";
    openQuestions: number;
    demo: boolean;
    needsReview: boolean;
    updatedAt: string | null;
    outcome: {
      title: string;
      status: string;
      measure: string;
      target: string;
      latest: string;
      latestDemo: boolean;
    } | null;
  };
  design: {
    architecture: "NONE" | "DRAFT" | "READY" | "APPROVED";
    architectureReview: boolean;
    architectureReviewReason: string;
    plan: "NONE" | "DRAFT" | "READY" | "APPROVED";
    planReview: boolean;
    planReviewReason: string;
    demo: boolean;
    updatedAt: string | null;
    traceabilityIssue: string;
  };
  review: {
    exists: boolean;
    approved: boolean;
    reviewRequired: boolean;
    reviewReason: string;
    openCritical: number;
    openHighBeforeCoding: number;
    openFindings: number;
    policyApproved: boolean;
    policyReapproval: boolean;
    policyReason: string;
    demo: boolean;
    updatedAt: string | null;
  };
  tasks: TaskSnapshot[];
  prove: {
    sliceVerified: boolean;
    integrated: boolean;
    entryOpen: boolean;
    entryReason: string;
  };
  release: {
    real: null | {
      version: string;
      status: string;
      approval: "NONE" | "CURRENT" | "STALE";
      staleReason: string;
      openBlockingRisks: number;
      planApproved: boolean;
      deployed: boolean;
      postChecksReady: boolean;
      updatedAt: string | null;
    };
    demoOnly: boolean;
    readyToLearn: boolean;
    learnReason: string;
  };
  learn: {
    realEvidence: boolean;
    decisionRecorded: boolean;
    outcomeAchieved: boolean;
    updatedAt: string | null;
  };
};

export type NextAction = {
  key: string;
  label: string;
  why: string;
  role: string;
  href: string;
  stage: ProductStage;
  decision: boolean;
  waitingSince: string | null;
  /** Task this action applies to, when the workflow needs one. */
  subjectId: string | null;
  execution: "navigate" | "command" | "confirm";
};

export type BlockerView = {
  what: string;
  why: string;
  required: string;
  who: string;
  next: string;
};

export type EvidenceItem = {
  label: string;
  state: "ready" | "missing" | "stale" | "demo" | "pending";
  note: string;
};

export type StageMark = {
  stage: ProductStage;
  status: StageProgress;
  label: string;
};

export type ProductGuidance = {
  productId: string;
  name: string;
  sample: boolean;
  stage: ProductStage;
  stages: StageMark[];
  action: NextAction | null;
  blocker: BlockerView | null;
  outcome: GuidanceSnapshot["definition"]["outcome"];
  risk: string | null;
  evidence: {
    ready: boolean;
    summary: string;
    items: EvidenceItem[];
  };
};
