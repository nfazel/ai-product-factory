import type { AgentRunStatus, AgentType } from "@/domain/constants";

export type AgentExecutionRequest = {
  productId: string;
  workItemId?: string;
  agentType: AgentType;
  input: Record<string, unknown>;
};

export type AgentRunner = {
  agentType: AgentType;
  /** True only when this agent can make a real model call. */
  isConfigured: () => boolean;
  /** Called before an AgentRun row is written. Throw to refuse without a run. */
  assertCanRun?: (request: AgentExecutionRequest) => Promise<void>;
  execute: (request: AgentExecutionRequest) => Promise<{
    output: Record<string, unknown>;
    estimatedCost?: string | null;
  }>;
};

export type AgentCatalogueEntry = {
  agentType: AgentType;
  name: string;
  responsibility: string;
  configured: boolean;
  runCount: number;
  completedCount: number;
  failedCount: number;
  escalatedCount: number;
  blockedCount: number;
  averageDurationMs: number | null;
  latestStatus: AgentRunStatus | null;
};

export type AgentRunRecord = {
  id: string;
  productId: string;
  workItemId: string | null;
  agentType: string;
  status: AgentRunStatus;
  input: unknown;
  output: unknown;
  startedAt: Date | null;
  completedAt: Date | null;
  duration: number | null;
  estimatedCost: string | null;
  createdAt: Date;
};
