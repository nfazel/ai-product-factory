import "server-only";

import { AGENT_CATALOG, AGENT_TYPES } from "@/domain/constants";
import { safeErrorMessage } from "@/modules/ai/errors";
import { recordActivity } from "@/modules/activity/service";
import { ensureAgentsRegistered } from "@/modules/agent/bootstrap";
import {
  agentRunStatsByType,
  completeAgentRun,
  countAgentRuns,
  countRunsByAgentType,
  failAgentRun,
  insertAgentRun,
  latestRunByAgentType,
  queryAgentRuns,
} from "@/modules/agent/repository";
import { getAgentRunner, isAgentConfigured } from "@/modules/agent/registry";
import type {
  AgentCatalogueEntry,
  AgentExecutionRequest,
} from "@/modules/agent/types";
import { DomainError } from "@/modules/shared/errors";

export class AgentNotConfiguredError extends DomainError {
  constructor(agentType: string) {
    super(
      agentType === "PRODUCT_DISCOVERY"
        ? "Product Discovery is not configured. Add OPENAI_API_KEY on the server. No response was generated."
        : agentType === "REQUIREMENTS"
          ? "The Requirements Agent is not configured. Add OPENAI_API_KEY on the server. No product definition was generated."
          : agentType === "ARCHITECTURE"
            ? "The Architecture Agent is not configured. Add OPENAI_API_KEY on the server. No architecture was generated."
            : `${agentType} is not configured. AI agents will be introduced progressively as the Product Factory capabilities are enabled.`,
      "INVALID",
    );
    this.name = "AgentNotConfiguredError";
  }
}

export async function countAllAgentRuns() {
  return countAgentRuns();
}

export async function listAgentRuns(filters?: {
  productId?: string;
  workItemId?: string;
}) {
  return queryAgentRuns(filters);
}

export async function listAgentCatalogue(): Promise<AgentCatalogueEntry[]> {
  ensureAgentsRegistered();
  const [counts, latest, stats] = await Promise.all([
    countRunsByAgentType(),
    latestRunByAgentType(),
    agentRunStatsByType(),
  ]);

  return AGENT_TYPES.map((agentType) => {
    const meta = AGENT_CATALOG[agentType];
    const agentStats = stats.get(agentType);
    return {
      agentType,
      name: meta.name,
      responsibility: meta.responsibility,
      configured: isAgentConfigured(agentType),
      runCount: counts.get(agentType) ?? 0,
      completedCount: agentStats?.completed ?? 0,
      failedCount: agentStats?.failed ?? 0,
      averageDurationMs: agentStats?.averageDurationMs ?? null,
      latestStatus: latest.get(agentType) ?? null,
    };
  });
}

/**
 * Creates an AgentRun, executes the registered runner, and stores the outcome.
 * Refuses before writing a run when the agent is not configured.
 */
export async function executeAgent(request: AgentExecutionRequest) {
  ensureAgentsRegistered();
  const runner = getAgentRunner(request.agentType);
  if (!runner || !runner.isConfigured()) {
    throw new AgentNotConfiguredError(request.agentType);
  }

  const startedAt = new Date();
  const run = await insertAgentRun({
    productId: request.productId,
    workItemId: request.workItemId ?? null,
    agentType: request.agentType,
    input: request.input,
    startedAt,
  });

  try {
    const result = await runner.execute(request);
    const completedAt = new Date();
    const saved = await completeAgentRun(run.id, {
      output: result.output,
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
      estimatedCost: result.estimatedCost ?? null,
    });
    await recordActivity({
      productId: request.productId,
      workItemId: request.workItemId,
      type: "AGENT_RUN_COMPLETED",
      description: `${AGENT_CATALOG[request.agentType].name} completed a run.`,
      actor: AGENT_CATALOG[request.agentType].name,
    });
    return saved;
  } catch (error) {
    const completedAt = new Date();
    const message = safeErrorMessage(error);
    await failAgentRun(run.id, {
      output: { error: message },
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
    });
    await recordActivity({
      productId: request.productId,
      workItemId: request.workItemId,
      type: "AGENT_RUN_FAILED",
      description: `${AGENT_CATALOG[request.agentType].name} failed. ${message}`,
      actor: AGENT_CATALOG[request.agentType].name,
    });
    if (error instanceof DomainError) throw error;
    throw new DomainError(message);
  }
}
