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
import {
  applyVerificationTool,
  approveVerification,
  confirmNotApplicable,
  createIntegratedVerification,
  createVerificationDefect,
  getProveView,
  recordManualResult,
  startVerification,
} from "@/modules/verification/service";

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

function makeRepo(pass = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-verify-repo-"));
  repos.push(dir);
  fs.mkdirSync(path.join(dir, "src/claims"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src/claims/submit.ts"), "export const claim = \"notice\"\n");
  fs.writeFileSync(path.join(dir, "src/claims/submit.test.ts"), "test(\"notice\", () => { expect(1).toBe(1) })\n");
  const script = pass ? "process.exit(0)" : "process.exit(1)";
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "demo-claims", scripts: { test: `node -e "${script}"` } }),
  );
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

function prepareRepo(pass = true) {
  const repo = makeRepo(pass);
  process.env.PRODUCT_REPOSITORY_ROOT = repo;
  process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = worktreeRoot;
  process.env.AI_PROVIDER = "openai";
  process.env.AI_MODEL = "gpt-4.1-mini";
  process.env.OPENAI_API_KEY = "test-key";
  return repo;
}

function passingBody(criterionId: string) {
  return `import test from "node:test";
import assert from "node:assert/strict";
// verifies:${criterionId}
test("submit valid claim", () => { assert.equal(1, 1); });
`;
}

function failingBody(criterionId: string) {
  return `import test from "node:test";
import assert from "node:assert/strict";
// verifies:${criterionId}
test("submit valid claim", () => { assert.equal(1, 2); });
`;
}

function provider(options: {
  criterionId: string;
  body?: string;
  automated?: boolean;
  extraCriterionId?: string;
  throwOn?: string;
}): AIProvider {
  const filePath = `verification/${options.criterionId}/claim.test.mjs`;
  const responses: Record<string, unknown> = {
    verification_conditions: { summary: "Conditions come from the approved criteria.", conditions: [] },
    verification_plan: {
      summary: "Verify the claim reference independently.",
      existingTestNotes: "Existing tests were inspected. A passing suite is not acceptance coverage.",
      untestedAreas: [],
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
          filePath,
          body: options.body ?? passingBody(options.criterionId),
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
  pass?: boolean;
  status?: "COMPLETED" | "APPROVED";
  approval?: boolean;
  sha?: boolean;
  checks?: boolean;
  stale?: boolean;
  workspace?: boolean;
  criteria?: number;
}) {
  const repo = prepareRepo(options?.pass ?? true);
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
    delete process.env.PRODUCT_REPOSITORY_ROOT;
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/PRODUCT_REPOSITORY_ROOT/);
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
    expect(created?.provenance).toBe("VERIFICATION_AGENT");
    expect(session?.testCases.some((item) => item.provenance === "HUMAN_EXISTING")).toBe(true);
    const coverage = session?.coverages.find((item) => item.acceptanceCriterionId === setup.criterion.id);
    expect(coverage?.status).toBe("VERIFIED");
  });

  it("does not treat a zero exit code as acceptance verification without a criterion marker", async () => {
    const setup = await completedTask();
    const body = passingBody(setup.criterion.id).replace(`// verifies:${setup.criterion.id}\n`, "");
    setAIProviderForTests(provider({ criterionId: setup.criterion.id, body }));
    const session = await startVerification(setup.product.id, setup.task.id);
    expect(session?.executions.some((item) => item.kind === "NEW_VERIFICATION" && item.exitCode === 0)).toBe(true);
    expect(session?.coverages[0]?.status).toBe("NOT_TESTED");
    expect(session?.overallVerdict).toBe("INCONCLUSIVE");
    expect(session?.evidence.some((item) => item.result === "EXECUTED")).toBe(true);
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
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/could not be created/);
    expect(await db.verificationEvidence.count({ where: { sessionId: session!.id } })).toBe(before);
  });

  it("preserves the first session when verification is run again", async () => {
    const setup = await completedTask();
    setAIProviderForTests(provider({ criterionId: setup.criterion.id }));
    const first = await startVerification(setup.product.id, setup.task.id);
    const before = await db.verificationEvidence.count({ where: { sessionId: first!.id } });
    const second = await startVerification(setup.product.id, setup.task.id);
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
    expect(await db.verificationExecution.count({ where: { sessionId: session!.id } })).toBeGreaterThan(0);
    expect(await db.agentRun.count({ where: { productId: setup.product.id, status: "FAILED" } })).toBeGreaterThan(0);
  });

  it("configures the verification agent only when AI and a repository exist", async () => {
    const repo = prepareRepo();
    setAIProviderForTests(provider({ criterionId: "unused" }));
    const ready = await listAgentCatalogue();
    expect(ready.find((agent) => agent.agentType === "TESTING")?.configured).toBe(true);
    delete process.env.PRODUCT_REPOSITORY_ROOT;
    expect((await listAgentCatalogue()).find((agent) => agent.agentType === "TESTING")?.configured).toBe(false);
    process.env.PRODUCT_REPOSITORY_ROOT = repo;
    setAIProviderForTests(null);
    delete process.env.OPENAI_API_KEY;
    expect((await listAgentCatalogue()).find((agent) => agent.agentType === "TESTING")?.configured).toBe(false);
  });
});
