import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

import { db } from "@/lib/db";

/**
 * Test support only. Builds a completed, code-approved task whose repository is the given directory, with the same
 * records the verification service tests use. Callers remove the product in cleanup. Not imported by application code.
 */

export function git(dir: string, args: string[]) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
}

export async function completedTaskIn(repo: string, options?: {
  pass?: boolean | "absent";
  build?: boolean;
  javascript?: boolean;
  productModule?: string;
  testApplicability?: "REQUIRED" | "NOT_APPLICABLE";
  status?: "COMPLETED" | "APPROVED";
  approval?: boolean;
  sha?: boolean;
  checks?: boolean;
  stale?: boolean;
  workspace?: boolean;
  criteria?: number;
}) {
  const sha = git(repo, ["rev-parse", "HEAD"]).trim();
  const product = await db.product.create({
    data: {
      name: `Verify ${crypto.randomUUID()}`,
      description: "Temporary",
      vision: "A customer can submit a claim.",
      problemStatement: "Claims are fragmented.",
      targetUsers: "Customers",
      status: "ACTIVE",
      currentStage: "BUILD",
    },
  });
  const slice = await db.productSlice.create({
    data: { productId: product.id, name: "Submit a simple claim", status: "APPROVED" },
  });
  const outcome = await db.productOutcome.create({
    data: { productId: product.id, title: "Customers submit a notice", status: "CONFIRMED" },
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
  const criterion = await db.acceptanceCriterion.create({
    data: { workItemId: story.id, description: "A valid notice returns a claim reference." },
  });
  if ((options?.criteria ?? 1) > 1) {
    await db.acceptanceCriterion.create({
      data: { workItemId: story.id, description: "A second criterion remains unverified." },
    });
  }
  const architecture = await db.solutionArchitecture.create({
    data: { productId: product.id, productSliceId: slice.id, version: 1, status: "APPROVED", summary: "A modular monolith." },
  });
  const plan = await db.implementationPlan.create({
    data: {
      productId: product.id,
      productSliceId: slice.id,
      solutionArchitectureId: architecture.id,
      version: 1,
      status: "APPROVED",
    },
  });
  const task = await db.implementationTask.create({
    data: {
      implementationPlanId: plan.id,
      workItemId: story.id,
      title: "Implement claim submission",
      objective: "Return a claim reference.",
      status: options?.status ?? "COMPLETED",
    },
  });
  const repository = await db.repository.create({
    data: { productId: product.id, name: "demo-claims", localPath: repo, defaultBranch: "main", status: "CONFIGURED" },
  });
  if (options?.workspace !== false) {
    const workspace = await db.repositoryWorkspace.create({
      data: {
        repositoryId: repository.id,
        productId: product.id,
        implementationTaskId: task.id,
        workspacePath: repo,
        branchName: "main",
        baseCommit: sha,
        headCommit: options?.sha === false ? "" : sha,
        status: "COMPLETED",
        executionContractStale: options?.stale === true,
      },
    });
    await db.codingExecutionContract.create({
      data: {
        implementationTaskId: task.id,
        workspaceId: workspace.id,
        objective: "Return a claim reference.",
        requiredChecks: ["unit tests"],
        executionMode: "SUPERVISED",
        riskLevel: "LOW",
        stale: options?.stale === true,
      },
    });
    await db.codingExecutionPlan.create({
      data: {
        workspaceId: workspace.id,
        summary: "Claim submission",
        version: 1,
        status: "COMPLETED",
        filesExpectedToChange: ["src/claims/submit.ts"],
        steps: ["Update the claim form"],
        validationCommands: [
          ...(options?.build
            ? [{ command: "npm run build", kind: "VALIDATION", applicability: "REQUIRED", reason: "The plan requires a build." }]
            : []),
          { command: "npm test", kind: "VALIDATION", applicability: options?.testApplicability ?? "REQUIRED", reason: "The plan states whether tests apply." },
        ],
        approvedBy: "Local user",
        approvedAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    if (options?.checks !== false) {
      await db.codingEvidence.create({
        data: {
          workspaceId: workspace.id,
          implementationTaskId: task.id,
          type: "TEST_RESULT",
          source: "COMMAND_RUNNER",
          description: "unit tests",
          result: "PASS",
          command: "npm test",
          exitCode: 0,
        },
      });
      if (options?.build) {
        await db.codingEvidence.create({
          data: {
            workspaceId: workspace.id,
            implementationTaskId: task.id,
            type: "BUILD",
            source: "COMMAND_RUNNER",
            description: "production build",
            result: "PASS",
            command: "npm run build",
            exitCode: 0,
          },
        });
      }
    }
    await db.codingSelfReview.create({
      data: { workspaceId: workspace.id, summary: "The Coding Agent says every criterion passed." },
    });
  }
  if (options?.approval !== false) {
    const approval = await db.approval.create({
      data: { productId: product.id, approvalType: "CODE_CHANGE", status: "APPROVED", approvedBy: "Local user" },
    });
    if (options?.workspace !== false) {
      const workspace = await db.repositoryWorkspace.findFirst({ where: { implementationTaskId: task.id } });
      await db.codeChangeApproval.create({
        data: {
          productId: product.id,
          approvalId: approval.id,
          implementationTaskId: task.id,
          workspaceId: workspace!.id,
          baseCommit: sha,
          headCommit: sha,
          diffHash: "abc",
        },
      });
    }
  }
  return { repo, sha, product, slice, task, criterion };
}
