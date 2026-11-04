import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * Golden path: one real task, verified end to end, with nothing clicked and nothing tolerated.
 *
 * The planning integration test accepts a failure of the execution stage, because that stage needs real Docker and
 * downloaded dependencies. That is the gap this test closes: it runs the production `startVerification` path against a
 * real product snapshot, in the real sandbox, and fails on the first thing that breaks.
 *
 * Opt in with APF_GOLDEN_PATH_REPO (a product repository on this machine) and APF_GOLDEN_PATH_COMMIT (the approved commit).
 * It also needs Docker, network access for the lockfile's packages, and VERIFICATION_DATABASE_ADMIN_URL. It uses a database
 * of its own that is dropped afterwards, and never opens the builder database. Run it with `npm run test:golden`.
 */

const ADMIN_URL = process.env.VERIFICATION_DATABASE_ADMIN_URL?.trim() ?? "";
const REPO = process.env.APF_GOLDEN_PATH_REPO?.trim() ?? "";
const COMMIT = process.env.APF_GOLDEN_PATH_COMMIT?.trim() ?? "";
const RUN = ADMIN_URL.length > 0 && REPO.length > 0 && /^[a-f0-9]{7,40}$/.test(COMMIT);
const DB_NAME = `apf_it_${crypto.randomBytes(6).toString("hex")}`;

function withDatabase(base: string, name: string) {
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

const original = {
  databaseUrl: process.env.DATABASE_URL,
  provider: process.env.AI_PROVIDER,
  model: process.env.AI_MODEL,
  key: process.env.OPENAI_API_KEY,
  worktrees: process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT,
  repositoryRoot: process.env.PRODUCT_REPOSITORY_ROOT,
  reviewKey: process.env.EXTERNAL_REVIEW_APPROVAL_KEY,
  containers: process.env.APF_CONTAINER_VERIFICATION_READY,
};

if (RUN) {
  if (!/^apf_it_[a-f0-9]{12}$/.test(DB_NAME)) throw new Error("The golden-path database name is not an isolated test name.");
  process.env.DATABASE_URL = withDatabase(ADMIN_URL, DB_NAME);
}

type Db = typeof import("@/lib/db").db;
let db: Db;
let startVerification: typeof import("@/modules/verification/service").startVerification;
let completedTaskIn: typeof import("@/modules/verification/completed-task.test-support").completedTaskIn;
let signFixtureRuntimeReview: typeof import("@/modules/verification/completed-task.test-support").signFixtureRuntimeReview;
let readyCodingProduct: typeof import("@/modules/coding/ready-product.test-support").readyCodingProduct;
let coding: typeof import("@/modules/coding/service");
let advance: typeof import("@/modules/coding/auto-advance");
let setAIProviderForTests: typeof import("@/modules/ai/provider").setAIProviderForTests;
type AIProvider = import("@/modules/ai/provider").AIProvider;

let admin: pg.Client | null = null;
let databaseCreated = false;
const tempDirectories: string[] = [];

/** The model is not what this test is about, so every request gets the plain answer an infrastructure task would produce. */
const ANSWERS: Record<string, unknown> = {
  verification_conditions: { summary: "No behavioural conditions: this task sets up the project.", conditions: [] },
  verification_plan: {
    summary: "Verify that the project installs, its schema is valid and it builds.",
    existingTestNotes: "",
    untestedAreas: [],
    authentication: { required: false, signupPath: "", loginPath: "", accountKeys: [] },
    fixtureSteps: [],
  },
  verification_test_cases: { testCases: [] },
  verification_coverage: { mappings: [] },
  verification_interpretation: { summary: "The required checks ran.", concerns: [] },
  verification_defects: { defects: [] },
  verification_summary: { proposedVerdict: "PASS", rationale: "Golden-path stub." },
};

function stubProvider() {
  const requests: string[] = [];
  return {
    requests,
    async generate(request: { schemaName: string }) {
      requests.push(request.schemaName);
      const data = ANSWERS[request.schemaName];
      if (data === undefined) throw new Error(`The golden-path stub has no answer for ${request.schemaName}.`);
      return { data, usage: { inputTokens: 0, outputTokens: 0 }, model: "stub", provider: "stub" };
    },
  };
}

function git(dir: string, args: string[]) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", ...args], { cwd: dir, encoding: "utf8" });
}

