import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { listAgentCatalogue } from "@/modules/agent/service";
import { noteVerificationCommitChanged } from "@/modules/verification/impact";
import { VERIFICATION_SYSTEM_PROMPT } from "@/modules/verification/prompt";
import { AIFailure } from "@/modules/ai/failures";
import {
  applyVerificationTool,
  approveVerification,
  confirmNotApplicable,
  createIntegratedVerification,
  createVerificationDefect,
  getProveView,
  recordManualResult,
  retryVerification,
  startNewVerificationAttempt,
  startVerification,
} from "@/modules/verification/service";
import { verificationEntryBlockers } from "@/modules/verification/gates";
import { recomputeSession } from "@/modules/verification/assess";

const products: string[] = [];
const repos: string[] = [];
const originalKey = process.env.OPENAI_API_KEY;
const originalProvider = process.env.AI_PROVIDER;
const originalModel = process.env.AI_MODEL;
const originalRoot = process.env.PRODUCT_REPOSITORY_ROOT;
const originalWorktrees = process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT;
const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apf-verify-worktrees-"));

function git(dir: string, args: string[]) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
}

const PRODUCT_MODULE = "export function submitClaim() { return { reference: \"CLM-1001\" }; }\n";

type RepoOptions = { javascript?: boolean; productModule?: string };

function makeRepo(pass: boolean | "absent" = true, build = false, options: RepoOptions = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-verify-repo-"));
  repos.push(dir);
  fs.mkdirSync(path.join(dir, "src/claims"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src/claims/submit.ts"), "export const claim = \"notice\"\n");
  fs.writeFileSync(path.join(dir, "src/claims/submit.test.ts"), "test(\"notice\", () => { expect(1).toBe(1) })\n");
  // A plain JavaScript product module gives node:test something behavioural to import.
  if (options.javascript !== false) {
    fs.writeFileSync(path.join(dir, "src/claims/submit.mjs"), options.productModule ?? PRODUCT_MODULE);
  }
  const scripts: Record<string, string> = {};
  if (pass !== "absent") scripts.test = `node -e "process.exit(${pass ? 0 : 1})"`;
  if (build) scripts.build = "node -e \"process.exit(0)\"";
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "demo-claims", scripts }));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

function prepareRepo(pass: boolean | "absent" = true, build = false, options: RepoOptions = {}) {
  const repo = makeRepo(pass, build, options);
  process.env.PRODUCT_REPOSITORY_ROOT = repo;
  process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = worktreeRoot;
  process.env.AI_PROVIDER = "openai";
  process.env.AI_MODEL = "gpt-4.1-mini";
  process.env.OPENAI_API_KEY = "test-key";
  return repo;
}

/** A behavioural test: it imports the product module and asserts on the value that module returns. */
function passingBody(criterionId: string) {
  return `import test from "node:test";
import assert from "node:assert/strict";
import { submitClaim } from "../../src/claims/submit.mjs";
// verifies:${criterionId}
test("submit valid claim returns a reference", () => { assert.equal(submitClaim().reference, "CLM-1001"); });
`;
}

function failingBody(criterionId: string) {
  return `import test from "node:test";
import assert from "node:assert/strict";
import { submitClaim } from "../../src/claims/submit.mjs";
// verifies:${criterionId}
test("submit valid claim returns a reference", () => { assert.equal(submitClaim().reference, "CLM-9999"); });
`;
}

/** A test that carries the marker and passes, but proves nothing about the product. */
function trivialBody(criterionId: string) {
  return `import test from "node:test";
import assert from "node:assert/strict";
import { submitClaim } from "../../src/claims/submit.mjs";
// verifies:${criterionId}
test("submit valid claim", () => { assert.ok(true); });
`;
}

function provider(options: {
  criterionId: string;
  body?: string;
  automated?: boolean;
  adapterId?: string;
  requiredCapabilities?: string[];
  extraCriterionId?: string;
  throwOn?: string;
  filePath?: string;
  targetSurface?: string;
}): AIProvider {
  const filePath = options.filePath ?? `verification/${options.criterionId}/claim.test.mjs`;
  const responses: Record<string, unknown> = {
    verification_conditions: { summary: "Conditions come from the approved criteria.", conditions: [] },
    verification_plan: {
      summary: "Verify the claim reference independently.",
      existingTestNotes: "Existing tests were inspected. A passing suite is not acceptance coverage.",
      untestedAreas: [],
      authentication: { required: false, signupPath: "", loginPath: "", accountKeys: [] },
      fixtureSteps: [],
    },
    verification_test_cases: {
      testCases: [
        {
          title: "Submit valid claim",
          purpose: "Demonstrate the criterion.",
          preconditions: "A complete notice.",
          steps: ["Submit the claim"],
          expectedResult: "Claim reference returned.",
          testType: "API",
          priority: "HIGH",
          source: "ACCEPTANCE_CRITERION",
          acceptanceCriterionId: options.criterionId,
          automated: options.automated ?? true,
          adapterId: options.adapterId ?? "node-test-mjs",
          targetSurface: options.targetSurface ?? "MODULE_EXPORT",
          requiredCapabilities: options.requiredCapabilities ?? [],
          filePath,
          body: options.body ?? passingBody(options.criterionId),
          manualReason: options.automated === false ? "A person must submit a notice in the running product and record the reference." : "",
        },
      ],
    },
    verification_coverage: { mappings: [{ acceptanceCriterionId: options.criterionId, rationale: "Mapped from the criterion." }] },
    verification_interpretation: { summary: "AI analysis only.", concerns: [] },
    verification_defects: { defects: [] },
    verification_summary: { proposedVerdict: "PASS", rationale: "The model proposes pass. Deterministic rules decide." },
  };
  return {
    async generate(request) {
      if (options.throwOn === request.schemaName) throw new Error("model unavailable");
      const data = responses[request.schemaName];
      if (!data) throw new Error(request.schemaName);
      return { data: data as never, usage: { inputTokens: 1, outputTokens: 1 }, model: "mock" };
    },
  };
}

