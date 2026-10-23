import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { AIFailure } from "@/modules/ai/failures";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { listAgentCatalogue } from "@/modules/agent/service";
import { updateArchitectureSummary } from "@/modules/architecture/service";
import { runGit } from "@/modules/coding/git";
import type { CompiledExecutionContract } from "@/modules/coding/commands";
import { executionContractsMatch } from "@/modules/coding/retry";
import { DomainError } from "@/modules/shared/errors";
import {
  applyCodingTool,
  approveCodeChanges,
  approveExecutionPlan,
  createCodingCommit,
  getCodingView,
  proposeCoherentExecutionPlan,
  requestExecutionPlanChanges,
  repairCodingTask,
  resumeCodingTask,
  retryCodingTask,
  reviseExecutionPlan,
  requestCodingChanges,
  startCodingTask,
} from "@/modules/coding/service";

const products: string[] = [];
const repos: string[] = [];
const originalKey = process.env.OPENAI_API_KEY;
const originalRoot = process.env.PRODUCT_REPOSITORY_ROOT;
const originalWorktrees = process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT;
const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apf-worktrees-"));

const analysis = {
  summary: "The claims helper is the relevant file.",
  relevantFiles: ["src/claims/submit.ts"],
  notes: "Bounded to the claims folder.",
};
const plan = {
  summary: "Update the claim helper.",
  filesExpectedToChange: ["src/claims/submit.ts"],
  steps: ["Update the helper"],
  risks: "",
  validationPlan: "npm test",
};
const review = {
  summary: "The diff is limited to the claim helper.",
  potentialDefects: [],
  missingAcceptance: [],
  unnecessaryChanges: [],
  architectureDeviations: [],
  securityConcerns: [],
  missingTests: [],
};
const completion = { proposal: "COMPLETED", rationale: "The deterministic checks decide." };

function provider(change: unknown, planOverride?: unknown): AIProvider {
  const responses: Record<string, unknown> = {
    coding_repository_analysis: analysis,
    coding_execution_plan: planOverride ?? plan,
    coding_change_request: change,
    coding_self_review: review,
    coding_completion: completion,
  };
  return {
    async generate(request) {
      const data = responses[request.schemaName];
      if (!data) throw new Error(`No mock for ${request.schemaName}`);
      return { data: data as never, usage: { inputTokens: 2, outputTokens: 3 }, model: "mock" };
    },
  };
}

const writeChange = {
  summary: "Set the claim reference.",
  operations: [{ action: "WRITE_FILE", path: "src/claims/submit.ts", content: "export const claim = \"reference\"\n" }],
  commands: [],
  escalation: null,
  completionProposal: "COMPLETED",
};

function makeRepo(pass = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-repo-"));
  repos.push(dir);
  fs.mkdirSync(path.join(dir, "src/claims"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src/claims/submit.ts"), "export const claim = \"notice\"\n");
  fs.writeFileSync(
    path.join(dir, "src/claims/submit.test.ts"),
    "test(\"notice\", () => { expect(1).toBe(1) })\n",
  );
  const script = pass ? "process.exit(0)" : "process.exit(1)";
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "demo-claims",
      scripts: {
        test: `node -e "${script}"`,
        lint: `node -e "${script}"`,
        typecheck: `node -e "${script}"`,
        build: `node -e "${script}"`,
      },
    }),
  );
  fs.writeFileSync(path.join(dir, "README.md"), "Demo claims\n");
  fs.writeFileSync(path.join(dir, ".env.example"), "CLAIMS_API=\n");
  const git = (args: string[]) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", ...args], { cwd: dir });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["add", "package.json", "README.md", ".env.example", "src"]);
  git(["commit", "-m", "init"]);
  return dir;
}

