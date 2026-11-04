import { db } from "@/lib/db";
import type { AIProvider } from "@/modules/ai/provider";
import { architectureFixture } from "@/modules/architecture/testing";
import { governanceFixture } from "@/modules/governance/testing";

/** Shared setup for tests of the Plan stage. The caller removes the product it is given. */
export const originalKey = process.env.OPENAI_API_KEY;

/** A product with the features drafted: brief approved, stage Define, nothing past the brief approved. */
export async function draftedFeaturesProduct(stage: "DEFINE" | "BUILD" = "DEFINE") {
  process.env.OPENAI_API_KEY = "test-key";
  const product = await db.product.create({
    data: { name: `Technical run ${crypto.randomUUID()}`, description: "Temporary", vision: "Temporary", problemStatement: "Temporary", targetUsers: "Testers", status: "ACTIVE", currentStage: stage },
  });
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
export function chainProvider(setup: Awaited<ReturnType<typeof draftedFeaturesProduct>>, onCall?: (n: number) => void): AIProvider {
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

