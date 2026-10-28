import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  __testing,
  HTTP_STAGE,
  redact,
  runHttpAcceptance,
  type HttpAcceptanceCase,
  type HttpAcceptanceDeps,
  type HttpAcceptanceInput,
} from "@/modules/verification/http/acceptance";
import { EMPTY_FIXTURE_PLAN, type FixturePlan } from "@/modules/verification/http/fixtures";
import { classifyTestRun } from "@/modules/verification/test-outcome";

const ADMIN_URL = "postgresql://verifier:admin-secret-value@127.0.0.1:5433/postgres";
const DATABASE_URL = "postgresql://verifier:db-secret-value@127.0.0.1:5433/vf_0123456789abcdef01234567";
const PASSING_OUTPUT = "# tests 1\n# pass 1\n# fail 0\n";

const CASE: HttpAcceptanceCase = {
  testCaseId: "case-1",
  acceptanceCriterionId: "ac-1",
  filePath: "verification/http/feed.test.mjs",
  body: "// verifies:ac-1\nconst base = process.env.VERIFICATION_BASE_URL;\n",
};

const AUTHENTICATED_PLAN: FixturePlan = {
  authentication: {
    required: true,
    signupPath: "/api/auth/signup",
    loginPath: "/api/auth/login",
    accountKeys: ["viewer"],
  },
  steps: [],
};

function input(overrides: Partial<HttpAcceptanceInput> = {}): HttpAcceptanceInput {
  return {
    attemptId: "0123456789abcdef01234567",
    workspacePath: "/nonexistent/approved-worktree",
    baseCommit: "abc123",
    cases: [CASE],
    fixturePlan: EMPTY_FIXTURE_PLAN,
    forbiddenDatabaseNames: ["ai_product_factory"],
    ...overrides,
  };
}

/** Fakes for every outside effect. Each test overrides only what it needs to show. */
function fakes(overrides: Partial<HttpAcceptanceDeps> = {}) {
  const stop = vi.fn(async () => ({ stopped: true, forced: false }));
  const drop = vi.fn(async () => ({ dropped: true, reason: "" }));
  const removed: string[] = [];
  const phases: string[][] = [];
  const startEnvironments: Record<string, string>[] = [];
  const testEnvironments: Record<string, string>[] = [];
  const provision = vi.fn(async () => ({ name: "vf_0123456789abcdef01234567", url: DATABASE_URL, drop }));
  const deps: HttpAcceptanceDeps = {
    env: { VERIFICATION_DATABASE_ADMIN_URL: ADMIN_URL },
    assertSnapshot: vi.fn(async () => undefined),
    readManifest: () => ({
      packageJson: { scripts: { build: "node build.js", start: "node server.js" }, dependencies: {} },
      hasLockfile: true,
      hasPrismaSchema: false,
    }),
    allocatePort: async () => 45123,
    provisionDatabase: provision,
    runPhase: vi.fn(async ({ argv }) => {
      phases.push(argv);
      return { ok: true, timedOut: false, code: 0, output: "" };
    }),
    startApplication: vi.fn(async ({ env, port }) => {
      startEnvironments.push(env);
      return {
        ok: true as const,
        app: { port, pid: 0, baseUrl: `http://127.0.0.1:${port}`, output: () => "", stop },
      };
    }),
    makeRuntimeDir: () => fs.mkdtempSync(path.join(os.tmpdir(), "apf-acceptance-test-")),
    removeRuntimeDir: (directory) => {
      removed.push(directory);
      fs.rmSync(directory, { recursive: true, force: true });
    },
    writeTest: vi.fn(async () => ({ allowed: true, reason: "" })),
    runTest: vi.fn(async ({ environment }) => {
      testEnvironments.push(environment);
      return { allowed: true, reason: "", exitCode: 0, output: PASSING_OUTPUT, timedOut: false };
    }),
    classify: (run) => classifyTestRun(run),
    ...overrides,
  };
  return { deps, stop, drop, provision, removed, phases, startEnvironments, testEnvironments };
}

describe("HTTP acceptance: configuration and snapshot", () => {
  it("refuses to run when the source is not the approved snapshot, and provisions nothing", async () => {
    const f = fakes({
      assertSnapshot: vi.fn(async () => {
        throw new Error("The source changed after approval.");
      }),
    });
    await expect(runHttpAcceptance(input(), f.deps)).rejects.toThrow("The source changed after approval.");
    expect(f.provision).not.toHaveBeenCalled();
    expect(f.phases).toHaveLength(0);
  });

  it("blocks every case with the configuration requirement when no admin URL is set, and never falls back to DATABASE_URL", async () => {
    const f = fakes({ env: { DATABASE_URL: DATABASE_URL } });
    const results = await runHttpAcceptance(input(), f.deps);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ stage: HTTP_STAGE.CONFIGURATION, attempted: false });
    expect(results[0]?.output).toMatch(/VERIFICATION_DATABASE_ADMIN_URL/);
    expect(f.provision).not.toHaveBeenCalled();
    expect(f.testEnvironments).toHaveLength(0);
  });

  it("returns nothing and provisions nothing when there are no cases", async () => {
    const f = fakes();
    expect(await runHttpAcceptance(input({ cases: [] }), f.deps)).toEqual([]);
    expect(f.provision).not.toHaveBeenCalled();
  });
});

