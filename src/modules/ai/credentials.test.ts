import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { safeErrorMessage } from "@/modules/ai/errors";
import { setConnectionProbeForTests, testProviderConnection } from "@/modules/ai/connection";
import { readProviderCredential, rememberAISelection } from "@/modules/ai/config";
import { readResolvedCredential, replaceCredentialCache } from "@/modules/ai/credential-cache";
import { decryptSecret, encryptSecret, encryptionKeyConfigurationStatus, parseEncryptionKey } from "@/modules/ai/credential-crypto";
import {
  ensureProviderCredentials,
  listPublicCredentials,
  removeProviderCredential,
  saveProviderCredential,
} from "@/modules/ai/credentials";

/**
 * SECURITY NOTE: All credential values in this file are intentionally fake test keys.
 * They are not real API keys and cannot access any services.
 * These are hardcoded for testing purposes only.
 */

const GEMINI_KEY = "test-gemini-key-do-not-use-AIzaSyTestGeminiCredentialValue1234567890";
const OPENAI_KEY = "test-gemini-key-do-not-use-sk-test-openai-credential-value-1234567890";
const ENV_GEMINI = "test-gemini-key-do-not-use-AIzaSyEnvironmentGeminiCredential999999";
const ENCRYPTION_KEY = randomBytes(32).toString("base64");

