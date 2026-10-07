import type { AgentRunStatus, AgentType } from "@/domain/constants";

/**
 * Extension point for a future agent runtime.
 * Runners are registered in-process. None are registered in this foundation.
 */
export type AgentExecutionRequest = {
  productId: string;
  workItemId?: string;
  agentType: AgentType;
  input: Record<string, unknown>;
};

export type AgentRunner = {
  agentType: AgentType;
  execute: (
    request: AgentExecutionRequest,
  ) => Promise<{ output: Record<string, unknown> }>;
};

export type AgentCatalogueEntry = {
  agentType: AgentType;
  name: string;
  responsibility: string;
  configured: boolean;
  runCount: number;
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
