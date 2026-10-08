import type { TimeWindow } from "@/modules/analytics/time";

export type MetricCategory =
  | "FLOW"
  | "DELIVERY"
  | "QUALITY"
  | "AI"
  | "GOVERNANCE"
  | "RELEASE"
  | "OUTCOME"
  | "PORTFOLIO";

export type MetricQuality = "GOOD" | "PARTIAL" | "INSUFFICIENT";
export type MetricAudience = "leadership" | "engineering" | "both";
export type MetricScope = "product" | "portfolio" | "both";
export type MetricKind = "duration" | "rate" | "count" | "text";

export type MetricDefinition = {
  key: string;
  name: string;
  description: string;
  category: MetricCategory;
  unit: string;
  calculation: string;
  interpretation: string;
  dataRequirements: string;
  audience: MetricAudience;
  scope: MetricScope;
};

export type DrillItem = {
  id: string;
  label: string;
  detail: string;
};

export type MetricValue = {
  key: string;
  display: string;
  value: number | null;
  unit: string;
  sampleSize: number | null;
  numerator: number | null;
  denominator: number | null;
  quality: MetricQuality;
  qualityNote: string;
  window: TimeWindow;
  calculatedAt: string;
  comparison: string | null;
  drilldown: DrillItem[];
  /** Duration samples in milliseconds. Empty unless this metric is a duration aggregate. */
  samplesMs: number[];
  kind: MetricKind;
};

export type FactoryEvent = {
  id: string;
  type: string;
  label: string;
  at: string;
  entityId: string;
  entityLabel: string;
  stage: string;
  demo: boolean;
};

export type WaitType =
  | "BRIEF_APPROVAL"
  | "DEFINITION_APPROVAL"
  | "ARCHITECTURE_APPROVAL"
  | "PLAN_APPROVAL"
  | "GOVERNANCE_APPROVAL"
  | "CODING_POLICY_APPROVAL"
  | "CODE_REVIEW"
  | "VERIFICATION_APPROVAL"
  | "PR_REVIEW"
  | "CI"
  | "RELEASE_APPROVAL"
  | "DEPLOYMENT";

export type WaitInterval = {
  id: string;
  type: WaitType;
  label: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  relatedEntity: string;
  reason: string;
  demo: boolean;
};

export type ScopeChangeCategory = "REQUIREMENT" | "ARCHITECTURE" | "IMPLEMENTATION" | "RELEASE";

export type ScopeChangeEvent = {
  id: string;
  category: ScopeChangeCategory;
  at: string;
  summary: string;
  impact: string;
  downstreamRework: number;
  entityId: string;
};

export type ReworkEvent = {
  id: string;
  source: string;
  trigger: string;
  affectedEntity: string;
  timestamp: string;
  reason: string;
};

export type BottleneckSeverity = "INFO" | "WARNING" | "CRITICAL";

export type BottleneckSignal = {
  id: string;
  type: string;
  severity: BottleneckSeverity;
  entity: string;
  metric: string;
  observedValue: string;
  comparison: string;
  reason: string;
};

export type FlowSegment = {
  id: string;
  label: string;
  kind: "work" | "wait" | "milestone";
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  demo: boolean;
};

export type OutcomeView = {
  id: string;
  title: string;
  successMeasure: string;
  target: string;
  baseline: string;
  latest: string;
  latestAt: string | null;
  trend: string;
  status: string;
  releases: string[];
  decision: string;
  deliveryCompleteOutcomePending: boolean;
};

export type AgentStat = {
  agentType: string;
  name: string;
  runs: number;
  completed: number;
  failed: number;
  escalated: number;
  averageDuration: string;
  medianDuration: string;
  sampleSize: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: string;
};

export type ChartPoint = {
  label: string;
  value: number;
  display: string;
};

export type ChartSet = {
  waitBreakdown: ChartPoint[];
  defectsByStage: ChartPoint[];
  agentRunsByResult: ChartPoint[];
  approvalWait: ChartPoint[];
  leadTime: ChartPoint[];
  cycleTime: ChartPoint[];
  outcomeObservations: ChartPoint[];
};

export type InterventionCount = {
  type: string;
  label: string;
  count: number;
};

