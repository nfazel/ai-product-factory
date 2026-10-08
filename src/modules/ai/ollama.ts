import "server-only";

import { toJSONSchema } from "zod";

import { ollamaEndpointIsLocal, ollamaEndpointIssue, ollamaOrigin } from "@/modules/ai/config";
import { AIFailure, cutOffResponse, emptyResponse, mapProviderFailure } from "@/modules/ai/failures";
import type { AIGenerateRequest, AIGenerateResult, AIProvider } from "@/modules/ai/provider";
import { requireStructured } from "@/modules/ai/structured";

export type OllamaProbe = {
  running: boolean;
  models: string[];
  local: boolean;
};

type FetchLike = typeof fetch;

let fetchOverride: FetchLike | null = null;
let probeCache: { at: number; value: OllamaProbe } | null = null;

/** Test hook. Production uses the server fetch. The browser cannot replace it. */
export function setOllamaFetchForTests(fetchImpl: FetchLike | null) {
  fetchOverride = fetchImpl;
  probeCache = null;
}

export function clearOllamaProbeCache() {
  probeCache = null;
}

export function ollamaModelInstalled(installed: string[], selected: string) {
  const wanted = selected.trim();
  return installed.some((name) => name === wanted || name.split(":")[0] === wanted);
}

export async function probeOllama(): Promise<OllamaProbe> {
  const local = ollamaEndpointIsLocal();
  if (ollamaEndpointIssue()) return { running: false, models: [], local };
  if (probeCache && Date.now() - probeCache.at < 2_000) return probeCache.value;
  const value = await readTags(local);
  probeCache = { at: Date.now(), value };
  return value;
}

export class OllamaProvider implements AIProvider {
  readonly id = "OLLAMA";

  constructor(private readonly model: string) {}

  async generate<T>(request: AIGenerateRequest<T>): Promise<AIGenerateResult<T>> {
    const issue = ollamaEndpointIssue();
    if (issue) throw new AIFailure(issue, "NOT_CONFIGURED");
    const origin = ollamaOrigin();
    const started = Date.now();
    try {
      const probe = await probeOllama();
      if (!probe.running) {
        throw new AIFailure(
          "Local AI is unavailable. Start Ollama on this computer and try again. Nothing was generated.",
          "PROVIDER_UNAVAILABLE",
        );
      }
      if (!ollamaModelInstalled(probe.models, this.model)) {
        throw new AIFailure(
          "The configured model is not available from this provider. No other model was substituted. Nothing was generated.",
          "MODEL_NOT_AVAILABLE",
        );
      }
      const response = await requestFetch()(`${origin}/api/chat`, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(120_000),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: toJSONSchema(request.responseSchema),
          options: { temperature: request.temperature ?? 0.3 },
          messages: [
            { role: "system", content: request.systemPrompt },
            ...(request.messages.length > 0
              ? request.messages.map((message) => ({ role: message.role, content: message.content }))
              : [{ role: "user", content: "Follow the system instruction and the schema." }]),
          ],
        }),
      });
      if (!response.ok) {
        throw Object.assign(new Error(`The AI provider returned HTTP ${response.status}.`), { status: response.status });
      }
      const payload = (await response.json()) as {
        model?: string;
        message?: { content?: unknown };
        done?: boolean;
        done_reason?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      const finish = payload.done_reason;
      if (finish === "length" && payload.done === false) throw cutOffResponse();
      const content = payload.message?.content;
      const text = typeof content === "string" ? content.trim() : "";
      const parsed = text ? parseJson(text) : content && typeof content === "object" ? content : undefined;
      if (parsed == null) {
        if (finish === "length") throw cutOffResponse();
        throw emptyResponse();
      }
      const data = requireStructured(request.responseSchema, parsed);
      return {
        data,
        usage: {
          inputTokens: typeof payload.prompt_eval_count === "number" ? payload.prompt_eval_count : null,
          outputTokens: typeof payload.eval_count === "number" ? payload.eval_count : null,
        },
        model: this.model,
        provider: this.id,
        ...(finish ? { finishStatus: finish } : {}),
        durationMs: Date.now() - started,
      };
    } catch (error) {
      mapProviderFailure(error);
    }
  }
}

function requestFetch() {
  return fetchOverride ?? fetch;
}

async function readTags(local: boolean): Promise<OllamaProbe> {
  try {
    const response = await requestFetch()(`${ollamaOrigin()}/api/tags`, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return { running: false, models: [], local };
    const payload = (await response.json()) as { models?: { name?: unknown }[] };
    const models = Array.isArray(payload.models)
      ? payload.models.flatMap((item) => (typeof item?.name === "string" && item.name.trim() ? [item.name.trim()] : []))
      : [];
    return { running: true, models, local };
  } catch {
    return { running: false, models: [], local };
  }
}

function parseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
