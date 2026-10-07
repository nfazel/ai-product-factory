import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { updateProduct } from "@/modules/product/service";
import {
  approveFirstSlice,
  approveProductDefinition,
  commitProductDefinition,
  generateProductDefinition,
  moveDefinitionToBuild,
} from "@/modules/requirements/service";
import { toStoredProposal } from "@/modules/requirements/schema";
import { requirementsFixture } from "@/modules/requirements/testing";

const createdProducts: string[] = [];
const originalKey = process.env.OPENAI_API_KEY;

function mockProvider(data: unknown, error?: Error): AIProvider {
  return {
    async generate<T>() {
      if (error) throw error;
      return {
        data: data as T,
        usage: { inputTokens: 20, outputTokens: 40 },
        model: "mock",
      };
    },
  };
}

async function tempProduct(stage: "EXPLORE" | "DEFINE" | "BUILD" = "DEFINE") {
  const product = await db.product.create({
    data: {
      name: `Requirements test ${crypto.randomUUID()}`,
      description: "Temporary product.",
      vision: "Temporary vision",
      problemStatement: "Temporary problem",
      targetUsers: "Testers",
      status: "ACTIVE",
      currentStage: stage,
    },
  });
  createdProducts.push(product.id);
  return product;
}

async function approvedBrief(productId: string, status: "APPROVED" | "DRAFT" = "APPROVED") {
  const session = await db.discoverySession.create({
    data: { productId, status: status === "APPROVED" ? "APPROVED" : "IN_PROGRESS" },
  });
  return db.productBrief.create({
    data: {
      productId,
      sessionId: session.id,
      version: 1,
      status,
      problemStatement: "Handlers rebuild each claim from fragments.",
      productVision: "A customer can open a straightforward claim.",
      valueProposition: "Customers start without the call centre.",
      inScope: [{ id: "in-1", text: "Online first notice", origin: "HUMAN_CONFIRMED" }],
      outOfScope: [{ id: "out-1", text: "Complex injury", origin: "HUMAN_CONFIRMED" }],
      fieldOrigins: {
        problemStatement: "HUMAN_CONFIRMED",
        productVision: "HUMAN_CONFIRMED",
        valueProposition: "HUMAN_CONFIRMED",
      },
    },
  });
}

afterEach(async () => {
  setAIProviderForTests(null);
  process.env.OPENAI_API_KEY = originalKey;
  while (createdProducts.length > 0) {
    const id = createdProducts.pop();
    if (!id) continue;
    await db.product.delete({ where: { id } }).catch(() => undefined);
  }
});

describe("requirements agent gate", () => {
  it("does not execute without an approved product brief", async () => {
    const product = await tempProduct("DEFINE");
    await approvedBrief(product.id, "DRAFT");
    setAIProviderForTests(mockProvider(requirementsFixture()));
    await expect(generateProductDefinition(product.id)).rejects.toThrow(/approve the product brief/i);
    expect(await db.agentRun.count({ where: { productId: product.id } })).toBe(0);
    expect(await db.definitionProposal.count({ where: { productId: product.id } })).toBe(0);
  });

  it("does not execute outside DEFINE", async () => {
    const product = await tempProduct("EXPLORE");
    await approvedBrief(product.id);
    setAIProviderForTests(mockProvider(requirementsFixture()));
    await expect(generateProductDefinition(product.id)).rejects.toThrow(/only runs during DEFINE/i);
    expect(await db.agentRun.count({ where: { productId: product.id } })).toBe(0);
  });

  it("refuses when the provider is not configured and writes no run", async () => {
    const product = await tempProduct("DEFINE");
    await approvedBrief(product.id);
    delete process.env.OPENAI_API_KEY;
    setAIProviderForTests(null);
    await expect(generateProductDefinition(product.id)).rejects.toThrow(/not configured/i);
    expect(await db.agentRun.count({ where: { productId: product.id } })).toBe(0);
  });

  it("records a failed run and does not write a proposal when the model fails", async () => {
    const product = await tempProduct("DEFINE");
    await approvedBrief(product.id);
    setAIProviderForTests(mockProvider(requirementsFixture(), new Error("model unavailable")));
    await expect(generateProductDefinition(product.id)).rejects.toThrow(/model unavailable/i);
    const run = await db.agentRun.findFirst({ where: { productId: product.id } });
    expect(run?.status).toBe("FAILED");
    expect(await db.definitionProposal.count({ where: { productId: product.id } })).toBe(0);
    expect(await db.workItem.count({ where: { productId: product.id } })).toBe(0);
  });

  it("rejects invalid relationship references and leaves the backlog empty", async () => {
    const product = await tempProduct("DEFINE");
    await approvedBrief(product.id);
    const broken = requirementsFixture();
    broken.proposedEpics[0].capabilityTempId = "capability-9";
    setAIProviderForTests(mockProvider(broken));
    await expect(generateProductDefinition(product.id)).rejects.toThrow(/missing capability/i);
    expect(await db.definitionProposal.count({ where: { productId: product.id } })).toBe(0);
    expect(await db.productOutcome.count({ where: { productId: product.id } })).toBe(0);
    const run = await db.agentRun.findFirst({ where: { productId: product.id } });
    expect(run?.status).toBe("FAILED");
  });
});