describe("provider credentials", () => {
  const previousFlag = process.env.AI_SELECTION_DISABLE_STORE;
  const originalEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_MODEL: process.env.AI_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
    AI_CREDENTIAL_ENCRYPTION_KEY: process.env.AI_CREDENTIAL_ENCRYPTION_KEY,
  };
  let previousCredentials: Array<{
    provider: string;
    encryptedCredential: string;
    encryptionIv: string;
    authTag: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  let previousChecks: Array<{ provider: string; model: string; outcome: string; checkedAt: Date }> = [];
  let existingChangeIds: string[] = [];
  let manageStore = false;

  afterEach(async () => {
    setConnectionProbeForTests(null);
    replaceCredentialCache(null);
    rememberAISelection(null);
    process.env.AI_SELECTION_DISABLE_STORE = previousFlag;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (manageStore) {
      await db.aiProviderCredential.deleteMany();
      await db.aiProviderConnectionCheck.deleteMany();
      if (previousCredentials.length > 0) {
        await db.aiProviderCredential.createMany({ data: previousCredentials });
      }
      if (previousChecks.length > 0) {
        await db.aiProviderConnectionCheck.createMany({ data: previousChecks });
      }
      const current = await db.aiSelectionChange.findMany({ select: { id: true } });
      const created = current.map((row) => row.id).filter((id) => !existingChangeIds.includes(id));
      if (created.length > 0) await db.aiSelectionChange.deleteMany({ where: { id: { in: created } } });
    }
    manageStore = false;
    previousCredentials = [];
    previousChecks = [];
    existingChangeIds = [];
  });

  async function enableStore() {
    manageStore = true;
    previousCredentials = await db.aiProviderCredential.findMany({
      select: {
        provider: true,
        encryptedCredential: true,
        encryptionIv: true,
        authTag: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    previousChecks = await db.aiProviderConnectionCheck.findMany({
      select: { provider: true, model: true, outcome: true, checkedAt: true },
    });
    existingChangeIds = (await db.aiSelectionChange.findMany({ select: { id: true } })).map((row) => row.id);
    await db.aiProviderCredential.deleteMany();
    await db.aiProviderConnectionCheck.deleteMany();
    delete process.env.AI_SELECTION_DISABLE_STORE;
    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = ENCRYPTION_KEY;
    delete process.env.GOOGLE_GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    replaceCredentialCache(null);
  }

  it("saves Gemini and OpenAI credentials encrypted, and Settings does not return them", async () => {
    await enableStore();
    const gemini = await saveProviderCredential({ provider: "GOOGLE_GEMINI", credential: GEMINI_KEY, actor: "Local user" });
    const openai = await saveProviderCredential({ provider: "openai", credential: OPENAI_KEY, actor: "Local user" });
    expect(gemini.replaced).toBe(false);
    expect(openai.replaced).toBe(false);

    const rows = await db.aiProviderCredential.findMany();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain(GEMINI_KEY);
      expect(serialized).not.toContain(OPENAI_KEY);
      expect(row.encryptedCredential).not.toBe(row.provider === "GOOGLE_GEMINI" ? GEMINI_KEY : OPENAI_KEY);
      const key = parseEncryptionKey(ENCRYPTION_KEY);
      expect(key).not.toBeNull();
      const plain = decryptSecret(row, key!);
      expect(plain).toBe(row.provider === "GOOGLE_GEMINI" ? GEMINI_KEY : OPENAI_KEY);
    }

    await ensureProviderCredentials();
    expect(readProviderCredential("GOOGLE_GEMINI")).toBe(GEMINI_KEY);
    expect(readResolvedCredential("OPENAI")).toMatchObject({ source: "application" });

    process.env.AI_PROVIDER = "GOOGLE_GEMINI";
    process.env.AI_MODEL = "gemini-flash-latest";
    const published = await listPublicCredentials();
    const body = JSON.stringify(published);
    expect(body).not.toContain(GEMINI_KEY);
    expect(body).not.toContain(OPENAI_KEY);
    expect(body).not.toContain("encryptedCredential");
    expect(published.find((item) => item.provider === "GOOGLE_GEMINI")).toMatchObject({
      configured: true,
      source: "application",
      sourceLabel: "Application configuration",
      connectionLabel: "Connection not tested",
    });
    expect(Object.keys(published[0] ?? {}).sort()).toEqual([
      "configured",
      "connectionLabel",
      "provider",
      "source",
      "sourceLabel",
    ]);

    await assertSecretAbsent(GEMINI_KEY);
    await assertSecretAbsent(OPENAI_KEY);
    const changes = await db.aiSelectionChange.findMany({ orderBy: { createdAt: "desc" }, take: 4 });
    expect(changes.map((change) => change.description)).toEqual(
      expect.arrayContaining(["Google Gemini API key saved", "OpenAI API key saved"]),
    );
  });

  it("replaces a credential and removes it without touching the environment", async () => {
    await enableStore();
    process.env.GOOGLE_GEMINI_API_KEY = ENV_GEMINI;
    await saveProviderCredential({ provider: "GOOGLE_GEMINI", credential: GEMINI_KEY, actor: "Local user" });
    const replaced = await saveProviderCredential({
      provider: "GOOGLE_GEMINI",
      credential: `${GEMINI_KEY}-replaced`,
      actor: "Local user",
    });
    expect(replaced.replaced).toBe(true);
    const rows = await db.aiProviderCredential.findMany({ where: { provider: "GOOGLE_GEMINI" } });
    expect(rows).toHaveLength(1);
    const plain = decryptSecret(rows[0]!, parseEncryptionKey(ENCRYPTION_KEY)!);
    expect(plain).toBe(`${GEMINI_KEY}-replaced`);
    expect(JSON.stringify(rows[0])).not.toContain(GEMINI_KEY);

    await ensureProviderCredentials();
    expect(readProviderCredential("GOOGLE_GEMINI")).toBe(`${GEMINI_KEY}-replaced`);
    expect(readResolvedCredential("GOOGLE_GEMINI").source).toBe("application");

    await removeProviderCredential({ provider: "GOOGLE_GEMINI", confirm: "remove", actor: "Local user" });
    expect(process.env.GOOGLE_GEMINI_API_KEY).toBe(ENV_GEMINI);
    await ensureProviderCredentials();
    expect(readResolvedCredential("GOOGLE_GEMINI")).toEqual({ value: ENV_GEMINI, source: "environment" });
    expect(await db.aiProviderCredential.findMany()).toHaveLength(0);

    const published = JSON.stringify(await listPublicCredentials());
    expect(published).not.toContain(GEMINI_KEY);
    expect(published).not.toContain(ENV_GEMINI);
    expect(published).toContain("Server environment");
  });

  it("prefers an application credential and falls back to the environment only when none is stored", async () => {
    await enableStore();
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    await ensureProviderCredentials();
    expect(readResolvedCredential("OPENAI")).toEqual({ value: OPENAI_KEY, source: "environment" });

    await saveProviderCredential({ provider: "OPENAI", credential: `${OPENAI_KEY}-app`, actor: "Local user" });
    await ensureProviderCredentials();
    expect(readProviderCredential("OPENAI")).toBe(`${OPENAI_KEY}-app`);
    expect(readResolvedCredential("OPENAI").source).toBe("application");
  });

  it("fails safely when the encryption key is missing or the stored credential cannot be read", async () => {
    await enableStore();
    delete process.env.AI_CREDENTIAL_ENCRYPTION_KEY;
    await expect(
      saveProviderCredential({ provider: "GOOGLE_GEMINI", credential: GEMINI_KEY, actor: "Local user" }),
    ).rejects.toThrow(/AI_CREDENTIAL_ENCRYPTION_KEY/);
    await saveProviderCredential({ provider: "GOOGLE_GEMINI", credential: GEMINI_KEY, actor: "Local user" }).then(
      () => {
        throw new Error("expected the save to fail");
      },
      (error: unknown) => {
        expect(error instanceof Error ? error.message : "").not.toContain(GEMINI_KEY);
      },
    );
    expect(await db.aiProviderCredential.findMany()).toHaveLength(0);

    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = "not-a-32-byte-key";
    await expect(
      saveProviderCredential({ provider: "OPENAI", credential: OPENAI_KEY, actor: "Local user" }),
    ).rejects.toThrow(/was not saved/);
    expect(await db.aiProviderCredential.findMany()).toHaveLength(0);

    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = ENCRYPTION_KEY;
    const encrypted = encryptSecret(GEMINI_KEY, parseEncryptionKey(ENCRYPTION_KEY)!);
    await db.aiProviderCredential.create({ data: { provider: "GOOGLE_GEMINI", ...encrypted } });
    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    process.env.GOOGLE_GEMINI_API_KEY = ENV_GEMINI;
    await ensureProviderCredentials();
    expect(readResolvedCredential("GOOGLE_GEMINI")).toEqual({ value: "", source: "unreadable" });
    expect(readProviderCredential("GOOGLE_GEMINI")).toBe("");

    await db.aiProviderCredential.update({
      where: { provider: "GOOGLE_GEMINI" },
      data: { authTag: randomBytes(16).toString("base64"), encryptedCredential: randomBytes(24).toString("base64") },
    });
    await ensureProviderCredentials();
    expect(readResolvedCredential("GOOGLE_GEMINI").source).toBe("unreadable");
    const published = JSON.stringify(await listPublicCredentials());
    expect(published).not.toContain(GEMINI_KEY);
    expect(published).not.toContain(ENV_GEMINI);
  });

  it("tests a connection only when asked and returns a fixed message", async () => {
    await enableStore();
    await saveProviderCredential({ provider: "GOOGLE_GEMINI", credential: GEMINI_KEY, actor: "Local user" });
    process.env.AI_PROVIDER = "GOOGLE_GEMINI";
    process.env.AI_MODEL = "gemini-flash-latest";
    let calls = 0;
    setConnectionProbeForTests(async ({ apiKey, model }) => {
      calls += 1;
      expect(apiKey).toBe(GEMINI_KEY);
      expect(model).toBe("gemini-flash-latest");
    });
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      const success = await testProviderConnection({ provider: "GOOGLE_GEMINI" });
      expect(success).toEqual({ ok: true, message: "Connection successful" });
      expect(calls).toBe(1);
      const status = await listPublicCredentials();
      expect(status.find((item) => item.provider === "GOOGLE_GEMINI")?.connectionLabel).toBe(
        "Connection tested successfully",
      );

      setConnectionProbeForTests(async () => {
        throw Object.assign(new Error(`rejected ${GEMINI_KEY}`), { status: 401 });
      });
      const auth = await testProviderConnection({ provider: "GOOGLE_GEMINI" });
      expect(auth.message).toBe("Authentication failed");
      expect(auth.message).not.toContain(GEMINI_KEY);

      setConnectionProbeForTests(async () => {
        throw Object.assign(new Error(`down ${GEMINI_KEY}`), { status: 503 });
      });
      expect((await testProviderConnection({ provider: "GOOGLE_GEMINI" })).message).toBe("Provider unavailable");

      setConnectionProbeForTests(async () => {
        throw Object.assign(new Error(`missing ${GEMINI_KEY}`), { status: 404 });
      });
      expect((await testProviderConnection({ provider: "GOOGLE_GEMINI" })).message).toBe("Model unavailable");
    } finally {
      console.error = original;
    }
    expect(JSON.stringify(errors)).not.toContain(GEMINI_KEY);
    expect(JSON.stringify(errors)).toContain("AUTHENTICATION_FAILED");
    expect(safeErrorMessage(new Error(`provider echoed ${GEMINI_KEY}`))).not.toContain(GEMINI_KEY);
    await assertSecretAbsent(GEMINI_KEY);
  });

  it("does not call the provider while saving, and client code cannot decrypt", () => {
    const credentials = readFileSync(path.join(process.cwd(), "src/modules/ai/credentials.ts"), "utf8");
    const surface = readFileSync(path.join(process.cwd(), "src/modules/ai/surface.ts"), "utf8");
    const gemini = readFileSync(path.join(process.cwd(), "src/modules/ai/gemini.ts"), "utf8");
    const openai = readFileSync(path.join(process.cwd(), "src/modules/ai/openai.ts"), "utf8");
    expect(credentials).not.toMatch(/testProviderConnection|models\.get|models\.retrieve|generateContent/);
    expect(surface).not.toMatch(/testProviderConnection|probeGeminiCredential|probeOpenAICredential/);
    expect(gemini).toMatch(/models\.get\(\{ model \}\)/);
    expect(openai).toMatch(/models\.retrieve\(model\)/);

    const clientFiles = walk(path.join(process.cwd(), "src")).filter((file) => {
      if (file.endsWith(".test.ts")) return false;
      const source = readFileSync(file, "utf8");
      return source.includes('"use client"') || source.includes("'use client'");
    });
    expect(clientFiles.length).toBeGreaterThan(3);
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/credential-crypto|decryptSecret|createDecipheriv|encryptSecret/);
      expect(source, file).not.toMatch(/OPENAI_API_KEY|GOOGLE_GEMINI_API_KEY|AI_CREDENTIAL_ENCRYPTION_KEY/);
    }
  });

  it("saves an API key when the encryption key is padded base64 or 64-character hex", async () => {
    await enableStore();
    const padded = randomBytes(32).toString("base64");
    expect(padded.endsWith("=")).toBe(true);
    expect(padded).not.toHaveLength(32);
    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = padded;
    const saved = await saveProviderCredential({ provider: "GOOGLE_GEMINI", credential: GEMINI_KEY, actor: "Local user" });
    expect(saved).toEqual({ provider: "GOOGLE_GEMINI", replaced: false });
    const row = await db.aiProviderCredential.findUnique({ where: { provider: "GOOGLE_GEMINI" } });
    expect(row).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain(GEMINI_KEY);
    expect(JSON.stringify(row)).not.toContain(padded);
    expect(decryptSecret(row!, parseEncryptionKey(padded)!)).toBe(GEMINI_KEY);
    const status = encryptionKeyConfigurationStatus();
    expect(status).toEqual({ configured: "Yes", valid: "Yes" });
    expect(JSON.stringify(status)).not.toContain(padded);
    expect(JSON.stringify(status)).not.toContain(GEMINI_KEY);

    const hex = randomBytes(32).toString("hex");
    expect(hex).toHaveLength(64);
    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = hex;
    const replaced = await saveProviderCredential({
      provider: "GOOGLE_GEMINI",
      credential: `${GEMINI_KEY}-hex`,
      actor: "Local user",
    });
    expect(replaced.replaced).toBe(true);
    const hexRow = await db.aiProviderCredential.findUnique({ where: { provider: "GOOGLE_GEMINI" } });
    expect(JSON.stringify(hexRow)).not.toContain(hex);
    expect(JSON.stringify(hexRow)).not.toContain(GEMINI_KEY);
    expect(decryptSecret(hexRow!, parseEncryptionKey(hex)!)).toBe(`${GEMINI_KEY}-hex`);
    await assertSecretAbsent(GEMINI_KEY);
    await assertSecretAbsent(padded);
    await assertSecretAbsent(hex);
  });
});

