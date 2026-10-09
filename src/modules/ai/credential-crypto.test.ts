import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  encryptionKeyConfigurationStatus,
  encryptionKeyFromEnvironment,
  parseEncryptionKey,
} from "@/modules/ai/credential-crypto";

describe("encryption key parsing", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalKey = process.env.AI_CREDENTIAL_ENCRYPTION_KEY;
  const originalCwd = process.cwd();
  let temporaryDirectory: string | null = null;

  afterEach(() => {
    process.chdir(originalCwd);
    setNodeEnv(originalNodeEnv);
    if (originalKey === undefined) delete process.env.AI_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.AI_CREDENTIAL_ENCRYPTION_KEY = originalKey;
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  });

  it("accepts a base64 key that decodes to 32 bytes, including = padding", () => {
    const key = randomBytes(32);
    const encoded = key.toString("base64");
    expect(encoded.endsWith("=")).toBe(true);
    expect(encoded).not.toHaveLength(32);
    expect(parseEncryptionKey(encoded)?.equals(key)).toBe(true);
    expect(parseEncryptionKey(`  ${encoded}\n`)?.equals(key)).toBe(true);
    expect(parseEncryptionKey(`"${encoded}"`)?.equals(key)).toBe(true);
    expect(parseEncryptionKey(`'${encoded}'`)?.equals(key)).toBe(true);
  });

  it("accepts a base64 key whose + was turned into a space", () => {
    let encoded = "";
    let key = Buffer.alloc(0);
    do {
      key = randomBytes(32);
      encoded = key.toString("base64");
    } while (!encoded.includes("+"));
    expect(parseEncryptionKey(encoded.replaceAll("+", " "))?.equals(key)).toBe(true);
  });

  it("accepts a 64-character hex key", () => {
    const key = randomBytes(32);
    const encoded = key.toString("hex");
    expect(encoded).toHaveLength(64);
    expect(parseEncryptionKey(encoded)?.equals(key)).toBe(true);
    expect(parseEncryptionKey(encoded.toUpperCase())?.equals(key)).toBe(true);
  });

  it("rejects invalid base64 and values that do not decode to 32 bytes", () => {
    expect(parseEncryptionKey("not a key !!!")).toBeNull();
    expect(parseEncryptionKey("@@@@")).toBeNull();
    expect(parseEncryptionKey("A".repeat(32))).toBeNull();
    expect(parseEncryptionKey(randomBytes(16).toString("base64"))).toBeNull();
    expect(parseEncryptionKey(randomBytes(31).toString("base64"))).toBeNull();
    expect(parseEncryptionKey(randomBytes(33).toString("base64"))).toBeNull();
    expect(parseEncryptionKey(randomBytes(48).toString("base64"))).toBeNull();
    expect(parseEncryptionKey("ab")).toBeNull();
    expect(parseEncryptionKey("zz".repeat(32))).toBeNull();
  });

  it("reads the process value at call time and ignores dotenv files during tests", () => {
    delete process.env.AI_CREDENTIAL_ENCRYPTION_KEY;
    expect(encryptionKeyFromEnvironment()).toBeNull();
    expect(encryptionKeyConfigurationStatus()).toEqual({ configured: "No", valid: "No" });

    const key = randomBytes(32);
    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = key.toString("base64");
    expect(encryptionKeyFromEnvironment()?.equals(key)).toBe(true);
    const status = encryptionKeyConfigurationStatus();
    expect(status).toEqual({ configured: "Yes", valid: "Yes" });
    expect(JSON.stringify(status)).not.toContain(key.toString("base64"));
    expect(JSON.stringify(status)).not.toMatch(/length|prefix|suffix/i);

    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = "not-a-32-byte-key";
    expect(encryptionKeyFromEnvironment()).toBeNull();
    expect(encryptionKeyConfigurationStatus()).toEqual({ configured: "Yes", valid: "No" });
  });

  it("uses a valid dotenv file when the process value is missing or unusable outside tests", () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "encryption-key-"));
    const fileKey = randomBytes(32);
    const encoded = fileKey.toString("base64");
    expect(encoded.includes("=")).toBe(true);
    writeFileSync(path.join(temporaryDirectory, ".env.local"), `AI_CREDENTIAL_ENCRYPTION_KEY=${encoded}\n`);
    writeFileSync(path.join(temporaryDirectory, ".env"), `AI_CREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`);
    process.chdir(temporaryDirectory);
    setNodeEnv("development");
    delete process.env.AI_CREDENTIAL_ENCRYPTION_KEY;

    expect(encryptionKeyFromEnvironment()?.equals(fileKey)).toBe(true);
    expect(encryptionKeyConfigurationStatus()).toEqual({ configured: "Yes", valid: "Yes" });

    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = "not-a-32-byte-key";
    expect(encryptionKeyFromEnvironment()?.equals(fileKey)).toBe(true);

    const processKey = randomBytes(32);
    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = processKey.toString("base64");
    expect(encryptionKeyFromEnvironment()?.equals(processKey)).toBe(true);
  });

  it("round-trips a secret with a padded base64 key without putting the key in the payload", () => {
    const key = parseEncryptionKey(randomBytes(32).toString("base64"));
    expect(key).not.toBeNull();
    const secret = "synthetic-provider-credential";
    const payload = encryptSecret(secret, key!);
    expect(JSON.stringify(payload)).not.toContain(secret);
    expect(decryptSecret(payload, key!)).toBe(secret);
  });

  it("does not read the encryption key through a static process.env access", () => {
    const source = readFileSync(path.join(process.cwd(), "src/modules/ai/credential-crypto.ts"), "utf8");
    const errors = readFileSync(path.join(process.cwd(), "src/modules/ai/errors.ts"), "utf8");
    expect(source).not.toMatch(/process\.env\.AI_CREDENTIAL_ENCRYPTION_KEY/);
    expect(errors).not.toMatch(/process\.env\.AI_CREDENTIAL_ENCRYPTION_KEY/);
    expect(source).toMatch(/aes-256-gcm/);
    expect(source).not.toMatch(/NEXT_PUBLIC_/);
  });
});

function setNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}