describe("HTTP acceptance: managed lifecycle and cleanup", () => {
  it("runs the test against the managed application with the guard, a verification database, and production settings for the application", async () => {
    const f = fakes();
    const results = await runHttpAcceptance(input(), f.deps);

    expect(results[0]).toMatchObject({ attempted: true, stage: null, exitCode: 0, outcome: { status: "PASSED" } });
    // The application receives the disposable database only, never the admin URL or the builder's DATABASE_URL.
    expect(f.startEnvironments[0]).toMatchObject({ DATABASE_URL, NODE_ENV: "production" });
    expect(JSON.stringify(f.startEnvironments[0])).not.toContain("admin-secret-value");
    const testEnvironment = f.testEnvironments[0] ?? {};
    expect(testEnvironment.VERIFICATION_BASE_URL).toBe("http://127.0.0.1:45123");
    expect(testEnvironment.NODE_OPTIONS).toMatch(/^--import file:\/\//);
    expect(testEnvironment.VERIFICATION_OBSERVATIONS_FILE).toBeTruthy();
    // The application stops, the database is dropped, and the runtime directory is removed.
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(f.drop).toHaveBeenCalledTimes(1);
    expect(f.removed).toHaveLength(1);
  });

  it("reads the requests the guard recorded for the test, so the adapter can count them", async () => {
    const f = fakes({
      runTest: vi.fn(async ({ environment }) => {
        const file = environment.VERIFICATION_OBSERVATIONS_FILE ?? "";
        fs.writeFileSync(
          file,
          `${JSON.stringify({ method: "GET", path: "/api/discovery/feed", status: 200, ms: 4, at: "2026-10-27T00:00:00.000Z" })}\n`,
        );
        return { allowed: true, reason: "", exitCode: 0, output: PASSING_OUTPUT, timedOut: false };
      }),
    });
    const [result] = await runHttpAcceptance(input(), f.deps);
    expect(result?.observations).toEqual([
      { method: "GET", path: "/api/discovery/feed", status: 200, ms: 4, at: "2026-10-27T00:00:00.000Z" },
    ]);
  });

  it("stops the process group and drops the database when install fails, and never starts the application", async () => {
    const f = fakes({
      runPhase: vi.fn(async () => ({ ok: false, timedOut: false, code: 1, output: "npm ERR! cannot resolve" })),
    });
    const [result] = await runHttpAcceptance(input(), f.deps);
    expect(result).toMatchObject({ stage: HTTP_STAGE.INSTALL, attempted: false });
    expect(f.deps.startApplication).not.toHaveBeenCalled();
    expect(f.stop).not.toHaveBeenCalled();
    expect(f.drop).toHaveBeenCalledTimes(1);
    expect(f.removed).toHaveLength(1);
  });

  it("records a failed start with its startup output, and still drops the database", async () => {
    const f = fakes({
      startApplication: vi.fn(async () => ({
        ok: false as const,
        stage: "APPLICATION_START_FAILED" as const,
        reason: "The application exited with code 1 before it answered HTTP.",
        output: "Error: missing configuration",
      })),
    });
    const [result] = await runHttpAcceptance(input(), f.deps);
    expect(result).toMatchObject({ stage: HTTP_STAGE.START, attempted: false, outcome: { category: "INFRASTRUCTURE_FAILURE", status: "BLOCKED" } });
    expect(result?.output).toMatch(/missing configuration/);
    expect(f.drop).toHaveBeenCalledTimes(1);
  });

  it("records a health-check failure as infrastructure, not as a product failure", async () => {
    const f = fakes({
      startApplication: vi.fn(async () => ({
        ok: false as const,
        stage: "HEALTH_CHECK_FAILED" as const,
        reason: "The application did not answer HTTP within the health timeout.",
        output: "",
      })),
    });
    const [result] = await runHttpAcceptance(input(), f.deps);
    expect(result).toMatchObject({ stage: HTTP_STAGE.HEALTH, outcome: { category: "INFRASTRUCTURE_FAILURE" } });
    expect(f.drop).toHaveBeenCalledTimes(1);
  });

  it("cleans up after an unexpected exception in the framework and blocks the cases instead of stalling", async () => {
    const f = fakes({
      runPhase: vi.fn(async () => {
        throw new Error("spawn exploded");
      }),
    });
    const [result] = await runHttpAcceptance(input(), f.deps);
    expect(result).toMatchObject({ stage: HTTP_STAGE.HARNESS, attempted: false, outcome: { category: "INFRASTRUCTURE_FAILURE" } });
    expect(f.drop).toHaveBeenCalledTimes(1);
    expect(f.removed).toHaveLength(1);
  });

  it("keeps the cleanup even when the database drop itself fails, and says so in the output", async () => {
    const f = fakes({
      provisionDatabase: vi.fn(async () => ({
        name: "vf_0123456789abcdef01234567",
        url: DATABASE_URL,
        drop: vi.fn(async () => ({ dropped: false, reason: "drop refused" })),
      })),
    });
    const [result] = await runHttpAcceptance(input(), f.deps);
    expect(result?.output).toMatch(/Cleanup: .*drop refused/);
    expect(f.removed).toHaveLength(1);
  });
});

describe("HTTP acceptance: authentication, seeding and test files", () => {
  it("stops before any test runs when a verification account cannot sign in, and names the authentication stage", async () => {
    const f = fakes({
      fetcher: vi.fn(async (url: string) =>
        url.endsWith("/api/auth/signup") ? new Response("", { status: 201 }) : new Response("", { status: 401 }),
      ),
    });
    const [result] = await runHttpAcceptance(input({ fixturePlan: AUTHENTICATED_PLAN }), f.deps);
    expect(result).toMatchObject({ stage: HTTP_STAGE.AUTHENTICATION, attempted: false });
    expect(f.testEnvironments).toHaveLength(0);
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(f.drop).toHaveBeenCalledTimes(1);
  });

  it("records a failed setup request as fixture seeding, not as a test verdict", async () => {
    const plan: FixturePlan = {
      authentication: AUTHENTICATED_PLAN.authentication,
      steps: [{ account: "viewer", method: "PUT", path: "/api/profile", body: "", purpose: "seed" }],
    };
    const f = fakes({
      fetcher: vi.fn(async (url: string) => {
        if (url.endsWith("/api/auth/signup")) return new Response("", { status: 201 });
        if (url.endsWith("/api/auth/login")) {
          return new Response("", { status: 200, headers: { "set-cookie": "session=abc123xyz; Path=/; HttpOnly" } });
        }
        // The seeding request itself fails.
        return new Response("", { status: 500 });
      }),
    });
    const [result] = await runHttpAcceptance(input({ fixturePlan: plan }), f.deps);
    expect(result).toMatchObject({ stage: HTTP_STAGE.FIXTURES, attempted: false });
    expect(f.testEnvironments).toHaveLength(0);
  });

  it("does not run a test file that the policy gate refused, and records it as not executed", async () => {
    const f = fakes({ writeTest: vi.fn(async () => ({ allowed: false, reason: "Outside verification/http." })) });
    const [result] = await runHttpAcceptance(input(), f.deps);
    expect(result).toMatchObject({ attempted: false, stage: null, outcome: { category: "NOT_EXECUTED", status: "NOT_RUN" } });
    expect(f.deps.runTest).not.toHaveBeenCalled();
  });

  it("does not run a case that has no file or body", async () => {
    const f = fakes();
    const [result] = await runHttpAcceptance(input({ cases: [{ ...CASE, filePath: "", body: "" }] }), f.deps);
    expect(result).toMatchObject({ attempted: false, outcome: { status: "NOT_RUN" } });
    expect(f.deps.writeTest).not.toHaveBeenCalled();
  });

  it("a test that exits 0 without reporting a test is not a demonstration", async () => {
    const f = fakes({
      runTest: vi.fn(async () => ({ allowed: true, reason: "", exitCode: 0, output: "", timedOut: false })),
    });
    const [result] = await runHttpAcceptance(input(), f.deps);
    expect(result?.outcome.status).toBe("NOT_RUN");
  });
});

describe("HTTP acceptance: output and secrets", () => {
  it("removes database passwords and connection strings from failure output before it is stored", async () => {
    const f = fakes({
      runPhase: vi.fn(async () => ({
        ok: false,
        timedOut: false,
        code: 1,
        output: `connect failed for ${DATABASE_URL} and ${ADMIN_URL}`,
      })),
    });
    const [result] = await runHttpAcceptance(input(), f.deps);
    expect(result?.output).toContain("[redacted]");
    expect(result?.output).not.toContain("db-secret-value");
    expect(result?.output).not.toContain("admin-secret-value");
  });

  it("redacts secrets of four or more characters and leaves the rest of the text intact", () => {
    expect(redact("token hunter22 and x", ["hunter22", "x"])).toBe("token [redacted] and x");
  });

  it("gives the test process no NODE_ENV and the application production NODE_ENV", () => {
    const tool = __testing.toolEnvironment(DATABASE_URL);
    expect(tool).not.toHaveProperty("NODE_ENV");
    expect(tool.CI).toBe("1");
    expect(tool.DATABASE_URL).toBe(DATABASE_URL);
    const app = __testing.applicationEnvironment(DATABASE_URL, "session-secret-value");
    expect(app.NODE_ENV).toBe("production");
    expect(app.SESSION_SECRET).toBe("session-secret-value");
  });
});
