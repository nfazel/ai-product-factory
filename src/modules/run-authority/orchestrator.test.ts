import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { AIFailure } from "@/modules/ai/failures";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { readyCodingProduct } from "@/modules/coding/ready-product.test-support";
import { grantRunAuthority, revokeRunAuthority } from "@/modules/run-authority/service";
import { runTaskUnderAuthority } from "@/modules/run-authority/orchestrator";
import { requireRuntimeReview } from "@/modules/verification/runtime-review";

const KEY = "synthetic-run-authority-key-32-bytes-long!!";
const repos: string[] = [];
const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apf-ra-worktrees-"));
const saved = { root: process.env.PRODUCT_REPOSITORY_ROOT, worktrees: process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT, key: process.env.OPENAI_API_KEY };

const answers = {
  coding_repository_analysis: { summary: "The helper is the relevant file.", relevantFiles: ["src/claims/submit.ts"], notes: "Bounded." },
  coding_execution_plan: { summary: "Update the helper.", filesExpectedToChange: ["src/claims/submit.ts"], steps: ["Update the helper"], risks: "", validationPlan: "npm test" },
  coding_change_request: { summary: "Set the reference.", operations: [{ action: "WRITE_FILE", path: "src/claims/submit.ts", content: "export const claim = \"reference\"\n" }], commands: [], escalation: null, completionProposal: "COMPLETED" },
  coding_self_review: { summary: "One small change.", potentialDefects: [], missingAcceptance: [], unnecessaryChanges: [], architectureDeviations: [], securityConcerns: [], missingTests: [] },
  coding_completion: { proposal: "COMPLETED", rationale: "The checks decide." },
} as Record<string, unknown>;

function provider(onCall?: (schema: string) => void): AIProvider {
  return {
    async generate(request) {
      onCall?.(request.schemaName);
      const data = answers[request.schemaName];
      if (!data) throw new Error(`No mock for ${request.schemaName}`);
      return { data: data as never, usage: { inputTokens: 1, outputTokens: 1 }, model: "mock" };
    },
  };
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-ra-repo-"));
  repos.push(dir);
  fs.mkdirSync(path.join(dir, "src/claims"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src/claims/submit.ts"), "export const claim = \"notice\"\n");
  const ok = "process.exit(0)";
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "demo", scripts: { test: `node -e "${ok}"`, lint: `node -e "${ok}"`, typecheck: `node -e "${ok}"`, build: `node -e "${ok}"` } }));
  fs.writeFileSync(path.join(dir, "README.md"), "Demo\n");
  const git = (args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", ...args], { cwd: dir });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["add", "."]);
  git(["commit", "-m", "init"]);
  return dir;
}

async function setup(risk: "LOW" | "MEDIUM" = "LOW") {
  process.env.PRODUCT_REPOSITORY_ROOT = makeRepo();
  process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = worktreeRoot;
  const ready = await readyCodingProduct({ taskStatus: "PROPOSED", mode: "SUPERVISED", risk });
  // A task with no behavioural criteria, like a setup task, so the runtime review has nothing to link.
  await db.acceptanceCriterion.deleteMany({ where: { workItemId: ready.task.workItemId ?? "" } });
  const planId = (await db.implementationTask.findUniqueOrThrow({ where: { id: ready.task.id } })).implementationPlanId;
  return { productId: ready.product.id, taskId: ready.task.id, planId };
}

beforeEach(() => {
  vi.stubEnv("EXTERNAL_REVIEW_APPROVAL_KEY", KEY);
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("APF_CONTAINER_VERIFICATION_READY", "0");
  setAIProviderForTests(provider());
});

