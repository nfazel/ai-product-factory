import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, vi } from "vitest";

import { db } from "@/lib/db";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { readyCodingProduct } from "@/modules/coding/ready-product.test-support";

/**
 * Test support only. A tiny real git repository, a scripted Coding Agent and a product whose task is ready to run, so the run
 * tests can go through every real step without Docker or the network. Not imported by application code.
 */
export const KEY = "synthetic-run-authority-key-32-bytes-long!!";

const answers = {
  coding_repository_analysis: { summary: "The helper is the relevant file.", relevantFiles: ["src/claims/submit.ts"], notes: "Bounded." },
  coding_execution_plan: { summary: "Update the helper.", filesExpectedToChange: ["src/claims/submit.ts"], steps: ["Update the helper"], risks: "", validationPlan: "npm test" },
  coding_change_request: { summary: "Set the reference.", operations: [{ action: "WRITE_FILE", path: "src/claims/submit.ts", content: "export const claim = \"reference\"\n" }], commands: [], escalation: null, completionProposal: "COMPLETED" },
  coding_self_review: { summary: "One small change.", potentialDefects: [], missingAcceptance: [], unnecessaryChanges: [], architectureDeviations: [], securityConcerns: [], missingTests: [] },
  coding_completion: { proposal: "COMPLETED", rationale: "The checks decide." },
} as Record<string, unknown>;

/** A scripted Coding Agent. `onCall` sees each request's schema name. */
export function scriptedProvider(onCall?: (schema: string) => void): AIProvider {
  return {
    async generate(request) {
      onCall?.(request.schemaName);
      const data = answers[request.schemaName];
      if (!data) throw new Error(`No mock for ${request.schemaName}`);
      return { data: data as never, usage: { inputTokens: 1, outputTokens: 1 }, model: "mock" };
    },
  };
}

const repos: string[] = [];
const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apf-ra-worktrees-"));
const saved = { root: process.env.PRODUCT_REPOSITORY_ROOT, worktrees: process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT };

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

/** A product with one LOW (or MEDIUM) risk task waiting for approval, in a fresh repository, with no behavioural criteria. */
export async function readyTask(risk: "LOW" | "MEDIUM" = "LOW") {
  process.env.PRODUCT_REPOSITORY_ROOT = makeRepo();
  process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = worktreeRoot;
  const ready = await readyCodingProduct({ taskStatus: "PROPOSED", mode: "SUPERVISED", risk });
  await db.acceptanceCriterion.deleteMany({ where: { workItemId: ready.task.workItemId ?? "" } });
  const planId = (await db.implementationTask.findUniqueOrThrow({ where: { id: ready.task.id } })).implementationPlanId;
  return { productId: ready.product.id, taskId: ready.task.id, planId };
}

/** Registers the environment every run test needs: the signing key, no container sandbox, a scripted agent, and cleanup. */
export function installRunHarness() {
  beforeEach(() => {
    vi.stubEnv("EXTERNAL_REVIEW_APPROVAL_KEY", KEY);
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("APF_CONTAINER_VERIFICATION_READY", "0");
    vi.stubEnv("OPERATOR_CONFIRMATION", "on");
    setAIProviderForTests(scriptedProvider());
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
}