async function readyProduct(options?: {
  stage?: "DEFINE" | "BUILD";
  taskStatus?: "PROPOSED" | "APPROVED";
  mode?: "AUTONOMOUS" | "SUPERVISED" | "HUMAN_ONLY";
  risk?: "LOW" | "MEDIUM" | "HIGH";
  maxFiles?: number;
  allowed?: string[];
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
  products.push(product.id);
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
      restrictedPaths: ["prisma/**"],
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

function useRepo(pass = true) {
  const repo = makeRepo(pass);
  process.env.PRODUCT_REPOSITORY_ROOT = repo;
  process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = worktreeRoot;
  return repo;
}

afterEach(async () => {
  setAIProviderForTests(null);
  process.env.OPENAI_API_KEY = originalKey;
  if (originalRoot === undefined) delete process.env.PRODUCT_REPOSITORY_ROOT;
  else process.env.PRODUCT_REPOSITORY_ROOT = originalRoot;
  if (originalWorktrees === undefined) delete process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT;
  else process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = originalWorktrees;
  while (products.length > 0) {
    const id = products.pop();
    if (id) await db.product.delete({ where: { id } }).catch(() => undefined);
  }
  while (repos.length > 0) {
    const repo = repos.pop();
    if (!repo) continue;
    try {
      execFileSync("git", ["-c", "maintenance.auto=false", "worktree", "prune"], {
        cwd: repo,
        timeout: 2000,
      });
    } catch {
      // The temporary repository may already be gone.
    }
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
    fs.mkdirSync(worktreeRoot, { recursive: true });
  }
});

describe("coding entry", () => {
  it("does not run outside BUILD and does not create an agent run", async () => {
    useRepo();
    const setup = await readyProduct({ stage: "DEFINE" });
    setAIProviderForTests(provider(writeChange));
    await expect(startCodingTask(setup.product.id, setup.task.id)).rejects.toThrow(/BUILD/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
    expect(await db.repositoryWorkspace.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("requires an approved task", async () => {
    useRepo();
    const setup = await readyProduct({ taskStatus: "PROPOSED" });
    setAIProviderForTests(provider(writeChange));
    await expect(startCodingTask(setup.product.id, setup.task.id)).rejects.toThrow(/PROPOSED/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("refuses a HUMAN_ONLY task", async () => {
    useRepo();
    const setup = await readyProduct({ mode: "HUMAN_ONLY", risk: "HIGH" });
    setAIProviderForTests(provider(writeChange));
    await expect(startCodingTask(setup.product.id, setup.task.id)).rejects.toThrow(/HUMAN_ONLY/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("refuses a task blocked by an unresolved dependency", async () => {
    useRepo();
    const setup = await readyProduct({ blocked: true });
    setAIProviderForTests(provider(writeChange));
    await expect(startCodingTask(setup.product.id, setup.task.id)).rejects.toThrow(/unresolved dependency/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("refuses a second workspace for the same product", async () => {
    useRepo();
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM" });
    setAIProviderForTests(provider(writeChange));
    await startCodingTask(setup.product.id, setup.task.id);
    await expect(startCodingTask(setup.product.id, setup.task.id)).rejects.toThrow(/already open/);
    expect(await db.repositoryWorkspace.count({ where: { productId: setup.product.id } })).toBe(1);
  });

  it("reports a missing repository before creating a run", async () => {
    delete process.env.PRODUCT_REPOSITORY_ROOT;
    const setup = await readyProduct();
    setAIProviderForTests(provider(writeChange));
    await expect(startCodingTask(setup.product.id, setup.task.id)).rejects.toThrow(/does not have a repository yet/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("starts coding in the product repository rather than the legacy environment repository", async () => {
    const productRepo = makeRepo();
    const legacy = makeRepo();
    fs.writeFileSync(path.join(productRepo, "PRODUCT.txt"), "product\n");
    execFileSync("git", ["-c", "commit.gpgsign=false", "add", "PRODUCT.txt"], { cwd: productRepo });
    execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "product marker"], { cwd: productRepo });
    process.env.PRODUCT_REPOSITORY_ROOT = legacy;
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM" });
    await db.repository.create({
      data: {
        productId: setup.product.id,
        name: "product",
        localPath: productRepo,
        defaultBranch: "main",
        status: "CONFIGURED",
      },
    });
    setAIProviderForTests(provider(writeChange));
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    expect(fs.existsSync(path.join(workspace!.workspacePath, "PRODUCT.txt"))).toBe(true);
    expect(fs.existsSync(path.join(legacy, "PRODUCT.txt"))).toBe(false);
  });

  it("reports missing AI configuration before creating a run", async () => {
    useRepo();
    const setup = await readyProduct();
    setAIProviderForTests(null);
    delete process.env.OPENAI_API_KEY;
    await expect(startCodingTask(setup.product.id, setup.task.id)).rejects.toThrow(/AI is not configured/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });
});

describe("coding execution", () => {
  it("bases a new workspace on the integration branch tip when HEAD is elsewhere", async () => {
    const repo = useRepo();
    const main = execFileSync("git", ["rev-parse", "main"], { cwd: repo, encoding: "utf8" }).trim();
    execFileSync("git", ["-c", "commit.gpgsign=false", "checkout", "-b", "ai-factory/task-stale", main], { cwd: repo });
    expect(execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()).toBe(
      "ai-factory/task-stale",
    );
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM" });
    setAIProviderForTests(provider(writeChange));
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    expect(workspace?.baseCommit).toBe(main);
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace!.workspacePath, encoding: "utf8" }).trim()).toBe(main);
    expect(execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()).toBe(
      "ai-factory/task-stale",
    );
  });

  it("creates an isolated worktree and a contract from approved artifacts", async () => {
    const repo = useRepo();
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM" });
    setAIProviderForTests(provider(writeChange));
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    expect(workspace?.baseCommit).toBe(base);
    expect(workspace?.branchName.startsWith(`ai-factory/task-${setup.task.id}-`)).toBe(true);
    expect(workspace?.workspacePath).not.toBe(repo);
    expect(workspace?.status).toBe("ACTIVE");
    expect(workspace?.plan?.status).toBe("PROPOSED");
    expect(workspace?.contract?.objective).toBe("Accept a notice and return a reference.");
    expect(workspace?.contract?.acceptanceCriteria).toEqual(["A valid notice returns a reference."]);
    expect(workspace?.contract?.allowedPaths).toEqual(["src/claims/**"]);
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" })).toBe("");
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()).toBe(base);
    const helper = fs.readFileSync(path.join(workspace!.workspacePath, "src/claims/submit.ts"), "utf8");
    expect(helper).toContain("notice");
    await updateArchitectureSummary({
      productId: setup.product.id,
      summary: "A second service now receives the notice.",
      rationale: "Changed after coding started.",
      architectureStyle: "Distributed",
    });
    const contract = await db.codingExecutionContract.findUnique({ where: { workspaceId: workspace!.id } });
    expect(contract?.stale).toBe(true);
    expect(contract?.staleReason).toMatch(/EXECUTION CONTRACT STALE/);
    await expect(approveExecutionPlan(setup.product.id, workspace!.id)).rejects.toThrow(/EXECUTION CONTRACT STALE/);
  });

  it("requires a new approval after execution plan changes", async () => {
    useRepo();
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM" });
    setAIProviderForTests(provider(writeChange));
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    expect(workspace?.plan?.status).toBe("PROPOSED");
    expect(workspace?.plan?.version).toBe(1);
    expect(workspace?.plan?.approvedBy).toBe("");
    await expect(requestExecutionPlanChanges(setup.product.id, workspace!.id, "short")).rejects.toThrow(/12 characters/);
    await requestExecutionPlanChanges(
      setup.product.id,
      workspace!.id,
      "Add explicit tests for the claim reference before coding.",
    );
    await expect(resumeCodingTask(setup.product.id, workspace!.id)).rejects.toThrow(/approval is required/);
    const revised = await reviseExecutionPlan(setup.product.id, workspace!.id);
    expect(revised?.plan?.status).toBe("PROPOSED");
    expect(revised?.plan?.version).toBe(2);
    expect(revised?.plan?.approvedBy).toBe("");
    expect(Array.isArray(revised?.plan?.history) ? revised?.plan?.history.length : 0).toBe(1);
    const approved = await approveExecutionPlan(setup.product.id, workspace!.id);
    expect(approved?.plan?.status).toBe("APPROVED");
    expect(approved?.plan?.version).toBe(2);
    const reread = await db.codingExecutionPlan.findUnique({ where: { workspaceId: workspace!.id } });
    expect(reread?.status).toBe("APPROVED");
    expect(reread?.approvedBy).toBe("Local user");
    expect(fs.readFileSync(path.join(workspace!.workspacePath, "src/claims/submit.ts"), "utf8")).toContain("notice");
  });

  it("refuses a file that is outside the approved execution plan", async () => {
    useRepo();
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM" });
    setAIProviderForTests(provider({
      ...writeChange,
      operations: [{ action: "CREATE_FILE", path: "src/claims/extra.ts", content: "export const extra = 1\n" }],
    }));
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    await approveExecutionPlan(setup.product.id, workspace!.id);
    const after = await resumeCodingTask(setup.product.id, workspace!.id);
    expect(fs.existsSync(path.join(workspace!.workspacePath, "src/claims/extra.ts"))).toBe(false);
    expect(after?.escalations.some((item) => item.type === "SCOPE_EXPANSION" && item.status === "OPEN")).toBe(true);
    expect(after?.plan?.version).toBe(1);
    expect(after?.plan?.status).not.toBe("APPROVED");
  });

  it("continues a low-risk autonomous plan and records the real check exit code", async () => {
    const repo = useRepo();
    const setup = await readyProduct();
    setAIProviderForTests(provider(writeChange));
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    expect(workspace?.status).toBe("READY_FOR_REVIEW");
    expect(workspace?.plan?.status).toBe("COMPLETED");
    const task = await db.implementationTask.findUnique({ where: { id: setup.task.id } });
    expect(task?.status).toBe("CODE_REVIEW");
    const evidence = workspace?.evidence.find((item) => item.type === "TEST_RESULT");
    expect(evidence?.source).toBe("COMMAND_RUNNER");
    expect(evidence?.exitCode).toBe(0);
    expect(evidence?.result).toBe("PASS");
    expect(workspace?.selfReview).toBeTruthy();
    expect(fs.readFileSync(path.join(repo, "src/claims/submit.ts"), "utf8")).toContain("notice");
    expect(fs.readFileSync(path.join(workspace!.workspacePath, "src/claims/submit.ts"), "utf8")).toContain("reference");
  });

  it("does not complete when the required check exits non-zero", async () => {
    useRepo(false);
    const setup = await readyProduct();
    setAIProviderForTests(provider(writeChange));
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    expect(workspace?.status).toBe("FAILED");
    const task = await db.implementationTask.findUnique({ where: { id: setup.task.id } });
    expect(task?.status).not.toBe("COMPLETED");
    const evidence = workspace?.evidence.find((item) => item.type === "TEST_RESULT");
    expect(evidence?.exitCode).toBe(1);
    expect(evidence?.result).toBe("FAIL");
    expect(typeof evidence?.output).toBe("string");
    expect(workspace?.plan?.status).toBe("APPROVED");
    expect(workspace?.plan?.version).toBe(1);
    const view = await getCodingView(setup.product.id);
    expect(view?.tasks.find((task) => task.id === setup.task.id)?.workspace?.repairOffer).toBe(true);
    await expect(resumeCodingTask(setup.product.id, workspace!.id)).rejects.toThrow(/Repair it inside the approved execution plan/);
    expect(fs.existsSync(workspace!.workspacePath)).toBe(true);
  });

  it("stops before setup when a required Prisma schema has no model", async () => {
    useRepo();
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM", allowed: ["prisma/**", "src/**"] });
    await db.codingPolicy.updateMany({
      where: { productId: setup.product.id },
      data: { restrictedPaths: [".env"], allowedPaths: ["prisma/**", "src/**"] },
    });
    await db.solutionArchitecture.update({
      where: { id: setup.architecture.id },
      data: { dataApproach: "PostgreSQL models for users and profiles." },
    });
    await db.dataEntity.create({
      data: {
        solutionArchitectureId: setup.architecture.id,
        name: "User and Profile Data",
        description: "Core identity and profile details.",
      },
    });
    setAIProviderForTests(provider({
      summary: "Write the datasource.",
      operations: [{
        action: "CREATE_FILE",
        path: "prisma/schema.prisma",
        content: "generator client {\n  provider = \"prisma-client-js\"\n}\n\ndatasource db {\n  provider = \"postgresql\"\n  url = env(\"DATABASE_URL\")\n}\n",
      }],
      commands: [],
      escalation: null,
      completionProposal: "COMPLETED",
    }, {
      summary: "Initialize the database schema.",
      filesExpectedToChange: ["prisma/schema.prisma"],
      steps: ["Create prisma/schema.prisma defining the PostgreSQL datasource and initial schema models."],
      risks: "None.",
      validationPlan: "npx prisma validate",
    }));
    const proposed = await startCodingTask(setup.product.id, setup.task.id);
    await approveExecutionPlan(setup.product.id, proposed!.id);
    const failed = await resumeCodingTask(setup.product.id, proposed!.id);
    expect(failed?.status).toBe("FAILED");
    expect(failed?.plan?.status).toBe("APPROVED");
    expect(failed?.evidence.some((item) => item.command === "npx prisma generate" && item.result === "FAIL")).toBe(false);
    expect(failed?.evidence.some((item) => item.command === "npx prisma generate" && item.result === "NOT RUN")).toBe(true);
    expect(failed?.evidence.some((item) => item.result === "FAIL" && item.description.includes("no Prisma model"))).toBe(true);
    expect(JSON.stringify(failed?.evidence)).not.toMatch(/model Example/);
    const view = await getCodingView(setup.product.id);
    const workspace = view?.tasks.find((task) => task.id === setup.task.id)?.workspace;
    expect(workspace?.implementationIncomplete).toBe(true);
    expect(workspace?.repairOffer).toBe(true);
  });

  it("repairs a validation failure inside the approved files and keeps the original evidence", async () => {
    const repo = useRepo(false);
    fs.writeFileSync(
      path.join(repo, "package.json"),
      JSON.stringify({
        name: "demo-claims",
        scripts: {
          test: "node -e \"const fs=require('fs'); const text=fs.readFileSync('src/claims/submit.ts','utf8'); if(!text.includes('repaired')){console.error('validation failed: claim is not repaired'); process.exit(1)}\"",
        },
      }),
    );
    execFileSync("git", ["-c", "commit.gpgsign=false", "add", "package.json"], { cwd: repo });
    execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "failing check"], { cwd: repo });
    const setup = await readyProduct();
    setAIProviderForTests(provider(writeChange));
    const failed = await startCodingTask(setup.product.id, setup.task.id);
    const original = failed?.evidence.find((item) => item.command === "npm test" && item.result === "FAIL");
    expect(original?.output).toContain("validation failed: claim is not repaired");
    expect(failed?.plan?.status).toBe("APPROVED");
    setAIProviderForTests({
      async generate(request) {
        if (request.schemaName === "coding_repair") {
          return {
            data: {
              summary: "Mark the claim repaired.",
              operations: [{ action: "WRITE_FILE", path: "src/claims/submit.ts", content: "export const claim = \"repaired\"\n" }],
              escalation: null,
            } as never,
            usage: { inputTokens: 1, outputTokens: 1 },
            model: "mock",
          };
        }
        return provider(writeChange).generate(request);
      },
    });
    const repaired = await repairCodingTask(setup.product.id, failed!.id);
    expect(fs.readFileSync(path.join(repaired!.workspacePath, "src/claims/submit.ts"), "utf8")).toContain("repaired");
    const checks = repaired?.evidence.filter((item) => item.command === "npm test") ?? [];
    expect(checks.some((item) => item.id === original?.id && item.result === "FAIL")).toBe(true);
    expect(checks.some((item) => item.result === "PASS" && item.exitCode === 0)).toBe(true);
    expect(repaired?.plan?.version).toBe(1);
    expect(await db.codingExecutionPlan.count({ where: { workspaceId: failed!.id } })).toBe(1);
  });

  it("stops after two repair attempts and does not write outside the approved plan", async () => {
    useRepo(false);
    const setup = await readyProduct();
    setAIProviderForTests(provider(writeChange));
    const failed = await startCodingTask(setup.product.id, setup.task.id);
    let repairs = 0;
    setAIProviderForTests({
      async generate(request) {
        if (request.schemaName !== "coding_repair") return provider(writeChange).generate(request);
        repairs += 1;
        return {
          data: {
            summary: "The fix needs a file outside the plan.",
            operations: [{ action: "CREATE_FILE", path: "src/outside.ts", content: "export const outside = 1\n" }],
            escalation: null,
          } as never,
          usage: { inputTokens: 1, outputTokens: 1 },
          model: "mock",
        };
      },
    });
    const stopped = await repairCodingTask(setup.product.id, failed!.id);
    expect(repairs).toBe(2);
    expect(fs.existsSync(path.join(stopped!.workspacePath, "src/outside.ts"))).toBe(false);
    expect(stopped?.escalations.some((item) => item.type === "SCOPE_EXPANSION")).toBe(true);
    expect(stopped?.plan?.version).toBe(1);
    expect(stopped?.plan?.status).toBe("APPROVED");
    const original = failed?.evidence.find((item) => item.result === "FAIL");
    expect(stopped?.evidence.some((item) => item.id === original?.id && item.result === "FAIL")).toBe(true);
    await expect(repairCodingTask(setup.product.id, failed!.id)).rejects.toThrow(/bounded attempts/);
    expect(repairs).toBe(2);
  });

  it("escalates scope expansion without editing files", async () => {
    const repo = useRepo();
    const setup = await readyProduct();
    setAIProviderForTests(
      provider(writeChange, {
        ...plan,
        filesExpectedToChange: ["prisma/hack.ts"],
      }),
    );
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    expect(workspace?.escalations.some((item) => item.type === "SCOPE_EXPANSION")).toBe(true);
    expect(workspace?.plan?.status).toBe("ESCALATED");
    expect(fs.readFileSync(path.join(repo, "src/claims/submit.ts"), "utf8")).toContain("notice");
    expect(await db.agentRun.count({ where: { productId: setup.product.id, status: "COMPLETED" } })).toBe(1);
  });

  it("escalates an architecture conflict without writing", async () => {
    useRepo();
    const setup = await readyProduct();
    setAIProviderForTests(
      provider({
        ...writeChange,
        operations: [],
        escalation: {
          type: "ARCHITECTURE_CONFLICT",
          description: "The approved API boundary does not match the file.",
          reason: "The task would move the notice into a new service.",
          recommendedAction: "Return the task to architecture review.",
        },
      }),
    );
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    expect(workspace?.escalations.some((item) => item.type === "ARCHITECTURE_CONFLICT")).toBe(true);
    expect(workspace?.status).not.toBe("COMPLETED");
    expect(fs.readFileSync(path.join(workspace!.workspacePath, "src/claims/submit.ts"), "utf8")).toContain("notice");
  });

  it("enforces the file limit", async () => {
    useRepo();
    const setup = await readyProduct({ maxFiles: 1 });
    setAIProviderForTests(
      provider({
        ...writeChange,
        operations: [
          { action: "CREATE_FILE", path: "src/claims/extra.ts", content: "export const extra = 1\n" },
          { action: "CREATE_FILE", path: "src/claims/another.ts", content: "export const another = 1\n" },
        ],
      }, {
        ...plan,
        filesExpectedToChange: [],
      }),
    );
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    expect(workspace?.escalations.some((item) => item.type === "SCOPE_EXPANSION")).toBe(true);
    expect(fs.existsSync(path.join(workspace!.workspacePath, "src/claims/extra.ts"))).toBe(true);
    expect(fs.existsSync(path.join(workspace!.workspacePath, "src/claims/another.ts"))).toBe(false);
    const task = await db.implementationTask.findUnique({ where: { id: setup.task.id } });
    expect(task?.status).not.toBe("COMPLETED");
  });

  it("escalates test deletion", async () => {
    useRepo();
    const setup = await readyProduct({ maxFiles: 1 });
    setAIProviderForTests(
      provider({
        ...writeChange,
        operations: [
          { action: "DELETE_FILE", path: "src/claims/submit.test.ts", content: "" },
          { action: "CREATE_FILE", path: "src/claims/extra.ts", content: "export const extra = 1\n" },
          { action: "CREATE_FILE", path: "src/claims/another.ts", content: "export const another = 1\n" },
        ],
      }),
    );
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    expect(workspace?.escalations.some((item) => item.type === "TEST_FAILURE")).toBe(true);
    expect(fs.existsSync(path.join(workspace!.workspacePath, "src/claims/submit.test.ts"))).toBe(true);
    expect(workspace?.status).not.toBe("COMPLETED");
  });

  it("enforces path, secret, command, and main-tree boundaries", async () => {
    const repo = useRepo();
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM" });
    setAIProviderForTests(provider(writeChange));
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    const productId = setup.product.id;
    const workspaceId = workspace!.id;
    const traversal = await applyCodingTool(productId, workspaceId, { action: "READ_FILE", path: "../../etc/passwd" });
    expect(traversal.allowed).toBe(false);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "apf-out-"));
    fs.writeFileSync(path.join(outside, "note.txt"), "outside");
    fs.symlinkSync(outside, path.join(workspace!.workspacePath, "escape"));
    const link = await applyCodingTool(productId, workspaceId, { action: "READ_FILE", path: "escape/note.txt" });
    expect(link.allowed).toBe(false);
    fs.writeFileSync(path.join(workspace!.workspacePath, ".env"), "CLAIMS_API=super-secret-token\n");
    const secret = await applyCodingTool(productId, workspaceId, { action: "READ_FILE", path: ".env" });
    expect(secret.allowed).toBe(false);
    const example = await applyCodingTool(productId, workspaceId, { action: "READ_FILE", path: ".env.example" });
    expect(example.allowed).toBe(true);
    const restricted = await applyCodingTool(productId, workspaceId, {
      action: "WRITE_FILE",
      path: "prisma/schema.prisma",
      content: "model Hack {}",
    });
    expect(restricted.allowed).toBe(false);
    const security = await applyCodingTool(productId, workspaceId, {
      action: "WRITE_FILE",
      path: "eslint.config.js",
      content: "export default []\n",
    });
    expect(security.allowed).toBe(false);
    const command = await applyCodingTool(productId, workspaceId, { action: "RUN_COMMAND", command: "npm run deploy" });
    expect(command.allowed).toBe(false);
    const injected = await applyCodingTool(productId, workspaceId, {
      action: "RUN_COMMAND",
      command: "npm test; rm -rf /",
    });
    expect(injected.allowed).toBe(false);
    const skipped = await applyCodingTool(productId, workspaceId, {
      action: "WRITE_FILE",
      path: "src/claims/submit.test.ts",
      content: "test.skip(\"notice\", () => { expect(1).toBe(1) })\n",
    });
    expect(skipped.allowed).toBe(false);
    const allowed = await applyCodingTool(productId, workspaceId, {
      action: "WRITE_FILE",
      path: "src/claims/submit.ts",
      content: "export const claim = \"allowed\"\n",
    });
    expect(allowed.allowed).toBe(true);
    expect(fs.readFileSync(path.join(repo, "src/claims/submit.ts"), "utf8")).toContain("notice");
    const events = await db.codingToolEvent.findMany({ where: { workspaceId } });
    const activity = await db.activity.findMany({ where: { productId } });
    const serialized = JSON.stringify({ events, activity });
    expect(serialized).not.toContain("super-secret-token");
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it("keeps requested changes inside the contract and requires a human code approval", async () => {
    const repo = useRepo();
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const setup = await readyProduct();
    let revision = 0;
    setAIProviderForTests({
      async generate(request) {
        if (request.schemaName === "coding_change_request") {
          revision += 1;
          return {
            data: {
              ...writeChange,
              operations: [
                {
                  action: "WRITE_FILE",
                  path: "src/claims/submit.ts",
                  content: revision === 1 ? "export const claim = \"reference\"\n" : "export const claim = \"revised\"\n",
                },
              ],
            } as never,
            usage: { inputTokens: 1, outputTokens: 1 },
            model: "mock",
          };
        }
        const data = {
          coding_repository_analysis: analysis,
          coding_execution_plan: plan,
          coding_self_review: review,
          coding_completion: completion,
        }[request.schemaName];
        if (!data) throw new Error(request.schemaName);
        return { data: data as never, usage: { inputTokens: 1, outputTokens: 1 }, model: "mock" };
      },
    });
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    await expect(createCodingCommit(setup.product.id, workspace!.id)).rejects.toThrow(/approved by a person/);
    await expect(
      approveCodeChanges(setup.product.id, workspace!.id, { actorName: "Coding Agent" }),
    ).rejects.toThrow(/cannot approve/);
    await approveCodeChanges(setup.product.id, workspace!.id, { actorName: "Local user" });
    const bounded = await requestCodingChanges({
      productId: setup.product.id,
      workspaceId: workspace!.id,
      feedback: "Also edit the database.",
      requiredChanges: "Change prisma as well.",
      affectedFiles: ["prisma/hack.ts"],
      actorName: "Local user",
    });
    expect(bounded?.escalations.some((item) => item.type === "SCOPE_EXPANSION")).toBe(true);
    expect(fs.readFileSync(path.join(workspace!.workspacePath, "src/claims/submit.ts"), "utf8")).toContain("reference");
    expect(bounded?.contract?.id).toBe(workspace?.contract?.id);
    await db.codingEscalation.updateMany({
      where: { workspaceId: workspace!.id, status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    await requestCodingChanges({
      productId: setup.product.id,
      workspaceId: workspace!.id,
      feedback: "Use the revised reference.",
      requiredChanges: "Update the helper text.",
      affectedFiles: ["src/claims/submit.ts"],
      actorName: "Local user",
    });
    const staleApproval = await db.codeChangeApproval.findFirst({
      where: { workspaceId: workspace!.id },
      orderBy: { createdAt: "asc" },
    });
    expect(staleApproval?.stale).toBe(true);
    await expect(createCodingCommit(setup.product.id, workspace!.id)).rejects.toThrow(/approved by a person/);
    await approveCodeChanges(setup.product.id, workspace!.id, { actorName: "Local user" });
    const committed = await createCodingCommit(setup.product.id, workspace!.id);
    expect(committed.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(committed.workspace?.headCommit).toBe(committed.sha);
    expect(committed.workspace?.status).toBe("COMPLETED");
    const task = await db.implementationTask.findUnique({ where: { id: setup.task.id } });
    expect(task?.status).toBe("COMPLETED");
    expect(execFileSync("git", ["rev-parse", "main"], { cwd: repo, encoding: "utf8" }).trim()).toBe(base);
    expect((await runGit(repo, ["push"])).stderr).toMatch(/not permitted/);
    expect((await runGit(workspace!.workspacePath, ["merge", "main"])).code).toBe(1);
  }, 20000);

  it("preserves a failed run, its workspace, and its evidence", async () => {
    useRepo();
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM" });
    setAIProviderForTests({
      async generate(request) {
        if (request.schemaName === "coding_change_request") throw new Error("model unavailable");
        const data = {
          coding_repository_analysis: analysis,
          coding_execution_plan: plan,
        }[request.schemaName];
        if (!data) throw new Error(request.schemaName);
        return { data: data as never, usage: { inputTokens: 1, outputTokens: 1 }, model: "mock" };
      },
    });
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    const approved = await approveExecutionPlan(setup.product.id, workspace!.id);
    expect(approved?.plan?.status).toBe("APPROVED");
    expect(approved?.plan?.approvedBy).toBe("Local user");
    expect(fs.readFileSync(path.join(workspace!.workspacePath, "src/claims/submit.ts"), "utf8")).toContain("notice");
    await expect(resumeCodingTask(setup.product.id, workspace!.id)).rejects.toThrow(/model unavailable/);
    const saved = await db.repositoryWorkspace.findUnique({ where: { id: workspace!.id } });
    expect(saved?.status).toBe("FAILED");
    expect(fs.existsSync(saved!.workspacePath)).toBe(true);
    expect(await db.codingExecutionPlan.count({ where: { workspaceId: workspace!.id } })).toBe(1);
    expect(await db.agentRun.count({ where: { productId: setup.product.id, status: "FAILED" } })).toBe(1);
    expect(await db.codingToolEvent.count({ where: { workspaceId: workspace!.id } })).toBeGreaterThan(0);
  });

  it("keeps an approved plan approved when provider generation fails before any file write", async () => {
    useRepo();
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM" });
    setAIProviderForTests({
      async generate(request) {
        if (request.schemaName === "coding_change_request") {
          throw new AIFailure(
            "The configured model is temporarily unavailable because of high demand. Nothing was generated. You can retry.",
            "PROVIDER_UNAVAILABLE",
          );
        }
        const data = {
          coding_repository_analysis: analysis,
          coding_execution_plan: plan,
        }[request.schemaName];
        if (!data) throw new Error(request.schemaName);
        return { data: data as never, usage: { inputTokens: 1, outputTokens: 1 }, model: "mock" };
      },
    });
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    const approved = await approveExecutionPlan(setup.product.id, workspace!.id);
    const approvedAt = approved?.plan?.approvedAt?.toISOString();
    await expect(resumeCodingTask(setup.product.id, workspace!.id)).rejects.toThrow(/high demand/);
    const planRow = await db.codingExecutionPlan.findUnique({ where: { workspaceId: workspace!.id } });
    expect(planRow?.status).toBe("APPROVED");
    expect(planRow?.approvedAt?.toISOString()).toBe(approvedAt);
    expect(planRow?.version).toBe(1);
    const run = await db.agentRun.findFirst({
      where: { productId: setup.product.id, status: "FAILED" },
      orderBy: { createdAt: "desc" },
    });
    const output = run?.output as { errorCategory?: string };
    expect(output.errorCategory).toBe("PROVIDER_UNAVAILABLE");
    expect(await db.codingToolEvent.count({
      where: {
        workspaceId: workspace!.id,
        action: { in: ["CREATE_FILE", "WRITE_FILE", "DELETE_FILE"] },
        allowed: true,
      },
    })).toBe(0);
    expect(fs.readFileSync(path.join(workspace!.workspacePath, "src/claims/submit.ts"), "utf8")).toContain("notice");
    const view = await getCodingView(setup.product.id);
    expect(view?.tasks.find((task) => task.id === setup.task.id)?.workspace?.retryOffer).toBe(true);
  });

  it("retries the same approved plan and contract after a provider failure that already wrote files", async () => {
    useRepo();
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM" });
    let plans = 0;
    let failCompletion = true;
    setAIProviderForTests({
      async generate(request) {
        if (request.schemaName === "coding_execution_plan") {
          plans += 1;
          return {
            data: (plans === 1 ? plan : { ...plan, summary: "Update the claim helper again." }) as never,
            usage: { inputTokens: 1, outputTokens: 1 },
            model: "mock",
          };
        }
        if (request.schemaName === "coding_change_request") {
          return { data: writeChange as never, usage: { inputTokens: 1, outputTokens: 1 }, model: "mock" };
        }
        if (request.schemaName === "coding_completion" && failCompletion) {
          throw new AIFailure(
            "The configured model is temporarily unavailable because of high demand. Nothing was generated. You can retry.",
            "PROVIDER_UNAVAILABLE",
          );
        }
        const data = {
          coding_repository_analysis: analysis,
          coding_self_review: review,
          coding_completion: completion,
        }[request.schemaName];
        if (!data) throw new Error(request.schemaName);
        return { data: data as never, usage: { inputTokens: 1, outputTokens: 1 }, model: "mock" };
      },
    });
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    await requestExecutionPlanChanges(setup.product.id, workspace!.id, "Name the helper update before coding.");
    await reviseExecutionPlan(setup.product.id, workspace!.id);
    const approved = await approveExecutionPlan(setup.product.id, workspace!.id);
    expect(approved?.plan?.version).toBe(2);
    expect(approved?.plan?.status).toBe("APPROVED");
    const before = await db.codingExecutionPlan.findUnique({ where: { workspaceId: workspace!.id } });
    await expect(resumeCodingTask(setup.product.id, workspace!.id)).rejects.toThrow(/high demand/);
    const afterFailure = await db.codingExecutionPlan.findUnique({ where: { workspaceId: workspace!.id } });
    expect(afterFailure?.status).toBe("APPROVED");
    expect(afterFailure?.version).toBe(2);
    expect(afterFailure?.approvedBy).toBe("Local user");
    expect(afterFailure?.approvedAt?.toISOString()).toBe(before?.approvedAt?.toISOString());
    expect(afterFailure?.setupCommands).toEqual(before?.setupCommands);
    expect(afterFailure?.validationCommands).toEqual(before?.validationCommands);
    expect(afterFailure?.history).toEqual(before?.history);
    expect(await db.codingExecutionPlan.count({ where: { workspaceId: workspace!.id } })).toBe(1);
    const writes = await db.codingToolEvent.count({
      where: {
        workspaceId: workspace!.id,
        action: { in: ["CREATE_FILE", "WRITE_FILE", "DELETE_FILE"] },
        allowed: true,
      },
    });
    expect(writes).toBeGreaterThan(0);
    const failedRuns = (await db.agentRun.findMany({
      where: { productId: setup.product.id, agentType: "CODING" },
      orderBy: { createdAt: "asc" },
    })).filter((run) => (run.input as { phase?: string }).phase === "implement");
    expect(failedRuns).toHaveLength(1);
    expect(failedRuns[0]?.status).toBe("FAILED");
    expect((failedRuns[0]?.input as { planVersion?: number }).planVersion).toBe(2);
    expect((failedRuns[0]?.output as { errorCategory?: string }).errorCategory).toBe("PROVIDER_UNAVAILABLE");
    const failedOutput = JSON.stringify(failedRuns[0]?.output);
    const view = await getCodingView(setup.product.id);
    expect(view?.tasks.find((task) => task.id === setup.task.id)?.workspace?.retryOffer).toBe(true);
    failCompletion = false;
    const retried = await retryCodingTask(setup.product.id, workspace!.id);
    expect(retried?.plan?.version).toBe(2);
    const implementRuns = (await db.agentRun.findMany({
      where: { productId: setup.product.id, agentType: "CODING" },
      orderBy: { createdAt: "asc" },
    })).filter((run) => (run.input as { phase?: string }).phase === "implement");
    expect(implementRuns).toHaveLength(2);
    expect(implementRuns[0]?.id).toBe(failedRuns[0]?.id);
    expect(JSON.stringify(implementRuns[0]?.output)).toBe(failedOutput);
    expect(implementRuns[0]?.status).toBe("FAILED");
    expect((implementRuns[1]?.input as { planVersion?: number }).planVersion).toBe(2);
    expect(executionContractsMatch(
      (implementRuns[0]?.input as { executionContract?: unknown }).executionContract,
      (implementRuns[1]?.input as { executionContract: CompiledExecutionContract }).executionContract,
    )).toBe(true);
    expect(await db.codingExecutionPlan.findUnique({ where: { workspaceId: workspace!.id } })).toMatchObject({
      version: 2,
      status: "COMPLETED",
    });
  }, 30000);

  it("refuses retry when the current contract or approval no longer matches the failed run", async () => {
    useRepo();
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM" });
    setAIProviderForTests({
      async generate(request) {
        if (request.schemaName === "coding_change_request") {
          throw new AIFailure("The AI provider did not respond in time. Nothing was generated. You can retry.", "TIMEOUT");
        }
        const data = {
          coding_repository_analysis: analysis,
          coding_execution_plan: plan,
        }[request.schemaName];
        if (!data) throw new Error(request.schemaName);
        return { data: data as never, usage: { inputTokens: 1, outputTokens: 1 }, model: "mock" };
      },
    });
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    await approveExecutionPlan(setup.product.id, workspace!.id);
    await expect(resumeCodingTask(setup.product.id, workspace!.id)).rejects.toThrow(/did not respond in time/);
    const planRow = await db.codingExecutionPlan.findUnique({ where: { workspaceId: workspace!.id } });
    await db.codingExecutionPlan.update({
      where: { workspaceId: workspace!.id },
      data: { filesExpectedToChange: ["src/claims/submit.ts", "src/claims/extra.ts"] },
    });
    await expect(retryCodingTask(setup.product.id, workspace!.id)).rejects.toThrow(/different contract/);
    await db.codingExecutionPlan.update({
      where: { workspaceId: workspace!.id },
      data: { status: "PROPOSED", approvedAt: null, approvedBy: "", filesExpectedToChange: planRow?.filesExpectedToChange ?? [] },
    });
    await expect(retryCodingTask(setup.product.id, workspace!.id)).rejects.toThrow(/approval is required/);
    const implementRuns = (await db.agentRun.findMany({ where: { productId: setup.product.id, agentType: "CODING" } }))
      .filter((run) => (run.input as { phase?: string }).phase === "implement");
    expect(implementRuns).toHaveLength(1);
    expect(implementRuns[0]?.status).toBe("FAILED");
    expect(await db.codingExecutionPlan.count({ where: { workspaceId: workspace!.id } })).toBe(1);
  });

  it("does not offer retry for a non-provider coding failure", async () => {
    useRepo();
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM" });
    setAIProviderForTests({
      async generate(request) {
        if (request.schemaName === "coding_change_request") throw new DomainError("That command is outside the approved execution contract.");
        const data = {
          coding_repository_analysis: analysis,
          coding_execution_plan: plan,
        }[request.schemaName];
        if (!data) throw new Error(request.schemaName);
        return { data: data as never, usage: { inputTokens: 1, outputTokens: 1 }, model: "mock" };
      },
    });
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    await approveExecutionPlan(setup.product.id, workspace!.id);
    await expect(resumeCodingTask(setup.product.id, workspace!.id)).rejects.toThrow(/approved execution contract/);
    const view = await getCodingView(setup.product.id);
    expect(view?.tasks.find((task) => task.id === setup.task.id)?.workspace?.retryOffer).toBe(false);
    await expect(retryCodingTask(setup.product.id, workspace!.id)).rejects.toThrow(/not retried/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id, status: "FAILED" } })).toBe(1);
  });

  it("configures the coding agent from AI; repository readiness is per product", async () => {
    const repo = useRepo();
    setAIProviderForTests(provider(writeChange));
    const ready = await listAgentCatalogue();
    expect(ready.find((agent) => agent.agentType === "CODING")?.configured).toBe(true);
    delete process.env.PRODUCT_REPOSITORY_ROOT;
    const missingRepo = await listAgentCatalogue();
    expect(missingRepo.find((agent) => agent.agentType === "CODING")?.configured).toBe(true);
    process.env.PRODUCT_REPOSITORY_ROOT = repo;
    setAIProviderForTests(null);
    delete process.env.OPENAI_API_KEY;
    const missingAi = await listAgentCatalogue();
    expect(missingAi.find((agent) => agent.agentType === "CODING")?.configured).toBe(false);
    expect(repo).toBeTruthy();
  });

  it("keeps an incomplete approved plan and proposes the next version only when asked", async () => {
    useRepo();
    const setup = await readyProduct({ mode: "SUPERVISED", risk: "MEDIUM", maxFiles: 15 });
    await db.product.update({ where: { id: setup.product.id }, data: { developmentContext: "GREENFIELD" } });
    await db.solutionArchitecture.update({
      where: { id: setup.architecture.id },
      data: {
        summary: "A Next.js modular monolith.",
        frontendApproach: "Responsive Next.js React.",
        backendApproach: "Next.js Server Actions.",
      },
    });
    await db.technologyChoice.create({
      data: {
        solutionArchitectureId: setup.architecture.id,
        choice: "Next.js (App Router) with TypeScript",
        reason: "The approved design uses the App Router.",
      },
    });
    await db.implementationTask.update({
      where: { id: setup.task.id },
      data: {
        title: "Initialize Next.js project and database schema.",
        objective: "Establish foundational repository structure and database connectivity.",
        description: "Create the Next.js application and the Prisma schema.",
        guidance: "Follow standard Next.js app router structure.",
        filesLikely: "package.json, prisma/schema.prisma, src/app/layout.tsx",
        validation: "Run npm run build.",
      },
    });
    await db.codingPolicy.updateMany({
      where: { productId: setup.product.id },
      data: {
        allowedPaths: ["src/", "prisma/", "package.json", "tsconfig.json"],
        restrictedPaths: [".env", ".env.*"],
        maxFilesPerTask: 15,
      },
    });
    const nextPlan = {
      summary: "Initialize the Next.js project and Prisma schema.",
      filesExpectedToChange: ["package.json", "tsconfig.json", "prisma/schema.prisma", "src/lib/db.ts"],
      steps: ["Create the project files"],
      risks: "",
      validationPlan: "Run npx prisma validate and npm run build.",
    };
    setAIProviderForTests(provider(writeChange, nextPlan));
    const workspace = await startCodingTask(setup.product.id, setup.task.id);
    expect(workspace?.plan?.status).toBe("PROPOSED");
    expect(workspace?.plan?.approvedAt).toBeNull();
    await expect(approveExecutionPlan(setup.product.id, workspace!.id)).rejects.toThrow(/application entry point/);
    const approvedAt = new Date("2026-10-13T15:37:48.365Z");
    await db.codingExecutionPlan.update({
      where: { workspaceId: workspace!.id },
      data: { version: 2, status: "APPROVED", approvedBy: "Local user", approvedAt },
    });
    await db.repositoryWorkspace.update({
      where: { id: workspace!.id },
      data: { status: "FAILED" },
    });
    await db.codingEvidence.create({
      data: {
        workspaceId: workspace!.id,
        implementationTaskId: setup.task.id,
        type: "STATIC_ANALYSIS",
        source: "COMMAND_RUNNER",
        description: "npx prisma validate",
        result: "FAIL",
        command: "npx prisma validate",
        output: "Environment variable not found: DATABASE_URL",
        exitCode: 1,
      },
    });
    await db.codingEvidence.create({
      data: {
        workspaceId: workspace!.id,
        implementationTaskId: setup.task.id,
        type: "BUILD",
        source: "COMMAND_RUNNER",
        description: "npm run build",
        result: "FAIL",
        command: "npm run build",
        output: "Couldn't find any `pages` or `app` directory.",
        exitCode: 1,
      },
    });
    await db.agentRun.create({
      data: {
        productId: setup.product.id,
        agentType: "CODING",
        status: "COMPLETED",
        input: { phase: "implement", workspaceId: workspace!.id, planVersion: 2 },
        output: { outcome: "FAILED" },
        startedAt: approvedAt,
        completedAt: approvedAt,
      },
    });
    const blocked = await getCodingView(setup.product.id);
    const blockedWorkspace = blocked?.tasks.find((task) => task.id === setup.task.id)?.workspace;
    expect(blockedWorkspace?.planIncomplete).toBe(true);
    expect(blockedWorkspace?.repairOffer).toBe(false);
    expect(blockedWorkspace?.missingScope).toEqual(["src/app/layout.tsx", "src/app/page.tsx"]);
    expect(blockedWorkspace?.plan?.status).toBe("APPROVED");
    expect(blockedWorkspace?.plan?.version).toBe(2);
    await expect(repairCodingTask(setup.product.id, workspace!.id)).rejects.toThrow(/Revise the execution plan/);
    const before = await db.agentRun.count({
      where: { productId: setup.product.id, agentType: "CODING" },
    });
    const proposed = await proposeCoherentExecutionPlan(setup.product.id, workspace!.id);
    expect(proposed?.plan?.version).toBe(3);
    expect(proposed?.plan?.status).toBe("PROPOSED");
    expect(proposed?.plan?.approvedAt).toBeNull();
    expect(proposed?.plan?.approvedBy).toBe("");
    const files = Array.isArray(proposed?.plan?.filesExpectedToChange) ? proposed.plan.filesExpectedToChange : [];
    expect(files).toEqual(expect.arrayContaining([
      "package.json",
      "tsconfig.json",
      "prisma/schema.prisma",
      "src/lib/db.ts",
      "src/app/layout.tsx",
      "src/app/page.tsx",
    ]));
    expect(proposed?.plan?.changeRequest).toContain("ADDED SCOPE");
    expect(proposed?.plan?.changeRequest).toContain("src/app/layout.tsx");
    expect(proposed?.plan?.changeRequest).toContain("UNCHANGED");
    expect(proposed?.plan?.changeRequest).toContain("npm run build");
    const history = Array.isArray(proposed?.plan?.history) ? proposed.plan.history : [];
    const previous = history.at(-1) as { version?: number; status?: string; approvedAt?: string; filesExpectedToChange?: string[] };
    expect(previous.version).toBe(2);
    expect(previous.status).toBe("APPROVED");
    expect(previous.approvedAt).toBe(approvedAt.toISOString());
    expect(previous.filesExpectedToChange).toEqual(nextPlan.filesExpectedToChange);
    expect(proposed?.plan?.steps).toEqual(expect.arrayContaining([
      "Create src/app/layout.tsx as the root Next.js App Router layout.",
      "Create src/app/page.tsx as the initial application route.",
    ]));
    expect(await db.agentRun.count({ where: { productId: setup.product.id, agentType: "CODING" } })).toBe(before);
    await db.codingExecutionPlan.update({
      where: { workspaceId: workspace!.id },
      data: {
        steps: [
          "Create package.json.",
          "Create tsconfig.json.",
          "Create prisma/schema.prisma.",
          "Create src/lib/db.ts.",
          "Install dependencies with npm install.",
          "Generate the Prisma client with npx prisma generate.",
          "Validate the Prisma schema with npx prisma validate.",
        ],
        validationPlan: "Required checks: npm run build, prisma validate, unit tests execution",
        validationCommands: [
          { command: "npx prisma validate", kind: "VALIDATION", applicability: "REQUIRED", reason: "The plan creates a Prisma schema." },
          { command: "npm run build", kind: "VALIDATION", applicability: "REQUIRED", reason: "package.json defines a build script." },
          { command: "npm test", kind: "VALIDATION", applicability: "NOT_APPLICABLE", reason: "package.json has no test script, so unit tests are not a required check for this task." },
        ],
      },
    });
    await expect(approveExecutionPlan(setup.product.id, workspace!.id)).rejects.toThrow(/no work item creates/);
    await requestExecutionPlanChanges(
      setup.product.id,
      workspace!.id,
      "Add work items that create the Next.js entry files. Do not list unit tests as required.",
    );
    const revised = await reviseExecutionPlan(setup.product.id, workspace!.id);
    expect(revised?.status).toBe("FAILED");
    expect(revised?.plan?.version).toBe(4);
    expect(revised?.plan?.status).toBe("PROPOSED");
    expect(revised?.plan?.approvedAt).toBeNull();
    expect(revised?.plan?.steps).toEqual(expect.arrayContaining([
      "Create src/app/layout.tsx as the root Next.js App Router layout.",
      "Create src/app/page.tsx as the initial application route.",
      "Run the Next.js production build with npm run build.",
    ]));
    expect(revised?.plan?.validationPlan).toContain("npx prisma validate");
    expect(revised?.plan?.validationPlan).toContain("npm run build");
    expect(revised?.plan?.validationPlan).toMatch(/Not applicable:\nnpm test/);
    expect(revised?.plan?.validationPlan).not.toContain("unit tests execution");
    const kept = Array.isArray(revised?.plan?.history) ? revised.plan.history : [];
    const superseded = kept.at(-1) as { version?: number; status?: string };
    expect(superseded.version).toBe(3);
    expect(superseded.status).toBe("PROPOSED");
    expect(await db.agentRun.count({ where: { productId: setup.product.id, agentType: "CODING" } })).toBe(before);
    const approved = await approveExecutionPlan(setup.product.id, workspace!.id);
    expect(approved?.plan?.status).toBe("APPROVED");
    expect(approved?.plan?.version).toBe(4);
    expect(approved?.plan?.approvedBy).toBe("Local user");
    expect(await db.agentRun.count({ where: { productId: setup.product.id, agentType: "CODING" } })).toBe(before);
    const ready = await getCodingView(setup.product.id);
    const readyWorkspace = ready?.tasks.find((task) => task.id === setup.task.id)?.workspace;
    expect(readyWorkspace?.planIncomplete).toBe(false);
    expect(readyWorkspace?.repairOffer).toBe(false);
    expect(readyWorkspace?.revisedPlanReady).toBe(true);
  });
});
