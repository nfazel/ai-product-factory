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
    restore("EXTERNAL_REVIEW_APPROVAL_KEY", original.reviewKey);
    restore("APF_CONTAINER_VERIFICATION_READY", original.containers);
  }
}, 120_000);

describe.skipIf(!RUN)("golden path: a real product, verified in the real sandbox", () => {
  it("sets up, validates and builds the product and reaches a verdict", async () => {
    process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "apf-golden-worktrees-"));
    tempDirectories.push(process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT);
    process.env.APF_CONTAINER_VERIFICATION_READY = "1";
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gpt-4.1-mini";
    process.env.OPENAI_API_KEY = "test-key";

    const setup = await completedTaskIn(snapshotOfProduct(), { build: true, testApplicability: "NOT_APPLICABLE" });
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

    expect(executions.some((item) => item.command === "npm run build" && item.status === "PASSED"), summary).toBe(true);
    expect(executions.some((item) => item.command === "npx prisma validate" && item.status === "PASSED"), summary).toBe(true);
    expect(row.failureClass, summary).toBe("");
    expect(["PASS", "PASS_WITH_CONCERNS"], summary).toContain(row.overallVerdict);
  }, 900_000);
});
