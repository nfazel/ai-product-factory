import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/*
 * Planning integration test. It drives the production `startVerification` path, which calls the real `runPlan`, against
 * an isolated, disposable PostgreSQL database. The AI provider is a stub that returns scripted responses. Everything
 * else is real: the planning validators, the fixture validation, the adapter registry, the test binding, and the
 * database writes.
 *
 * Isolation:
 * - A fresh database named apf_it_<random hex> is created with the dedicated verification admin role, migrated with the
 *   project's own migrations, and dropped (WITH FORCE) afterwards. The name is checked against a strict pattern first.
 * - DATABASE_URL is pointed at that database before the Prisma client is loaded. The builder database is never opened.
 *
 * The Task 4 discovery scenario is the fixture. No production rule below is specific to it.
 *
 * The test is skipped unless VERIFICATION_DATABASE_ADMIN_URL is configured. It never falls back to DATABASE_URL.
 */

const ADMIN_URL = process.env.VERIFICATION_DATABASE_ADMIN_URL?.trim() ?? "";
const RUN = ADMIN_URL.length > 0;
const DB_NAME = `apf_it_${crypto.randomBytes(6).toString("hex")}`;
const BUILDER_DATABASE_NAMES = ["ai_product_factory"];

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
  root: process.env.PRODUCT_REPOSITORY_ROOT,
  worktrees: process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT,
};

// Point the process at the isolated database before any module that loads the Prisma client is imported. Those
// modules are imported dynamically in beforeAll, after this assignment.
if (RUN) {
  if (!/^apf_it_[a-f0-9]{12}$/.test(DB_NAME) || BUILDER_DATABASE_NAMES.includes(DB_NAME)) {
    throw new Error("The integration database name is not an isolated test name, so the test refused to run.");
  }
  process.env.DATABASE_URL = withDatabase(ADMIN_URL, DB_NAME);
}

type Db = typeof import("@/lib/db").db;
let db: Db;
let startVerification: typeof import("@/modules/verification/service").startVerification;
let completedTaskIn: typeof import("@/modules/verification/completed-task.test-support").completedTaskIn;
let setAIProviderForTests: typeof import("@/modules/ai/provider").setAIProviderForTests;
type AIProvider = import("@/modules/ai/provider").AIProvider;

let admin: pg.Client | null = null;
let databaseCreated = false;
const tempDirectories: string[] = [];

// ---------- stubbed AI ----------

type ScriptEntry = unknown | Error;

/**
 * Scripted provider. Each schema name has a queue of responses. The provider returns the next response for that schema
 * and records the call, so a test can count requests exactly.
 */
function scriptedProvider(script: Record<string, ScriptEntry[]>) {
  const queues = new Map(Object.entries(script).map(([key, value]) => [key, [...value]]));
  const requests: { schemaName: string; phase: string }[] = [];
  const provider = {
    requests,
    async generate(request: { schemaName: string; messages: { content: string }[] }) {
      const schemaName = request.schemaName;
      const phase = request.messages.map((item) => item.content).join(" | ");
      requests.push({ schemaName, phase: phase.slice(0, 120) });
      const queue = queues.get(schemaName) ?? [];
      const next = queue.shift();
      if (next === undefined) throw new Error(`No scripted response is left for ${schemaName}.`);
      if (next instanceof Error) throw next;
      return { data: next, usage: { inputTokens: 0, outputTokens: 0 }, model: "stub", provider: "stub" };
    },
  };
  return provider;
}

// ---------- scenario data ----------

const VALID_AUTHENTICATION = {
  required: true,
  signupPath: "/api/auth/signup",
  loginPath: "/api/auth/login",
  accountKeys: ["viewer"],
};

const VALID_FIXTURE_STEPS = [
  {
    account: "viewer",
    method: "POST",
    path: "/api/profile",
    body: "{\"displayName\":\"Verifier\"}",
    purpose: "Create the viewer profile so the feed has a profile to show.",
  },
];

