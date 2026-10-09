import type { AIGenerateResult, AIUsage } from "@/modules/ai/provider";

export type AIRunEvidence = {
  provider: string;
  model: string;
  usage: AIUsage;
};

export function aiRunEvidence(
  result: Pick<AIGenerateResult<unknown>, "provider" | "model" | "usage" | "finishStatus" | "durationMs" | "repairAttempted">,
): AIRunEvidence & { finishStatus?: string; durationMs?: number; repairAttempted?: boolean } {
  return {
    provider: result.provider?.trim() || "unspecified",
    model: result.model,
    usage: result.usage,
    ...(result.finishStatus ? { finishStatus: result.finishStatus } : {}),
    ...(typeof result.durationMs === "number" ? { durationMs: result.durationMs } : {}),
    ...(result.repairAttempted ? { repairAttempted: true } : {}),
  };
}

/** Combines several calls that used the configured provider. Token totals stay empty when any call omitted them. */
export function combineAIEvidence(parts: AIRunEvidence[]): AIRunEvidence | null {
  if (parts.length === 0) return null;
  return {
    provider: unique(parts.map((part) => part.provider)),
    model: unique(parts.map((part) => part.model)),
    usage: {
      inputTokens: sum(parts, (usage) => usage.inputTokens),
      outputTokens: sum(parts, (usage) => usage.outputTokens),
    },
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))].join("+");
}

function sum(parts: AIRunEvidence[], pick: (usage: AIUsage) => number | null) {
  let total = 0;
  for (const part of parts) {
    const value = pick(part.usage);
    if (value == null) return null;
    total += value;
  }
  return total;
}
