import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { AIFailure } from "@/modules/ai/failures";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { nextPrepareAction, prepareFeatures } from "@/modules/plan/prepare";
import { startPreparation, waitForPreparation } from "@/modules/plan/prepare-runner";
import { approveFirstSlice, approveProductDefinition, moveDefinitionToBuild } from "@/modules/requirements/service";
import { requirementsFixture } from "@/modules/requirements/testing";

const created: string[] = [];
const originalKey = process.env.OPENAI_API_KEY;

function provider(data: unknown, onCall?: () => void): AIProvider {
  return {
    async generate<T>() {
      onCall?.();
      return { data: data as T, usage: { inputTokens: 20, outputTokens: 40 }, model: "mock-definition", provider: "anthropic" };
    },
  };
}

/** A product at the end of the interview: stage Explore, brief approved. */
async function approvedBriefProduct(briefStatus: "APPROVED" | "DRAFT" = "APPROVED") {
  process.env.OPENAI_API_KEY = "test-key";
  const product = await db.product.create({
    data: { name: `Plan run ${crypto.randomUUID()}`, description: "Temporary", vision: "Temporary", problemStatement: "Temporary", targetUsers: "Testers", status: "ACTIVE", currentStage: "EXPLORE" },
  });
  created.push(product.id);
  const session = await db.discoverySession.create({ data: { productId: product.id, status: briefStatus === "APPROVED" ? "APPROVED" : "IN_PROGRESS" } });
  await db.productBrief.create({
    data: {
      productId: product.id, sessionId: session.id, version: 1, status: briefStatus,
      problemStatement: "Handlers rebuild each claim from fragments.", productVision: "A claim is captured once.", valueProposition: "Customers start without the call centre.",
      inScope: [{ id: "in-1", text: "Online first notice", origin: "HUMAN_CONFIRMED" }], outOfScope: [{ id: "out-1", text: "Complex injury", origin: "HUMAN_CONFIRMED" }],
      fieldOrigins: { problemStatement: "HUMAN_CONFIRMED", productVision: "HUMAN_CONFIRMED", valueProposition: "HUMAN_CONFIRMED" },
    },
  });
  return product;
}

afterEach(async () => {
  setAIProviderForTests(null);
  process.env.OPENAI_API_KEY = originalKey;
  while (created.length > 0) {
    const id = created.pop();
    if (id) await db.product.delete({ where: { id } }).catch(() => undefined);
  }
});

describe("drafting the features after the brief is approved", () => {
  it("moves the product on, asks the agent once, selects its candidate and commits the proposal as a draft, approving and confirming nothing", async () => {
    const product = await approvedBriefProduct();
    let calls = 0;
    setAIProviderForTests(provider(requirementsFixture(), () => { calls += 1; }));
    const outcome = await prepareFeatures(product.id);
    expect(outcome, JSON.stringify(outcome)).toEqual({ status: "DRAFTED" });
    expect(calls).toBe(1);

    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).currentStage).toBe("DEFINE");
    // The candidate was selected by the run, and said so.
    const selection = await db.definitionCandidateSelection.findFirstOrThrow({ where: { productId: product.id } });
    expect(selection).toMatchObject({ selectedBy: "Plan run", selectedByKind: "PLAN_RUN" });
    // The features are on the backlog as drafts.
    expect(await db.productOutcome.count({ where: { productId: product.id } })).toBeGreaterThan(0);
    expect(await db.workItem.count({ where: { productId: product.id, type: "FEATURE" } })).toBeGreaterThan(0);
    // Nothing was approved or confirmed by a person.
    expect(await db.approval.count({ where: { productId: product.id, approvalType: "PRODUCT_DEFINITION" } })).toBe(0);
    expect(await db.productOutcome.count({ where: { productId: product.id, status: "CONFIRMED" } })).toBe(0);
    expect(await db.productSlice.count({ where: { productId: product.id, status: "APPROVED" } })).toBe(0);
    expect((await db.productDefinition.findUnique({ where: { productId: product.id } }))?.status).not.toBe("APPROVED");
  }, 60_000);

  it("waits for the brief rather than drafting from one that is not approved", async () => {
    const product = await approvedBriefProduct("DRAFT");
    setAIProviderForTests(provider(requirementsFixture()));
    expect(await prepareFeatures(product.id)).toMatchObject({ status: "NEEDS_YOU", step: "brief" });
    expect(await db.agentRun.count({ where: { productId: product.id } })).toBe(0);
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).currentStage).toBe("EXPLORE");
  });

  it("carries on from where it stopped without asking the model again", async () => {
    const product = await approvedBriefProduct();
    let calls = 0;
    setAIProviderForTests(provider(requirementsFixture(), () => { calls += 1; }));
    expect(await nextPrepareAction(product.id)).toEqual({ kind: "move-to-define" });
    await prepareFeatures(product.id);
    const first = calls;
    expect(await nextPrepareAction(product.id)).toEqual({ kind: "done" });
    expect(await prepareFeatures(product.id)).toEqual({ status: "DRAFTED" });
    expect(calls).toBe(first);
  }, 60_000);

  it("retries a model outage up to two more times, then hands back with the reason", async () => {
    const product = await approvedBriefProduct();
    let calls = 0;
    setAIProviderForTests({
      async generate() {
        calls += 1;
        throw new AIFailure("The model is temporarily unavailable.", "PROVIDER_UNAVAILABLE" as never);
      },
    });
    const outcome = await prepareFeatures(product.id);
    expect(outcome).toMatchObject({ status: "NEEDS_YOU", step: "generate-definition" });
    if (outcome.status === "NEEDS_YOU") expect(outcome.reason).toContain("tried 3 times");
    expect(calls).toBe(3);
    expect(await db.productOutcome.count({ where: { productId: product.id } })).toBe(0);
  }, 60_000);

  it("runs in the background, once at a time, and the result is there when it finishes", async () => {
    const product = await approvedBriefProduct();
    setAIProviderForTests(provider(requirementsFixture()));
    expect(startPreparation(product.id)).toBe("started");
    expect(startPreparation(product.id)).toBe("already-running");
    await waitForPreparation(product.id);
    expect(await nextPrepareAction(product.id)).toEqual({ kind: "done" });
  }, 60_000);

  it("leaves a definition that the existing steps can then approve, so the pipeline is no longer stuck", async () => {
    const product = await approvedBriefProduct();
    setAIProviderForTests(provider(requirementsFixture()));
    expect(await prepareFeatures(product.id)).toEqual({ status: "DRAFTED" });
    const slice = await db.productSlice.findFirstOrThrow({ where: { productId: product.id } });
    await approveFirstSlice(product.id, slice.id);
    await approveProductDefinition(product.id);
    await moveDefinitionToBuild(product.id);
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).currentStage).toBe("BUILD");
    expect((await db.productDefinition.findUniqueOrThrow({ where: { productId: product.id } })).status).toBe("APPROVED");
  }, 60_000);
});