describe("requirements commit and traceability", () => {
  it("keeps a proposal off the backlog until a person commits it, then traces outcome to story", async () => {
    const product = await tempProduct("DEFINE");
    const brief = await approvedBrief(product.id);
    setAIProviderForTests(mockProvider(requirementsFixture()));
    await generateProductDefinition(product.id);

    expect(await db.workItem.count({ where: { productId: product.id } })).toBe(0);
    const proposal = await db.definitionProposal.findFirst({ where: { productId: product.id } });
    expect(proposal?.status).toBe("OPEN");
    const stored = toStoredProposal(requirementsFixture());
    for (const collection of [
      stored.outcomes,
      stored.capabilities,
      stored.epics,
      stored.features,
      stored.stories,
      stored.acceptanceCriteria,
      stored.nfrs,
      stored.assumptions,
      stored.questions,
    ]) {
      for (const item of collection) item.reviewStatus = "ACCEPTED";
    }
    if (stored.firstSlice) stored.firstSlice.reviewStatus = "ACCEPTED";
    await db.definitionProposal.update({
      where: { id: proposal!.id },
      data: { payload: stored },
    });

    await commitProductDefinition(product.id, proposal!.id);

    const outcome = await db.productOutcome.findFirst({ where: { productId: product.id } });
    const capability = await db.productCapability.findFirst({ where: { productId: product.id } });
    const epic = await db.workItem.findFirst({ where: { productId: product.id, type: "EPIC" } });
    const feature = await db.workItem.findFirst({ where: { productId: product.id, type: "FEATURE" } });
    const story = await db.workItem.findFirst({ where: { productId: product.id, type: "STORY" } });
    const criteria = await db.acceptanceCriterion.findMany({ where: { workItemId: story?.id } });
    const slice = await db.productSlice.findFirst({ where: { productId: product.id } });

    expect(outcome?.sourceBriefId).toBe(brief.id);
    expect(capability?.outcomeId).toBe(outcome?.id);
    expect(epic?.capabilityId).toBe(capability?.id);
    expect(feature?.parentId).toBe(epic?.id);
    expect(story?.parentId).toBe(feature?.id);
    expect(story?.capabilityId).toBe(capability?.id);
    expect(story?.provenance).toBe("AI_ACCEPTED");
    expect(criteria).toHaveLength(1);
    expect(slice?.status).toBe("PROPOSED");

    const stage = await db.product.findUnique({ where: { id: product.id } });
    expect(stage?.currentStage).toBe("DEFINE");
    const definitionApproval = await db.approval.count({
      where: { productId: product.id, approvalType: "PRODUCT_DEFINITION" },
    });
    expect(definitionApproval).toBe(0);
  });

  it("does not commit a partial backlog when an accepted child has no accepted parent", async () => {
    const product = await tempProduct("DEFINE");
    await approvedBrief(product.id);
    const stored = toStoredProposal(requirementsFixture());
    stored.features[0].reviewStatus = "ACCEPTED";
    stored.epics[0].reviewStatus = "REJECTED";
    const proposal = await db.definitionProposal.create({
      data: {
        productId: product.id,
        status: "OPEN",
        summary: stored.assistantSummary,
        payload: stored,
      },
    });
    await expect(commitProductDefinition(product.id, proposal.id)).rejects.toThrow(/not accepted/i);
    expect(await db.workItem.count({ where: { productId: product.id } })).toBe(0);
    expect(await db.productOutcome.count({ where: { productId: product.id } })).toBe(0);
  });

  it("does not overwrite a human-confirmed outcome", async () => {
    const product = await tempProduct("DEFINE");
    await approvedBrief(product.id);
    const outcome = await db.productOutcome.create({
      data: {
        productId: product.id,
        title: "Reduce customer effort",
        description: "Confirmed by a person.",
        successMeasure: "Fewer calls",
        status: "CONFIRMED",
        humanLocked: true,
        origin: "HUMAN_CONFIRMED",
      },
    });
    const stored = toStoredProposal(requirementsFixture());
    stored.outcomes[0].replacesId = outcome.id;
    stored.outcomes[0].title = "A feature pretending to be an outcome";
    stored.outcomes[0].reviewStatus = "ACCEPTED";
    const proposal = await db.definitionProposal.create({
      data: {
        productId: product.id,
        status: "OPEN",
        summary: stored.assistantSummary,
        payload: stored,
      },
    });
    const result = await commitProductDefinition(product.id, proposal.id);
    const saved = await db.productOutcome.findUnique({ where: { id: outcome.id } });
    expect(saved?.title).toBe("Reduce customer effort");
    expect(result.skipped.join(" ")).toMatch(/unchanged/i);
    expect(await db.productOutcome.count({ where: { productId: product.id } })).toBe(1);
  });
});