/** A signed-in test with a standalone // verifies: marker, which the validator accepts. */
function discoveryBody(criterionId: string, marker: "line" | "title") {
  const header = marker === "line" ? `// verifies:${criterionId}` : "";
  const title = marker === "line" ? "viewer sees the discovery feed" : `verifies:${criterionId}`;
  return [
    "import test from \"node:test\";",
    "import assert from \"node:assert/strict\";",
    header,
    `test("${title}", async () => {`,
    "  const base = process.env.VERIFICATION_BASE_URL;",
    "  const accounts = JSON.parse(process.env.VERIFICATION_ACCOUNTS);",
    "  const paths = JSON.parse(process.env.VERIFICATION_PATHS);",
    "  const login = await fetch(`${base}${paths.login}`, { method: \"POST\", body: JSON.stringify(accounts[0]) });",
    "  const cookie = login.headers.getSetCookie().join(\"; \");",
    "  const feed = await fetch(`${base}/api/discovery/feed`, { headers: { cookie } });",
    "  assert.equal(feed.status, 200);",
    "  const body = await feed.json();",
    "  assert.ok(Array.isArray(body.profiles));",
    "});",
    "",
  ]
    .filter((line, index) => !(index === 2 && header === ""))
    .join("\n");
}

function httpCase(criterionId: string, body: string, overrides: Record<string, unknown> = {}) {
  return {
    title: "Viewer sees the discovery feed",
    purpose: "Demonstrate the discovery feed criterion through an authenticated request.",
    preconditions: "A viewer account exists with a profile.",
    steps: ["Sign in as the viewer", "Request the discovery feed"],
    expectedResult: "The feed returns a list of profiles.",
    testType: "API",
    priority: "HIGH",
    source: "ACCEPTANCE_CRITERION",
    acceptanceCriterionId: criterionId,
    automated: true,
    adapterId: "http-blackbox",
    targetSurface: "HTTP_ENDPOINT",
    requiredCapabilities: ["http-request", "status-assertion", "body-assertion", "authenticated-session"],
    filePath: "verification/http/discovery.test.mjs",
    body,
    manualReason: "",
    ...overrides,
  };
}

function planResponse(auth = VALID_AUTHENTICATION, steps = VALID_FIXTURE_STEPS) {
  return {
    summary: "Verify the discovery feed through an authenticated request.",
    existingTestNotes: "",
    untestedAreas: [],
    authentication: auth,
    fixtureSteps: steps,
  };
}

const CONDITIONS = { summary: "Conditions come from the approved criteria.", conditions: [] };
const COVERAGE = (criterionId: string) => ({
  mappings: [{ acceptanceCriterionId: criterionId, rationale: "The feed test demonstrates the criterion." }],
});

// ---------- helpers ----------

/** Creates the completed task the planning phase needs, in a temporary repository. */
async function completedTask() {
  return completedTaskIn(makeRepository(), { pass: true, build: false });
}

/**
 * A temporary product snapshot. It has the API routes the discovery criterion needs, written as Next.js route handlers,
 * so the framework discovers them through its own inspector. No route is hard-coded in production code.
 */
const ROUTE_FILES = [
  "src/app/api/auth/signup/route.ts",
  "src/app/api/auth/login/route.ts",
  "src/app/api/profile/route.ts",
  "src/app/api/discovery/feed/route.ts",
  "src/app/api/discovery/action/route.ts",
];

function makeRepository() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-it-repo-"));
  tempDirectories.push(dir);
  for (const file of ROUTE_FILES) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), "export async function GET() { return Response.json({ ok: true }); }\n");
  }
  fs.mkdirSync(path.join(dir, "src/claims"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src/claims/submit.mjs"), "export function submitClaim() { return { reference: \"CLM-1001\" }; }\n");
  fs.writeFileSync(path.join(dir, "src/claims/submit.ts"), "export function submitClaim() { return { reference: \"CLM-1001\" }; }\n");
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "it-product", scripts: { build: "node -e \"process.exit(0)\"", start: "node -e \"process.exit(0)\"", test: "node -e \"process.exit(0)\"" } }),
  );
  const git = (args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", ...args], { cwd: dir, encoding: "utf8" });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["add", "."]);
  git(["commit", "-m", "init"]);
  return dir;
}

function useProvider(provider: ReturnType<typeof scriptedProvider>) {
  process.env.AI_PROVIDER = "openai";
  process.env.AI_MODEL = "gpt-4.1-mini";
  process.env.OPENAI_API_KEY = "test-key";
  setAIProviderForTests(provider as unknown as AIProvider);
}

