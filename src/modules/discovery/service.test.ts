import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { safeErrorMessage } from "@/modules/ai/errors";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { findCurrentBrief } from "@/modules/discovery/repository";
import {
  approveProductBrief,
  continueDiscovery,
  editProductBrief,
  moveDiscoveryToDefine,
  setAssumptionStatus,
  startDiscovery,
} from "@/modules/discovery/service";
import { discoveryFixture } from "@/modules/discovery/testing";

const createdProducts: string[] = [];
const originalKey = process.env.OPENAI_API_KEY;

function mockProvider(data: unknown, error?: Error): AIProvider {
  return {
    async generate<T>() {
      if (error) throw error;
      return {
        data: data as T,
        usage: { inputTokens: 11, outputTokens: 17 },
        model: "mock",
      };
    },
  };
}

async function tempProduct() {
  const product = await db.product.create({
    data: {
      name: `Discovery test ${crypto.randomUUID()}`,
      description: "Temporary product for discovery tests.",
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

const intake = {
  initialIdea: "Handlers rebuild every claim from scattered notes.",
  optionalContext: "",
  knownConstraints: "",
  knownUsers: "Claims handlers",
  desiredOutcome: "A notice a handler can work without a phone call.",
};

afterEach(async () => {
  setAIProviderForTests(null);
  process.env.OPENAI_API_KEY = originalKey;
  while (createdProducts.length > 0) {
    const id = createdProducts.pop();
    if (!id) continue;
    await db.product.delete({ where: { id } }).catch(() => undefined);
  }
});

describe("product discovery service", () => {
  it("creates a session, stores the structured turn, and leaves the stage unchanged", async () => {
    setAIProviderForTests(mockProvider(discoveryFixture()));
    const product = await tempProduct();
    await startDiscovery({ productId: product.id, ...intake });

    const session = await db.discoverySession.findUnique({
      where: { productId: product.id },
      include: { messages: true },
    });
    const brief = await findCurrentBrief(product.id);
    const run = await db.agentRun.findFirst({
      where: { productId: product.id, agentType: "PRODUCT_DISCOVERY" },
    });
    const stored = await db.product.findUnique({ where: { id: product.id } });

    expect(session?.status).toBe("IN_PROGRESS");
    expect(session?.messages.some((message) => message.role === "USER")).toBe(true);
    expect(session?.messages.some((message) => message.role === "ASSISTANT")).toBe(true);
    expect(brief?.version).toBe(1);
    expect(brief?.problemStatement).toContain("Handlers rebuild");
    expect(brief?.status).not.toBe("APPROVED");
    expect(run?.status).toBe("COMPLETED");
    expect(run?.estimatedCost).toBeNull();
    expect(run?.output).toMatchObject({
      usage: { inputTokens: 11, outputTokens: 17 },
      model: "mock",
    });
    expect(stored?.currentStage).toBe("EXPLORE");
  });

  it("does not corrupt the brief when the model response is invalid", async () => {
    const product = await tempProduct();
    setAIProviderForTests(mockProvider(discoveryFixture()));
    await startDiscovery({ productId: product.id, ...intake });
    const before = await findCurrentBrief(product.id);

    setAIProviderForTests(
      mockProvider(
        discoveryFixture({
          questions: ["1", "2", "3", "4", "5", "6"],
          briefUpdates: {
            ...discoveryFixture().briefUpdates,
            problemStatement: "This invalid turn must not be saved.",
          },
        }),
      ),
    );

    await expect(
      continueDiscovery(product.id, "Customers are the ones who feel the delay."),
    ).rejects.toThrow(/product brief was not changed/i);

    const after = await findCurrentBrief(product.id);
    const failed = await db.agentRun.findFirst({
      where: { productId: product.id, status: "FAILED" },
      orderBy: { createdAt: "desc" },
    });
    expect(after?.problemStatement).toBe(before?.problemStatement);
    expect(failed?.status).toBe("FAILED");
  });

  it("lets a human edit take precedence over the next agent suggestion", async () => {
    const product = await tempProduct();
    setAIProviderForTests(mockProvider(discoveryFixture()));
    await startDiscovery({ productId: product.id, ...intake });
    await editProductBrief({
      productId: product.id,
      section: "problemStatement",
      value: "The confirmed problem is handler rework.",
    });

    setAIProviderForTests(
      mockProvider(
        discoveryFixture({
          briefUpdates: {
            ...discoveryFixture().briefUpdates,
            problemStatement: "The agent wants a different problem.",
            productVision: "Customers can see the claim enter a queue.",
          },
        }),
      ),
    );
    await continueDiscovery(product.id, "Please keep my problem statement.");

    const brief = await findCurrentBrief(product.id);
    expect(brief?.problemStatement).toBe("The confirmed problem is handler rework.");
    expect(brief?.fieldOrigins.problemStatement).toBe("HUMAN_CONFIRMED");
    expect(brief?.productVision).toBe("Customers can see the claim enter a queue.");
  });

  it("keeps a human assumption status when the agent repeats the assumption", async () => {
    const product = await tempProduct();
    setAIProviderForTests(mockProvider(discoveryFixture()));
    await startDiscovery({ productId: product.id, ...intake });
    const created = await findCurrentBrief(product.id);
    const assumption = created?.assumptions[0];
    expect(assumption).toBeTruthy();
    await setAssumptionStatus({
      productId: product.id,
      assumptionId: assumption!.id,
      status: "VALIDATED",
    });

    setAIProviderForTests(
      mockProvider(
        discoveryFixture({
          briefUpdates: {
            ...discoveryFixture().briefUpdates,
            assumptions: [
              {
                description: "Customers will file online without help.",
                impact: "LOW",
                confidence: "HIGH",
              },
            ],
          },
        }),
      ),
    );
    await continueDiscovery(product.id, "I checked that assumption with three handlers.");

    const brief = await findCurrentBrief(product.id);
    expect(brief?.assumptions[0]).toMatchObject({
      status: "VALIDATED",
      impact: "HIGH",
      confidence: "LOW",
    });
  });

  it("approves only through a person and does not move the stage until asked", async () => {
    const product = await tempProduct();
    setAIProviderForTests(
      mockProvider(
        discoveryFixture({
          discoveryAssessment: {
            problemClarity: "HIGH",
            userClarity: "HIGH",
            outcomeClarity: "MEDIUM",
            scopeClarity: "MEDIUM",
            riskClarity: "MEDIUM",
            readyForReview: true,
            reason: "Enough is known for a person to review.",
          },
        }),
      ),
    );
    await startDiscovery({ productId: product.id, ...intake });
    await expect(moveDiscoveryToDefine(product.id)).rejects.toThrow(/approve the product brief/i);

    const stageBeforeMove = await db.product.findUnique({ where: { id: product.id } });
    expect(stageBeforeMove?.currentStage).toBe("EXPLORE");

    await approveProductBrief(product.id);
    const approvedProduct = await db.product.findUnique({ where: { id: product.id } });
    const session = await db.discoverySession.findUnique({ where: { productId: product.id } });
    const brief = await findCurrentBrief(product.id);
    const approval = await db.approval.findFirst({
      where: { productId: product.id, approvalType: "PRODUCT_DISCOVERY" },
    });

    expect(session?.status).toBe("APPROVED");
    expect(brief?.status).toBe("APPROVED");
    expect(approval?.status).toBe("APPROVED");
    expect(approvedProduct?.currentStage).toBe("EXPLORE");

    await moveDiscoveryToDefine(product.id);
    const moved = await db.product.findUnique({ where: { id: product.id } });
    expect(moved?.currentStage).toBe("DEFINE");
  });

  it("records a failed provider call without storing the secret", async () => {
    const product = await tempProduct();
    const secret = "sk-testsecretkeyvalue";
    setAIProviderForTests(mockProvider(discoveryFixture(), new Error(`connection failed for ${secret}`)));

    await expect(startDiscovery({ productId: product.id, ...intake })).rejects.toThrow();

    const run = await db.agentRun.findFirst({ where: { productId: product.id } });
    const brief = await findCurrentBrief(product.id);
    const serialized = JSON.stringify(run?.output);
    expect(run?.status).toBe("FAILED");
    expect(serialized).not.toContain(secret);
    expect(safeErrorMessage(new Error(secret))).not.toContain(secret);
    expect(brief?.problemStatement).toBe("");
  });

  it("refuses to start when OPENAI_API_KEY is missing and does not invent a session", async () => {
    delete process.env.OPENAI_API_KEY;
    setAIProviderForTests(null);
    const product = await tempProduct();

    await expect(startDiscovery({ productId: product.id, ...intake })).rejects.toThrow(
      /not configured/i,
    );

    const session = await db.discoverySession.findUnique({ where: { productId: product.id } });
    const runs = await db.agentRun.count({ where: { productId: product.id } });
    expect(session).toBeNull();
    expect(runs).toBe(0);
  });
});
