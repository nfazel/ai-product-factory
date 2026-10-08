import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { AIFailure } from "@/modules/ai/failures";
import { OpenAIProvider, setOpenAICompleteForTests } from "@/modules/ai/openai";

const schema = z.object({ name: z.string().min(1) }).strict();
const OPENAI_SECRET = "sk-live-openai-secret-value-xyz";
const savedKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  setOpenAICompleteForTests(null);
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedKey;
});

function provider() {
  process.env.OPENAI_API_KEY = OPENAI_SECRET;
  return new OpenAIProvider("gpt-4.1-mini");
}

const request = {
  systemPrompt: "Return the schema.",
  messages: [{ role: "user" as const, content: "Name the product." }],
  responseSchema: schema,
  schemaName: "sample",
};

describe("OpenAI provider", () => {
  it("accepts a structured response through the common contract", async () => {
    setOpenAICompleteForTests(async () => ({
      parsed: { name: "Claims" },
      model: "gpt-4.1-mini",
      finishReason: "stop",
      promptTokens: 5,
      completionTokens: 2,
    }));
    const result = await provider().generate(request);
    expect(result).toMatchObject({
      data: { name: "Claims" },
      provider: "OPENAI",
      model: "gpt-4.1-mini",
      usage: { inputTokens: 5, outputTokens: 2 },
      finishStatus: "stop",
    });
    expect(JSON.stringify(result)).not.toContain(OPENAI_SECRET);
  });

  it("leaves usage empty when the provider omits it", async () => {
    setOpenAICompleteForTests(async () => ({ parsed: { name: "Claims" }, finishReason: "stop" }));
    const result = await provider().generate(request);
    expect(result.usage).toEqual({ inputTokens: null, outputTokens: null });
  });

  it("rejects an invalid structured response", async () => {
    setOpenAICompleteForTests(async () => ({ parsed: { name: 1 }, finishReason: "stop" }));
    await expect(provider().generate(request)).rejects.toThrow(/required structure/);
  });

  it("normalises authentication, rate limit, and timeout without revealing the key", async () => {
    setOpenAICompleteForTests(async () => {
      throw Object.assign(new Error(`unauthorized ${OPENAI_SECRET}`), { status: 401, name: "AuthenticationError" });
    });
    await expect(provider().generate(request)).rejects.toThrow(/rejected the credentials/);
    try {
      await provider().generate(request);
    } catch (error) {
      expect(error).toBeInstanceOf(AIFailure);
      expect((error as AIFailure).category).toBe("AUTHENTICATION_FAILED");
      expect(JSON.stringify(error)).not.toContain(OPENAI_SECRET);
    }

    setOpenAICompleteForTests(async () => {
      throw Object.assign(new Error("slow"), { status: 429, name: "RateLimitError" });
    });
    await expect(provider().generate(request)).rejects.toThrow(/rate limit/);

    setOpenAICompleteForTests(async () => {
      throw Object.assign(new Error("timed out"), { name: "APIConnectionTimeoutError" });
    });
    await expect(provider().generate(request)).rejects.toThrow(/did not respond in time/);
  });

  it("does not call the API when the key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    let called = false;
    setOpenAICompleteForTests(async () => {
      called = true;
      return { parsed: { name: "Claims" } };
    });
    await expect(new OpenAIProvider("gpt-4.1-mini").generate(request)).rejects.toThrow(/OPENAI_API_KEY/);
    expect(called).toBe(false);
  });
});
