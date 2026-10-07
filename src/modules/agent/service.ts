import "server-only";

import { AGENT_CATALOG, AGENT_TYPES } from "@/domain/constants";
import { DomainError } from "@/modules/shared/errors";
import { getAgentRunner, isAgentConfigured } from "@/modules/agent/registry";
import {
  countAgentRuns,
  countRunsByAgentType,
  latestRunByAgentType,
  queryAgentRuns,
} from "@/modules/agent/repository";
import type {
  AgentCatalogueEntry,
  AgentExecutionRequest,
} from "@/modules/agent/types";

export class AgentNotConfiguredError extends DomainError {
  constructor(agentType: string) {
    super(
      `${agentType} is not configured. AI agents will be introduced progressively as the Product Factory capabilities are enabled.`,
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
  const [counts, latest] = await Promise.all([
    countRunsByAgentType(),
    latestRunByAgentType(),
  ]);

  return AGENT_TYPES.map((agentType) => {
    const meta = AGENT_CATALOG[agentType];
    return {
      agentType,
      name: meta.name,
      responsibility: meta.responsibility,
      configured: isAgentConfigured(agentType),
      runCount: counts.get(agentType) ?? 0,
      latestStatus: latest.get(agentType) ?? null,
    };
  });
}

/**
 * Future entry point. No runner is registered in this foundation, so this
 * refuses before writing an agent run or inventing output.
 */
export async function executeAgent(request: AgentExecutionRequest) {
  const runner = getAgentRunner(request.agentType);
  if (!runner) throw new AgentNotConfiguredError(request.agentType);
  return runner.execute(request);
}
