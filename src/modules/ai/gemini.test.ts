import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { architectureResponseSchema } from "@/modules/architecture/schema";
import { AIFailure } from "@/modules/ai/failures";
import { GeminiProvider, geminiResponseSchema, setGeminiCompleteForTests, type GeminiCompletion } from "@/modules/ai/gemini";
import { requirementsResponseSchema } from "@/modules/requirements/schema";
import { requirementsFixture } from "@/modules/requirements/testing";

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

  it("rejects an invalid structured response after one repair", async () => {
    let calls = 0;
    setGeminiCompleteForTests(async () => {
      calls += 1;
      return { text: JSON.stringify({ name: "" }), finishReason: "STOP" };
    });
    await expect(
      provider().generate({
        systemPrompt: "Return the schema.",
        messages: [{ role: "user", content: "Name the product." }],
        responseSchema: schema,
        schemaName: "sample",
        purpose: "Generate Design",
      }),
    ).rejects.toThrow(/required structure/);
    expect(calls).toBe(2);
  });

  it("repairs one invalid structured response and keeps the domain schema", async () => {
    const calls: string[] = [];
    setGeminiCompleteForTests(async (input) => {
      calls.push(input.messages.at(-1)?.content ?? "");
      if (calls.length === 1) return { text: JSON.stringify({ name: "" }), finishReason: "STOP" };
      return { text: JSON.stringify({ name: "Claims" }), finishReason: "STOP", modelVersion: "gemini-flash-latest" };
    });
    const result = await provider().generate({
      systemPrompt: "Return the schema.",
      messages: [{ role: "user", content: "Name the product." }],
      responseSchema: schema,
      schemaName: "sample",
      purpose: "Generate Design",
    });
    expect(result.data).toEqual({ name: "Claims" });
    expect(result.repairAttempted).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatch(/name: Too small|name: /);
    expect(calls[1]).toMatch(/Do not add business facts/);
  });

  it("does not repair an unreadable payload", async () => {
    let calls = 0;
    setGeminiCompleteForTests(async () => {
      calls += 1;
      return { text: "not-json", finishReason: "STOP" };
    });
    await expect(
      provider().generate({
        systemPrompt: "Return the schema.",
        messages: [{ role: "user", content: "Name the product." }],
        responseSchema: schema,
        schemaName: "sample",
      }),
    ).rejects.toThrow(/could not be read as structured data/);
    expect(calls).toBe(1);
  });

  it("tells Gemini the stable id format without sending a pattern constraint", () => {
    const sent = geminiResponseSchema(architectureResponseSchema) as {
      properties: { technologyDecisions: { items: { properties: { tempId: { description?: string; pattern?: string } } } } };
    };
    const tempId = sent.properties.technologyDecisions.items.properties.tempId;
    expect(tempId.pattern).toBeUndefined();
    expect(tempId.description).toBe("Stable id such as technology-1.");
    expect(architectureResponseSchema.safeParse({ technologyDecisions: [{ tempId: "tech-decision-1" }] }).success).toBe(false);
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

  it("sends Gemini a structural schema and still enforces the product definition schema", async () => {
    const sent = JSON.stringify(geminiResponseSchema(requirementsResponseSchema));
    for (const keyword of ["pattern", "minLength", "maxLength", "minItems", "maxItems", "additionalProperties", "$schema"]) {
      expect(sent).not.toContain(`"${keyword}"`);
    }
    expect(sent).toContain("proposedOutcomes");
    const invalid = requirementsFixture();
    invalid.proposedOutcomes[0].tempId = "not-an-id";
    expect(requirementsResponseSchema.safeParse(invalid).success).toBe(false);

    let sawPattern = false;
    setGeminiCompleteForTests(async (input) => {
      sawPattern = JSON.stringify(input.responseJsonSchema).includes('"pattern"');
      return { text: JSON.stringify({ name: "" }), finishReason: "STOP" };
    });
    await expect(
      provider().generate({
        systemPrompt: "Return the schema.",
        messages: [{ role: "user", content: "Name the product." }],
        responseSchema: z.object({ name: z.string().regex(/^outcome-[1-9]\d*$/).min(1).max(20) }).strict(),
        schemaName: "sample",
        purpose: "the Product Definition",
      }),
    ).rejects.toThrow(/required structure/);
    expect(sawPattern).toBe(false);
  });

  it("translates a Gemini invalid-argument rejection without returning the raw payload", async () => {
    const raw = '{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}';
    setGeminiCompleteForTests(async () => {
      throw Object.assign(new Error(raw), { status: 400 });
    });
    await expect(
      provider().generate({
        systemPrompt: "Return the schema.",
        messages: [{ role: "user", content: "Name the product." }],
        responseSchema: schema,
        schemaName: "product_definition",
        purpose: "the Product Definition",
      }),
    ).rejects.toThrow("Gemini could not generate the Product Definition because the request format was not accepted.");
    try {
      await provider().generate({
        systemPrompt: "Return the schema.",
        messages: [{ role: "user", content: "Name the product." }],
        responseSchema: schema,
        schemaName: "product_definition",
        purpose: "the Product Definition",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AIFailure);
      expect((error as AIFailure).category).toBe("INVALID_RESPONSE");
      expect((error as Error).message).not.toContain("INVALID_ARGUMENT");
      expect((error as Error).message).not.toContain(GEMINI_SECRET);
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
