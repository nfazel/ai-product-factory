import type { AIGenerateResult, AIUsage } from "@/modules/ai/provider";

export type AIRunEvidence = {
  provider: string;
  model: string;
  usage: AIUsage;
};

export function aiRunEvidence(
  result: Pick<AIGenerateResult<unknown>, "provider" | "model" | "usage">,
): AIRunEvidence {
  return {
    provider: result.provider?.trim() || "unspecified",
    model: result.model,
    usage: result.usage,
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
