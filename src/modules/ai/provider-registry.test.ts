import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { AnthropicProvider } from "@/modules/ai/anthropic";
import { describeAIConfiguration } from "@/modules/ai/config";
import { combineAIEvidence, aiRunEvidence } from "@/modules/ai/evidence";
import { mapProviderFailure } from "@/modules/ai/failures";
import { OpenAIProvider } from "@/modules/ai/openai";
import { getAIProvider, setAIProviderForTests } from "@/modules/ai/provider";
import { createConfiguredProvider } from "@/modules/ai/registry";
import { requireStructured } from "@/modules/ai/structured";
import { childEnv } from "@/modules/coding/git";
import { DomainError } from "@/modules/shared/errors";

const ENV_KEYS = ["AI_PROVIDER", "AI_MODEL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const OPENAI_SECRET = "sk-live-openai-secret-value-xyz";
const ANTHROPIC_SECRET = "sk-ant-live-secret-value-xyz";

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  setAIProviderForTests(null);
}

afterEach(() => {
  restoreEnv();
});

function clearAIEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("AI provider registry", () => {
  it("resolves the configured provider and does not fall back", () => {
    clearAIEnv();
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gpt-4.1-mini";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_SECRET;
    expect(createConfiguredProvider()).toBeInstanceOf(OpenAIProvider);
    expect(describeAIConfiguration()).toMatchObject({
      configured: true,
      providerId: "openai",
      providerLabel: "OpenAI",
      model: "gpt-4.1-mini",
      status: "Configured",
    });

    process.env.AI_PROVIDER = "Anthropic";
    process.env.AI_MODEL = "claude-sonnet-4-5";
    delete process.env.OPENAI_API_KEY;
    expect(createConfiguredProvider()).toBeInstanceOf(AnthropicProvider);
    expect(getAIProvider("discovery")).toBeInstanceOf(AnthropicProvider);
    expect(describeAIConfiguration().providerId).toBe("anthropic");
  });

  it("fails safely for an unsupported provider without using another one", () => {
    clearAIEnv();
    process.env.AI_PROVIDER = "google";
    process.env.AI_MODEL = "gemini-2.5-pro";
    process.env.OPENAI_API_KEY = OPENAI_SECRET;
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_SECRET;
    expect(() => createConfiguredProvider()).toThrow(/not supported/);
    expect(() => createConfiguredProvider()).toThrow(/google/);
    expect(describeAIConfiguration().configured).toBe(false);
    expect(describeAIConfiguration().status).toBe("Not configured");
  });

  it("fails safely when the selected provider has no credential and does not switch provider", () => {
    clearAIEnv();
    process.env.AI_PROVIDER = "anthropic";
    process.env.AI_MODEL = "claude-sonnet-4-5";
    process.env.OPENAI_API_KEY = OPENAI_SECRET;
    expect(() => createConfiguredProvider()).toThrow(DomainError);
    expect(() => createConfiguredProvider()).toThrow(/AI is not configured/);
    expect(() => createConfiguredProvider()).not.toThrow(/sk-live/);
    const view = describeAIConfiguration();
    expect(view.configured).toBe(false);
    expect(view.providerId).toBe("anthropic");
    expect(view.issue).toBe("credential_missing");
  });

  it("fails safely when the model is missing and does not substitute one", () => {
    clearAIEnv();
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-openai-key";
    expect(() => createConfiguredProvider()).toThrow(/AI_MODEL/);
    expect(() => createConfiguredProvider()).toThrow(/No model was substituted/);
    expect(describeAIConfiguration().model).toBeNull();
    expect(describeAIConfiguration().configured).toBe(false);
  });

  it("rejects a model that belongs to the other provider", () => {
    clearAIEnv();
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "claude-sonnet-4-5";
    process.env.OPENAI_API_KEY = "test-openai-key";
    expect(() => createConfiguredProvider()).toThrow(/cannot be used with OpenAI/);
    expect(() => createConfiguredProvider()).toThrow(/No other model was substituted/);

    process.env.AI_PROVIDER = "anthropic";
    process.env.AI_MODEL = "gpt-4.1-mini";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    expect(() => createConfiguredProvider()).toThrow(/cannot be used with Anthropic/);
  });

  it("fails safely when structured output is invalid and does not fill missing fields", () => {
    const schema = z.object({ name: z.string().min(1) }).strict();
    expect(requireStructured(schema, { name: "Claims" })).toEqual({ name: "Claims" });
    expect(() => requireStructured(schema, {})).toThrow(/required structure/);
    expect(() => requireStructured(schema, { name: "Claims", extra: true })).toThrow(/required structure/);
    expect(() => requireStructured(schema, null)).toThrow(DomainError);
    expect(() => requireStructured(schema, {})).toThrow(DomainError);
  });

  it("maps provider failures without turning them into a model response", () => {
    expect(() => mapProviderFailure(Object.assign(new Error("no"), { status: 401, name: "AuthenticationError" }))).toThrow(
      /rejected the credentials/,
    );
    expect(() => mapProviderFailure(Object.assign(new Error("slow"), { status: 429 }))).toThrow(/rate limit/);
    expect(() => mapProviderFailure(Object.assign(new Error("down"), { status: 503 }))).toThrow(/unavailable/);
    expect(() => mapProviderFailure(Object.assign(new Error("timed out"), { name: "APIConnectionTimeoutError" }))).toThrow(
      /did not respond in time/,
    );
    expect(() => mapProviderFailure(Object.assign(new Error("model gpt-missing was not found"), { status: 404 }))).toThrow(
      /No other model was substituted/,
    );
    expect(() => mapProviderFailure(new DomainError("kept"))).toThrow(/kept/);
  });

  it("keeps credentials out of the client configuration and child process environment", () => {
    clearAIEnv();
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gpt-4.1-mini";
    process.env.OPENAI_API_KEY = OPENAI_SECRET;
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_SECRET;
    const view = describeAIConfiguration();
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(OPENAI_SECRET);
    expect(serialized).not.toContain(ANTHROPIC_SECRET);
    expect(serialized).not.toContain("sk-");
    expect(view).not.toHaveProperty("apiKey");
    expect(Object.keys(view)).not.toEqual(expect.arrayContaining(["key", "secret", "token"]));

    const env = childEnv();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain(OPENAI_SECRET);
    expect(JSON.stringify(env)).not.toContain(ANTHROPIC_SECRET);

    const settings = readFileSync(path.join(process.cwd(), "src/app/(app)/settings/page.tsx"), "utf8");
    expect(settings).not.toMatch(/use client/);
    expect(settings).not.toMatch(/NEXT_PUBLIC_/);
    expect(settings).toMatch(/AI Configuration/);
    expect(settings).toMatch(/Provider/);
    expect(settings).toMatch(/Model/);
    expect(settings).toMatch(/Status/);
  });

  it("does not let product modules import a provider SDK", () => {
    const roots = [
      "discovery",
      "requirements",
      "intake",
      "architecture",
      "governance",
      "coding",
      "verification",
      "release",
      "analytics",
      "agent",
    ];
    const files = roots.flatMap((root) => walk(path.join(process.cwd(), "src/modules", root)));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      if (file.endsWith(".test.ts")) continue;
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from ["']openai["']/);
      expect(source, file).not.toMatch(/@anthropic-ai\/sdk/);
      expect(source, file).not.toMatch(/new OpenAI|new Anthropic/);
    }
    const clientFiles = walk(path.join(process.cwd(), "src")).filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.startsWith('"use client"') || source.startsWith("'use client'");
    });
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/OPENAI_API_KEY|ANTHROPIC_API_KEY|NEXT_PUBLIC_/);
      expect(source, file).not.toMatch(/from ["']openai["']|@anthropic-ai\/sdk/);
    }
  });

  it("records provider and model evidence without credentials", () => {
    const evidence = aiRunEvidence({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      usage: { inputTokens: 3, outputTokens: 5 },
    });
    expect(evidence).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      usage: { inputTokens: 3, outputTokens: 5 },
    });
    const combined = combineAIEvidence([
      evidence,
      { provider: "anthropic", model: "claude-sonnet-4-5", usage: { inputTokens: null, outputTokens: 1 } },
    ]);
    expect(combined?.usage.inputTokens).toBeNull();
    expect(combined?.usage.outputTokens).toBe(6);
    expect(JSON.stringify(combined)).not.toContain("sk-");
  });
});

function walk(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}