export type ProductStageName = "EXPLORE" | "DEFINE" | "BUILD" | "PROVE" | "SHIP" | "LEARN";

export type AnalyticsInput = {
  now: string;
  product: {
    id: string;
    name: string;
    status: string;
    currentStage: ProductStageName;
    createdAt: string;
  };
  discovery: { createdAt: string; startedAt: string | null; completedAt: string | null } | null;
  definition: { status: string; createdAt: string; approvedAt: string | null } | null;
  definitionProposals: { id: string; status: string; createdAt: string }[];
  architectureProposals: { id: string; status: string; createdAt: string }[];
  architectures: {
    id: string;
    version: number;
    status: string;
    reviewRequired: boolean;
    reviewReason: string;
    createdAt: string;
  }[];
  plans: {
    id: string;
    version: number;
    status: string;
    reviewRequired: boolean;
    reviewReason: string;
    createdAt: string;
  }[];
  governanceReviews: {
    id: string;
    version: number;
    status: string;
    reviewRequired: boolean;
    reviewReason: string;
    createdAt: string;
  }[];
  findings: {
    id: string;
    title: string;
    severity: string;
    status: string;
    dueBeforeCoding: boolean;
    createdAt: string;
    updatedAt: string;
  }[];
  codingRisks: {
    id: string;
    taskId: string;
    taskTitle: string;
    riskLevel: string;
    executionMode: string;
    overrideRiskLevel: string | null;
    overrideExecutionMode: string | null;
    overriddenAt: string | null;
  }[];
  policies: { reapprovalRequired: boolean; reapprovalReason: string; reapprovalFlaggedAt: string | null }[];
  slices: { id: string; name: string; status: string; createdAt: string }[];
  workItems: {
    id: string;
    title: string;
    type: string;
    status: string;
    priority: string;
    sliceId: string | null;
    capabilityId: string | null;
    capabilityName: string | null;
    sliceName: string | null;
    createdAt: string;
  }[];
  tasks: { id: string; title: string; status: string; workItemId: string | null; createdAt: string; updatedAt: string }[];
  workspaces: {
    id: string;
    taskId: string;
    contractStale: boolean;
    staleReason: string;
    staleFlaggedAt: string | null;
    createdAt: string;
    completedAt: string | null;
  }[];
  contracts: {
    id: string;
    taskId: string;
    workspaceId: string;
    stale: boolean;
    staleReason: string;
    staleFlaggedAt: string | null;
    executionMode: string;
    riskLevel: string;
    createdAt: string;
  }[];
  revisions: { id: string; workspaceId: string; createdAt: string }[];
  codingEscalations: {
    id: string;
    workspaceId: string;
    type: string;
    reason: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
  }[];
  codeApprovals: { id: string; taskId: string; workspaceId: string; createdAt: string; status: string }[];
  sessions: {
    id: string;
    taskId: string;
    verdict: string | null;
    stale: boolean;
    demo: boolean;
    commitSha: string;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
  }[];
  executions: {
    id: string;
    sessionId: string;
    kind: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
  }[];
  coverages: { id: string; sessionId: string; criterionId: string; status: string; humanConfirmed: boolean }[];
  verificationApprovals: { id: string; sessionId: string; resolvedAt: string | null; status: string }[];
  verificationEscalations: {
    id: string;
    sessionId: string;
    type: string;
    reason: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
  }[];
  defectLinks: { id: string; workItemId: string; taskId: string; createdAt: string }[];
  pullRequests: {
    id: string;
    number: number;
    title: string;
    state: string;
    demo: boolean;
    workspaceId: string | null;
    taskId: string | null;
    createdAt: string;
    mergedAt: string | null;
  }[];
  reviews: { id: string; pullRequestId: string; state: string; submittedAt: string | null }[];
  checks: {
    id: string;
    pullRequestId: string;
    name: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
  }[];
  releases: { id: string; version: string; status: string; demo: boolean; sliceId: string; createdAt: string; taskIds: string[] }[];
  releaseApprovals: {
    id: string;
    candidateId: string;
    stale: boolean;
    staleReason: string;
    staleFlaggedAt: string | null;
    status: string;
    requestedAt: string | null;
    resolvedAt: string | null;
    demo: boolean;
  }[];
  deployments: {
    id: string;
    candidateId: string;
    version: string;
    status: string;
    demo: boolean;
    environment: string;
    startedAt: string | null;
    completedAt: string | null;
  }[];
  deploymentChecks: { id: string; candidateId: string; phase: string; status: string; completedAt: string | null }[];
  releaseRisks: { id: string; status: string; severity: string; candidateId: string }[];
  releaseQuestions: { id: string; status: string; resolvedAt: string | null }[];
  issues: {
    id: string;
    candidateId: string;
    deploymentId: string | null;
    severity: string;
    status: string;
    description: string;
    detectedAt: string;
    resolvedAt: string | null;
  }[];
  outcomes: { id: string; title: string; successMeasure: string; targetValue: string; status: string }[];
  observations: {
    id: string;
    outcomeId: string;
    measure: string;
    value: string;
    unit: string;
    observedAt: string;
    demo: boolean;
    releaseVersion: string | null;
  }[];
  learning: { id: string; outcomeId: string | null; decision: string; createdAt: string }[];
  approvals: { id: string; type: string; status: string; requestedAt: string; resolvedAt: string | null }[];
  agentRuns: {
    id: string;
    agentType: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    estimatedCost: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    escalated: boolean;
    workspaceId: string | null;
  }[];
  activities: { id: string; type: string; description: string; createdAt: string }[];
};