async function completedTask(options?: {
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
  const repo = prepareRepo(options?.pass ?? true, options?.build ?? false, {
    javascript: options?.javascript,
    productModule: options?.productModule,
  });
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
  products.push(product.id);
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

afterEach(async () => {
  setAIProviderForTests(null);
  process.env.OPENAI_API_KEY = originalKey;
  if (originalProvider === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = originalProvider;
  if (originalModel === undefined) delete process.env.AI_MODEL;
  else process.env.AI_MODEL = originalModel;
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
    fs.rmSync(repo, { recursive: true, force: true });
  }
  fs.rmSync(worktreeRoot, { recursive: true, force: true });
  fs.mkdirSync(worktreeRoot, { recursive: true });
});

describe("verification entry", () => {
  it("states the independent verification authority", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("You are an independent verification agent.");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("You did not implement the code.");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("Do not assume the implementation is correct because tests written by the Coding Agent pass.");
  });

  it("requires a completed task and does not create a run", async () => {
    const setup = await completedTask({ status: "APPROVED" });
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/completed task/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("requires a human code approval", async () => {
    const setup = await completedTask({ approval: false });
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/code approval/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("requires a commit SHA", async () => {
    const setup = await completedTask({ sha: false });
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/commit SHA/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("blocks verification of the baseline when the approved snapshot is still uncommitted", async () => {
    const setup = await completedTask();
    const workspace = await db.repositoryWorkspace.findFirstOrThrow({ where: { implementationTaskId: setup.task.id } });
    await db.codingDiff.create({
      data: {
        workspaceId: workspace.id,
        files: [{ path: "src/claims/submit.ts", status: "modified", additions: 1, deletions: 0 }],
        additions: 1,
        deletions: 0,
        patch: "approved",
      },
    });
    await db.codeChangeApproval.updateMany({
      where: { implementationTaskId: setup.task.id },
      data: { baseCommit: setup.sha, headCommit: setup.sha },
    });
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/not the baseline/);
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("allows verification entry for the approved commit", async () => {
    const setup = await completedTask();
    const parent = setup.sha;
    fs.writeFileSync(path.join(setup.repo, "src/claims/submit.ts"), "export const claim = \"approved\"\n");
    git(setup.repo, ["add", "src/claims/submit.ts"]);
    git(setup.repo, ["commit", "-m", "approved snapshot"]);
    const approved = git(setup.repo, ["rev-parse", "HEAD"]).trim();
    const workspace = await db.repositoryWorkspace.findFirstOrThrow({ where: { implementationTaskId: setup.task.id } });
    await db.repositoryWorkspace.update({
      where: { id: workspace.id },
      data: { baseCommit: parent, headCommit: approved },
    });
    await db.codingDiff.create({
      data: {
        workspaceId: workspace.id,
        files: [{ path: "src/claims/submit.ts", status: "modified", additions: 1, deletions: 0 }],
        additions: 1,
        deletions: 0,
        patch: "approved",
      },
    });
    await db.codeChangeApproval.updateMany({
      where: { implementationTaskId: setup.task.id },
      data: { baseCommit: parent, headCommit: approved },
    });
    const reasons = await verificationEntryBlockers(setup.product.id, setup.task.id);
    expect(reasons.filter((reason) => /baseline|commit SHA|product repository/i.test(reason))).toEqual([]);
  });

  it("allows verification after a scope-only plan revision that reuses earlier passing checks", async () => {
    const setup = await completedTask({ build: true, testApplicability: "NOT_APPLICABLE" });
    const parent = setup.sha;
    fs.writeFileSync(path.join(setup.repo, "src/claims/submit.ts"), "export const claim = \"approved\"\n");
    git(setup.repo, ["add", "src/claims/submit.ts"]);
    git(setup.repo, ["commit", "-m", "approved snapshot"]);
    const approved = git(setup.repo, ["rev-parse", "HEAD"]).trim();
    const workspace = await db.repositoryWorkspace.findFirstOrThrow({ where: { implementationTaskId: setup.task.id } });
    await db.repositoryWorkspace.update({
      where: { id: workspace.id },
      data: { baseCommit: parent, headCommit: approved },
    });
    await db.codeChangeApproval.updateMany({
      where: { implementationTaskId: setup.task.id },
      data: { baseCommit: parent, headCommit: approved },
    });
    const priorEvidenceAt = new Date("2026-10-13T15:00:00.000Z");
    await db.codingEvidence.updateMany({
      where: { workspaceId: workspace.id },
      data: { createdAt: priorEvidenceAt, completedAt: priorEvidenceAt },
    });
    await db.codingExecutionPlan.update({
      where: { workspaceId: workspace.id },
      data: {
        version: 4,
        status: "APPROVED",
        approvedAt: new Date("2026-10-14T13:12:17.272Z"),
        approvedBy: "Local user",
        filesExpectedToChange: ["src/claims/submit.ts", ".gitignore"],
        history: [{
          version: 1,
          status: "COMPLETED",
          approvedAt: "2026-10-13T14:00:00.000Z",
          filesExpectedToChange: ["src/claims/submit.ts"],
        }],
        changeRequest: "Authorise .gitignore. Existing implementation evidence was kept.",
      },
    });
    const reasons = await verificationEntryBlockers(setup.product.id, setup.task.id);
    expect(reasons).not.toContain("Required coding checks did not pass.");
    expect(reasons.filter((reason) => /coding checks|baseline|commit SHA|product repository/i.test(reason))).toEqual([]);
  });

  it("still blocks verification when the latest coding check failed after recovery history", async () => {
    const setup = await completedTask({ build: true, testApplicability: "NOT_APPLICABLE" });
    const workspace = await db.repositoryWorkspace.findFirstOrThrow({ where: { implementationTaskId: setup.task.id } });
    const earlierPassAt = new Date("2026-10-14T12:00:00.000Z");
    const laterFailAt = new Date("2026-10-15T12:00:00.000Z");
    await db.codingEvidence.updateMany({
      where: { workspaceId: workspace.id, command: "npm run build" },
      data: { createdAt: earlierPassAt, completedAt: earlierPassAt, result: "PASS" },
    });
    await db.codingEvidence.create({
      data: {
        workspaceId: workspace.id,
        implementationTaskId: setup.task.id,
        type: "BUILD",
        source: "COMMAND_RUNNER",
        description: "npm run build",
        result: "FAIL",
        command: "npm run build",
        exitCode: 1,
        createdAt: laterFailAt,
        completedAt: laterFailAt,
      },
    });
    const reasons = await verificationEntryBlockers(setup.product.id, setup.task.id);
    expect(reasons).toContain("Required coding checks did not pass.");
  });

  it("blocks a stale execution contract", async () => {
    const setup = await completedTask({ stale: true });
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/execution contract is stale/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("reports missing AI configuration before creating a run", async () => {
    const setup = await completedTask();
    setAIProviderForTests(null);
    delete process.env.OPENAI_API_KEY;
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/AI is not configured/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("reports a missing repository before creating a run", async () => {
    const setup = await completedTask();
    await db.repository.update({
      where: { productId: setup.product.id },
      data: { status: "UNAVAILABLE", localPath: "" },
    });
    delete process.env.PRODUCT_REPOSITORY_ROOT;
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/does not have a repository yet/);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });
});

describe("verification execution", () => {
  it("verifies from an isolated worktree at the approved commit", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.workspace?.baseCommit).toBe(setup.sha);
    expect(session?.workspace?.branchName).toContain("ai-factory/verify-task-");
    expect(session?.overallVerdict).toBe("PASS");
    expect(fs.existsSync(path.join(session!.workspace!.workspacePath, `verification/${setup.criterion.id}/claim.test.mjs`))).toBe(true);
    expect(fs.existsSync(path.join(setup.repo, `verification/${setup.criterion.id}/claim.test.mjs`))).toBe(false);
    expect(fs.readFileSync(path.join(setup.repo, "src/claims/submit.ts"), "utf8")).toContain("notice");
    expect(git(setup.repo, ["rev-parse", "HEAD"]).trim()).toBe(setup.sha);
    const created = session?.testCases.find((item) => item.title === "Submit valid claim");
    expect(session?.executions.some((item) => item.kind === "EXISTING_REGRESSION" && item.command === "npm test" && item.status === "PASSED")).toBe(true);
    expect(session?.executions.some((item) => item.kind === "NEW_VERIFICATION" && item.command.startsWith("node --test verification/"))).toBe(true);
    expect(created?.provenance).toBe("VERIFICATION_AGENT");
    expect(session?.testCases.some((item) => item.provenance === "HUMAN_EXISTING")).toBe(true);
    const coverage = session?.coverages.find((item) => item.acceptanceCriterionId === setup.criterion.id);
    expect(coverage?.status).toBe("VERIFIED");
  });

  it("does not execute an automated test without the criterion marker, and says why", async () => {
    const setup = await completedTask();
    const body = passingBody(setup.criterion.id).replace(`// verifies:${setup.criterion.id}\n`, "");
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, body }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.executions.some((item) => item.kind === "NEW_VERIFICATION")).toBe(false);
    expect(session?.coverages[0]?.status).toBe("NOT_TESTED");
    expect(session?.overallVerdict).toBe("INCONCLUSIVE");
    const notRun = session?.evidence.find((item) => item.result === "NOT RUN");
    expect(notRun?.description).toContain("marker");
    expect(notRun?.description).toContain("manual");
  });

  it("does not verify a criterion with a trivial assertion, even when the marker and exit code are present", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, body: trivialBody(setup.criterion.id) }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.executions.some((item) => item.kind === "NEW_VERIFICATION")).toBe(false);
    expect(session?.coverages[0]?.status).toBe("NOT_TESTED");
    expect(session?.overallVerdict).toBe("INCONCLUSIVE");
    const notRun = session?.evidence.find((item) => item.result === "NOT RUN");
    expect(notRun?.description).toContain("trivial assertion");
  });

  it("does not verify a criterion with a self-comparing assertion", async () => {
    const setup = await completedTask();
    const body = passingBody(setup.criterion.id).replace("assert.equal(submitClaim().reference, \"CLM-1001\")", "assert.equal(1, 1)");
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, body }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.executions.some((item) => item.kind === "NEW_VERIFICATION")).toBe(false);
    expect(session?.coverages[0]?.status).not.toBe("VERIFIED");
    expect(session?.overallVerdict).not.toBe("PASS");
  });

  it("classifies a missing dependency during a verification test as an environment failure, not a product failure", async () => {
    const setup = await completedTask({
      productModule: "import \"left-pad-not-installed-for-verification\";\nexport function submitClaim() { return { reference: \"CLM-1001\" }; }\n",
    });
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    const execution = session?.executions.find((item) => item.kind === "NEW_VERIFICATION");
    expect(execution?.status).toBe("BLOCKED");
    expect(session?.failureClass).toBe("VERIFICATION_TEST_ENVIRONMENT_FAILED");
    expect(session?.overallVerdict).toBe("INCONCLUSIVE");
    expect(session?.overallVerdict).not.toBe("FAIL");
    expect(session?.coverages[0]?.status).toBe("BLOCKED");
    expect(session?.defectLinks).toHaveLength(0);
    expect(session?.failureStage).toBe("AGENT_EXECUTE");
    expect(session?.failureDetail).toContain("not installed or does not exist");
  });

  it("marks an automated case as manual when the implementation has no executable JavaScript product module", async () => {
    const setup = await completedTask({ javascript: false });
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.executions.some((item) => item.kind === "NEW_VERIFICATION")).toBe(false);
    const notRun = session?.evidence.find((item) => item.result === "NOT RUN");
    expect(notRun?.description).toContain("Automated execution is not available for this implementation");
    expect(session?.testCases.find((item) => item.title === "Submit valid claim")?.manualReason).toContain("not available");
    const inspection = session?.evidence.find((item) => item.type === "STATIC_ANALYSIS" && item.result === "INSPECTED");
    expect(inspection?.description).toContain("not available");
    expect(session?.coverages[0]?.status).toBe("NOT_TESTED");
    expect(session?.overallVerdict).toBe("INCONCLUSIVE");
  });

  it("treats a product change made during verification as a blocking implementation change", async () => {
    const setup = await completedTask();
    setAIProviderForTests({
      async generate(request) {
        if (request.schemaName === "verification_conditions") {
          // Simulates a verification run that modifies the approved product source.
          const current = await db.verificationSession.findFirstOrThrow({
            where: { productId: setup.product.id },
            include: { workspace: true },
          });
          fs.writeFileSync(
            path.join(current.workspace!.workspacePath, "src/claims/submit.mjs"),
            "export function submitClaim() { return { reference: \"tampered\" }; }\n",
          );
        }
        return provider({ criterionId: setup.criterion.id }).generate(request);
      },
    });
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.escalations.some((item) => item.type === "IMPLEMENTATION_CHANGE" && item.status === "OPEN")).toBe(true);
    expect(session?.overallVerdict).not.toBe("PASS");
    expect(session?.overallVerdict).not.toBe("PASS_WITH_CONCERNS");
    expect(fs.readFileSync(path.join(setup.repo, "src/claims/submit.mjs"), "utf8")).toContain("CLM-1001");
  });

  it("fails when the verification test fails even if the coding self-review is positive", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, body: failingBody(setup.criterion.id) }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.overallVerdict).toBe("FAIL");
    expect(session?.coverages[0]?.status).toBe("FAILED");
    expect(session?.defectLinks[0]?.workItem.type).toBe("DEFECT");
    expect(session?.defectLinks[0]?.implementationTaskId).toBe(setup.task.id);
    expect(session?.defectLinks[0]?.commitSha).toBe(setup.sha);
    expect(session?.aiSummary).not.toBe(session?.verdictReason);
  });

  it("does not pass while an acceptance criterion is unverified", async () => {
    const setup = await completedTask({ criteria: 2 });
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.coverages.some((item) => item.status === "NOT_TESTED")).toBe(true);
    expect(session?.overallVerdict).not.toBe("PASS");
  });

  it("does not pass when regression fails", async () => {
    const setup = await completedTask({ pass: false });
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.executions.some((item) => item.kind === "EXISTING_REGRESSION" && item.status === "FAILED")).toBe(true);
    expect(session?.overallVerdict).toBe("FAIL");
  });

  it("does not pass while a critical defect is open", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.overallVerdict).toBe("PASS");
    const withDefect = await createVerificationDefect({
      productId: setup.product.id,
      sessionId: session!.id,
      title: "Reference can be guessed",
      description: "Another customer might read the notice.",
      severity: "CRITICAL",
      acceptanceCriterionId: setup.criterion.id,
      condition: "A guessed reference is opened.",
      expected: "Access is refused.",
      actual: "The notice is returned.",
    });
    expect(withDefect?.overallVerdict).toBe("FAIL");
    expect(withDefect?.defectLinks[0]?.workItem.priority).toBe("CRITICAL");
  });

  it("records a manual result and requires a person for not applicable", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, automated: false, body: "" }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.overallVerdict).toBe("INCONCLUSIVE");
    const manual = session?.testCases.find((item) => item.title === "Submit valid claim");
    const recorded = await recordManualResult({
      productId: setup.product.id,
      sessionId: session!.id,
      testCaseId: manual!.id,
      result: "PASS",
      comment: "I submitted a notice and saw the reference.",
      tester: "Local user",
    });
    expect(recorded?.evidence.some((item) => item.source === "HUMAN" && item.type === "MANUAL_CONFIRMATION")).toBe(true);
    expect(recorded?.coverages[0]?.status).toBe("VERIFIED");
    await expect(
      confirmNotApplicable(setup.product.id, session!.id, setup.criterion.id, "Testing & Verification Agent"),
    ).rejects.toThrow(/cannot approve/);
    const second = await completedTask();
    setAIProviderForTests(provider({ criterionId: second.criterion.id, automated: false, body: "" }));
    const open = await startVerification(second.product.id, second.task.id);
    const marked = await confirmNotApplicable(second.product.id, open!.id, second.criterion.id, "Local user");
    expect(marked?.coverages[0]?.status).toBe("NOT_APPLICABLE");
    expect(marked?.coverages[0]?.humanConfirmed).toBe(true);
    expect(marked?.overallVerdict).not.toBe("PASS");
  });

  it("keeps approval human-only and flags a later commit", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    await expect(
      approveVerification(setup.product.id, session!.id, { actorName: "Testing & Verification Agent" }),
    ).rejects.toThrow(/cannot approve/);
    const approved = await approveVerification(setup.product.id, session!.id, { actorName: "Local user" });
    expect(approved?.approvals[0]?.commitSha).toBe(setup.sha);
    const before = await db.verificationEvidence.count({ where: { sessionId: session!.id } });
    await noteVerificationCommitChanged(setup.task.id, "b".repeat(40));
    const stale = await db.verificationSession.findUnique({ where: { id: session!.id } });
    expect(stale?.stale).toBe(true);
    expect(stale?.staleReason).toMatch(/RE-VERIFICATION REQUIRED/);
    const approval = await db.verificationApproval.findFirst({ where: { sessionId: session!.id } });
    expect(approval?.stale).toBe(true);
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    await db.repositoryWorkspace.updateMany({
      where: { implementationTaskId: setup.task.id },
      data: { headCommit: "b".repeat(40) },
    });
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/approved commit SHA/);
    expect(await db.verificationEvidence.count({ where: { sessionId: session!.id } })).toBe(before);
  });

  it("does not rewrite a historical verification session", async () => {
    const setup = await completedTask();
    const historical = await db.verificationSession.create({
      data: {
        productId: setup.product.id,
        implementationTaskId: setup.task.id,
        commitSha: setup.sha,
        status: "BLOCKED",
        overallVerdict: "INCONCLUSIVE",
        verdictReason: "No acceptance criteria were available to verify.",
        failureClass: "VERIFICATION_EVIDENCE_INSUFFICIENT",
      },
    });
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const created = await startNewVerificationAttempt(setup.product.id, setup.task.id);
    const again = await db.verificationSession.findUnique({ where: { id: historical.id } });
    expect(created?.id).not.toBe(historical.id);
    expect(again?.status).toBe("BLOCKED");
    expect(again?.overallVerdict).toBe("INCONCLUSIVE");
    expect(again?.verdictReason).toBe("No acceptance criteria were available to verify.");
    expect(again?.failureClass).toBe("VERIFICATION_EVIDENCE_INSUFFICIENT");
  });

  it("preserves the first session when verification is run again", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const first = await startVerification(setup.product.id, setup.task.id);
    const before = await db.verificationEvidence.count({ where: { sessionId: first!.id } });
    const second = await startNewVerificationAttempt(setup.product.id, setup.task.id);
    expect(second?.id).not.toBe(first?.id);
    expect(await db.verificationEvidence.count({ where: { sessionId: first!.id } })).toBe(before);
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(2);
  });

  it("denies production edits, secrets, and unapproved commands", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    const write = await applyVerificationTool(setup.product.id, session!.id, {
      action: "WRITE_FILE",
      path: "src/claims/submit.ts",
      content: "export const claim = \"changed\"\n",
    });
    expect(write.allowed).toBe(false);
    expect(fs.readFileSync(path.join(session!.workspace!.workspacePath, "src/claims/submit.ts"), "utf8")).toContain("notice");
    fs.writeFileSync(path.join(session!.workspace!.workspacePath, ".env"), "TOKEN=secret-value\n");
    const secret = await applyVerificationTool(setup.product.id, session!.id, { action: "READ_FILE", path: ".env" });
    expect(secret.allowed).toBe(false);
    const command = await applyVerificationTool(setup.product.id, session!.id, { action: "RUN_COMMAND", command: "npm run deploy" });
    expect(command.allowed).toBe(false);
    const chained = await applyVerificationTool(setup.product.id, session!.id, {
      action: "RUN_COMMAND",
      command: "npm test; rm -rf /",
    });
    expect(chained.allowed).toBe(false);
    const events = JSON.stringify(await db.verificationEvidence.findMany({ where: { sessionId: session!.id } }));
    expect(events).not.toContain("secret-value");
    expect(await db.verificationEscalation.count({ where: { sessionId: session!.id, type: "IMPLEMENTATION_CHANGE" } })).toBe(1);
  });

  it("records an evidence gap for integrated slice verification", async () => {
    const setup = await completedTask();
    const integrated = await createIntegratedVerification(setup.product.id, setup.slice.id);
    expect(integrated.overallVerdict).toBe("INCONCLUSIVE");
    expect(JSON.stringify(integrated.evidenceGaps)).toMatch(/not executed/);
  });

  it("marks the slice verified only after approved task verification", async () => {
    const setup = await completedTask();
    const before = await getProveView(setup.product.id);
    expect(before?.readiness.label).toBe("NOT VERIFIED");
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    await approveVerification(setup.product.id, session!.id, { actorName: "Local user" });
    const after = await getProveView(setup.product.id);
    expect(after?.readiness.label).toBe("PRODUCT SLICE VERIFIED");
    expect(after?.readiness.reasons[0]).toBe("Ready to move to PROVE");
  });

  it("preserves evidence when the model fails", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, throwOn: "verification_interpretation" }));
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/model unavailable/);
    const session = await db.verificationSession.findFirst({ where: { productId: setup.product.id } });
    expect(session?.status).toBe("FAILED");
    expect(session?.overallVerdict).toBeNull();
    expect(session?.failureClass).toBe("VERIFICATION_EXECUTION_FAILED");
    expect(await db.verificationExecution.count({ where: { sessionId: session!.id } })).toBeGreaterThan(0);
    expect(await db.agentRun.count({ where: { productId: setup.product.id, status: "FAILED" } })).toBeGreaterThan(0);
  });

  it("does not turn a missing test script into a product failure", async () => {
    const setup = await completedTask({ pass: "absent" });
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.executions.some((item) => item.command === "npm test" && item.status === "FAILED")).toBe(false);
    expect(session?.evidence.some((item) => item.command === "npm test" && item.result === "UNAVAILABLE")).toBe(true);
    expect(session?.overallVerdict).not.toBe("FAIL");
    expect(session?.defectLinks).toHaveLength(0);
  });

  it("treats tests marked not applicable by the approved plan as not run", async () => {
    const setup = await completedTask({ pass: "absent", build: true, testApplicability: "NOT_APPLICABLE" });
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.executions.some((item) => item.command === "npm test" && item.status === "NOT_RUN")).toBe(true);
    expect(session?.evidence.some((item) => item.command === "npm test" && item.result === "NOT APPLICABLE")).toBe(true);
    expect(session?.executions.some((item) => item.command === "npm run build" && item.status === "PASSED")).toBe(true);
    expect(session?.coverages[0]?.status).toBe("VERIFIED");
    expect(session?.overallVerdict).toBe("PASS");
  });

  it("does not treat a passing technical check as proof of an unexecuted acceptance criterion", async () => {
    const setup = await completedTask({ build: true, criteria: 2 });
    const body = passingBody(setup.criterion.id).replace(`// verifies:${setup.criterion.id}\n`, "");
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, body }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.executions.some((item) => item.command === "npm run build" && item.status === "PASSED")).toBe(true);
    expect(session?.coverages.every((item) => item.status !== "VERIFIED")).toBe(true);
    expect(session?.overallVerdict).not.toBe("PASS");
    expect(session?.overallVerdict).not.toBe("PASS_WITH_CONCERNS");
  });

  it("records a provider failure without a product verdict", async () => {
    const setup = await completedTask();
    setAIProviderForTests({
      async generate(request) {
        if (request.schemaName === "verification_interpretation") {
          throw new AIFailure(
            "The configured model is temporarily unavailable because of high demand. Nothing was generated. You can retry.",
            "PROVIDER_UNAVAILABLE",
          );
        }
        return provider({ criterionId: setup.criterion.id }).generate(request);
      },
    });
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/high demand/);
    const session = await db.verificationSession.findFirst({ where: { productId: setup.product.id } });
    expect(session?.status).toBe("FAILED");
    expect(session?.overallVerdict).toBeNull();
    expect(session?.failureClass).toBe("AI_PROVIDER_UNAVAILABLE");
    expect(["PASS", "FAIL", "PASS_WITH_CONCERNS"]).not.toContain(session?.overallVerdict);
  });

  it("records the failed stage and a redacted technical detail when execution fails", async () => {
    const setup = await completedTask();
    const secret = "sk-FAKE_TEST_KEY_NOT_REAL_1234567890";
    setAIProviderForTests({
      async generate(request) {
        if (request.schemaName === "verification_interpretation") {
          throw new Error(`upstream rejected the request api_key=${secret}`);
        }
        return provider({ criterionId: setup.criterion.id }).generate(request);
      },
    });
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/upstream rejected/);
    const session = await db.verificationSession.findFirstOrThrow({ where: { productId: setup.product.id } });
    expect(session.status).toBe("FAILED");
    expect(session.overallVerdict).toBeNull();
    expect(session.failureStage).toBe("AGENT_EXECUTE");
    expect(session.failureDetail).toContain("upstream rejected the request");
    expect(session.failureDetail).not.toContain(secret);
  });

  it("records the planning stage when the plan phase fails before any execution", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, throwOn: "verification_plan" }));
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/model unavailable/);
    const session = await db.verificationSession.findFirstOrThrow({ where: { productId: setup.product.id } });
    expect(session.status).toBe("FAILED");
    expect(session.overallVerdict).toBeNull();
    expect(session.failureStage).toBe("AGENT_PLAN");
    expect(await db.verificationExecution.count({ where: { sessionId: session.id, kind: "NEW_VERIFICATION" } })).toBe(0);
  });

  it("records a manual test case as not run, with its reason, without demonstrating the criterion", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, automated: false }));
    const session = await startVerification(setup.product.id, setup.task.id);
    const notRun = session?.evidence.filter((item) => item.result === "NOT RUN") ?? [];
    expect(notRun).toHaveLength(1);
    expect(notRun[0]).toMatchObject({ acceptanceCriterionId: null, type: "TEST_RESULT" });
    expect(notRun[0]?.description).toContain("manual");
    expect(session?.coverages[0]?.status).not.toBe("VERIFIED");
    expect(session?.overallVerdict).not.toBe("PASS");
  });

  it("explains why an automated case pointing at product source was not executed", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({
      criterionId: setup.criterion.id,
      filePath: "src/app/discovery/page.tsx",
    }));
    const session = await startVerification(setup.product.id, setup.task.id);
    const notRun = session?.evidence.find((item) => item.result === "NOT RUN");
    expect(notRun?.description).toContain("src/app/discovery/page.tsx");
    expect(notRun?.description).toContain("Automated execution was refused.");
    expect(session?.executions.some((item) => item.kind === "NEW_VERIFICATION")).toBe(false);
    expect(session?.coverages[0]?.status).not.toBe("VERIFIED");
    expect(session?.overallVerdict).not.toBe("PASS");
  });

  it("retries against the same approved commit in a new workspace and keeps the failed attempt", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, throwOn: "verification_interpretation" }));
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/model unavailable/);
    const first = await db.verificationSession.findFirstOrThrow({
      where: { productId: setup.product.id },
      include: { workspace: true },
    });
    const approvalBefore = await db.codeChangeApproval.findFirstOrThrow({ where: { implementationTaskId: setup.task.id } });
    const headBefore = git(setup.repo, ["rev-parse", "HEAD"]).trim();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const second = await retryVerification(setup.product.id, setup.task.id);
    expect(second?.id).not.toBe(first.id);
    expect(second?.commitSha).toBe(setup.sha);
    expect(second?.workspace?.workspacePath).not.toBe(first.workspace?.workspacePath);
    expect(fs.existsSync(second!.workspace!.workspacePath)).toBe(true);
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(2);
    const approvalAfter = await db.codeChangeApproval.findFirstOrThrow({ where: { implementationTaskId: setup.task.id } });
    expect(approvalAfter.diffHash).toBe(approvalBefore.diffHash);
    expect(approvalAfter.headCommit).toBe(approvalBefore.headCommit);
    expect(git(setup.repo, ["rev-parse", "HEAD"]).trim()).toBe(headBefore);
    expect(fs.readFileSync(path.join(setup.repo, "src/claims/submit.ts"), "utf8")).toContain("notice");
  });

  it("creates a fresh worktree when the previous temporary checkout is gone", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const first = await startVerification(setup.product.id, setup.task.id);
    const head = git(setup.repo, ["rev-parse", "HEAD"]).trim();
    fs.rmSync(first!.workspace!.workspacePath, { recursive: true, force: true });
    const second = await startNewVerificationAttempt(setup.product.id, setup.task.id);
    expect(fs.existsSync(second!.workspace!.workspacePath)).toBe(true);
    expect(second?.workspace?.baseCommit).toBe(setup.sha);
    expect(second?.id).not.toBe(first?.id);
    expect(git(setup.repo, ["rev-parse", "HEAD"]).trim()).toBe(head);
    const kept = await db.verificationSession.findUnique({ where: { id: first!.id } });
    expect(kept?.commitSha).toBe(setup.sha);
  });

  it("blocks retry when the code approval no longer matches the commit", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const first = await startVerification(setup.product.id, setup.task.id);
    await db.codeChangeApproval.updateMany({
      where: { implementationTaskId: setup.task.id },
      data: { stale: true },
    });
    await expect(startNewVerificationAttempt(setup.product.id, setup.task.id)).rejects.toThrow(/code approval/);
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(1);
    await db.codeChangeApproval.updateMany({
      where: { implementationTaskId: setup.task.id },
      data: { stale: false },
    });
    fs.writeFileSync(path.join(setup.repo, "src/claims/submit.ts"), "export const claim = \"later\"\n");
    git(setup.repo, ["add", "src/claims/submit.ts"]);
    git(setup.repo, ["commit", "-m", "later"]);
    const later = git(setup.repo, ["rev-parse", "HEAD"]).trim();
    await db.repositoryWorkspace.updateMany({
      where: { implementationTaskId: setup.task.id },
      data: { headCommit: later },
    });
    await expect(startNewVerificationAttempt(setup.product.id, setup.task.id)).rejects.toThrow(/approved commit SHA/);
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(1);
    expect(first?.commitSha).toBe(setup.sha);
  });

  it("still allows verification entry when the temporary coding checkout is missing", async () => {
    const setup = await completedTask();
    await db.repositoryWorkspace.updateMany({
      where: { implementationTaskId: setup.task.id },
      data: { workspacePath: path.join(os.tmpdir(), `missing-${setup.task.id}`) },
    });
    const reasons = await verificationEntryBlockers(setup.product.id, setup.task.id);
    expect(reasons.some((reason) => /not in the product repository/i.test(reason))).toBe(false);
  });

  it("records an integrated plan without executing or verifying the slice", async () => {
    const setup = await completedTask();
    const before = await db.verificationSession.count({ where: { productId: setup.product.id } });
    const integrated = await createIntegratedVerification(setup.product.id, setup.slice.id);
    const view = await getProveView(setup.product.id);
    expect(integrated.status).toBe("BLOCKED");
    expect(integrated.overallVerdict).toBe("INCONCLUSIVE");
    expect(JSON.stringify(integrated.evidenceGaps)).toMatch(/not executed/);
    expect(view?.readiness.label).toBe("NOT VERIFIED");
    expect(view?.readiness.reasons.join(" ")).toContain(setup.task.title);
    expect(view?.readiness.reasons.join(" ")).not.toContain(setup.task.id);
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(before);
  });

  it("configures the verification agent from AI; repository readiness is per product", async () => {
    const repo = prepareRepo();
    setAIProviderForTests(provider({ criterionId: "unused" }));
    const ready = await listAgentCatalogue();
    expect(ready.find((agent) => agent.agentType === "TESTING")?.configured).toBe(true);
    delete process.env.PRODUCT_REPOSITORY_ROOT;
    expect((await listAgentCatalogue()).find((agent) => agent.agentType === "TESTING")?.configured).toBe(true);
    process.env.PRODUCT_REPOSITORY_ROOT = repo;
    setAIProviderForTests(null);
    delete process.env.OPENAI_API_KEY;
    expect((await listAgentCatalogue()).find((agent) => agent.agentType === "TESTING")?.configured).toBe(false);
  });
});

