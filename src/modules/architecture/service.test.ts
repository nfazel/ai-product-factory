import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { persistCommittedArchitecture, persistCommittedPlan } from "@/modules/architecture/repository";
import {
  acceptEntireArchitectureProposal,
  approveImplementationPlan,
  approveSolutionArchitecture,
  commitArchitecture,
  commitImplementationPlan,
  generateArchitecture,
  generateImplementationPlan,
  getCodingReadiness,
  markArchitectureReady,
  markPlanReady,
  updateArchitectureSummary,
} from "@/modules/architecture/service";
import { toStoredArchitecture } from "@/modules/architecture/schema";
import { architectureFixture } from "@/modules/architecture/testing";
import { updateWorkItem } from "@/modules/work-item/service";

const createdProducts: string[] = [];
const originalKey = process.env.OPENAI_API_KEY;

function mockProvider(data: unknown, error?: Error): AIProvider {
  return {
    async generate<T>() {
      if (error) throw error;
      return { data: data as T, usage: { inputTokens: 12, outputTokens: 20 }, model: "mock" };
    },
  };
}

async function tempProduct(stage: "EXPLORE" | "DEFINE" | "BUILD" = "BUILD") {
  const product = await db.product.create({
    data: {
      name: `Architecture test ${crypto.randomUUID()}`,
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

async function approvedBrief(productId: string) {
  const session = await db.discoverySession.create({
    data: { productId, status: "APPROVED" },
  });
  await db.productBrief.create({
    data: {
      productId,
      sessionId: session.id,
      version: 1,
      status: "APPROVED",
      problemStatement: "Customers cannot submit a straightforward claim online.",
      productVision: "A customer can submit a simple claim and see a reference.",
      valueProposition: "The first notice does not need the call centre.",
    },
  });
}

async function readyProduct(stage: "EXPLORE" | "DEFINE" | "BUILD" = "BUILD") {
  const product = await tempProduct(stage);
  await approvedBrief(product.id);
  await db.productDefinition.create({
    data: { productId: product.id, status: "APPROVED" },
  });
  await db.approval.create({
    data: {
      productId: product.id,
      approvalType: "PRODUCT_DEFINITION",
      status: "APPROVED",
      approvedBy: "Local user",
      resolvedAt: new Date(),
    },
  });
  const outcome = await db.productOutcome.create({
    data: { productId: product.id, title: "Reduce effort to open a claim", status: "CONFIRMED" },
  });
  const capability = await db.productCapability.create({
    data: {
      productId: product.id,
      outcomeId: outcome.id,
      name: "Digital Claim Submission",
      status: "CONFIRMED",
    },
  });
  const slice = await db.productSlice.create({
    data: {
      productId: product.id,
      name: "Submit a simple claim",
      status: "APPROVED",
    },
  });
  const story = await db.workItem.create({
    data: {
      productId: product.id,
      title: "Submit a straightforward claim",
      description: "The customer submits a notice and sees a reference.",
      type: "STORY",
      stage: "BUILD",
      capabilityId: capability.id,
      sliceId: slice.id,
    },
  });
  const nfr = await db.nonFunctionalRequirement.create({
    data: {
      productId: product.id,
      category: "SECURITY",
      title: "A customer must not see another customer's notice",
      description: "Submission and lookup stay within the customer's own claims.",
      status: "CONFIRMED",
    },
  });
  return { product, capability, story, nfr, slice };
}

async function openProposal(productId: string, kind: "ARCHITECTURE" | "IMPLEMENTATION_PLAN") {
  const proposal = await db.architectureProposal.findFirst({
    where: { productId, kind, status: "OPEN" },
  });
  if (!proposal) throw new Error("expected an open proposal");
  return proposal;
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

describe("architecture agent entry", () => {
  it("does not run outside BUILD", async () => {
    const { product, capability, story, nfr } = await readyProduct("DEFINE");
    setAIProviderForTests(mockProvider(architectureFixture({ nfrId: nfr.id, capabilityId: capability.id, storyId: story.id })));
    await expect(generateArchitecture(product.id)).rejects.toThrow(/only runs during BUILD/i);
    expect(await db.agentRun.count({ where: { productId: product.id } })).toBe(0);
  });

  it("requires an approved product brief", async () => {
    const product = await tempProduct("BUILD");
    await db.productDefinition.create({ data: { productId: product.id, status: "APPROVED" } });
    await db.approval.create({
      data: {
        productId: product.id,
        approvalType: "PRODUCT_DEFINITION",
        status: "APPROVED",
        approvedBy: "Local user",
        resolvedAt: new Date(),
      },
    });
    await db.productSlice.create({
      data: { productId: product.id, name: "Slice", status: "APPROVED" },
    });
    setAIProviderForTests(mockProvider(architectureFixture({ nfrId: "x", capabilityId: "y", storyId: "z" })));
    await expect(generateArchitecture(product.id)).rejects.toThrow(/approved Product Brief/i);
    expect(await db.agentRun.count({ where: { productId: product.id } })).toBe(0);
  });

  it("requires an approved product definition", async () => {
    const product = await tempProduct("BUILD");
    await approvedBrief(product.id);
    await db.productSlice.create({
      data: { productId: product.id, name: "Slice", status: "APPROVED" },
    });
    setAIProviderForTests(mockProvider({}));
    await expect(generateArchitecture(product.id)).rejects.toThrow(/approved Product Definition/i);
    expect(await db.agentRun.count({ where: { productId: product.id } })).toBe(0);
  });

  it("requires an approved first product slice", async () => {
    const product = await tempProduct("BUILD");
    await approvedBrief(product.id);
    await db.productDefinition.create({ data: { productId: product.id, status: "APPROVED" } });
    await db.approval.create({
      data: {
        productId: product.id,
        approvalType: "PRODUCT_DEFINITION",
        status: "APPROVED",
        approvedBy: "Local user",
        resolvedAt: new Date(),
      },
    });
    setAIProviderForTests(mockProvider({}));
    await expect(generateArchitecture(product.id)).rejects.toThrow(/approved First Product Slice/i);
    expect(await db.agentRun.count({ where: { productId: product.id } })).toBe(0);
  });

  it("refuses when the provider is not configured and writes no run", async () => {
    const { product } = await readyProduct();
    delete process.env.OPENAI_API_KEY;
    setAIProviderForTests(null);
    await expect(generateArchitecture(product.id)).rejects.toThrow(/not configured/i);
    expect(await db.agentRun.count({ where: { productId: product.id } })).toBe(0);
  });

  it("records a failed run when the model fails and writes no architecture", async () => {
    const { product } = await readyProduct();
    setAIProviderForTests(mockProvider({}, new Error("model unavailable")));
    await expect(generateArchitecture(product.id)).rejects.toThrow(/model unavailable/i);
    const run = await db.agentRun.findFirst({ where: { productId: product.id } });
    expect(run?.status).toBe("FAILED");
    expect(await db.architectureProposal.count({ where: { productId: product.id } })).toBe(0);
    expect(await db.solutionArchitecture.count({ where: { productId: product.id } })).toBe(0);
  });

  it("rejects an invalid structured response and an invalid component reference", async () => {
    const { product, capability, story, nfr } = await readyProduct();
    setAIProviderForTests(mockProvider({ assistantSummary: "too small" }));
    await expect(generateArchitecture(product.id)).rejects.toThrow(/did not match the required structure/i);
    expect(await db.architectureProposal.count({ where: { productId: product.id } })).toBe(0);

    const broken = architectureFixture({ nfrId: nfr.id, capabilityId: capability.id, storyId: story.id });
    broken.relationships[0].targetTempId = "component-9";
    setAIProviderForTests(mockProvider(broken));
    await expect(generateArchitecture(product.id)).rejects.toThrow(/invalid component reference/i);
    expect(await db.solutionArchitecture.count({ where: { productId: product.id } })).toBe(0);
    const runs = await db.agentRun.findMany({ where: { productId: product.id } });
    expect(runs.every((run) => run.status === "FAILED")).toBe(true);
  });
});

describe("architecture commit, approval, and planning", () => {
  it("rolls back when a relationship references a missing component", async () => {
    const { product, capability, story, nfr, slice } = await readyProduct();
    const stored = toStoredArchitecture(
      architectureFixture({ nfrId: nfr.id, capabilityId: capability.id, storyId: story.id }),
    );
    stored.relationships[0].reviewStatus = "ACCEPTED";
    stored.relationships[0].targetTempId = "component-9";
    stored.components = stored.components.map((component) => ({
      ...component,
      reviewStatus: "ACCEPTED" as const,
    }));
    await expect(
      persistCommittedArchitecture({
        productId: product.id,
        productSliceId: slice.id,
        payload: stored,
      }),
    ).rejects.toThrow(/invalid component reference/i);
    expect(await db.solutionArchitecture.count({ where: { productId: product.id } })).toBe(0);
    expect(await db.architectureComponent.count({ where: { architecture: { productId: product.id } } })).toBe(0);
  });

  it("keeps a human edit when a later proposal is committed", async () => {
    const setup = await readyProduct();
    const fixture = architectureFixture({
      nfrId: setup.nfr.id,
      capabilityId: setup.capability.id,
      storyId: setup.story.id,
    });
    setAIProviderForTests(mockProvider(fixture));
    await generateArchitecture(setup.product.id);
    const proposal = await openProposal(setup.product.id, "ARCHITECTURE");
    await acceptEntireArchitectureProposal(setup.product.id, proposal.id);
    await commitArchitecture(setup.product.id, proposal.id);
    await updateArchitectureSummary({
      productId: setup.product.id,
      summary: "Human summary that must survive regeneration.",
      rationale: "A person rewrote the rationale.",
      architectureStyle: "Modular monolith",
    });

    const revised = architectureFixture({
      nfrId: setup.nfr.id,
      capabilityId: setup.capability.id,
      storyId: setup.story.id,
    });
    revised.architectureSummary = "The model tried to replace the human summary.";
    setAIProviderForTests(mockProvider(revised));
    await generateArchitecture(setup.product.id);
    const next = await openProposal(setup.product.id, "ARCHITECTURE");
    await acceptEntireArchitectureProposal(setup.product.id, next.id);
    await commitArchitecture(setup.product.id, next.id);

    const saved = await db.solutionArchitecture.findFirst({ where: { productId: setup.product.id } });
    expect(saved?.summary).toBe("Human summary that must survive regeneration.");
    expect(saved?.humanLocked).toBe(true);
    expect(saved?.status).not.toBe("APPROVED");
  });

  it("lets a person approve the architecture and refuses the agent", async () => {
    const setup = await readyProduct();
    await expect(
      approveSolutionArchitecture(setup.product.id, { actorName: "Architecture Agent" }),
    ).rejects.toThrow(/cannot approve a solution architecture/i);

    setAIProviderForTests(
      mockProvider(
        architectureFixture({
          nfrId: setup.nfr.id,
          capabilityId: setup.capability.id,
          storyId: setup.story.id,
        }),
      ),
    );
    await generateArchitecture(setup.product.id);
    const proposal = await openProposal(setup.product.id, "ARCHITECTURE");
    await acceptEntireArchitectureProposal(setup.product.id, proposal.id);
    await commitArchitecture(setup.product.id, proposal.id);
    await markArchitectureReady(setup.product.id);
    await approveSolutionArchitecture(setup.product.id);
    const saved = await db.solutionArchitecture.findFirst({ where: { productId: setup.product.id } });
    expect(saved?.status).toBe("APPROVED");
    const approval = await db.approval.findFirst({
      where: { productId: setup.product.id, approvalType: "SOLUTION_ARCHITECTURE" },
    });
    expect(approval?.status).toBe("APPROVED");
    expect(approval?.approvedBy).not.toBe("Architecture Agent");
  });

  it("refuses an implementation plan until the architecture is approved", async () => {
    const setup = await readyProduct();
    setAIProviderForTests(
      mockProvider(
        architectureFixture({
          nfrId: setup.nfr.id,
          capabilityId: setup.capability.id,
          storyId: setup.story.id,
        }),
      ),
    );
    await expect(generateImplementationPlan(setup.product.id)).rejects.toThrow(
      /approved Solution Architecture/i,
    );
    expect(await db.implementationPlan.count({ where: { productId: setup.product.id } })).toBe(0);
    expect(await db.agentRun.count({ where: { productId: setup.product.id, agentType: "ARCHITECTURE" } })).toBe(0);
  });

  it("rejects a dependency cycle and a layer-cake plan before saving tasks", async () => {
    const setup = await readyProduct();
    const base = architectureFixture({
      nfrId: setup.nfr.id,
      capabilityId: setup.capability.id,
      storyId: setup.story.id,
    });
    const cycled = structuredClone(base);
    cycled.implementationPlanProposal.tasks[0].dependsOn = ["task-2"];
    const storedCycle = toStoredArchitecture(cycled);
    storedCycle.implementationPlanProposal.tasks = storedCycle.implementationPlanProposal.tasks.map(
      (task) => ({ ...task, reviewStatus: "ACCEPTED" as const }),
    );
    const architecture = await db.solutionArchitecture.create({
      data: {
        productId: setup.product.id,
        version: 1,
        status: "APPROVED",
        summary: "Approved for the plan test.",
        architectureStyle: "Modular monolith",
      },
    });
    await expect(
      persistCommittedPlan({
        productId: setup.product.id,
        productSliceId: setup.slice.id,
        solutionArchitectureId: architecture.id,
        payload: storedCycle,
      }),
    ).rejects.toThrow(/dependency cycle/i);
    expect(await db.implementationPlan.count({ where: { productId: setup.product.id } })).toBe(0);

    const layered = structuredClone(base);
    layered.implementationPlanProposal.tasks[0].title = "Build all database";
    layered.implementationPlanProposal.tasks[0].verticalSlice = "database layer";
    const storedLayer = toStoredArchitecture(layered);
    storedLayer.implementationPlanProposal.tasks = storedLayer.implementationPlanProposal.tasks.map(
      (task) => ({ ...task, reviewStatus: "ACCEPTED" as const }),
    );
    await expect(
      persistCommittedPlan({
        productId: setup.product.id,
        productSliceId: setup.slice.id,
        solutionArchitectureId: architecture.id,
        payload: storedLayer,
      }),
    ).rejects.toThrow(/vertical slices/i);
    expect(await db.implementationTask.count({ where: { plan: { productId: setup.product.id } } })).toBe(0);
  });

  it("commits a vertical-slice plan with dependencies and keeps coding blocked until both approvals", async () => {
    const setup = await readyProduct();
    const fixture = architectureFixture({
      nfrId: setup.nfr.id,
      capabilityId: setup.capability.id,
      storyId: setup.story.id,
    });
    setAIProviderForTests(mockProvider(fixture));
    await generateArchitecture(setup.product.id);
    const architectureProposal = await openProposal(setup.product.id, "ARCHITECTURE");
    await acceptEntireArchitectureProposal(setup.product.id, architectureProposal.id);
    await commitArchitecture(setup.product.id, architectureProposal.id);
    await markArchitectureReady(setup.product.id);
    await approveSolutionArchitecture(setup.product.id);

    expect((await getCodingReadiness(setup.product.id)).label).toBe("NOT READY");
    await expect(
      approveImplementationPlan(setup.product.id, { actorName: "Architecture Agent" }),
    ).rejects.toThrow(/cannot approve an implementation plan/i);

    await generateImplementationPlan(setup.product.id);
    const planProposal = await openProposal(setup.product.id, "IMPLEMENTATION_PLAN");
    await acceptEntireArchitectureProposal(setup.product.id, planProposal.id);
    await commitImplementationPlan(setup.product.id, planProposal.id);
    const tasks = await db.implementationTask.findMany({
      where: { plan: { productId: setup.product.id } },
      include: { dependencies: true },
    });
    expect(new Set(tasks.map((task) => task.verticalSlice))).toEqual(new Set(["Submit simple claim"]));
    expect(tasks.some((task) => task.dependencies.length > 0)).toBe(true);
    expect((await getCodingReadiness(setup.product.id)).ready).toBe(false);

    await markPlanReady(setup.product.id);
    await approveImplementationPlan(setup.product.id);
    const coding = await getCodingReadiness(setup.product.id);
    expect(coding.label).toBe("READY");
    expect(coding.ready).toBe(true);
    const planApproval = await db.approval.findFirst({
      where: { productId: setup.product.id, approvalType: "IMPLEMENTATION_PLAN" },
    });
    expect(planApproval?.approvedBy).not.toBe("Architecture Agent");
  });

  it("flags architecture review when a requirement changes and plan review when architecture changes", async () => {
    const setup = await readyProduct();
    const fixture = architectureFixture({
      nfrId: setup.nfr.id,
      capabilityId: setup.capability.id,
      storyId: setup.story.id,
    });
    setAIProviderForTests(mockProvider(fixture));
    await generateArchitecture(setup.product.id);
    const architectureProposal = await openProposal(setup.product.id, "ARCHITECTURE");
    await acceptEntireArchitectureProposal(setup.product.id, architectureProposal.id);
    await commitArchitecture(setup.product.id, architectureProposal.id);
    await markArchitectureReady(setup.product.id);
    await approveSolutionArchitecture(setup.product.id);

    await updateWorkItem({
      id: setup.story.id,
      title: "Submit a straightforward claim online",
      description: setup.story.description,
      status: "DRAFT",
      stage: "BUILD",
      priority: "MEDIUM",
    });
    const architecture = await db.solutionArchitecture.findFirst({
      where: { productId: setup.product.id },
    });
    expect(architecture?.reviewRequired).toBe(true);
    expect(architecture?.reviewReason).toMatch(/Architecture review required/i);
    const architectureApproval = await db.approval.findFirst({
      where: { productId: setup.product.id, approvalType: "SOLUTION_ARCHITECTURE" },
    });
    expect(architectureApproval?.status).toBe("APPROVED");

    await generateImplementationPlan(setup.product.id);
    const planProposal = await openProposal(setup.product.id, "IMPLEMENTATION_PLAN");
    await acceptEntireArchitectureProposal(setup.product.id, planProposal.id);
    await commitImplementationPlan(setup.product.id, planProposal.id);
    await markPlanReady(setup.product.id);
    await approveImplementationPlan(setup.product.id);
    await updateArchitectureSummary({
      productId: setup.product.id,
      summary: "A person changed the approved architecture.",
      rationale: "The change needs a plan review.",
      architectureStyle: "Modular monolith",
    });
    const plan = await db.implementationPlan.findFirst({ where: { productId: setup.product.id } });
    expect(plan?.reviewRequired).toBe(true);
    expect(plan?.reviewReason).toMatch(/Implementation Plan review required/i);
    expect(plan?.status).toBe("APPROVED");
    const planApproval = await db.approval.findFirst({
      where: { productId: setup.product.id, approvalType: "IMPLEMENTATION_PLAN" },
    });
    expect(planApproval?.status).toBe("APPROVED");
  });
});