async function persistedCases(sessionId: string) {
  return db.verificationTestCase.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
}

/** The session a successful startVerification returned. Fails the test clearly if it is missing. */
function requireSession<T extends { id: string } | null>(session: T): NonNullable<T> {
  if (!session) throw new Error("startVerification returned no session.");
  return session as NonNullable<T>;
}

async function reviewedVerdict(sessionId: string) {
  const row = await db.verificationSession.findUnique({ where: { id: sessionId }, select: { overallVerdict: true } });
  return row?.overallVerdict ?? "";
}

async function persistedAuditEvidence(sessionId: string) {
  return db.verificationEvidence.findMany({
    where: { sessionId, type: "STATIC_ANALYSIS", description: { startsWith: "Plan validation" } },
    orderBy: { createdAt: "asc" },
  });
}

// ---------- lifecycle ----------

beforeAll(async () => {
  if (!RUN) return;
  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  // Create only the database this run owns. Its name was verified above.
  await admin.query(`CREATE DATABASE "${DB_NAME}"`);
  databaseCreated = true;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: withDatabase(ADMIN_URL, DB_NAME) },
    stdio: "pipe",
  });
  db = (await import("@/lib/db")).db;
  ({ startVerification } = await import("@/modules/verification/service"));
  ({ completedTaskIn } = await import("@/modules/verification/completed-task.test-support"));
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
    restore("PRODUCT_REPOSITORY_ROOT", original.root);
    restore("PRODUCT_REPOSITORY_WORKTREE_ROOT", original.worktrees);
  }
}, 120_000);

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "apf-it-worktrees-"));
  tempDirectories.push(process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT);
});

