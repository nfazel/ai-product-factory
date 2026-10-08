import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

/** 32-byte key as base64 (openssl rand -base64 32) or 64 hex characters. */
export function parseEncryptionKey(raw: string): Buffer | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) return null;
  return decoded;
}

export function encryptionKeyFromEnvironment() {
  return parseEncryptionKey(process.env.AI_CREDENTIAL_ENCRYPTION_KEY ?? "");
}

export function encryptionKeyAvailable() {
  return encryptionKeyFromEnvironment() !== null;
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
