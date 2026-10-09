import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { describeAIConfiguration } from "@/modules/ai/config";
import { combineAIEvidence, aiRunEvidence } from "@/modules/ai/evidence";
import { AIFailure, mapProviderFailure } from "@/modules/ai/failures";
import { GeminiProvider } from "@/modules/ai/gemini";
import { OllamaProvider } from "@/modules/ai/ollama";
import { OpenAIProvider } from "@/modules/ai/openai";
import { getAIProvider, setAIProviderForTests } from "@/modules/ai/provider";
import { createConfiguredProvider } from "@/modules/ai/registry";
import { requireStructured } from "@/modules/ai/structured";
import { childEnv } from "@/modules/coding/git";
import { DomainError } from "@/modules/shared/errors";

const ENV_KEYS = ["AI_PROVIDER", "AI_MODEL", "OPENAI_API_KEY", "GOOGLE_GEMINI_API_KEY", "OLLAMA_BASE_URL", "AI_CREDENTIAL_ENCRYPTION_KEY"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const OPENAI_SECRET = "sk-live-openai-secret-value-xyz";
const GEMINI_SECRET = "AIzaSyLiveGeminiSecretValue123456";

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
  it("resolves Gemini, Ollama, and OpenAI without falling back", async () => {
    clearAIEnv();
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gpt-4.1-mini";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.GOOGLE_GEMINI_API_KEY = GEMINI_SECRET;
    expect(createConfiguredProvider()).toBeInstanceOf(OpenAIProvider);
    expect(await getAIProvider("coding")).toBeInstanceOf(OpenAIProvider);
    expect(describeAIConfiguration()).toMatchObject({
      configured: true,
      providerId: "OPENAI",
      providerLabel: "OpenAI",
      model: "gpt-4.1-mini",
      status: "Configured",
    });

    process.env.AI_PROVIDER = "GEMINI";
    process.env.AI_MODEL = "gemini-flash-latest";
    delete process.env.OPENAI_API_KEY;
    expect(createConfiguredProvider()).toBeInstanceOf(GeminiProvider);
    expect(describeAIConfiguration().providerId).toBe("GOOGLE_GEMINI");

    process.env.AI_PROVIDER = "ollama";
    process.env.AI_MODEL = "llama3.2";
    delete process.env.GOOGLE_GEMINI_API_KEY;
    expect(createConfiguredProvider()).toBeInstanceOf(OllamaProvider);
    expect(await getAIProvider("verification")).toBeInstanceOf(OllamaProvider);
    expect(describeAIConfiguration()).toMatchObject({ providerId: "OLLAMA", model: "llama3.2", status: "Configured" });
  });

  it("fails safely for an unsupported provider and does not use a configured one", () => {
    clearAIEnv();
    process.env.AI_PROVIDER = "anthropic";
    process.env.AI_MODEL = "claude-sonnet-4-5";
    process.env.OPENAI_API_KEY = OPENAI_SECRET;
    process.env.GOOGLE_GEMINI_API_KEY = GEMINI_SECRET;
    expect(() => createConfiguredProvider()).toThrow(AIFailure);
    expect(() => createConfiguredProvider()).toThrow(/not supported/);
    expect(() => createConfiguredProvider()).toThrow(/anthropic/);
    expect(() => createConfiguredProvider()).not.toThrow(OPENAI_SECRET);
    expect(describeAIConfiguration().configured).toBe(false);
    expect(describeAIConfiguration().status).toBe("Not configured");
  });

  it("does not fall back when the selected provider is missing its credential", () => {
    clearAIEnv();
    process.env.AI_PROVIDER = "GOOGLE_GEMINI";
    process.env.AI_MODEL = "gemini-flash-latest";
    process.env.OPENAI_API_KEY = OPENAI_SECRET;
    expect(() => createConfiguredProvider()).toThrow(DomainError);
    expect(() => createConfiguredProvider()).toThrow(/AI is not configured/);
    expect(() => createConfiguredProvider()).not.toThrow(/sk-live/);
    expect(() => createConfiguredProvider()).not.toThrow(GEMINI_SECRET);
    const view = describeAIConfiguration();
    expect(view.configured).toBe(false);
    expect(view.providerId).toBe("GOOGLE_GEMINI");
    expect(view.issue).toBe("credential_missing");
    expect(view.setup).toMatch(/GOOGLE_GEMINI_API_KEY/);
    expect(view.setup).not.toMatch(/sk-|AIza/);
  });

  it("fails safely when the model is missing and does not substitute one", () => {
    clearAIEnv();
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-openai-key";
    expect(() => createConfiguredProvider()).toThrow(/No model was substituted/);
    expect(describeAIConfiguration().model).toBeNull();
    expect(describeAIConfiguration().status).toBe("No model selected");
    expect(describeAIConfiguration().configured).toBe(false);
  });

  it("rejects a model that belongs to another provider", () => {
    clearAIEnv();
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gemini-flash-latest";
    process.env.OPENAI_API_KEY = "test-openai-key";
    expect(() => createConfiguredProvider()).toThrow(/cannot be used with OpenAI/);
    expect(() => createConfiguredProvider()).toThrow(/No other model was substituted/);

    process.env.AI_PROVIDER = "GOOGLE_GEMINI";
    process.env.AI_MODEL = "gpt-4.1-mini";
    process.env.GOOGLE_GEMINI_API_KEY = "test-gemini-key";
    expect(() => createConfiguredProvider()).toThrow(/cannot be used with Google Gemini/);

    process.env.AI_PROVIDER = "OLLAMA";
    process.env.AI_MODEL = "claude-sonnet-4-5";
    expect(() => createConfiguredProvider()).toThrow(/cannot be used with Ollama/);
  });

  it("fails safely when structured output is invalid and does not fill missing fields", () => {
    const schema = z.object({ name: z.string().min(1) }).strict();
    expect(requireStructured(schema, { name: "Claims" })).toEqual({ name: "Claims" });
    expect(() => requireStructured(schema, {})).toThrow(/required structure/);
    expect(() => requireStructured(schema, { name: "Claims", extra: true })).toThrow(/required structure/);
    expect(() => requireStructured(schema, null)).toThrow(AIFailure);
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
    expect(() =>
      mapProviderFailure(
        Object.assign(new Error('{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}'), {
          status: 400,
        }),
      ),
    ).toThrow(/request format was not accepted/);
  });

  it("keeps credentials out of configuration, child processes, and the settings page", () => {
    clearAIEnv();
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gpt-4.1-mini";
    process.env.OPENAI_API_KEY = OPENAI_SECRET;
    process.env.GOOGLE_GEMINI_API_KEY = GEMINI_SECRET;
    const view = describeAIConfiguration();
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(OPENAI_SECRET);
    expect(serialized).not.toContain(GEMINI_SECRET);
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain("AIza");
    expect(view).not.toHaveProperty("apiKey");

    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = "b".repeat(44);
    const env = childEnv();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.GOOGLE_GEMINI_API_KEY).toBeUndefined();
    expect(env.AI_CREDENTIAL_ENCRYPTION_KEY).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain(OPENAI_SECRET);
    expect(JSON.stringify(env)).not.toContain(GEMINI_SECRET);
    expect(JSON.stringify(env)).not.toContain("b".repeat(44));

    const settings = readFileSync(path.join(process.cwd(), "src/app/(app)/settings/page.tsx"), "utf8");
    expect(settings).not.toMatch(/use client/);
    expect(settings).not.toMatch(/NEXT_PUBLIC_/);
    expect(settings).toMatch(/AI Configuration/);
    expect(settings).toMatch(/Active provider/);
    expect(settings).toMatch(/Model/);
    expect(settings).toMatch(/Status/);
    expect(settings).not.toContain(OPENAI_SECRET);
    expect(settings).not.toContain(GEMINI_SECRET);

    const form = readFileSync(path.join(process.cwd(), "src/components/ai/configuration-form.tsx"), "utf8");
    expect(form).toMatch(/type="password"/);
    expect(form).toMatch(/name="apiKey"/);
    expect(form).toContain("••••••••••••");
    expect(form).not.toMatch(/createDecipheriv|decryptSecret|credential-crypto|baseUrl|OLLAMA_BASE_URL|OPENAI_API_KEY|GOOGLE_GEMINI_API_KEY|NEXT_PUBLIC_/);
  });

  it("does not let product modules import a provider SDK", () => {
    const files = walk(path.join(process.cwd(), "src")).filter(
      (file) => !file.includes(`${path.sep}modules${path.sep}ai${path.sep}`),
    );
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      if (file.endsWith(".test.ts")) continue;
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from ["']openai["']/);
      expect(source, file).not.toMatch(/@google\/genai/);
      expect(source, file).not.toMatch(/@anthropic-ai\/sdk/);
      expect(source, file).not.toMatch(/11434\/api\/(?:chat|tags)/);
      expect(source, file).not.toMatch(/new OpenAI|new Anthropic|new GoogleGenAI/);
    }
  });

  it("records provider and model evidence without credentials or invented usage", () => {
    const evidence = aiRunEvidence({
      provider: "GOOGLE_GEMINI",
      model: "gemini-flash-latest",
      usage: { inputTokens: 3, outputTokens: null },
      finishStatus: "STOP",
      durationMs: 12,
    });
    expect(evidence).toEqual({
      provider: "GOOGLE_GEMINI",
      model: "gemini-flash-latest",
      usage: { inputTokens: 3, outputTokens: null },
      finishStatus: "STOP",
      durationMs: 12,
    });
    const combined = combineAIEvidence([
      evidence,
      { provider: "GOOGLE_GEMINI", model: "gemini-flash-latest", usage: { inputTokens: null, outputTokens: 1 } },
    ]);
    expect(combined?.usage.inputTokens).toBeNull();
    expect(combined?.usage.outputTokens).toBeNull();
    expect(JSON.stringify(combined)).not.toContain("sk-");
    expect(JSON.stringify(combined)).not.toContain("AIza");
  });
});

function walk(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated" || entry.name === "node_modules") return [];
      return walk(full);
    }
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}
