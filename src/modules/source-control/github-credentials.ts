import "server-only";

import { db } from "@/lib/db";
import { decryptSecret, encryptionKeyAvailable, encryptionKeyFromEnvironment, encryptSecret } from "@/modules/ai/credential-crypto";
import { DomainError } from "@/modules/shared/errors";

const AGENT_ACTORS = new Set([
  "coding agent",
  "testing & verification agent",
  "testing agent",
  "verification agent",
  "architecture agent",
  "security & engineering governance agent",
  "ai product factory",
]);

const TOKEN_PATTERN = /^(github_pat_[A-Za-z0-9_]{16,}|ghp_[A-Za-z0-9]{16,}|gho_[A-Za-z0-9]{16,})$/;

export type StoredGitHubAccess =
  | { mode: "pat"; token: string }
  | { mode: "app"; appId: string; installationId: string; privateKey: string };

export type GitHubConnectionState =
  | "NOT_CONFIGURED"
  | "SAVED"
  | "CONNECTED"
  | "INVALID_CREDENTIALS"
  | "INSUFFICIENT_PERMISSIONS";

export type GitHubConnectionView = {
  state: GitHubConnectionState;
  stateLabel: string;
  nextAction: string;
  login: string;
  authMode: "NONE" | "TOKEN" | "APP";
  maskedCredential: string;
  encryptionAvailable: boolean;
  message: string;
  envAppConfigured: boolean;
  serverRepository: string;
};

const STATE_LABEL: Record<GitHubConnectionState, string> = {
  NOT_CONFIGURED: "Not configured",
  SAVED: "Saved, not validated",
  CONNECTED: "Connected",
  INVALID_CREDENTIALS: "Invalid credentials",
  INSUFFICIENT_PERMISSIONS: "Insufficient permissions",
};

const NEXT_ACTION: Record<GitHubConnectionState, string> = {
  NOT_CONFIGURED: "Save a fine-grained personal access token, or a GitHub App credential, then validate the connection.",
  SAVED: "Validate the connection. Saving a credential does not call GitHub.",
  CONNECTED: "Choose the GitHub repository on each product's Build page. Nothing is published from here.",
  INVALID_CREDENTIALS: "Replace the credential, then validate the connection again.",
  INSUFFICIENT_PERMISSIONS: "Grant Contents access for the repositories this builder should publish, then validate again.",
};

export function assertGitHubActor(actor: string) {
  if (AGENT_ACTORS.has(actor.trim().toLowerCase())) {
    throw new DomainError("An agent cannot change the GitHub connection.");
  }
  if (!actor.trim()) throw new DomainError("A person must change the GitHub connection.");
}

export async function readStoredGitHubAccess(): Promise<StoredGitHubAccess | null> {
  const row = await db.sourceControlConnection.findUnique({ where: { id: "factory" } });
  if (!row?.encryptedCredential || !row.encryptionIv || !row.authTag) return null;
  const key = encryptionKeyFromEnvironment();
  if (!key) return null;
  const secret = decryptSecret(
    { encryptedCredential: row.encryptedCredential, encryptionIv: row.encryptionIv, authTag: row.authTag },
    key,
  );
  if (!secret) return null;
  if (row.authMode === "APP" && row.appId && row.installationId) {
    return { mode: "app", appId: row.appId, installationId: row.installationId, privateKey: secret };
  }
  if (row.authMode === "TOKEN") return { mode: "pat", token: secret };
  return null;
}

export async function getGitHubConnectionView(): Promise<GitHubConnectionView> {
  const row = await db.sourceControlConnection.findUnique({ where: { id: "factory" } });
  const stored = Boolean(row?.encryptedCredential && row.encryptionIv && row.authTag);
  const envAppConfigured = Boolean(
    process.env.GITHUB_APP_ID?.trim() &&
      process.env.GITHUB_APP_INSTALLATION_ID?.trim() &&
      process.env.GITHUB_APP_PRIVATE_KEY?.trim(),
  );
  const owner = process.env.GITHUB_OWNER?.trim() ?? "";
  const repository = process.env.GITHUB_REPOSITORY?.trim() ?? "";
  let state: GitHubConnectionState = "NOT_CONFIGURED";
  if (row?.message === "Invalid credentials.") state = "INVALID_CREDENTIALS";
  else if (row?.message === "Insufficient permissions.") state = "INSUFFICIENT_PERMISSIONS";
  else if (row?.status === "CONNECTED") state = "CONNECTED";
  else if (stored) state = "SAVED";
  const authMode = row?.authMode === "APP" || row?.authMode === "TOKEN" ? row.authMode : "NONE";
  return {
    state,
    stateLabel: STATE_LABEL[state],
    nextAction: NEXT_ACTION[state],
    login: row?.login ?? "",
    authMode,
    maskedCredential: maskStoredCredential(stored, authMode === "TOKEN" ? await tokenSuffix() : ""),
    encryptionAvailable: encryptionKeyAvailable(),
    message: row?.message || "GitHub is not configured.",
    envAppConfigured,
    serverRepository: owner && repository ? `${owner}/${repository}` : "",
  };
}