/** A private copy of the product at the approved commit, so the real repository is never touched. */
function snapshotOfProduct() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-golden-"));
  tempDirectories.push(dir);
  execFileSync("git", ["clone", "-q", "--no-local", REPO, dir], { stdio: "pipe" });
  // A branch at the approved commit, not a detached head: the framework refuses a repository without a branch.
  git(dir, ["checkout", "-q", "-B", "main", COMMIT]);
  return dir;
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeAll(async () => {
  if (!RUN) return;
  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${DB_NAME}"`);
  databaseCreated = true;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: withDatabase(ADMIN_URL, DB_NAME) }, stdio: "pipe" });
  db = (await import("@/lib/db")).db;
  ({ startVerification } = await import("@/modules/verification/service"));
  ({ completedTaskIn, signFixtureRuntimeReview } = await import("@/modules/verification/completed-task.test-support"));
  ({ readyCodingProduct } = await import("@/modules/coding/ready-product.test-support"));
  coding = await import("@/modules/coding/service");
  advance = await import("@/modules/coding/auto-advance");
  ({ setAIProviderForTests } = await import("@/modules/ai/provider"));
}, 300_000);

afterAll(async () => {
  if (!RUN) return;
  try {
    setAIProviderForTests?.(null);
    await db?.$disconnect();
  } finally {
    if (admin) {
      if (databaseCreated) await admin.query(`DROP DATABASE "${DB_NAME}" WITH (FORCE)`);
      await admin.end();
    }
    for (const dir of tempDirectories) fs.rmSync(dir, { recursive: true, force: true });
    restore("DATABASE_URL", original.databaseUrl);
    restore("AI_PROVIDER", original.provider);
    restore("AI_MODEL", original.model);
    restore("OPENAI_API_KEY", original.key);
    restore("PRODUCT_REPOSITORY_WORKTREE_ROOT", original.worktrees);
    restore("PRODUCT_REPOSITORY_ROOT", original.repositoryRoot);
    restore("EXTERNAL_REVIEW_APPROVAL_KEY", original.reviewKey);
    restore("APF_CONTAINER_VERIFICATION_READY", original.containers);
  }
}, 120_000);

/** Verifies the product in `repo` as a completed, code-approved task and returns what the framework recorded. */
async function verifyProductIn(repo: string) {
    process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "apf-golden-worktrees-"));
    tempDirectories.push(process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT);
    process.env.APF_CONTAINER_VERIFICATION_READY = "1";
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gpt-4.1-mini";
    process.env.OPENAI_API_KEY = "test-key";

    const setup = await completedTaskIn(repo, { build: true, testApplicability: "NOT_APPLICABLE" });
    // An infrastructure task has no behavioural criteria, and its plan has the setup and checks the real plan had.
    if (setup.task.workItemId) await db.acceptanceCriterion.deleteMany({ where: { workItemId: setup.task.workItemId } });
    const workspace = await db.repositoryWorkspace.findFirstOrThrow({ where: { productId: setup.product.id, implementationTaskId: setup.task.id } });
    await db.codingExecutionPlan.updateMany({
      where: { workspaceId: workspace.id },
      data: {
        filesExpectedToChange: ["package.json", "prisma/schema.prisma"],
        setupCommands: ["npm install", "npx prisma generate"],
        validationCommands: [
          { command: "npx prisma validate", kind: "VALIDATION", applicability: "REQUIRED", reason: "The schema must be valid." },
          { command: "npm run build", kind: "VALIDATION", applicability: "REQUIRED", reason: "The project must build." },
          { command: "npm test", kind: "VALIDATION", applicability: "NOT_APPLICABLE", reason: "The project has no tests yet." },
        ],
      },
    });
    // The coding run recorded a passing result for each required check; verification is only offered after that.
    await db.codingEvidence.create({
      data: { workspaceId: workspace.id, implementationTaskId: setup.task.id, type: "TEST_RESULT", source: "COMMAND_RUNNER", description: "schema validation", result: "PASS", command: "npx prisma validate", exitCode: 0 },
    });
    await signFixtureRuntimeReview(setup.product.id, setup.task.id);
    const provider = stubProvider();
    setAIProviderForTests(provider as unknown as AIProvider);

    const session = await startVerification(setup.product.id, setup.task.id);
    if (!session) throw new Error("startVerification returned no session.");

    const executions = await db.verificationExecution.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } });
    const report = executions.map((item) => `${item.command}: ${item.status}${item.status === "PASSED" || item.status === "NOT_RUN" ? "" : ` (${item.outputSummary.slice(0, 200).replace(/\s+/g, " ")})`}`);
    const row = await db.verificationSession.findUniqueOrThrow({ where: { id: session.id } });
    const summary = `status ${row.status}, verdict ${row.overallVerdict ?? "none"}, failure ${row.failureClass || "none"}, reason: ${row.verdictReason}\n${report.join("\n")}\nAI calls: ${provider.requests.join(" -> ")}`;

    return { session, executions, row, summary, provider };
}