afterEach(() => {
  setAIProviderForTests(null);
  vi.unstubAllEnvs();
  process.env.PRODUCT_REPOSITORY_ROOT = saved.root;
  process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = saved.worktrees;
  for (const repo of repos.splice(0)) {
    try { execFileSync("git", ["-c", "maintenance.auto=false", "worktree", "prune"], { cwd: repo, timeout: 2000 }); } catch { /* already gone */ }
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

describe("a task run under one authority", () => {
  it("takes a LOW risk task from proposed to the verification step with no clicks, recording every step as the Builder's", async () => {
    const { productId, taskId, planId } = await setup("LOW");
    const authority = await grantRunAuthority({ productId, planId, credential: KEY });
    const outcome = await runTaskUnderAuthority({ productId, taskId, authorityId: authority.id });

    // Verification needs the container sandbox, which this fast test leaves off, so the run stops there and says why.
    expect(outcome).toMatchObject({ status: "NEEDS_YOU", step: "verify" });

    const steps = (await db.runAuthorityEvent.findMany({ where: { authorityId: authority.id, type: "STEP" }, orderBy: { createdAt: "asc" } })).map((event) => event.step);
    expect(steps).toEqual(["APPROVE_TASK", "APPROVE_PLAN", "APPROVE_CODE", "RECORD_SNAPSHOT", "SIGN_RUNTIME_REVIEW"]);

    const wording = `Builder, under authority ${authority.id} granted by Local operator`;
    const workspace = await db.repositoryWorkspace.findFirstOrThrow({ where: { productId, implementationTaskId: taskId }, include: { plan: true } });
    expect(workspace.status).toBe("COMPLETED");
    expect(workspace.plan?.approvedBy).toBe(wording);
    const approvals = await db.approval.findMany({ where: { productId, authorityId: authority.id } });
    expect(approvals.map((item) => item.approvalType).sort()).toEqual(["CODE_CHANGE", "VERIFICATION_RUNTIME"]);
    expect(approvals.every((item) => item.approvedBy === wording)).toBe(true);
    // Nothing the Builder did is labelled as a person's confirmation.
    const evidence = await db.codingEvidence.findMany({ where: { workspaceId: workspace.id, type: { in: ["HUMAN_CONFIRMATION", "DELEGATED_CONFIRMATION"] } } });
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.filter((item) => item.source === "HUMAN")).toHaveLength(0);
    // The framework accepts the Builder's signed review as the binding verification will use.
    await expect(requireRuntimeReview(productId, workspace.id)).resolves.toMatchObject({ kind: "VERIFICATION_RUNTIME_BINDING" });
  }, 120_000);

  it("hands a MEDIUM risk task back to the person at the first step and changes nothing", async () => {
    const { productId, taskId, planId } = await setup("MEDIUM");
    const authority = await grantRunAuthority({ productId, planId, credential: KEY });
    const outcome = await runTaskUnderAuthority({ productId, taskId, authorityId: authority.id });
    expect(outcome).toMatchObject({ status: "NEEDS_YOU", step: "approve-task" });
    if (outcome.status === "NEEDS_YOU") expect(outcome.reason).toMatch(/MEDIUM risk.*needs you/);
    expect((await db.implementationTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe("PROPOSED");
    expect(await db.repositoryWorkspace.count({ where: { productId } })).toBe(0);
  });

  it("does nothing once the authority is stopped, and stops midway when it is stopped during the run", async () => {
    const stoppedFirst = await setup("LOW");
    const first = await grantRunAuthority({ productId: stoppedFirst.productId, planId: stoppedFirst.planId, credential: KEY });
    await revokeRunAuthority({ authorityId: first.id, credential: KEY });
    expect(await runTaskUnderAuthority({ productId: stoppedFirst.productId, taskId: stoppedFirst.taskId, authorityId: first.id })).toMatchObject({ status: "STOPPED" });
    expect((await db.implementationTask.findUniqueOrThrow({ where: { id: stoppedFirst.taskId } })).status).toBe("PROPOSED");

    const midway = await setup("LOW");
    const second = await grantRunAuthority({ productId: midway.productId, planId: midway.planId, credential: KEY });
    let stopped = false;
    // The person presses Stop while the plan is being drafted.
    setAIProviderForTests(provider((schema) => {
      if (schema === "coding_execution_plan" && !stopped) { stopped = true; void revokeRunAuthority({ authorityId: second.id, credential: KEY }); }
    }));
    const outcome = await runTaskUnderAuthority({ productId: midway.productId, taskId: midway.taskId, authorityId: second.id });
    expect(outcome).toMatchObject({ status: "STOPPED" });
    const steps = (await db.runAuthorityEvent.findMany({ where: { authorityId: second.id, type: "STEP" } })).map((event) => event.step);
    expect(steps).toEqual(["APPROVE_TASK"]);
  }, 120_000);

  it("stops when the authority has expired", async () => {
    const { productId, taskId, planId } = await setup("LOW");
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const authority = await grantRunAuthority({ productId, planId, credential: KEY, now: tenDaysAgo });
    expect(await runTaskUnderAuthority({ productId, taskId, authorityId: authority.id })).toMatchObject({ status: "STOPPED", reason: expect.stringContaining("expired") });
  });

  it("retries a model outage up to the authority's limit, then hands back to the person", async () => {
    const { productId, taskId, planId } = await setup("LOW");
    const authority = await grantRunAuthority({ productId, planId, credential: KEY });
    let calls = 0;
    setAIProviderForTests({
      async generate(request) {
        if (request.schemaName === "coding_repository_analysis") calls += 1;
        throw new AIFailure("The model is temporarily unavailable.", "PROVIDER_UNAVAILABLE" as never);
      },
    });
    const outcome = await runTaskUnderAuthority({ productId, taskId, authorityId: authority.id });
    expect(outcome.status).toBe("NEEDS_YOU");
    if (outcome.status === "NEEDS_YOU") expect(outcome.reason).toContain("temporarily unavailable");
    // The first try plus two retries.
    expect(calls).toBe(3);
  }, 120_000);
});