export async function saveGitHubCredential(input: {
  actor: string;
  mode: "TOKEN" | "APP";
  token?: string;
  appId?: string;
  installationId?: string;
  privateKey?: string;
}) {
  assertGitHubActor(input.actor);
  const key = encryptionKeyFromEnvironment();
  if (!key) {
    throw new DomainError(
      "Set AI_CREDENTIAL_ENCRYPTION_KEY on the server to 32 bytes of base64 or hex, then restart AI Product Builder. The GitHub credential was not saved.",
    );
  }
  const material = credentialMaterial(input);
  const encrypted = encryptSecret(material.secret, key);
  const existing = await db.sourceControlConnection.findUnique({
    where: { id: "factory" },
    select: { encryptedCredential: true },
  });
  await db.sourceControlConnection.upsert({
    where: { id: "factory" },
    create: {
      id: "factory",
      provider: "GITHUB",
      authMode: material.authMode,
      appId: material.appId,
      installationId: material.installationId,
      login: "",
      status: "UNAVAILABLE",
      message: "Credential saved. Validate the connection before publishing.",
      ...encrypted,
    },
    update: {
      authMode: material.authMode,
      appId: material.appId,
      installationId: material.installationId,
      login: "",
      status: "UNAVAILABLE",
      message: "Credential saved. Validate the connection before publishing.",
      ...encrypted,
    },
  });
  return { replaced: Boolean(existing?.encryptedCredential) };
}

export async function removeGitHubCredential(input: { actor: string; confirm: string }) {
  assertGitHubActor(input.actor);
  if (input.confirm !== "remove") {
    throw new DomainError("Confirm removal before the GitHub credential is deleted.");
  }
  await db.sourceControlConnection.upsert({
    where: { id: "factory" },
    create: {
      id: "factory",
      provider: "GITHUB",
      authMode: "",
      login: "",
      appId: "",
      installationId: "",
      encryptedCredential: "",
      encryptionIv: "",
      authTag: "",
      status: "UNAVAILABLE",
      message: "GitHub connection removed.",
    },
    update: {
      authMode: "",
      login: "",
      appId: "",
      installationId: "",
      encryptedCredential: "",
      encryptionIv: "",
      authTag: "",
      status: "UNAVAILABLE",
      message: "GitHub connection removed.",
    },
  });
}

function credentialMaterial(input: {
  mode: "TOKEN" | "APP";
  token?: string;
  appId?: string;
  installationId?: string;
  privateKey?: string;
}) {
  if (input.mode === "TOKEN") {
    const secret = input.token?.trim() ?? "";
    if (!TOKEN_PATTERN.test(secret) || secret.length > 512) {
      throw new DomainError("Enter a fine-grained personal access token. It starts with github_pat_. Nothing was saved.");
    }
    return { secret, authMode: "TOKEN", appId: "", installationId: "" };
  }
  const appId = input.appId?.trim() ?? "";
  const installationId = input.installationId?.trim() ?? "";
  const secret = (input.privateKey ?? "").trim().replace(/\\n/g, "\n");
  if (!/^\d{1,20}$/.test(appId) || !/^\d{1,20}$/.test(installationId)) {
    throw new DomainError("Enter the GitHub App id and installation id. Nothing was saved.");
  }
  if (!secret.includes("PRIVATE KEY") || secret.length > 16000) {
    throw new DomainError("Enter the GitHub App private key. Nothing was saved.");
  }
  return { secret, authMode: "APP", appId, installationId };
}

async function tokenSuffix() {
  const stored = await readStoredGitHubAccess();
  if (!stored || stored.mode !== "pat" || stored.token.length < 8) return "";
  return stored.token.slice(-4);
}

function maskStoredCredential(stored: boolean, suffix: string) {
  if (!stored) return "Not saved";
  if (!suffix) return "Saved";
  return `Saved, ending ${suffix}`;
}
