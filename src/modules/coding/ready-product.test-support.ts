import crypto from "node:crypto";

import { db } from "@/lib/db";

/**
 * Test support only. Creates a product with every approved record the Coding Agent needs before it may start: brief,
 * definition, architecture, implementation plan, governance review, coding policy and a risk assessment, plus one task.
 * Callers remove the product in cleanup. Not imported by application code.
 */
export async function readyCodingProduct(options?: {
  stage?: "DEFINE" | "BUILD";
  taskStatus?: "PROPOSED" | "APPROVED";
  mode?: "AUTONOMOUS" | "SUPERVISED" | "HUMAN_ONLY";
  risk?: "LOW" | "MEDIUM" | "HIGH";
  maxFiles?: number;
  allowed?: string[];
  restricted?: string[];
  blocked?: boolean;
}) {
  const product = await db.product.create({
    data: {
      name: `Coding ${crypto.randomUUID()}`,
      description: "Temporary",
      vision: "A customer can submit a claim.",
      problemStatement: "Claims are fragmented.",
      targetUsers: "Customers",
      status: "ACTIVE",
      currentStage: options?.stage ?? "BUILD",
    },
  });
  const session = await db.discoverySession.create({ data: { productId: product.id, status: "APPROVED" } });
  await db.productBrief.create({
    data: {
      productId: product.id,
      sessionId: session.id,
      version: 1,
      status: "APPROVED",
      problemStatement: "Customers cannot submit a claim online.",
      productVision: "A customer can submit a simple claim.",
      valueProposition: "The first notice is digital.",
    },
  });
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
  const slice = await db.productSlice.create({
    data: { productId: product.id, name: "Submit a simple claim", status: "APPROVED" },
  });
  const outcome = await db.productOutcome.create({
    data: { productId: product.id, title: "Customers submit a notice without calling", status: "CONFIRMED" },
  });
  const capability = await db.productCapability.create({
    data: { productId: product.id, outcomeId: outcome.id, name: "Submit a claim", status: "CONFIRMED" },
  });
  const epic = await db.workItem.create({
    data: { productId: product.id, title: "Digital claims", type: "EPIC", stage: "BUILD" },
  });
  const feature = await db.workItem.create({
    data: { productId: product.id, title: "Claim notice", type: "FEATURE", stage: "BUILD", parentId: epic.id },
  });
  const story = await db.workItem.create({
    data: {
      productId: product.id,
      title: "As a customer I want to submit a new claim online",
      type: "STORY",
      stage: "BUILD",
      parentId: feature.id,
      capabilityId: capability.id,
      sliceId: slice.id,
    },
  });
  await db.acceptanceCriterion.create({
    data: { workItemId: story.id, description: "A valid notice returns a reference." },
  });
  const architecture = await db.solutionArchitecture.create({
    data: {
      productId: product.id,
      productSliceId: slice.id,
      version: 1,
      status: "APPROVED",
      summary: "A modular monolith accepts the notice.",
      rationale: "One journey is enough.",
    },
  });
  await db.approval.create({
    data: {
      productId: product.id,
      approvalType: "SOLUTION_ARCHITECTURE",
      status: "APPROVED",
      approvedBy: "Local user",
      resolvedAt: new Date(),
    },
  });
  const component = await db.architectureComponent.create({
    data: {
      solutionArchitectureId: architecture.id,
      name: "Claims API",
      type: "API",
      responsibilities: "Accept a valid notice.",
    },
  });
  const plan = await db.implementationPlan.create({
    data: {
      productId: product.id,
      productSliceId: slice.id,
      solutionArchitectureId: architecture.id,
      version: 1,
      status: "APPROVED",
      summary: "Implement the notice as one slice.",
    },
  });
  await db.approval.create({
    data: {
      productId: product.id,
      approvalType: "IMPLEMENTATION_PLAN",
      status: "APPROVED",
      approvedBy: "Local user",
      resolvedAt: new Date(),
    },
  });
  const dependency = options?.blocked
    ? await db.implementationTask.create({
        data: {
          implementationPlanId: plan.id,
          title: "Confirm the customer",
          objective: "Identify the caller.",
          status: "APPROVED",
        },
      })
    : null;
  const task = await db.implementationTask.create({
    data: {
      implementationPlanId: plan.id,
      workItemId: story.id,
      title: "Accept a simple claim",
      objective: "Accept a notice and return a reference.",
      validation: "A valid notice returns a reference.",
      status: options?.taskStatus ?? "APPROVED",
    },
  });
  await db.implementationTaskComponent.create({ data: { taskId: task.id, componentId: component.id } });
  if (dependency) {
    await db.implementationTaskDependency.create({ data: { taskId: task.id, dependsOnId: dependency.id } });
  }
  const review = await db.engineeringGovernanceReview.create({
    data: {
      productId: product.id,
      solutionArchitectureId: architecture.id,
      implementationPlanId: plan.id,
      version: 1,
      status: "APPROVED",
      overallAssessment: "PASS",
      summary: "The slice can be coded inside the policy.",
    },
  });
  await db.approval.create({
    data: {
      productId: product.id,
      approvalType: "ENGINEERING_GOVERNANCE",
      status: "APPROVED",
      approvedBy: "Local user",
      resolvedAt: new Date(),
    },
  });
  await db.codingPolicy.create({
    data: {
      productId: product.id,
      reviewId: review.id,
      allowedPaths: options?.allowed ?? ["src/claims/**"],
      restrictedPaths: options?.restricted ?? ["prisma/**"],
      prohibitedActions: ["Force push", "Bypass failing tests"],
      requiredChecks: ["unit tests"],
      maxFilesPerTask: options?.maxFiles ?? 8,
      requireTests: true,
      requireHumanReview: true,
    },
  });
  await db.approval.create({
    data: {
      productId: product.id,
      approvalType: "CODING_POLICY",
      status: "APPROVED",
      approvedBy: "Local user",
      resolvedAt: new Date(),
    },
  });
  await db.codingRiskAssessment.create({
    data: {
      reviewId: review.id,
      implementationTaskId: task.id,
      riskLevel: options?.risk ?? "LOW",
      recommendedExecutionMode: options?.mode ?? "AUTONOMOUS",
      reason: "The task stays inside the claims helper.",
    },
  });
  return { product, task, architecture };
}