describe.skipIf(!RUN)("golden path: a real product, verified in the real sandbox", () => {
  it("sets up, validates and builds the product and reaches a verdict", async () => {
    const { executions, row, summary } = await verifyProductIn(snapshotOfProduct());

    expect(executions.some((item) => item.command === "npm run build" && item.status === "PASSED"), summary).toBe(true);
    expect(executions.some((item) => item.command === "npx prisma validate" && item.status === "PASSED"), summary).toBe(true);
    expect(row.failureClass, summary).toBe("");
    expect(["PASS", "PASS_WITH_CONCERNS"], summary).toContain(row.overallVerdict);
  }, 900_000);

  it("reports a genuine product failure as a product failure, and refuses a retry", async () => {
    const repo = snapshotOfProduct();
    // A committed change that really breaks the product: the page no longer compiles.
    fs.writeFileSync(path.join(repo, "src/app/page.tsx"), "export default function Home() { return <main>broken\n");
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-q", "-m", "Break the home page"]);
    const { executions, row, summary } = await verifyProductIn(repo);

    expect(executions.some((item) => item.command === "npm run build" && item.status === "FAILED"), summary).toBe(true);
    expect(row.status, summary).toBe("FAILED");
    expect(row.overallVerdict, summary).toBe("FAIL");
    expect(row.failureClass, summary).toBe("PRODUCT_VERIFICATION_FAILED");
    // The sandbox did not cause this, so it must not be offered as a retry.
    const { failedOnlyForEnvironment } = await import("@/modules/verification/service");
    expect(failedOnlyForEnvironment(executions), summary).toBe(false);
  }, 900_000);

  it("goes from an approved task through coding, review and commit to a verified result", async () => {
    const repo = snapshotOfProduct();
    process.env.PRODUCT_REPOSITORY_ROOT = repo;
    process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "apf-golden-worktrees-"));
    tempDirectories.push(process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT);
    process.env.APF_CONTAINER_VERIFICATION_READY = "1";
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gpt-4.1-mini";
    process.env.OPENAI_API_KEY = "test-key";

    // Every approved record that must exist before the Coding Agent may start, with one task waiting for approval.
    const setup = await readyCodingProduct({ taskStatus: "PROPOSED", mode: "SUPERVISED", risk: "MEDIUM", allowed: ["src/app/**", "package.json"], restricted: ["prisma/**"] });
    await db.acceptanceCriterion.deleteMany({ where: { workItemId: setup.task.workItemId ?? "" } });

    const original = fs.readFileSync(path.join(repo, "src/app/page.tsx"), "utf8");
    const changed = `${original.trimEnd()}\n// Golden path: a small, safe change made by the stubbed Coding Agent.\n`;
    const answers: Record<string, unknown> = {
      coding_repository_analysis: { summary: "The home page is the relevant file.", relevantFiles: ["src/app/page.tsx"], notes: "Bounded to the app folder." },
      coding_execution_plan: { summary: "Add a comment to the home page.", filesExpectedToChange: ["src/app/page.tsx", "package.json"], steps: ["Install the dependencies with npm install", "Generate the database client with npx prisma generate", "Edit the home page"], risks: "", validationPlan: "Run npx prisma validate, then npm run build." },
      coding_change_request: { summary: "Add the comment.", operations: [{ action: "WRITE_FILE", path: "src/app/page.tsx", content: changed }], commands: [], escalation: null, completionProposal: "COMPLETED" },
      coding_self_review: { summary: "The change is one comment.", potentialDefects: [], missingAcceptance: [], unnecessaryChanges: [], architectureDeviations: [], securityConcerns: [], missingTests: [] },
      coding_completion: { proposal: "COMPLETED", rationale: "The deterministic checks decide." },
      ...ANSWERS,
    };
    const requests: string[] = [];
    setAIProviderForTests({
      async generate(request: { schemaName: string }) {
        requests.push(request.schemaName);
        const data = answers[request.schemaName];
        if (data === undefined) throw new Error(`The golden-path stub has no answer for ${request.schemaName}.`);
        return { data: data as never, usage: { inputTokens: 1, outputTokens: 1 }, model: "stub" };
      },
    } as unknown as AIProvider);

    const human = { actorName: "Local user" };
    await coding.approveImplementationTask(setup.product.id, setup.task.id, human);
    // The step after each decision runs by itself, exactly as it does after the button is pressed.
    expect(await advance.afterTaskApproved(setup.product.id, setup.task.id), "drafting the plan after approving the task").toEqual({ ok: true });
    const workspace = await db.repositoryWorkspace.findFirstOrThrow({ where: { productId: setup.product.id, implementationTaskId: setup.task.id } });
    await coding.approveExecutionPlan(setup.product.id, workspace.id, human);
    expect(await advance.afterPlanApproved(setup.product.id, workspace.id), "coding after approving the plan").toEqual({ ok: true });
    const afterCoding = await db.repositoryWorkspace.findUniqueOrThrow({ where: { id: workspace.id } });
    const evidence = await db.codingEvidence.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "asc" } });
    const detail = evidence.map((item) => `${item.command || item.type}: ${item.result} ${String(item.description).slice(0, 240).replace(/\s+/g, " ")} ${String(item.output).slice(-300).replace(/\s+/g, " ")}`).join("\n");
    expect(afterCoding.status, `coding ended as ${afterCoding.status}\n${detail}\nAI calls: ${requests.join(" -> ")}\n${JSON.stringify(afterCoding).slice(0, 600)}`).toBe("READY_FOR_REVIEW");
    await coding.approveCodeChanges(setup.product.id, workspace.id, human);
    const snapshot = await advance.afterCodeApproved(setup.product.id, workspace.id);
    expect(snapshot.ok, "recording the snapshot after approving the code").toBe(true);
    const committed = await db.repositoryWorkspace.findUniqueOrThrow({ where: { id: workspace.id } });
    expect(committed.status).toBe("COMPLETED");
    expect(committed.headCommit).not.toBe(committed.baseCommit);

    try {
      await signFixtureRuntimeReview(setup.product.id, setup.task.id);
    } catch (error) {
      const task = await db.implementationTask.findUniqueOrThrow({ where: { id: setup.task.id } });
      const approvals = await db.codeChangeApproval.findMany({ where: { workspaceId: workspace.id }, include: { approval: true } });
      const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: committed.workspacePath, encoding: "utf8" });
      throw new Error(`Runtime review could not be prepared: ${error instanceof Error ? error.message : error}\ntask ${task.status}; workspace ${committed.status}; stale ${committed.executionContractStale}\napprovals ${JSON.stringify(approvals.map((item) => ({ stale: item.stale, base: item.baseCommit.slice(0, 7), head: item.headCommit.slice(0, 7), by: item.approval.approvedBy, resolved: Boolean(item.approval.resolvedAt) })))}\nworkspace head ${committed.headCommit.slice(0, 7)}\ngit status: ${status.slice(0, 300)}`);
    }
    const session = await startVerification(setup.product.id, setup.task.id);
    if (!session) throw new Error("startVerification returned no session.");
    const row = await db.verificationSession.findUniqueOrThrow({ where: { id: session.id } });
    const executions = await db.verificationExecution.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } });
    const summary = `status ${row.status}, verdict ${row.overallVerdict ?? "none"}, reason: ${row.verdictReason}\n${executions.map((item) => `${item.command}: ${item.status}`).join("\n")}\nAI calls: ${requests.join(" -> ")}`;
    expect(row.failureClass, summary).toBe("");
    expect(["PASS", "PASS_WITH_CONCERNS"], summary).toContain(row.overallVerdict);
    expect(executions.some((item) => item.command === "npm run build" && item.status === "PASSED"), summary).toBe(true);
  }, 1_800_000);
});
