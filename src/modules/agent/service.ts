import "server-only";

import { AGENT_CATALOG, AGENT_TYPES } from "@/domain/constants";
import { codingConfigurationGap } from "@/modules/coding/config";
import { describeAIConfiguration } from "@/modules/ai/config";
import { aiNotConfiguredMessage, safeErrorMessage } from "@/modules/ai/errors";
import { AIFailure, validationActivity } from "@/modules/ai/failures";
import { prepareAI } from "@/modules/ai/provider";
import { assertAIReady } from "@/modules/ai/surface";
import { recordActivity } from "@/modules/activity/service";
import { ensureAgentsRegistered } from "@/modules/agent/bootstrap";
import {
  agentRunStatsByType,
  completeAgentRun,
  countAgentRuns,
  countBlockedVerificationSessions,
  countEscalatedCodingRuns,
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
        ? aiNotConfiguredMessage("Discovery", "Nothing was generated.")
        : agentType === "REQUIREMENTS"
          ? aiNotConfiguredMessage("product definition", "No product definition was generated.")
          : agentType === "ARCHITECTURE"
            ? aiNotConfiguredMessage("architecture", "No architecture was generated.")
            : agentType === "SECURITY"
              ? aiNotConfiguredMessage("engineering governance", "No governance review was generated.")
              : agentType === "CODING"
                ? codingConfigurationGap() === "repository"
                  ? "The Coding Agent is not configured. Set PRODUCT_REPOSITORY_ROOT to a Git repository that is not this application. No code was changed."
                  : aiNotConfiguredMessage("coding", "No code was changed.")
                : agentType === "TESTING"
                  ? codingConfigurationGap() === "repository"
                    ? "The Testing & Verification Agent is not configured. Set PRODUCT_REPOSITORY_ROOT to a Git repository that is not this application. No verification was started."
                    : aiNotConfiguredMessage("verification", "No verification was started.")
                : aiNotConfiguredMessage(agentType, "Nothing was generated."),
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
  await prepareAI();
  const [counts, latest, stats, escalatedCount, blockedCount] = await Promise.all([
    countRunsByAgentType(),
    latestRunByAgentType(),
    agentRunStatsByType(),
    countEscalatedCodingRuns(),
    countBlockedVerificationSessions(),
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
      escalatedCount: agentType === "CODING" ? escalatedCount : 0,
      blockedCount: agentType === "TESTING" ? blockedCount : 0,
      averageDurationMs: agentStats?.averageDurationMs ?? null,
      latestStatus: latest.get(agentType) ?? null,
    };
  });
}

/**
 * Creates an AgentRun, executes the registered runner, and stores the outcome.
 * Refuses before writing a run when the agent is not configured.
 */
const AGENT_CAPABILITY: Record<string, string> = {
  PRODUCT_DISCOVERY: "Discovery",
  REQUIREMENTS: "product definition",
  ARCHITECTURE: "architecture",
  SECURITY: "engineering governance",
  CODING: "coding",
  TESTING: "verification",
};

export async function executeAgent(request: AgentExecutionRequest) {
  ensureAgentsRegistered();
  await prepareAI();
  const runner = getAgentRunner(request.agentType);
  if (!runner || !runner.isConfigured()) {
    throw new AgentNotConfiguredError(request.agentType);
  }
  if (runner.assertCanRun) await runner.assertCanRun(request);
  await assertAIReady(
    AGENT_CAPABILITY[request.agentType] ?? request.agentType,
    request.agentType === "CODING"
      ? "No code was changed."
      : request.agentType === "TESTING"
        ? "No verification was started."
        : "Nothing was generated.",
  );

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
      output: {
        ...result.output,
        purpose:
          typeof result.output.purpose === "string" && result.output.purpose.trim()
            ? result.output.purpose
            : request.agentType,
      },
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
    const configuration = describeAIConfiguration();
    const diagnostics = error instanceof AIFailure ? error.diagnostics : undefined;
    await failAgentRun(run.id, {
      output: {
        error: message,
        purpose: request.agentType,
        ...(error instanceof AIFailure ? { errorCategory: error.category } : {}),
        ...(configuration.providerId ? { provider: configuration.providerId } : {}),
        ...(configuration.model ? { model: configuration.model } : {}),
        ...(diagnostics
          ? {
              operation: diagnostics.operation,
              validationStage: diagnostics.validationStage,
              repairAttempted: diagnostics.repairAttempted,
              validationIssues: diagnostics.issues,
            }
          : {}),
      },
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
    });
    await recordActivity({
      productId: request.productId,
      workItemId: request.workItemId,
      type: "AGENT_RUN_FAILED",
      description: diagnostics
        ? validationActivity({
            agent: AGENT_CATALOG[request.agentType].name,
            provider: configuration.providerId,
            model: configuration.model,
            diagnostics,
          })
        : `${AGENT_CATALOG[request.agentType].name} failed. ${message}`,
      actor: AGENT_CATALOG[request.agentType].name,
    });
    if (error instanceof DomainError) throw error;
    throw new DomainError(message);
  }
}
