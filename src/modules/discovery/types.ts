import type {
  AssumptionImpact,
  AssumptionStatus,
  BriefOrigin,
  DiscoveryMessageRole,
  DiscoveryStatus,
  ProductBriefStatus,
  SignalLevel,
} from "@/domain/constants";

export type BriefItem = {
  id: string;
  text: string;
  origin: BriefOrigin;
};

export type FieldOrigins = {
  problemStatement: BriefOrigin;
  productVision: BriefOrigin;
  valueProposition: BriefOrigin;
};

export type AssumptionRecord = {
  id: string;
  briefId: string;
  description: string;
  impact: AssumptionImpact;
  confidence: SignalLevel;
  status: AssumptionStatus;
  origin: BriefOrigin;
};

export type ProductBriefRecord = {
  id: string;
  productId: string;
  sessionId: string | null;
  version: number;
  problemStatement: string;
  productVision: string;
  valueProposition: string;
  fieldOrigins: FieldOrigins;
  targetUsers: BriefItem[];
  userNeeds: BriefItem[];
  desiredOutcomes: BriefItem[];
  inScope: BriefItem[];
  outOfScope: BriefItem[];
  constraints: BriefItem[];
  risks: BriefItem[];
  successMeasures: BriefItem[];
  openQuestions: BriefItem[];
  assumptions: AssumptionRecord[];
  problemClarity: SignalLevel;
  userClarity: SignalLevel;
  outcomeClarity: SignalLevel;
  scopeClarity: SignalLevel;
  riskClarity: SignalLevel;
  readyForReview: boolean;
  readinessReason: string;
  status: ProductBriefStatus;
  fromRequirements: boolean;
};

export type DiscoveryMessageRecord = {
  id: string;
  sessionId: string;
  role: DiscoveryMessageRole;
  content: string;
  createdAt: Date;
};

export type DiscoverySessionRecord = {
  id: string;
  productId: string;
  status: DiscoveryStatus;
  initialIdea: string;
  optionalContext: string;
  knownConstraints: string;
  knownUsers: string;
  desiredOutcome: string;
  seededDemo: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const EMPTY_FIELD_ORIGINS: FieldOrigins = {
  problemStatement: "UNRESOLVED",
  productVision: "UNRESOLVED",
  valueProposition: "UNRESOLVED",
};
