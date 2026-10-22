import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { keepClarificationVersion, saveClarificationAnswer } from "@/modules/clarification/service";
import { assessGuidance } from "@/modules/guidance/assess";
import { loadSnapshots } from "@/modules/guidance/load";
import { resumeCodingTask } from "@/modules/coding/service";

const createdProducts: string[] = [];

async function product() {
  const row = await db.product.create({
    data: {
      name: `Clarification ${crypto.randomUUID()}`,
      description: "Temporary product.",
      vision: "Temporary vision",
      problemStatement: "Temporary problem",
      targetUsers: "Testers",
      status: "ACTIVE",
      currentStage: "BUILD",
    },
  });
  createdProducts.push(row.id);
  return row;
}

async function question(productId: string, text = "Pilot location?") {
  return db.requirementQuestion.create({
    data: { productId, question: text, reason: "The definition depends on it.", impact: "HIGH" },
  });
}

afterEach(async () => {
  if (createdProducts.length === 0) return;
  await db.product.deleteMany({ where: { id: { in: createdProducts.splice(0) } } });
});

describe("clarification answer lifecycle", () => {
  it("stores the first answer and keeps an unanswered question open until then", async () => {
    const row = await product();
    const open = await question(row.id);
    expect(open.status).toBe("OPEN");
    expect(open.answer).toBe("");
    const saved = await saveClarificationAnswer({
      productId: row.id,
      kind: "REQUIREMENT",
      questionId: open.id,
      answer: "London",
    });
    expect(saved.changed).toBe(true);
    expect(saved.material).toBe(false);
    const current = await db.requirementQuestion.findUniqueOrThrow({ where: { id: open.id } });
    expect(current.status).toBe("ANSWERED");
    expect(current.answer).toBe("London");
    const history = await db.clarificationAnswerRevision.findMany({ where: { questionId: open.id }, orderBy: { createdAt: "asc" } });
    expect(history).toHaveLength(1);
    expect(history[0]?.answer).toBe("London");
  });

  it("leaves the original answer in place when a revision is not saved", async () => {
    const row = await product();
    const open = await question(row.id);
    await saveClarificationAnswer({ productId: row.id, kind: "REQUIREMENT", questionId: open.id, answer: "London" });
    const before = await db.requirementQuestion.findUniqueOrThrow({ where: { id: open.id } });
    const unchanged = await saveClarificationAnswer({
      productId: row.id,
      kind: "REQUIREMENT",
      questionId: open.id,
      answer: "London",
    });
    expect(unchanged.changed).toBe(false);
    const after = await db.requirementQuestion.findUniqueOrThrow({ where: { id: open.id } });
    expect(after.answer).toBe(before.answer);
    expect(after.resolvedAt?.toISOString()).toBe(before.resolvedAt?.toISOString());
  });

  it("keeps the previous answer when the current answer changes", async () => {
    const row = await product();
    const open = await question(row.id);
    await saveClarificationAnswer({ productId: row.id, kind: "REQUIREMENT", questionId: open.id, answer: "London" });
    await saveClarificationAnswer({ productId: row.id, kind: "REQUIREMENT", questionId: open.id, answer: "Manchester" });
    const current = await db.requirementQuestion.findUniqueOrThrow({ where: { id: open.id } });
    expect(current.answer).toBe("Manchester");
    const history = await db.clarificationAnswerRevision.findMany({ where: { questionId: open.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((item) => item.answer)).toEqual(["London", "Manchester"]);
    expect(history[1]?.changedBy).toBeTruthy();
    expect(history[1]?.material).toBe(true);
    const activity = await db.activity.findFirst({
      where: { productId: row.id, type: "CLARIFICATION_ANSWER_REVISED" },
    });
    expect(activity?.description).toMatch(/previous answer/i);
    const reread = await db.requirementQuestion.findUniqueOrThrow({ where: { id: open.id } });
    expect(reread.answer).toBe("Manchester");
  });

  it("does not flag anything when no downstream artefact exists", async () => {
    const row = await product();
    const open = await question(row.id);
    await saveClarificationAnswer({ productId: row.id, kind: "REQUIREMENT", questionId: open.id, answer: "London" });
    const saved = await saveClarificationAnswer({ productId: row.id, kind: "REQUIREMENT", questionId: open.id, answer: "Manchester" });
    expect(saved.impacts).toEqual([]);
    expect(await db.productDefinition.count({ where: { productId: row.id } })).toBe(0);
    expect(await db.solutionArchitecture.count({ where: { productId: row.id } })).toBe(0);
    const guidance = assessGuidance((await loadSnapshots(row.id))[0]!);
    expect(guidance.action?.key).not.toBe("review-definition");
  });

  it("flags a draft definition without approving or rewriting it", async () => {
    const row = await product();
    const open = await question(row.id);
    await saveClarificationAnswer({ productId: row.id, kind: "REQUIREMENT", questionId: open.id, answer: "London" });
    const definition = await db.productDefinition.create({
      data: { productId: row.id, status: "IN_PROGRESS", reviewSummary: "Draft summary" },
    });
    await saveClarificationAnswer({ productId: row.id, kind: "REQUIREMENT", questionId: open.id, answer: "Manchester" });
    const after = await db.productDefinition.findUniqueOrThrow({ where: { id: definition.id } });
    expect(after.status).toBe("IN_PROGRESS");
    expect(after.reviewSummary).toBe("Draft summary");
    expect(after.reviewRequired).toBe(true);
    expect(after.reviewReason).toMatch(/not rewritten/i);
  });

  it("keeps an approved definition and design historically approved", async () => {
    const row = await product();
    const open = await question(row.id);
    await saveClarificationAnswer({ productId: row.id, kind: "REQUIREMENT", questionId: open.id, answer: "London" });
    const approvedAt = new Date("2026-10-10T12:00:00.000Z");
    const definition = await db.productDefinition.create({
      data: { productId: row.id, status: "APPROVED", approvedAt, reviewSummary: "Approved summary" },
    });
    const architecture = await db.solutionArchitecture.create({
      data: { productId: row.id, version: 1, status: "APPROVED", summary: "Designed for London." },
    });
    await saveClarificationAnswer({ productId: row.id, kind: "REQUIREMENT", questionId: open.id, answer: "Manchester" });
    const definitionAfter = await db.productDefinition.findUniqueOrThrow({ where: { id: definition.id } });
    const designAfter = await db.solutionArchitecture.findUniqueOrThrow({ where: { id: architecture.id } });
    expect(definitionAfter.status).toBe("APPROVED");
    expect(definitionAfter.approvedAt?.toISOString()).toBe(approvedAt.toISOString());
    expect(definitionAfter.reviewSummary).toBe("Approved summary");
    expect(definitionAfter.reviewRequired).toBe(true);
    expect(designAfter.status).toBe("APPROVED");
    expect(designAfter.version).toBe(1);
    expect(designAfter.summary).toBe("Designed for London.");
    expect(designAfter.reviewRequired).toBe(true);
    expect(await db.solutionArchitecture.count({ where: { productId: row.id } })).toBe(1);
    const guidance = assessGuidance((await loadSnapshots(row.id))[0]!);
    expect(guidance.action?.key).toBe("review-definition");
    expect(guidance.evidence.items.find((item) => item.label === "Product Definition")?.note).toBe("Needs review again.");
  });

  it("does not rewind the lifecycle for a cosmetic answer change", async () => {
    const row = await product();
    const open = await question(row.id);
    await saveClarificationAnswer({ productId: row.id, kind: "REQUIREMENT", questionId: open.id, answer: "London UK" });
    const definition = await db.productDefinition.create({
      data: { productId: row.id, status: "APPROVED", reviewSummary: "Approved summary" },
    });
    const saved = await saveClarificationAnswer({
      productId: row.id,
      kind: "REQUIREMENT",
      questionId: open.id,
      answer: "London, UK",
    });
    expect(saved.material).toBe(false);
    expect(saved.impacts).toEqual([]);
    const after = await db.productDefinition.findUniqueOrThrow({ where: { id: definition.id } });
    expect(after.reviewRequired).toBe(false);
    expect(after.status).toBe("APPROVED");
    const guidance = assessGuidance((await loadSnapshots(row.id))[0]!);
    expect(guidance.action?.key).not.toBe("review-definition");
    const history = await db.clarificationAnswerRevision.findMany({ where: { questionId: open.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((item) => item.answer)).toEqual(["London UK", "London, UK"]);
  });

  it("blocks a stale approved execution plan and leaves the coding run unchanged", async () => {
    const row = await product();
    const open = await question(row.id);
    await saveClarificationAnswer({ productId: row.id, kind: "REQUIREMENT", questionId: open.id, answer: "London" });
    const slice = await db.productSlice.create({ data: { productId: row.id, name: "Slice", status: "APPROVED" } });
    const architecture = await db.solutionArchitecture.create({
      data: { productId: row.id, productSliceId: slice.id, version: 1, status: "APPROVED", summary: "Designed for London." },
    });
    const delivery = await db.implementationPlan.create({
      data: {
        productId: row.id,
        productSliceId: slice.id,
        solutionArchitectureId: architecture.id,
        version: 1,
        status: "APPROVED",
        summary: "Deliver the London slice.",
      },
    });
    const task = await db.implementationTask.create({
      data: { implementationPlanId: delivery.id, title: "Build the slice", objective: "Build it.", status: "APPROVED" },
    });
    const repository = await db.repository.create({
      data: { productId: row.id, name: "local", localPath: "/tmp/clarification-test", status: "CONFIGURED" },
    });
    const workspace = await db.repositoryWorkspace.create({
      data: {
        repositoryId: repository.id,
        productId: row.id,
        implementationTaskId: task.id,
        workspacePath: "/tmp/clarification-workspace",
        branchName: "ai-factory/clarification",
        status: "FAILED",
      },
    });
    await db.codingExecutionContract.create({
      data: { implementationTaskId: task.id, workspaceId: workspace.id, executionMode: "SUPERVISED", riskLevel: "LOW" },
    });
    const approvedAt = new Date("2026-10-13T14:37:48.365Z");
    const plan = await db.codingExecutionPlan.create({
      data: {
        workspaceId: workspace.id,
        version: 2,
        status: "APPROVED",
        approvedBy: "Local user",
        approvedAt,
        summary: "Execution plan v2",
        setupCommands: ["npm install"],
        validationCommands: [],
      },
    });
    const run = await db.agentRun.create({
      data: {
        productId: row.id,
        agentType: "CODING",
        status: "FAILED",
        input: { phase: "implement", workspaceId: workspace.id, planVersion: 2 },
        output: { error: "The AI provider is unavailable. Nothing was generated. You can retry.", errorCategory: "PROVIDER_UNAVAILABLE" },
      },
    });
    await db.repositoryWorkspace.update({ where: { id: workspace.id }, data: { agentRunId: run.id } });

    await saveClarificationAnswer({ productId: row.id, kind: "REQUIREMENT", questionId: open.id, answer: "Manchester" });

    const planAfter = await db.codingExecutionPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(planAfter.status).toBe("APPROVED");
    expect(planAfter.version).toBe(2);
    expect(planAfter.approvedAt?.toISOString()).toBe(approvedAt.toISOString());
    expect(planAfter.summary).toBe("Execution plan v2");
    expect(planAfter.setupCommands).toEqual(["npm install"]);
    const workspaceAfter = await db.repositoryWorkspace.findUniqueOrThrow({ where: { id: workspace.id } });
    expect(workspaceAfter.executionContractStale).toBe(true);
    expect(workspaceAfter.agentRunId).toBe(run.id);
    const runAfter = await db.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(runAfter.output).toMatchObject({ errorCategory: "PROVIDER_UNAVAILABLE" });
    expect(runAfter.status).toBe("FAILED");
    expect(await db.agentRun.count({ where: { productId: row.id } })).toBe(1);
    await expect(resumeCodingTask(row.id, workspace.id)).rejects.toThrow(/STALE|clarification/i);
    expect(await db.agentRun.count({ where: { productId: row.id } })).toBe(1);
    const still = await db.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(still.output).toEqual(runAfter.output);

    await keepClarificationVersion(row.id, "PLAN");
    const kept = await db.repositoryWorkspace.findUniqueOrThrow({ where: { id: workspace.id } });
    expect(kept.executionContractStale).toBe(false);
    const planKept = await db.codingExecutionPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(planKept.status).toBe("APPROVED");
    expect(planKept.version).toBe(2);
    expect(await db.agentRun.count({ where: { productId: row.id } })).toBe(1);
  });
});
