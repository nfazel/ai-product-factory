import "server-only";

import { db } from "@/lib/db";
import { canonicalProviderId, currentAISelection } from "@/modules/ai/config";
import { assertCloudProvider, ensureProviderCredentials, type CloudProviderId } from "@/modules/ai/credentials";
import { readResolvedCredential } from "@/modules/ai/credential-cache";
import { AIFailure, providerFailureCategory } from "@/modules/ai/failures";
import { probeGeminiCredential } from "@/modules/ai/gemini";
import { probeOpenAICredential } from "@/modules/ai/openai";

export const CONNECTION_SUCCESS = "Connection successful";

type Probe = (input: { provider: CloudProviderId; apiKey: string; model: string }) => Promise<void>;

let probeOverride: Probe | null = null;

/** Test hook. Production uses a model lookup and does not generate text. */
export function setConnectionProbeForTests(probe: Probe | null) {
  probeOverride = probe;
}

export async function testProviderConnection(input: { provider: string }) {
  const provider = assertCloudProvider(input.provider);
  await ensureProviderCredentials();
  const selection = currentAISelection();
  const active = canonicalProviderId(selection.provider);
  const model = selection.model.trim();
  if (active !== provider) {
    throw new AIFailure(
      `Save ${provider === "GOOGLE_GEMINI" ? "Google Gemini" : "OpenAI"} as the active provider before testing the connection. Nothing was sent.`,
      "NOT_CONFIGURED",
    );
  }
  if (!model) {
    throw new AIFailure("Set a model before testing the connection. Nothing was sent.", "MODEL_NOT_CONFIGURED");
  }
  const resolved = readResolvedCredential(provider);
  if (!resolved.value) {
    throw new AIFailure(
      resolved.source === "unreadable"
        ? "The stored credential could not be read. Check AI_CREDENTIAL_ENCRYPTION_KEY and save the key again in Settings. Nothing was sent."
        : "This provider is not configured. Save an API key or set the server environment variable. Nothing was sent.",
      "NOT_CONFIGURED",
    );
  }
  try {
    if (probeOverride) await probeOverride({ provider, apiKey: resolved.value, model });
    else if (provider === "GOOGLE_GEMINI") await probeGeminiCredential(resolved.value, model);
    else await probeOpenAICredential(resolved.value, model);
    await recordCheck(provider, model, "SUCCEEDED");
    return { ok: true as const, message: CONNECTION_SUCCESS };
  } catch (error) {
    if (error instanceof AIFailure && (error.category === "NOT_CONFIGURED" || error.category === "MODEL_NOT_CONFIGURED")) {
      throw error;
    }
    const category = providerFailureCategory(error);
    const outcome = storedOutcome(category);
    console.error("[ai] connection test failed", outcome);
    await recordCheck(provider, model, outcome);
    return { ok: false as const, message: failureMessage(outcome) };
  }
}

function storedOutcome(category: ReturnType<typeof providerFailureCategory>) {
  if (category === "AUTHENTICATION_FAILED") return "AUTHENTICATION_FAILED";
  if (category === "MODEL_NOT_AVAILABLE") return "MODEL_NOT_AVAILABLE";
  if (category === "RATE_LIMITED") return "RATE_LIMITED";
  if (category === "TIMEOUT") return "TIMEOUT";
  return "PROVIDER_UNAVAILABLE";
}

function failureMessage(outcome: string) {
  if (outcome === "AUTHENTICATION_FAILED") return "Authentication failed";
  if (outcome === "MODEL_NOT_AVAILABLE") return "Model unavailable";
  if (outcome === "RATE_LIMITED") return "Rate limited";
  if (outcome === "TIMEOUT") return "The AI provider did not respond in time.";
  return "Provider unavailable";
}

async function recordCheck(provider: string, model: string, outcome: string) {
  try {
    await db.aiProviderConnectionCheck.upsert({
      where: { provider },
      create: { provider, model, outcome },
      update: { model, outcome },
    });
  } catch {
    console.error("[ai] connection check was not recorded");
  }
}