describe("test adapters: traceability, selection and snapshot binding", () => {
  it("records each automated result with its test case, execution, adapter, criterion and approved snapshot", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    const testCase = session?.testCases.find((item) => item.title === "Submit valid claim");
    expect(testCase).toMatchObject({ automated: true, adapterId: "node-test-mjs", targetSurface: "MODULE_EXPORT" });

    const execution = session?.executions.find((item) => item.kind === "NEW_VERIFICATION");
    expect(execution).toMatchObject({
      testCaseId: testCase?.id,
      adapterId: "node-test-mjs",
      failureCategory: "PASSED",
      snapshotCommit: setup.sha,
      status: "PASSED",
    });
    expect(execution?.durationMs).toBeGreaterThanOrEqual(0);

    const evidence = session?.evidence.find((item) => item.executionId === execution?.id);
    expect(evidence).toMatchObject({
      testCaseId: testCase?.id,
      acceptanceCriterionId: setup.criterion.id,
      adapterId: "node-test-mjs",
      snapshotCommit: setup.sha,
      result: "DEMONSTRATED",
    });
  });

  it("keeps an HTTP case manual when the approved snapshot offers no route to test, and never runs it", async () => {
    const setup = await completedTask();
    setAIProviderForTests(
      provider({
        criterionId: setup.criterion.id,
        adapterId: "http-blackbox",
        targetSurface: "HTTP_ENDPOINT",
        requiredCapabilities: ["http-request", "status-assertion"],
        filePath: "verification/http/claim.test.mjs",
        body: `// verifies:${setup.criterion.id}\nconst base = process.env.VERIFICATION_BASE_URL;\nconst response = await fetch(new URL("/api/claims", base));\nif (response.status !== 200) throw new Error("status");\n`,
      }),
    );
    const session = await startVerification(setup.product.id, setup.task.id);
    const testCase = session?.testCases.find((item) => item.title === "Submit valid claim");
    expect(testCase).toMatchObject({ automated: false, adapterId: "" });
    expect(testCase?.manualReason).toMatch(/not available for this implementation/);
    expect(await db.verificationExecution.count({ where: { testCaseId: testCase?.id, kind: "NEW_VERIFICATION" } })).toBe(0);
  });

  it("refuses a case that names an unregistered adapter and never executes it", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, adapterId: "vitest" }));
    const session = await startVerification(setup.product.id, setup.task.id);
    const testCase = session?.testCases.find((item) => item.title === "Submit valid claim");
    expect(testCase?.automated).toBe(false);
    expect(testCase?.adapterId).toBe("");
    expect(testCase?.manualReason).toContain("The adapter vitest is not registered");
    expect(session?.executions.some((item) => item.kind === "NEW_VERIFICATION")).toBe(false);
    expect(session?.coverages[0]?.status).not.toBe("VERIFIED");
    expect(session?.overallVerdict).not.toBe("PASS");
  });

  it("refuses a case that requires a capability its adapter does not provide", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, requiredCapabilities: ["browser-session"] }));
    const session = await startVerification(setup.product.id, setup.task.id);
    const testCase = session?.testCases.find((item) => item.title === "Submit valid claim");
    expect(testCase?.automated).toBe(false);
    expect(testCase?.manualReason).toContain("browser-session");
    expect(testCase?.requiredCapabilities).toEqual(["browser-session"]);
    expect(session?.executions.some((item) => item.kind === "NEW_VERIFICATION")).toBe(false);
  });

  it("does not let a pass from a different snapshot satisfy the criterion", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.overallVerdict).toBe("PASS");

    await db.verificationExecution.updateMany({
      where: { sessionId: session!.id, kind: "NEW_VERIFICATION" },
      data: { snapshotCommit: "0".repeat(40) },
    });
    await recomputeSession(session!.id);
    const coverage = await db.verificationCoverage.findFirst({
      where: { sessionId: session!.id, acceptanceCriterionId: setup.criterion.id },
    });
    expect(coverage?.status).not.toBe("VERIFIED");
  });
});

