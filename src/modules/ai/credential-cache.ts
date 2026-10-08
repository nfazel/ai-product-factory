import "server-only";

import type { AIProviderId } from "@/modules/ai/config";

export type CredentialSource = "application" | "environment" | "none" | "unreadable";

export type CredentialSlot =
  | { kind: "absent" }
  | { kind: "unreadable" }
  | { kind: "application"; secret: string };

let loaded = false;
const slots = new Map<string, CredentialSlot>();

export function credentialStoreEnabled() {
  return process.env.AI_SELECTION_DISABLE_STORE !== "1";
}

export function replaceCredentialCache(next: Map<string, CredentialSlot> | null) {
  slots.clear();
  loaded = next !== null;
  if (!next) return;
  for (const [provider, slot] of next) slots.set(provider, slot);
}

export function rememberApplicationCredential(provider: AIProviderId, secret: string) {
  slots.set(provider, { kind: "application", secret });
  loaded = true;
}

export function forgetApplicationCredential(provider: AIProviderId) {
  slots.set(provider, { kind: "absent" });
  loaded = true;
}

export function knownCredentialSecrets() {
  const secrets: string[] = [];
  for (const slot of slots.values()) {
    if (slot.kind === "application" && slot.secret.length > 8) secrets.push(slot.secret);
  }
  return secrets;
}

export function readResolvedCredential(provider: AIProviderId): { value: string; source: CredentialSource } {
  if (provider === "OLLAMA") return { value: "", source: "none" };
  const env = environmentCredential(provider);
  if (!credentialStoreEnabled() || !loaded) {
    return env ? { value: env, source: "environment" } : { value: "", source: "none" };
  }
  const slot = slots.get(provider) ?? { kind: "absent" as const };
  if (slot.kind === "application") return { value: slot.secret, source: "application" };
  if (slot.kind === "unreadable") return { value: "", source: "unreadable" };
  return env ? { value: env, source: "environment" } : { value: "", source: "none" };
}

function environmentCredential(provider: AIProviderId) {
  if (provider === "OPENAI") return process.env.OPENAI_API_KEY?.trim() ?? "";
  if (provider === "GOOGLE_GEMINI") return process.env.GOOGLE_GEMINI_API_KEY?.trim() ?? "";
  return "";
}
