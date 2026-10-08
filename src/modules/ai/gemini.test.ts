import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { AIFailure } from "@/modules/ai/failures";
import { GeminiProvider, setGeminiCompleteForTests, type GeminiCompletion } from "@/modules/ai/gemini";

const schema = z.object({ name: z.string().min(1) }).strict();
const GEMINI_SECRET = "AIzaSyLiveGeminiSecretValue123456";
const savedKey = process.env.GOOGLE_GEMINI_API_KEY;

afterEach(() => {
  setGeminiCompleteForTests(null);
  if (savedKey === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
  else process.env.GOOGLE_GEMINI_API_KEY = savedKey;
});

function provider() {
  process.env.GOOGLE_GEMINI_API_KEY = GEMINI_SECRET;
  return new GeminiProvider("gemini-flash-latest");
}

describe("Gemini provider", () => {
  it("accepts a structured response and keeps usage only when the provider sent it", async () => {
    setGeminiCompleteForTests(async () => ({
      text: JSON.stringify({ name: "Claims" }),
      modelVersion: "gemini-flash-latest",
      finishReason: "STOP",
      promptTokens: 9,
      outputTokens: 4,
    }));
    const result = await provider().generate({
      systemPrompt: "Return the schema.",
      messages: [{ role: "user", content: "Name the product." }],
      responseSchema: schema,
      schemaName: "sample",
    });
    expect(result).toMatchObject({
      data: { name: "Claims" },
      provider: "GOOGLE_GEMINI",
      model: "gemini-flash-latest",
      usage: { inputTokens: 9, outputTokens: 4 },
      finishStatus: "STOP",
    });
    expect(JSON.stringify(result)).not.toContain(GEMINI_SECRET);
  });

  it("stores unavailable usage instead of estimating it", async () => {
    setGeminiCompleteForTests(async () => ({ text: JSON.stringify({ name: "Claims" }), finishReason: "STOP" }));
    const result = await provider().generate({
      systemPrompt: "Return the schema.",
      messages: [{ role: "user", content: "Name the product." }],
      responseSchema: schema,
      schemaName: "sample",
    });
    expect(result.usage).toEqual({ inputTokens: null, outputTokens: null });
  });

  it("fails when the key is missing and does not call the completion hook as a fallback", async () => {
    delete process.env.GOOGLE_GEMINI_API_KEY;
    let called = false;
    setGeminiCompleteForTests(async () => {
      called = true;
      return { text: JSON.stringify({ name: "Claims" }) };
    });
    await expect(
      new GeminiProvider("gemini-flash-latest").generate({
        systemPrompt: "Return the schema.",
        messages: [],
        responseSchema: schema,
        schemaName: "sample",
      }),
    ).rejects.toThrow(/GOOGLE_GEMINI_API_KEY/);
    expect(called).toBe(false);
  });

  it("rejects an invalid structured response", async () => {
    setGeminiCompleteForTests(async () => ({ text: JSON.stringify({ name: "" }), finishReason: "STOP" }));
    await expect(
      provider().generate({
        systemPrompt: "Return the schema.",
        messages: [{ role: "user", content: "Name the product." }],
        responseSchema: schema,
        schemaName: "sample",
      }),
    ).rejects.toThrow(/required structure/);
  });

  it("normalises authentication, rate limit, and timeout failures", async () => {
    const cases: { error: unknown; pattern: RegExp }[] = [
      { error: Object.assign(new Error(`bad ${GEMINI_SECRET}`), { status: 401 }), pattern: /rejected the credentials/ },
      { error: Object.assign(new Error("slow"), { status: 429 }), pattern: /rate limit/ },
      { error: Object.assign(new Error("timed out"), { name: "AbortError" }), pattern: /did not respond in time/ },
    ];
    for (const item of cases) {
      setGeminiCompleteForTests(async () => {
        throw item.error;
      });
      await expect(
        provider().generate({
          systemPrompt: "Return the schema.",
          messages: [{ role: "user", content: "Name the product." }],
          responseSchema: schema,
          schemaName: "sample",
        }),
      ).rejects.toThrow(item.pattern);
    }
    try {
      setGeminiCompleteForTests(async () => {
        throw Object.assign(new Error(`bad ${GEMINI_SECRET}`), { status: 401 });
      });
      await provider().generate({
        systemPrompt: "Return the schema.",
        messages: [{ role: "user", content: "Name the product." }],
        responseSchema: schema,
        schemaName: "sample",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AIFailure);
      expect(JSON.stringify(error)).not.toContain(GEMINI_SECRET);
      expect((error as AIFailure).category).toBe("AUTHENTICATION_FAILED");
    }
  });

  it("does not trust an unreadable payload", async () => {
    const completion: GeminiCompletion = { text: "not-json", finishReason: "STOP" };
    setGeminiCompleteForTests(async () => completion);
    await expect(
      provider().generate({
        systemPrompt: "Return the schema.",
        messages: [{ role: "user", content: "Name the product." }],
        responseSchema: schema,
        schemaName: "sample",
      }),
    ).rejects.toThrow(AIFailure);
  });
});
