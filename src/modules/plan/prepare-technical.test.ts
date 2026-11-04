import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { architectureFixture } from "@/modules/architecture/testing";
import { generateArchitecture, getCodingReadiness } from "@/modules/architecture/service";
import { governanceFixture } from "@/modules/governance/testing";
import { generateGovernanceReview } from "@/modules/governance/service";
import { startTechnicalPreparation, technicalPreparationState, waitForTechnicalPreparation } from "@/modules/plan/prepare-technical-runner";
import { nextTechnicalAction, prepareTechnical } from "@/modules/plan/prepare-technical";

const created: string[] = [];
const originalKey = process.env.OPENAI_API_KEY;

/** A product with the features drafted: brief approved, stage Define, nothing past the brief approved. */
async function draftedFeaturesProduct(stage: "DEFINE" | "BUILD" = "DEFINE") {
  process.env.OPENAI_API_KEY = "test-key";
  const product = await db.product.create({
    data: { name: `Technical run ${crypto.randomUUID()}`, description: "Temporary", vision: "Temporary", problemStatement: "Temporary", targetUsers: "Testers", status: "ACTIVE", currentStage: stage },
  });
  created.push(product.id);
  const session = await db.discoverySession.create({ data: { productId: product.id, status: "APPROVED" } });
  await db.productBrief.create({
    data: { productId: product.id, sessionId: session.id, version: 1, status: "APPROVED", problemStatement: "Customers cannot submit a claim online.", productVision: "A customer submits a simple claim.", valueProposition: "No call centre needed." },
  });
  await db.productDefinition.create({ data: { productId: product.id, status: "IN_PROGRESS" } });
  const outcome = await db.productOutcome.create({ data: { productId: product.id, title: "Reduce effort to open a claim", status: "PROPOSED" } });
  const capability = await db.productCapability.create({ data: { productId: product.id, outcomeId: outcome.id, name: "Digital claim submission", status: "PROPOSED" } });
  const slice = await db.productSlice.create({ data: { productId: product.id, name: "Submit a simple claim", status: "PROPOSED" } });
  await db.workItem.create({ data: { productId: product.id, title: "Claim submission", description: "Submit a claim.", type: "FEATURE", stage: "DEFINE", capabilityId: capability.id, sliceId: slice.id } });
  const story = await db.workItem.create({
    data: { productId: product.id, title: "Submit a straightforward claim", description: "The customer submits a notice.", type: "STORY", stage: "DEFINE", capabilityId: capability.id, sliceId: slice.id },
  });
  const nfr = await db.nonFunctionalRequirement.create({ data: { productId: product.id, category: "SECURITY", title: "A customer must not see another customer's notice", description: "Scoped to the caller.", status: "PROPOSED" } });
  return { product, capability, story, nfr };
}

/** Answers each agent call from what exists in the database at that moment, as the real agents are given. */
function chainProvider(setup: Awaited<ReturnType<typeof draftedFeaturesProduct>>, onCall?: (n: number) => void): AIProvider {
  let calls = 0;
  return {
    async generate<T>() {
      calls += 1;
      onCall?.(calls);
      const architecture = architectureFixture({ nfrId: setup.nfr.id, capabilityId: setup.capability.id, storyId: setup.story.id });
      // The first two calls are the architecture and the plan, both carried by the architecture response.
      if (calls <= 2) return { data: architecture as T, usage: { inputTokens: 10, outputTokens: 10 }, model: "mock" };
      const component = await db.architectureComponent.findFirstOrThrow({ where: { architecture: { productId: setup.product.id } } });
      const adr = await db.architectureDecisionRecord.findFirstOrThrow({ where: { productId: setup.product.id } });
      const tasks = await db.implementationTask.findMany({ where: { plan: { productId: setup.product.id } } });
      const data = governanceFixture({ componentId: component.id, adrId: adr.id, taskIds: tasks.map((task) => task.id), nfrId: setup.nfr.id, workItemId: setup.story.id });
      return { data: data as T, usage: { inputTokens: 10, outputTokens: 10 }, model: "mock" };
    },
  };
}

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
