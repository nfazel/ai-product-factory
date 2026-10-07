import type { AgentType } from "@/domain/constants";
import type { AgentRunner } from "@/modules/agent/types";

const runners = new Map<AgentType, AgentRunner>();

export function registerAgentRunner(runner: AgentRunner) {
  runners.set(runner.agentType, runner);
}

export function getAgentRunner(agentType: AgentType) {
  return runners.get(agentType) ?? null;
}

export function isAgentConfigured(agentType: AgentType) {
  const runner = runners.get(agentType);
  return runner ? runner.isConfigured() : false;
}
