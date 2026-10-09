import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY_ENV = "AI_CREDENTIAL_ENCRYPTION_KEY";

/**
 * 32 decoded bytes, as base64 (`openssl rand -base64 32`, including `=` padding)
 * or as 64 hexadecimal characters. The base64 text itself is not 32 characters.
 */
export function parseEncryptionKey(raw: string): Buffer | null {
  const value = normalizeKeyMaterial(raw);
  if (!value) return null;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    const decoded = Buffer.from(value, "hex");
    return decoded.length === 32 ? decoded : null;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) return null;
  const canonical = decoded.toString("base64").replace(/=+$/, "");
  if (canonical !== value.replace(/=+$/, "")) return null;
  return decoded;
}

export function encryptionKeyFromEnvironment() {
  return resolveEncryptionKey();
}

export function encryptionKeyAvailable() {
  return encryptionKeyFromEnvironment() !== null;
}

/** Server-side only. Never includes key material, length, or a prefix. */
export function encryptionKeyConfigurationStatus(): { configured: "Yes" | "No"; valid: "Yes" | "No" } {
  const raw = resolveRawEncryptionKey();
  const valid = parseEncryptionKey(raw ?? "") !== null;
  return {
    configured: raw && raw.trim() ? "Yes" : "No",
    valid: valid ? "Yes" : "No",
  };
}

export type EncryptedCredential = {
  encryptedCredential: string;
  encryptionIv: string;
  authTag: string;
};

export function encryptSecret(plaintext: string, key: Buffer): EncryptedCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    encryptedCredential: ciphertext.toString("base64"),
    encryptionIv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(payload: EncryptedCredential, key: Buffer) {
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.encryptionIv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.encryptedCredential, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}

function resolveEncryptionKey() {
  const raw = resolveRawEncryptionKey();
  return raw ? parseEncryptionKey(raw) : null;
}

function resolveRawEncryptionKey() {
  const fromProcess = readProcessEncryptionKey();
  if (fromProcess && parseEncryptionKey(fromProcess)) return fromProcess;
  if (process.env.NODE_ENV === "test") return fromProcess;
  return readEncryptionKeyFromFiles() ?? fromProcess;
}

/** Dynamic lookup. A static `process.env.NAME` access can be inlined before the server environment exists. */
function readProcessEncryptionKey() {
  const value = process.env[ENCRYPTION_KEY_ENV];
  return typeof value === "string" ? value : undefined;
}

function readEncryptionKeyFromFiles() {
  const nodeEnv = process.env.NODE_ENV === "production" ? "production" : "development";
  const files = [`.env.${nodeEnv}.local`, ".env.local", `.env.${nodeEnv}`, ".env"];
  for (const file of files) {
    const raw = readDotenvAssignment(path.join(/* turbopackIgnore: true */ process.cwd(), file), ENCRYPTION_KEY_ENV);
    if (raw && parseEncryptionKey(raw)) return raw;
  }
  return undefined;
}

function readDotenvAssignment(filePath: string, name: string) {
  let text: string;
  try {
    text = readFileSync(/* turbopackIgnore: true */ filePath, "utf8");
  } catch {
    return undefined;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const separator = body.indexOf("=");
    if (separator === -1) continue;
    if (body.slice(0, separator).trim() !== name) continue;
    return body.slice(separator + 1).trim();
  }
  return undefined;
}

function normalizeKeyMaterial(raw: string) {
  let value = raw.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }
  // Form and query decoding turns "+" into a space. Base64 uses "+".
  value = value.replace(/ /g, "+");
  value = value.replace(/[\r\n\t]/g, "");
  return value;
}
