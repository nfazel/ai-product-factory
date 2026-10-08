import "server-only";

import { db } from "@/lib/db";
import { canonicalProviderId, currentAISelection, providerSpec, type AIProviderId } from "@/modules/ai/config";
import {
  credentialStoreEnabled,
  forgetApplicationCredential,
  readResolvedCredential,
  rememberApplicationCredential,
  replaceCredentialCache,
  type CredentialSlot,
  type CredentialSource,
} from "@/modules/ai/credential-cache";
import { decryptSecret, encryptionKeyAvailable, encryptionKeyFromEnvironment, encryptSecret } from "@/modules/ai/credential-crypto";
import { AIFailure } from "@/modules/ai/failures";

const CLOUD_PROVIDERS = ["GOOGLE_GEMINI", "OPENAI"] as const;

export type CloudProviderId = (typeof CLOUD_PROVIDERS)[number];

export type PublicCredential = {
  provider: CloudProviderId;
  configured: boolean;
  source: CredentialSource;
  sourceLabel: string;
  connectionLabel: string;
};

const KEY_LIMIT = 512;

export function encryptionAvailable() {
  return encryptionKeyAvailable();
}

export async function ensureProviderCredentials() {
  if (!credentialStoreEnabled()) {
    replaceCredentialCache(null);
    return;
  }
  try {
    const rows = await db.aiProviderCredential.findMany({
      select: { provider: true, encryptedCredential: true, encryptionIv: true, authTag: true },
    });
    const key = encryptionKeyFromEnvironment();
    const next = new Map<string, CredentialSlot>();
    for (const provider of CLOUD_PROVIDERS) {
      const row = rows.find((item) => item.provider === provider);
      if (!row) {
        next.set(provider, { kind: "absent" });
        continue;
      }
      const secret = key
        ? decryptSecret(
            {
              encryptedCredential: row.encryptedCredential,
              encryptionIv: row.encryptionIv,
              authTag: row.authTag,
            },
            key,
          )
        : null;
      next.set(provider, secret ? { kind: "application", secret } : { kind: "unreadable" });
    }
    replaceCredentialCache(next);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "unavailable";
    console.error("[ai] credential store unavailable", code);
    throw new AIFailure("AI credentials could not be read. Nothing was generated.", "PROVIDER_UNAVAILABLE");
  }
}

export function assertCloudProvider(raw: string): CloudProviderId {
  const provider = canonicalProviderId(raw);
  if (provider !== "GOOGLE_GEMINI" && provider !== "OPENAI") {
    throw new AIFailure(
      "An API key applies only to Google Gemini or OpenAI. Ollama does not use an API key for normal local use.",
      "NOT_CONFIGURED",
    );
  }
  return provider;
}

export async function saveProviderCredential(input: { provider: string; credential: string; actor: string }) {
  const provider = assertCloudProvider(input.provider);
  const credential = input.credential.trim();
  if (!credential) {
    throw new AIFailure("Enter an API key before saving.", "NOT_CONFIGURED");
  }
  if (credential.length > KEY_LIMIT) {
    throw new AIFailure("That API key is too long to store. Nothing was saved.", "NOT_CONFIGURED");
  }
  const key = encryptionKeyFromEnvironment();
  if (!key) {
    throw new AIFailure(
      "Set AI_CREDENTIAL_ENCRYPTION_KEY on the server to 32 bytes of base64 or hex, then restart AI Product Builder. The API key was not saved.",
      "NOT_CONFIGURED",
    );
  }
  const existing = await db.aiProviderCredential.findUnique({
    where: { provider },
    select: { provider: true },
  });
  const encrypted = encryptSecret(credential, key);
  await db.aiProviderCredential.upsert({
    where: { provider },
    create: { provider, ...encrypted },
    update: encrypted,
  });
  rememberApplicationCredential(provider, credential);
  await db.aiProviderConnectionCheck.deleteMany({ where: { provider } });
  await db.aiSelectionChange.create({
    data: {
      description: `${providerSpec(provider).label} API key ${existing ? "replaced" : "saved"}`,
      actor: input.actor.trim() || "Local user",
    },
  });
  return { provider, replaced: Boolean(existing) };
}

export async function removeProviderCredential(input: { provider: string; confirm: string; actor: string }) {
  if (input.confirm !== "remove") {
    throw new AIFailure("Confirm removal before the configured key is deleted.", "NOT_CONFIGURED");
  }
  const provider = assertCloudProvider(input.provider);
  await db.aiProviderCredential.deleteMany({ where: { provider } });
  forgetApplicationCredential(provider);
  await db.aiProviderConnectionCheck.deleteMany({ where: { provider } });
  await db.aiSelectionChange.create({
    data: {
      description: `${providerSpec(provider).label} API key removed`,
      actor: input.actor.trim() || "Local user",
    },
  });
  return { provider };
}

export async function listPublicCredentials(): Promise<PublicCredential[]> {
  await ensureProviderCredentials();
  const checks = credentialStoreEnabled() ? await db.aiProviderConnectionCheck.findMany() : [];
  const active = currentAISelection();
  const activeProvider = canonicalProviderId(active.provider);
  const activeModel = active.model.trim();
  return CLOUD_PROVIDERS.map((provider) => {
    const resolved = readResolvedCredential(provider);
    const configured = resolved.source === "application" || resolved.source === "environment";
    const check = checks.find((row) => row.provider === provider);
    const matches = Boolean(check && activeProvider === provider && activeModel && check.model === activeModel);
    return {
      provider,
      configured,
      source: resolved.source,
      sourceLabel: sourceLabel(resolved.source),
      connectionLabel: matches && check ? connectionStatusLabel(check.outcome) : "Connection not tested",
    };
  });
}

export function sourceLabel(source: CredentialSource) {
  if (source === "application") return "Application configuration";
  if (source === "environment") return "Server environment";
  return "Not configured";
}

export function connectionStatusLabel(outcome: string) {
  if (outcome === "SUCCEEDED") return "Connection tested successfully";
  if (outcome === "AUTHENTICATION_FAILED") return "Authentication failed";
  if (outcome === "MODEL_NOT_AVAILABLE") return "Model unavailable";
  if (outcome === "PROVIDER_UNAVAILABLE") return "Provider unavailable";
  if (outcome === "RATE_LIMITED") return "Rate limited";
  if (outcome === "TIMEOUT") return "The AI provider did not respond in time.";
  return "Connection not tested";
}

export function isCloudProvider(provider: AIProviderId | null): provider is CloudProviderId {
  return provider === "GOOGLE_GEMINI" || provider === "OPENAI";
}
