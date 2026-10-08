import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { listAgentCatalogue } from "@/modules/agent/service";
import { updateArchitectureSummary } from "@/modules/architecture/service";
import { runGit } from "@/modules/coding/git";
import {
  applyCodingTool,
  approveCodeChanges,
  approveExecutionPlan,
  createCodingCommit,
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
    await expect(startCodingTask(setup.product.id, setup.task.id)).rejects.toThrow(/PRODUCT_REPOSITORY_ROOT/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
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
    expect(fs.existsSync(workspace!.workspacePath)).toBe(true);
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
    await expect(approveExecutionPlan(setup.product.id, workspace!.id)).rejects.toThrow(/model unavailable/);
    const saved = await db.repositoryWorkspace.findUnique({ where: { id: workspace!.id } });
    expect(saved?.status).toBe("FAILED");
    expect(fs.existsSync(saved!.workspacePath)).toBe(true);
    expect(await db.codingExecutionPlan.count({ where: { workspaceId: workspace!.id } })).toBe(1);
    expect(await db.agentRun.count({ where: { productId: setup.product.id, status: "FAILED" } })).toBe(1);
    expect(await db.codingToolEvent.count({ where: { workspaceId: workspace!.id } })).toBeGreaterThan(0);
  });

  it("configures the coding agent only when AI and a repository exist", async () => {
    const repo = useRepo();
    setAIProviderForTests(provider(writeChange));
    const ready = await listAgentCatalogue();
    expect(ready.find((agent) => agent.agentType === "CODING")?.configured).toBe(true);
    delete process.env.PRODUCT_REPOSITORY_ROOT;
    const missingRepo = await listAgentCatalogue();
    expect(missingRepo.find((agent) => agent.agentType === "CODING")?.configured).toBe(false);
    process.env.PRODUCT_REPOSITORY_ROOT = repo;
    setAIProviderForTests(null);
    delete process.env.OPENAI_API_KEY;
    const missingAi = await listAgentCatalogue();
    expect(missingAi.find((agent) => agent.agentType === "CODING")?.configured).toBe(false);
    expect(repo).toBeTruthy();
  });
});
