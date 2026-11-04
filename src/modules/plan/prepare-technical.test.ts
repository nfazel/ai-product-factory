import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { setAIProviderForTests } from "@/modules/ai/provider";
import { generateArchitecture, getCodingReadiness } from "@/modules/architecture/service";
import { generateGovernanceReview } from "@/modules/governance/service";
import { startTechnicalPreparation, technicalPreparationState, waitForTechnicalPreparation } from "@/modules/plan/prepare-technical-runner";
import { chainProvider, draftedFeaturesProduct as makeProduct, originalKey } from "@/modules/plan/testing";
import { nextTechnicalAction, prepareTechnical } from "@/modules/plan/prepare-technical";

const created: string[] = [];
const draftedFeaturesProduct = async (stage?: "DEFINE" | "BUILD") => {
  const setup = await makeProduct(stage);
  created.push(setup.product.id);
  return setup;
};

afterEach(async () => {
  setAIProviderForTests(null);
  process.env.OPENAI_API_KEY = originalKey;
  while (created.length > 0) {
    const id = created.pop();
    if (id) await db.product.delete({ where: { id } }).catch(() => undefined);
  }
});

describe("drafting the technical chain ahead of approval", () => {
  it("drafts the design, plan, review and rules from drafted features, and approves nothing", async () => {
    const setup = await draftedFeaturesProduct();
    setAIProviderForTests(chainProvider(setup));
    const outcome = await prepareTechnical(setup.product.id);
    expect(outcome, JSON.stringify(outcome)).toEqual({ status: "DRAFTED" });

    expect((await db.solutionArchitecture.findFirstOrThrow({ where: { productId: setup.product.id } })).status).toBe("READY_FOR_REVIEW");
    expect((await db.implementationPlan.findFirstOrThrow({ where: { productId: setup.product.id } })).status).toBe("READY_FOR_REVIEW");
    expect((await db.engineeringGovernanceReview.findFirstOrThrow({ where: { productId: setup.product.id } })).status).toBe("READY_FOR_REVIEW");
    expect(await db.codingPolicy.count({ where: { productId: setup.product.id } })).toBeGreaterThan(0);
    // No approval of any kind was recorded, and the earlier parts are still drafts.
    expect(await db.approval.count({ where: { productId: setup.product.id } })).toBe(0);
    expect((await db.productDefinition.findUniqueOrThrow({ where: { productId: setup.product.id } })).status).not.toBe("APPROVED");
    expect(await db.productSlice.count({ where: { productId: setup.product.id, status: "APPROVED" } })).toBe(0);
    expect(await nextTechnicalAction(setup.product.id)).toEqual({ kind: "done" });
  }, 60_000);

  it("starts again from what exists and does not ask the agents twice", async () => {
    const setup = await draftedFeaturesProduct();
    let calls = 0;
    setAIProviderForTests(chainProvider(setup, (n) => { calls = n; }));
    await prepareTechnical(setup.product.id);
    expect(calls).toBe(3);
    expect(await prepareTechnical(setup.product.id)).toEqual({ status: "DRAFTED" });
    expect(calls).toBe(3);
  }, 60_000);

  it("runs in the background, refuses a second start while running, and reports the outcome", async () => {
    const setup = await draftedFeaturesProduct();
    setAIProviderForTests(chainProvider(setup));
    expect(startTechnicalPreparation(setup.product.id)).toBe("started");
    expect(startTechnicalPreparation(setup.product.id)).toBe("already-running");
    await waitForTechnicalPreparation(setup.product.id);
    expect(technicalPreparationState(setup.product.id)).toEqual({ running: false, last: { status: "DRAFTED" } });
  }, 60_000);

  it("waits for the features rather than drafting a design from nothing", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const product = await db.product.create({ data: { name: `Technical run ${crypto.randomUUID()}`, description: "T", vision: "T", problemStatement: "T", targetUsers: "T", status: "ACTIVE", currentStage: "DEFINE" } });
    created.push(product.id);
    expect(await prepareTechnical(product.id)).toMatchObject({ status: "NEEDS_YOU", step: "features" });
    expect(await db.agentRun.count({ where: { productId: product.id } })).toBe(0);
  });

  it("leaves coding blocked, because nothing is approved", async () => {
    const setup = await draftedFeaturesProduct();
    setAIProviderForTests(chainProvider(setup));
    await prepareTechnical(setup.product.id);
    expect((await getCodingReadiness(setup.product.id)).label).toBe("NOT READY");
    expect(await db.approval.count({ where: { productId: setup.product.id } })).toBe(0);
  }, 60_000);

  it("keeps the normal generation checks when drafting ahead is not asked for", async () => {
    const setup = await draftedFeaturesProduct("BUILD");
    setAIProviderForTests(chainProvider(setup));
    await expect(generateArchitecture(setup.product.id)).rejects.toThrow(/approved Product Definition/i);
    await expect(generateGovernanceReview(setup.product.id)).rejects.toThrow(/approved Solution Architecture/i);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });
});
