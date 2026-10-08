function meta(output: unknown) {
  const empty = {
    provider: null as string | null,
    model: null as string | null,
    usage: null as string | null,
    errorCategory: null as string | null,
  };
  if (!output || typeof output !== "object") return empty;
  const record = output as Record<string, unknown>;
  const provider = publicLabel(record.provider);
  const model = publicLabel(record.model);
  const usage = record.usage;
  let usageText: string | null = null;
  if (usage && typeof usage === "object") {
    const tokens = usage as Record<string, unknown>;
    const input = typeof tokens.inputTokens === "number" ? tokens.inputTokens : null;
    const outputTokens = typeof tokens.outputTokens === "number" ? tokens.outputTokens : null;
    usageText = input == null && outputTokens == null ? null : `Input ${input ?? "unavailable"}, output ${outputTokens ?? "unavailable"}`;
  }
  const errorCategory = publicLabel(record.errorCategory);
  return { provider, model, usage: usageText, errorCategory };
}

function publicLabel(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || /sk-|AIza|bearer|api[_-]?key|secret/i.test(text)) return null;
  return text.slice(0, 80);
}

function durationLabel(duration: number | null) {
  if (duration == null) return "Duration unavailable";
  if (duration < 1000) return `${duration} ms`;
  return `${Math.round(duration / 100) / 10}s`;
}

export function AgentRunEvidenceList({
  runs,
}: {
  runs: { id: string; agentType: string; status: string; duration: number | null; output: unknown }[];
}) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No agent runs recorded.</p>;
  }
  return (
    <ul className="space-y-3 text-sm">
      {runs.map((run) => {
        const detail = meta(run.output);
        return (
          <li key={run.id} className="rounded-xl border px-3 py-2">
            <p className="font-medium">
              {run.agentType} · {run.status}
            </p>
            <dl className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
              <div>Provider {detail.provider ?? "Unavailable"}</div>
              <div>Model {detail.model ?? "Unavailable"}</div>
              <div>Duration {durationLabel(run.duration)}</div>
              <div>{detail.usage ?? "Usage unavailable"}</div>
              {detail.errorCategory ? <div>Error {detail.errorCategory}</div> : null}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