describe("new attempt governance", () => {
  it("starts a new attempt after an inconclusive result and leaves the previous session unchanged", async () => {
    const setup = await completedTask();
    const previous = await db.verificationSession.create({
      data: {
        productId: setup.product.id,
        implementationTaskId: setup.task.id,
        commitSha: setup.sha,
        status: "BLOCKED",
        overallVerdict: "INCONCLUSIVE",
        verdictReason: "Evidence was insufficient.",
        failureClass: "VERIFICATION_EVIDENCE_INSUFFICIENT",
      },
    });
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const created = await startNewVerificationAttempt(setup.product.id, setup.task.id);
    expect(created?.id).toBeTruthy();
    expect(created?.id).not.toBe(previous.id);
    const kept = await db.verificationSession.findUniqueOrThrow({ where: { id: previous.id } });
    expect(kept.status).toBe("BLOCKED");
    expect(kept.overallVerdict).toBe("INCONCLUSIVE");
    expect(kept.verdictReason).toBe("Evidence was insufficient.");
    expect(kept.failureClass).toBe("VERIFICATION_EVIDENCE_INSUFFICIENT");
    expect(kept.updatedAt.getTime()).toBe(previous.updatedAt.getTime());
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(2);
  });

  it("refuses the first-attempt entry point once any attempt exists", async () => {
    const setup = await completedTask();
    await db.verificationSession.create({
      data: {
        productId: setup.product.id,
        implementationTaskId: setup.task.id,
        commitSha: setup.sha,
        status: "BLOCKED",
        overallVerdict: "INCONCLUSIVE",
        failureClass: "VERIFICATION_EVIDENCE_INSUFFICIENT",
      },
    });
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/Start New Verification Attempt/);
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(1);
  });

  it("refuses the retry entry point after an inconclusive result", async () => {
    const setup = await completedTask();
    await db.verificationSession.create({
      data: {
        productId: setup.product.id,
        implementationTaskId: setup.task.id,
        commitSha: setup.sha,
        status: "BLOCKED",
        overallVerdict: "INCONCLUSIVE",
        failureClass: "VERIFICATION_EVIDENCE_INSUFFICIENT",
      },
    });
    await expect(retryVerification(setup.product.id, setup.task.id)).rejects.toThrow(/After an inconclusive result/);
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(1);
  });

  it("refuses a new attempt while an attempt is still running", async () => {
    const setup = await completedTask();
    await db.verificationSession.create({
      data: {
        productId: setup.product.id,
        implementationTaskId: setup.task.id,
        commitSha: setup.sha,
        status: "EXECUTING",
      },
    });
    await expect(startNewVerificationAttempt(setup.product.id, setup.task.id)).rejects.toThrow(
      /already running|stopped before it finished/,
    );
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(1);
  });

  it("refuses a new attempt after a person has approved the verification, and the approval stands", async () => {
    const setup = await completedTask();
    const approvedSession = await db.verificationSession.create({
      data: {
        productId: setup.product.id,
        implementationTaskId: setup.task.id,
        commitSha: setup.sha,
        status: "PASSED",
        overallVerdict: "PASS",
      },
    });
    const approval = await db.approval.create({
      data: { productId: setup.product.id, approvalType: "VERIFICATION", status: "APPROVED", approvedBy: "Local user" },
    });
    await db.verificationApproval.create({
      data: {
        productId: setup.product.id,
        approvalId: approval.id,
        sessionId: approvedSession.id,
        implementationTaskId: setup.task.id,
        commitSha: setup.sha,
        evidenceFingerprint: "fingerprint",
      },
    });
    await expect(startNewVerificationAttempt(setup.product.id, setup.task.id)).rejects.toThrow(/already approved/);
    await expect(retryVerification(setup.product.id, setup.task.id)).rejects.toThrow(/already approved/);
    const stillApproved = await db.verificationApproval.findFirstOrThrow({ where: { sessionId: approvedSession.id } });
    expect(stillApproved.stale).toBe(false);
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(1);
  });

  it("refuses a new attempt after a failed verdict, which needs a change rather than a new run", async () => {
    const setup = await completedTask();
    await db.verificationSession.create({
      data: {
        productId: setup.product.id,
        implementationTaskId: setup.task.id,
        commitSha: setup.sha,
        status: "REVIEW",
        overallVerdict: "FAIL",
      },
    });
    await expect(startNewVerificationAttempt(setup.product.id, setup.task.id)).rejects.toThrow(
      /inconclusive result or a result awaiting human review/,
    );
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(1);
  });

  it("refuses a new attempt when the approved code snapshot is no longer valid", async () => {
    const setup = await completedTask();
    await db.verificationSession.create({
      data: {
        productId: setup.product.id,
        implementationTaskId: setup.task.id,
        commitSha: setup.sha,
        status: "BLOCKED",
        overallVerdict: "INCONCLUSIVE",
        failureClass: "VERIFICATION_EVIDENCE_INSUFFICIENT",
      },
    });
    await db.codeChangeApproval.updateMany({
      where: { implementationTaskId: setup.task.id },
      data: { stale: true },
    });
    await expect(startNewVerificationAttempt(setup.product.id, setup.task.id)).rejects.toThrow(/code approval/);
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(1);
  });
});
