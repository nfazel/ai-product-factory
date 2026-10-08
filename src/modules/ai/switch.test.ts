import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { AIFailure } from "@/modules/ai/failures";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { rememberAISelection } from "@/modules/ai/config";
import { saveAISelection, selectionId } from "@/modules/ai/selection";
import { startDiscovery, continueDiscovery } from "@/modules/discovery/service";
import { discoveryFixture } from "@/modules/discovery/testing";

const createdProducts: string[] = [];

function provider(read: () => { provider: string; model: string }): AIProvider {
  return {
    async generate<T>() {
      const current = read();
      return {
        data: discoveryFixture() as T,
        usage: { inputTokens: 4, outputTokens: null },
        model: current.model,
        provider: current.provider,
      };
    },
  };
}

async function tempProduct() {
  const product = await db.product.create({
    data: {
      name: `Provider switch ${crypto.randomUUID()}`,
      description: "Temporary product for provider evidence.",
      vision: "Temporary vision",
      problemStatement: "Temporary problem",
      targetUsers: "Testers",
      status: "ACTIVE",
      currentStage: "EXPLORE",
    },
  });
  createdProducts.push(product.id);
  return product;
}

describe("provider switch evidence", () => {
  const previousFlag = process.env.AI_SELECTION_DISABLE_STORE;
  let previous: { provider: string; model: string; updatedBy: string } | null = null;
  let existingChangeIds: string[] = [];
  let manageSelection = false;

  afterEach(async () => {
    setAIProviderForTests(null);
    process.env.AI_SELECTION_DISABLE_STORE = previousFlag;
    rememberAISelection(null);
    if (manageSelection) {
      const current = await db.aiSelectionChange.findMany({ select: { id: true } });
      const created = current.map((row) => row.id).filter((id) => !existingChangeIds.includes(id));
      if (created.length > 0) await db.aiSelectionChange.deleteMany({ where: { id: { in: created } } });
      if (previous) {
        await db.aiSelection.upsert({
          where: { id: selectionId() },
          create: { id: selectionId(), ...previous },
          update: previous,
        });
      } else {
        await db.aiSelection.delete({ where: { id: selectionId() } }).catch(() => undefined);
      }
    }
    manageSelection = false;
    previous = null;
    existingChangeIds = [];
    while (createdProducts.length > 0) {
      const id = createdProducts.pop();
      if (id) await db.product.delete({ where: { id } }).catch(() => undefined);
    }
  });

  it("keeps each run on the provider that performed it", async () => {
    manageSelection = true;
    previous = await db.aiSelection.findUnique({
      where: { id: selectionId() },
      select: { provider: true, model: true, updatedBy: true },
    });
    existingChangeIds = (await db.aiSelectionChange.findMany({ select: { id: true } })).map((row) => row.id);
    let active = { provider: "GOOGLE_GEMINI", model: "gemini-flash-latest" };
    setAIProviderForTests(provider(() => active));
    const product = await tempProduct();
    await startDiscovery({
      productId: product.id,
      initialIdea: "Handlers rebuild every claim from scattered notes.",
      optionalContext: "",
      knownConstraints: "",
      knownUsers: "Claims handlers",
      desiredOutcome: "A notice a handler can work without a phone call.",
    });
    const firstId = (await db.agentRun.findFirst({ where: { productId: product.id }, orderBy: { createdAt: "asc" } }))?.id;
    const firstOutput = JSON.stringify(
      (await db.agentRun.findFirst({ where: { id: firstId ?? "" } }))?.output,
    );

    delete process.env.AI_SELECTION_DISABLE_STORE;
    await saveAISelection({ provider: "OPENAI", model: "gpt-4.1-mini", actor: "Local user" });
    active = { provider: "OLLAMA", model: "llama3.2" };
    await continueDiscovery(product.id, "The handler still rebuilds the file by hand.");

    const runs = await db.agentRun.findMany({ where: { productId: product.id }, orderBy: { createdAt: "asc" } });
    expect(runs).toHaveLength(2);
    expect(runs[0]?.output).toMatchObject({ provider: "GOOGLE_GEMINI", model: "gemini-flash-latest", purpose: "PRODUCT_DISCOVERY" });
    expect(JSON.stringify(runs[0]?.output)).toBe(firstOutput);
    expect(runs[1]?.output).toMatchObject({ provider: "OLLAMA", model: "llama3.2" });
    expect(JSON.stringify(runs[0]?.output)).not.toContain("gpt-4.1-mini");
    expect(JSON.stringify(runs)).not.toMatch(/sk-|AIza|apiKey/);
  });

  it("stores an error category and no credential when a run fails", async () => {
    setAIProviderForTests({
      async generate() {
        throw new AIFailure("The model returned a response that did not match the required structure. Nothing was saved from this response.", "SCHEMA_VALIDATION_FAILED");
      },
    });
    const product = await tempProduct();
    await expect(
      startDiscovery({
        productId: product.id,
        initialIdea: "Handlers rebuild every claim from scattered notes.",
        optionalContext: "",
        knownConstraints: "",
        knownUsers: "Claims handlers",
        desiredOutcome: "A notice a handler can work without a phone call.",
      }),
    ).rejects.toThrow(/required structure/);
    const run = await db.agentRun.findFirst({ where: { productId: product.id } });
    expect(run?.status).toBe("FAILED");
    expect(run?.output).toMatchObject({ errorCategory: "SCHEMA_VALIDATION_FAILED", purpose: "PRODUCT_DISCOVERY" });
    expect(JSON.stringify(run?.output)).not.toMatch(/sk-|AIza/);
  });
});