describe.skipIf(!RUN)("planning integration (isolated database, production runPlan)", () => {
  it("only ever touches the isolated database", async () => {
    expect(DB_NAME).toMatch(/^apf_it_[a-f0-9]{12}$/);
    expect(process.env.DATABASE_URL).toContain(`/${DB_NAME}`);
    expect(process.env.DATABASE_URL).not.toContain("/ai_product_factory");
    const rows = await db.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int n from information_schema.tables where table_schema='public'`);
    expect(rows[0]?.n).toBeGreaterThan(50);
  });

  it("scenario 1: an invalid marker is corrected once, validated, and persisted as an automated HTTP test", async () => {
    const task = await completedTask();
    const invalid = discoveryBody(task.criterion.id, "title");
    const corrected = discoveryBody(task.criterion.id, "line");
    // Call order in runPlan: conditions, plan, test cases, coverage. The correction re-asks plan, then test cases.
    const provider = scriptedProvider({
      verification_conditions: [CONDITIONS],
      verification_plan: [planResponse(), planResponse()],
      verification_test_cases: [{ testCases: [httpCase(task.criterion.id, invalid)] }, { testCases: [httpCase(task.criterion.id, corrected)] }],
      verification_coverage: [COVERAGE(task.criterion.id)],
      // The execute phase's analysis and summary. Their content does not decide the planning outcome.
      verification_interpretation: [{ summary: "AI analysis only.", concerns: [] }],
      verification_defects: [{ defects: [] }],
      verification_summary: [{ proposedVerdict: "INCONCLUSIVE", rationale: "Planning integration test." }],
    });
    useProvider(provider);

    const session = requireSession(await startVerification(task.product.id, task.task.id));
    console.log("AI calls:", provider.requests.map((item) => item.schemaName).join(" -> "));
    const cases = await persistedCases(session.id);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      automated: true,
      adapterId: "http-blackbox",
      acceptanceCriterionId: task.criterion.id,
      manualReason: "",
    });
    expect(cases[0]!.body).toContain(`// verifies:${task.criterion.id}`);
    expect(cases[0]!.body).not.toContain(`test("verifies:${task.criterion.id}"`);

    const audit = await persistedAuditEvidence(session.id);
    expect(audit.map((item) => item.description)).toEqual([
      expect.stringContaining("Plan validation INITIAL (correction requests: 1). Errors: MARKER_MISSING."),
      expect.stringContaining("Plan validation CORRECTED_PASSED (correction requests: 1). No validation errors."),
    ]);
  }, 300_000);

  it("scenario 2: a correction that still fails validation leaves the test manual, with one correction and no automated record", async () => {
    const task = await completedTask();
    const invalid = discoveryBody(task.criterion.id, "title");
    const provider = scriptedProvider({
      verification_conditions: [CONDITIONS],
      verification_plan: [planResponse(), planResponse()],
      verification_test_cases: [{ testCases: [httpCase(task.criterion.id, invalid)] }, { testCases: [httpCase(task.criterion.id, invalid)] }],
      verification_coverage: [COVERAGE(task.criterion.id)],
      verification_interpretation: [{ summary: "AI analysis only.", concerns: [] }],
      verification_defects: [{ defects: [] }],
      verification_summary: [{ proposedVerdict: "INCONCLUSIVE", rationale: "Planning integration test." }],
    });
    useProvider(provider);
    const session = requireSession(await startVerification(task.product.id, task.task.id));

    const cases = await persistedCases(session.id);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ automated: false, adapterId: "" });
    expect(cases[0]!.manualReason).toMatch(/marker|does not carry/i);
    expect(provider.requests.filter((item) => item.schemaName === "verification_test_cases")).toHaveLength(2);
    expect(await reviewedVerdict(session.id)).not.toBe("PASS");
    const audit = await persistedAuditEvidence(session.id);
    expect(audit.map((item) => item.description).join(" ")).toContain("CORRECTED_FAILED");
  }, 300_000);

  it("scenario 3: a failing AI correction call leaves the test manual and does not produce an automated record", async () => {
    const task = await completedTask();
    const invalid = discoveryBody(task.criterion.id, "title");
    const provider = scriptedProvider({
      verification_conditions: [CONDITIONS],
      verification_plan: [planResponse(), new Error("model unavailable")],
      verification_test_cases: [{ testCases: [httpCase(task.criterion.id, invalid)] }],
      verification_coverage: [COVERAGE(task.criterion.id)],
    });
    useProvider(provider);
    const session = await startVerification(task.product.id, task.task.id).catch((error: unknown) => error);

    // A provider failure is a failed planning run. It must not become an automated test or a PASS.
    expect(session).toBeInstanceOf(Error);
    const failed = await db.verificationSession.findFirst({ where: { implementationTaskId: task.task.id }, orderBy: { createdAt: "desc" } });
    expect(failed?.overallVerdict).not.toBe("PASS");
    const cases = await db.verificationTestCase.findMany({ where: { acceptanceCriterionId: task.criterion.id } });
    expect(cases.every((item) => !item.automated)).toBe(true);
    expect(cases.some((item) => item.adapterId === "http-blackbox")).toBe(false);
    expect(provider.requests.filter((item) => item.schemaName === "verification_plan")).toHaveLength(2);
  }, 300_000);

  it("scenario 4: a malformed correction response is refused and leaves no automated test", async () => {
    const task = await completedTask();
    const invalid = discoveryBody(task.criterion.id, "title");
    const provider = scriptedProvider({
      verification_conditions: [CONDITIONS],
      verification_plan: [planResponse(), { not: "a plan" }],
      verification_test_cases: [{ testCases: [httpCase(task.criterion.id, invalid)] }],
      verification_coverage: [COVERAGE(task.criterion.id)],
    });
    useProvider(provider);
    const session = await startVerification(task.product.id, task.task.id).catch((error: unknown) => error);

    expect(session).toBeInstanceOf(Error);
    const failed = await db.verificationSession.findFirst({ where: { implementationTaskId: task.task.id }, orderBy: { createdAt: "desc" } });
    expect(failed?.overallVerdict).not.toBe("PASS");
    const cases = await db.verificationTestCase.findMany({ where: { acceptanceCriterionId: task.criterion.id } });
    expect(cases.every((item) => !item.automated)).toBe(true);
    expect(provider.requests.filter((item) => item.schemaName === "verification_plan")).toHaveLength(2);
  }, 300_000);

  it("scenario 5: when the HTTP adapter is unavailable, the test stays manual and no correction is requested", async () => {
    const task = await completedTask();
    const invalid = discoveryBody(task.criterion.id, "title");
    const provider = scriptedProvider({
      verification_conditions: [CONDITIONS],
      verification_plan: [planResponse()],
      verification_test_cases: [{ testCases: [httpCase(task.criterion.id, invalid)] }],
      verification_coverage: [COVERAGE(task.criterion.id)],
      verification_interpretation: [{ summary: "AI analysis only.", concerns: [] }],
      verification_defects: [{ defects: [] }],
      verification_summary: [{ proposedVerdict: "INCONCLUSIVE", rationale: "Planning integration test." }],
    });
    useProvider(provider);
    // Remove the verification database configuration for this call only, so http-blackbox is UNAVAILABLE.
    const saved = process.env.VERIFICATION_DATABASE_ADMIN_URL;
    delete process.env.VERIFICATION_DATABASE_ADMIN_URL;
    let session;
    try {
      session = requireSession(await startVerification(task.product.id, task.task.id));
    } finally {
      process.env.VERIFICATION_DATABASE_ADMIN_URL = saved;
    }

    const cases = await persistedCases(session.id);
    expect(cases[0]).toMatchObject({ automated: false, adapterId: "" });
    expect(cases[0]!.manualReason).toMatch(/not available|verification database/i);
    // Unavailability is terminal: correcting the wording cannot change it, so no correction is requested.
    expect(provider.requests.filter((item) => item.schemaName === "verification_test_cases")).toHaveLength(1);
    expect(await reviewedVerdict(session.id)).not.toBe("PASS");
  }, 300_000);
  it("scenario 6: a valid HTTP black-box test without product imports is persisted as automated", async () => {
    const task = await completedTask();
    const body = discoveryBody(task.criterion.id, "line");
    expect(body).toContain("fetch(");
    expect(body).not.toMatch(/from ["']\.\./);
    const provider = scriptedProvider({
      verification_conditions: [CONDITIONS],
      verification_plan: [planResponse()],
      verification_test_cases: [{ testCases: [httpCase(task.criterion.id, body)] }],
      verification_coverage: [COVERAGE(task.criterion.id)],
      verification_interpretation: [{ summary: "AI analysis only.", concerns: [] }],
      verification_defects: [{ defects: [] }],
      verification_summary: [{ proposedVerdict: "INCONCLUSIVE", rationale: "Planning integration test." }],
    });
    useProvider(provider);
    const session = requireSession(await startVerification(task.product.id, task.task.id));
    const cases = await persistedCases(session.id);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      automated: true,
      adapterId: "http-blackbox",
      acceptanceCriterionId: task.criterion.id,
      manualReason: "",
    });
    expect(cases[0]!.body).not.toMatch(/from ["']\.\.\//);
    const audit = await persistedAuditEvidence(session.id);
    expect(audit.some((item) => item.description.includes("INITIAL") && item.description.includes("No validation errors"))).toBe(true);
    expect(provider.requests.filter((item) => item.schemaName === "verification_test_cases")).toHaveLength(1);
  }, 300_000);

  it("scenario 7: incomplete authenticated HTTP is refused, corrected once, revalidated, and persisted as automated", async () => {
    const task = await completedTask();
    const incomplete = [
      "import test from \"node:test\";",
      "import assert from \"node:assert/strict\";",
      `// verifies:${task.criterion.id}`,
      "test(\"discovery feed\", async () => {",
      "  const base = process.env.VERIFICATION_BASE_URL;",
      "  const response = await fetch(`${base}/api/discovery/feed`);",
      "  assert.ok(response.status === 200 || response.status === 401);",
      "});",
      "",
    ].join("\n");
    const corrected = discoveryBody(task.criterion.id, "line");
    const provider = scriptedProvider({
      verification_conditions: [CONDITIONS],
      verification_plan: [planResponse(), planResponse()],
      verification_test_cases: [
        { testCases: [httpCase(task.criterion.id, incomplete)] },
        { testCases: [httpCase(task.criterion.id, corrected)] },
      ],
      verification_coverage: [COVERAGE(task.criterion.id)],
      verification_interpretation: [{ summary: "AI analysis only.", concerns: [] }],
      verification_defects: [{ defects: [] }],
      verification_summary: [{ proposedVerdict: "INCONCLUSIVE", rationale: "Planning integration test." }],
    });
    useProvider(provider);

    const session = requireSession(await startVerification(task.product.id, task.task.id));
    const cases = await persistedCases(session.id);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      automated: true,
      adapterId: "http-blackbox",
      acceptanceCriterionId: task.criterion.id,
      manualReason: "",
    });
    expect(cases[0]!.body).toContain("VERIFICATION_ACCOUNTS");
    expect(cases[0]!.body).toContain("VERIFICATION_PATHS");
    expect(cases[0]!.body).toContain("getSetCookie");
    expect(cases[0]!.body).toMatch(/headers:\s*\{\s*cookie\s*\}/);
    expect(provider.requests.filter((item) => item.schemaName === "verification_test_cases")).toHaveLength(2);

    const audit = await persistedAuditEvidence(session.id);
    expect(audit.map((item) => item.description)).toEqual([
      expect.stringMatching(/Plan validation INITIAL \(correction requests: 1\)\. Errors:.*AUTH_ACCOUNTS_NOT_READ/),
      expect.stringContaining("Plan validation CORRECTED_PASSED (correction requests: 1). No validation errors."),
    ]);
  }, 300_000);

  it("scenario 8: an unknown literal account key stays manual and never reaches HTTP execution", async () => {
    const task = await completedTask();
    const authentication = { ...VALID_AUTHENTICATION, accountKeys: ["seeker", "target"] };
    const steps = [{ ...VALID_FIXTURE_STEPS[0]!, account: "seeker" }];
    const unknownAccount = discoveryBody(task.criterion.id, "line").replace(
      "JSON.stringify(accounts[0])",
      'JSON.stringify(accounts.find((item) => item.key === "viewer"))',
    );
    const provider = scriptedProvider({
      verification_conditions: [CONDITIONS],
      verification_plan: [planResponse(authentication, steps), planResponse(authentication, steps)],
      verification_test_cases: [
        { testCases: [httpCase(task.criterion.id, unknownAccount, { requiredCapabilities: ["http-request", "status-assertion", "body-assertion"] })] },
        { testCases: [httpCase(task.criterion.id, unknownAccount, { requiredCapabilities: ["http-request", "status-assertion", "body-assertion"] })] },
      ],
      verification_coverage: [COVERAGE(task.criterion.id)],
      verification_interpretation: [{ summary: "AI analysis only.", concerns: [] }],
      verification_defects: [{ defects: [] }],
      verification_summary: [{ proposedVerdict: "INCONCLUSIVE", rationale: "Unknown account regression." }],
    });
    useProvider(provider);

    const { setHttpAcceptanceOverridesForTests } = await import("@/modules/verification/http/acceptance");
    let httpTestCalls = 0;
    setHttpAcceptanceOverridesForTests(() => ({
      writeTest: async () => {
        httpTestCalls += 1;
        return { allowed: true, reason: "" };
      },
      runTest: async () => {
        httpTestCalls += 1;
        return { allowed: true, reason: "", exitCode: 0, output: "", timedOut: false };
      },
    }));
    let session;
    try {
      session = requireSession(await startVerification(task.product.id, task.task.id));
    } finally {
      setHttpAcceptanceOverridesForTests(null);
    }

    const cases = await persistedCases(session.id);
    expect(session.fixturePlan).toMatchObject({ authentication: { accountKeys: ["seeker", "target"] } });
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ automated: false, adapterId: "" });
    expect(cases[0]!.manualReason).toContain('account key "viewer"');
    expect(cases[0]!.manualReason).toContain("seeker, target");
    expect(httpTestCalls).toBe(0);
    expect(provider.requests.filter((item) => item.schemaName === "verification_plan")).toHaveLength(2);
    expect(provider.requests.filter((item) => item.schemaName === "verification_test_cases")).toHaveLength(2);
    const audit = await persistedAuditEvidence(session.id);
    expect(audit[0]?.description).toContain("AUTH_ACCOUNT_KEY_UNKNOWN");
    expect(audit.at(-1)?.description).toContain("CORRECTED_FAILED");
    expect(await reviewedVerdict(session.id)).toBe("INCONCLUSIVE");
  }, 300_000);

});