describe("definition approval and build gate", () => {
  it("lets a person approve the slice and the definition without moving the stage", async () => {
    const product = await tempProduct("DEFINE");
    await approvedBrief(product.id);
    const slice = await db.productSlice.create({
      data: {
        productId: product.id,
        name: "Submit a simple claim",
        description: "End to end confirmation.",
        rationale: "Smallest demonstrable slice.",
        status: "PROPOSED",
      },
    });
    await db.productOutcome.create({
      data: {
        productId: product.id,
        title: "Reduce effort",
        description: "A result.",
        successMeasure: "Fewer calls",
        status: "CONFIRMED",
        humanLocked: true,
      },
    });
    await approveFirstSlice(product.id, slice.id);
    const approvedSlice = await db.productSlice.findUnique({ where: { id: slice.id } });
    expect(approvedSlice?.status).toBe("APPROVED");

    await expect(
      updateProduct({
        id: product.id,
        name: product.name,
        description: product.description,
        vision: product.vision,
        problemStatement: product.problemStatement,
        targetUsers: product.targetUsers,
        status: "ACTIVE",
        currentStage: "BUILD",
      }),
    ).rejects.toThrow(/approved Product Definition/i);

    const approval = await approveProductDefinition(product.id);
    expect(approval.stage).toBe("DEFINE");
    const row = await db.approval.findFirst({
      where: { productId: product.id, approvalType: "PRODUCT_DEFINITION", status: "APPROVED" },
    });
    expect(row?.approvedBy).toBe("Local user");
    const definition = await db.productDefinition.findUnique({ where: { productId: product.id } });
    expect(definition?.status).toBe("APPROVED");

    await moveDefinitionToBuild(product.id);
    const moved = await db.product.findUnique({ where: { id: product.id } });
    expect(moved?.currentStage).toBe("BUILD");
  });
});