export type ProductIntelligence = {
  productId: string;
  productName: string;
  stage: ProductStageName;
  status: string;
  window: TimeWindow;
  calculatedAt: string;
  blocked: boolean;
  readyForHuman: boolean;
  metrics: MetricValue[];
  events: FactoryEvent[];
  waits: WaitInterval[];
  scopeChanges: ScopeChangeEvent[];
  rework: ReworkEvent[];
  bottlenecks: BottleneckSignal[];
  segments: FlowSegment[];
  outcomes: OutcomeView[];
  agents: AgentStat[];
  interventions: InterventionCount[];
  charts: ChartSet;
};

export type PortfolioIntelligence = {
  window: TimeWindow;
  calculatedAt: string;
  products: ProductIntelligence[];
  metrics: MetricValue[];
  stageCounts: { stage: string; count: number }[];
  blocked: { id: string; name: string; stage: string }[];
  ready: { id: string; name: string; stage: string }[];
  bottlenecks: BottleneckSignal[];
  charts: ChartSet;
};

export type CalcContext = {
  input: AnalyticsInput;
  window: TimeWindow;
  start: Date | null;
  previousStart: Date | null;
  now: Date;
  calculatedAt: string;
};

const EMPTY = {
  discovery: null,
  definition: null,
  definitionProposals: [],
  architectureProposals: [],
  architectures: [],
  plans: [],
  governanceReviews: [],
  findings: [],
  codingRisks: [],
  policies: [],
  slices: [],
  workItems: [],
  tasks: [],
  workspaces: [],
  contracts: [],
  revisions: [],
  codingEscalations: [],
  codeApprovals: [],
  sessions: [],
  executions: [],
  coverages: [],
  verificationApprovals: [],
  verificationEscalations: [],
  defectLinks: [],
  pullRequests: [],
  reviews: [],
  checks: [],
  releases: [],
  releaseApprovals: [],
  deployments: [],
  deploymentChecks: [],
  issues: [],
  releaseRisks: [],
  releaseQuestions: [],
  outcomes: [],
  observations: [],
  learning: [],
  approvals: [],
  agentRuns: [],
  activities: [],
} satisfies Omit<AnalyticsInput, "now" | "product">;

export function createAnalyticsInput(
  now: string,
  product: { id: string; name: string; currentStage?: ProductStageName; status?: string; createdAt?: string },
  rest: Partial<Omit<AnalyticsInput, "now" | "product">> = {},
): AnalyticsInput {
  return {
    now,
    product: {
      id: product.id,
      name: product.name,
      status: product.status ?? "ACTIVE",
      currentStage: product.currentStage ?? "EXPLORE",
      createdAt: product.createdAt ?? now,
    },
    ...structuredClone(EMPTY),
    ...rest,
  };
}