async function assertSecretAbsent(secret: string) {
  const activity = await db.activity.findFirst({ where: { description: { contains: secret } }, select: { id: true } });
  expect(activity).toBeNull();
  const runs = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "AgentRun"
    WHERE COALESCE("input"::text, '') LIKE ${"%" + secret + "%"}
       OR COALESCE("output"::text, '') LIKE ${"%" + secret + "%"}
    LIMIT 1
  `;
  expect(runs).toHaveLength(0);
  const evidence = await db.$queryRaw<Array<{ found: number }>>`
    SELECT 1 AS found FROM "GovernanceEvidence" WHERE description LIKE ${"%" + secret + "%"} OR result LIKE ${"%" + secret + "%"}
    UNION ALL
    SELECT 1 FROM "CodingEvidence" WHERE description LIKE ${"%" + secret + "%"} OR result LIKE ${"%" + secret + "%"} OR command LIKE ${"%" + secret + "%"}
    UNION ALL
    SELECT 1 FROM "VerificationEvidence" WHERE description LIKE ${"%" + secret + "%"} OR result LIKE ${"%" + secret + "%"} OR command LIKE ${"%" + secret + "%"}
    UNION ALL
    SELECT 1 FROM "SourceControlEvidence" WHERE description LIKE ${"%" + secret + "%"} OR result LIKE ${"%" + secret + "%"}
    UNION ALL
    SELECT 1 FROM "ReleaseEvidence" WHERE description LIKE ${"%" + secret + "%"} OR result LIKE ${"%" + secret + "%"}
    LIMIT 1
  `;
  expect(evidence).toHaveLength(0);
  const changes = await db.aiSelectionChange.findFirst({
    where: { description: { contains: secret } },
    select: { id: true },
  });
  expect(changes).toBeNull();
}

function walk(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}
