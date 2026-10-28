import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { setHttpAcceptanceOverridesForTests } from "@/modules/verification/http/acceptance";
import type { ManagedApplication } from "@/modules/verification/http/lifecycle";
import { verificationDatabaseName } from "@/modules/verification/http/database";
import { completedTaskIn, git } from "@/modules/verification/completed-task.test-support";
import { recomputeSession } from "@/modules/verification/assess";
import { getVerificationSession, startVerification } from "@/modules/verification/service";

/**
 * Orchestration, end to end, against an isolated fixture product. The chain under test is:
 *
 *   approved source snapshot -> verification planning -> http-blackbox adapter selection -> application startup
 *   -> test execution -> evidence recording -> deterministic verdict -> cleanup
 *
 * Real things: the git snapshot and worktree, the AI-plan contract (a scripted provider, not a network model), the
 * npm install, the managed Node server on a loopback port, the guard, the HTTP requests and the test process.
 *
 * Faked, and only these: database provisioning. A real PostgreSQL database needs a dedicated, non-superuser admin
 * role, which does not exist yet. The fake returns a name and a drop function, so no database is created.
 *
 * Acceptance evidence must come from requests the managed server really answered. The assertions check the server's
 * own output, the guard's observations and the response body, not a mocked response.
 */

const products: string[] = [];
const dirs: string[] = [];
const originalEnv = {
  PRODUCT_REPOSITORY_ROOT: process.env.PRODUCT_REPOSITORY_ROOT,
  PRODUCT_REPOSITORY_WORKTREE_ROOT: process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT,
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_MODEL: process.env.AI_MODEL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  VERIFICATION_DATABASE_ADMIN_URL: process.env.VERIFICATION_DATABASE_ADMIN_URL,
};

const FIXTURE_FILES: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "claims-fixture",
    version: "1.0.0",
    private: true,
    scripts: { start: "node server.js", test: "node -e \"process.exit(0)\"" },
  }),
  "package-lock.json": JSON.stringify({
    name: "claims-fixture",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: "claims-fixture", version: "1.0.0" } },
  }),
  // The approved plan expects this file, so it must exist in the approved snapshot.
  "src/claims/submit.ts": "export const claim = \"notice\";\n",
  "pages/api/claims.js":
    "exports.handler = function handler(request, response) {\n  response.setHeader(\"content-type\", \"application/json\");\n  response.end(JSON.stringify({ reference: \"CLM-1001\" }));\n};\n",
  "server.js": [
    "const http = require(\"node:http\");",
    "const claims = require(\"./pages/api/claims.js\");",
    "const server = http.createServer((request, response) => {",
    "  console.log(`fixture ${request.method} ${request.url}`);",
    "  if (request.url === \"/api/claims\") return claims.handler(request, response);",
    "  response.statusCode = 404;",
    "  response.end(\"not found\");",
    "});",
    "server.listen(Number(process.env.PORT), process.env.HOST || \"127.0.0.1\", () => console.log(\"fixture listening\"));",
    "",
  ].join("\n"),
};

function makeFixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-orchestration-repo-"));
  dirs.push(dir);
  for (const [file, contents] of Object.entries(FIXTURE_FILES)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), contents);
  }
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

function httpPlanProvider(criterionId: string): AIProvider {
  const filePath = `verification/http/${criterionId}/claims.test.mjs`;
  const body = [
    "import { test } from \"node:test\";",
    "import assert from \"node:assert/strict\";",
    `// verifies:${criterionId}`,
    "test(\"a valid notice returns a claim reference over HTTP\", async () => {",
    "  const response = await fetch(new URL(\"/api/claims\", process.env.VERIFICATION_BASE_URL));",
    "  assert.equal(response.status, 200);",
    "  assert.equal((await response.json()).reference, \"CLM-1001\");",
    "});",
    "",
  ].join("\n");
  const responses: Record<string, unknown> = {
    verification_conditions: { summary: "Conditions come from the approved criteria.", conditions: [] },
    verification_plan: {
      summary: "Verify the claim reference over HTTP against the managed application.",
      existingTestNotes: "Existing tests were inspected. A passing suite is not acceptance coverage.",
      untestedAreas: [],
      authentication: { required: false, signupPath: "", loginPath: "", accountKeys: [] },
      fixtureSteps: [],
    },
    verification_test_cases: {
      testCases: [
        {
          title: "Claim reference over HTTP",
          purpose: "Demonstrate the criterion.",
          preconditions: "A valid notice.",
          steps: ["GET /api/claims"],
          expectedResult: "Status 200 with reference CLM-1001.",
          testType: "API",
          priority: "HIGH",
          source: "ACCEPTANCE_CRITERION",
          acceptanceCriterionId: criterionId,
          automated: true,
          adapterId: "http-blackbox",
          targetSurface: "HTTP_ENDPOINT",
          requiredCapabilities: ["http-request", "status-assertion"],
          filePath,
          body,
          manualReason: "",
        },
      ],
    },
    verification_coverage: { mappings: [{ acceptanceCriterionId: criterionId, rationale: "Mapped from the criterion." }] },
    verification_interpretation: { summary: "AI analysis only.", concerns: [] },
    verification_defects: { defects: [] },
    verification_summary: { proposedVerdict: "PASS", rationale: "The model proposes pass. Deterministic rules decide." },
  };
  return {
    async generate(request) {
      const data = responses[request.schemaName];
      if (!data) throw new Error(request.schemaName);
      return { data: data as never, usage: { inputTokens: 1, outputTokens: 1 }, model: "scripted" };
    },
  };
}

afterEach(async () => {
  setHttpAcceptanceOverridesForTests(null);
  setAIProviderForTests(null);
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  while (products.length > 0) {
    const id = products.pop();
    if (id) await db.product.delete({ where: { id } }).catch(() => undefined);
  }
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("HTTP verification, orchestrated against an isolated fixture product", () => {
  it(
    "runs the approved snapshot through planning, startup, real HTTP requests, evidence, verdict and cleanup",
    async () => {
      const repo = makeFixtureRepo();
      const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apf-orchestration-worktrees-"));
      dirs.push(worktreeRoot);
      const setup = await completedTaskIn(repo);
      products.push(setup.product.id);

      process.env.PRODUCT_REPOSITORY_ROOT = repo;
      process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = worktreeRoot;
      process.env.AI_PROVIDER = "openai";
      process.env.AI_MODEL = "gpt-4.1-mini";
      process.env.OPENAI_API_KEY = "test-key";
      // A syntactically valid admin URL is required for the HTTP adapter to be selected. It is never connected to:
      // provisioning is replaced below, so this host and port are unreachable on purpose.
      process.env.VERIFICATION_DATABASE_ADMIN_URL = "postgresql://verifier:not-used@127.0.0.1:9/postgres";

      const captured = {
        provisioned: [] as string[],
        dropped: [] as string[],
        runtimeDirs: [] as string[],
        app: undefined as ManagedApplication | undefined,
      };
      setHttpAcceptanceOverridesForTests((base) => ({
        provisionDatabase: async ({ attemptId }) => {
          const name = verificationDatabaseName(attemptId);
          captured.provisioned.push(name);
          return {
            name,
            url: `postgresql://fixture:fixture@127.0.0.1:9/${name}`,
            async drop() {
              captured.dropped.push(name);
              return { dropped: true, reason: "" };
            },
          };
        },
        startApplication: async (input) => {
          const result = await base.startApplication(input);
          if (result.ok) captured.app = result.app;
          return result;
        },
        makeRuntimeDir: () => {
          const dir = base.makeRuntimeDir();
          captured.runtimeDirs.push(dir);
          return dir;
        },
      }));
      setAIProviderForTests(httpPlanProvider(setup.criterion.id));

      const started = await startVerification(setup.product.id, setup.task.id);
      const sessionId = started?.id ?? "";
      expect(sessionId).not.toBe("");

      // 1. The approved snapshot is what was verified.
      expect(started?.commitSha).toBe(setup.sha);
      expect(started?.workspace?.baseCommit).toBe(setup.sha);

      // 2. Planning selected the HTTP adapter and the case was executed, not left manual.
      const testCase = started?.testCases.find((item) => item.title === "Claim reference over HTTP");
      expect(testCase).toMatchObject({ adapterId: "http-blackbox", automated: true });

      // 3. Real HTTP happened: the test process observed 200 from the managed server.
      const execution = await db.verificationExecution.findFirst({
        where: { sessionId, testCaseId: testCase?.id, kind: "NEW_VERIFICATION" },
      });
      expect(execution?.status).toBe("PASSED");
      const observations = (execution?.observations ?? []) as { method: string; path: string; status: number }[];
      expect(observations.length).toBeGreaterThan(0);
      expect(observations).toContainEqual(expect.objectContaining({ method: "GET", path: "/api/claims", status: 200 }));

      // 4. The managed server itself logged the request, so the traffic is not only the test's own claim.
      expect(captured.app).toBeDefined();
      expect(captured.app?.output()).toContain("fixture GET /api/claims");

      // 5. Evidence is tied to the criterion and to the approved snapshot.
      const evidence = started?.evidence.find((item) => item.executionId === execution?.id);
      expect(evidence).toMatchObject({
        acceptanceCriterionId: setup.criterion.id,
        adapterId: "http-blackbox",
        snapshotCommit: setup.sha,
        result: "DEMONSTRATED",
      });

      // 6. The verdict is deterministic: recomputing from the same records gives the same answer.
      const verdict = started?.overallVerdict;
      expect(verdict === "PASS" || verdict === "PASS_WITH_CONCERNS").toBe(true);
      expect(started?.coverages.find((item) => item.acceptanceCriterionId === setup.criterion.id)?.status).toBe("VERIFIED");
      await recomputeSession(sessionId);
      const recomputed = await getVerificationSession(setup.product.id, sessionId);
      expect(recomputed?.overallVerdict).toBe(verdict);

      // 7. Cleanup: the database was dropped, the runtime directory is gone, and the application no longer answers.
      expect(captured.provisioned).toHaveLength(1);
      expect(captured.dropped).toEqual(captured.provisioned);
      for (const dir of captured.runtimeDirs) expect(fs.existsSync(dir)).toBe(false);
      await expect(fetch(`${captured.app?.baseUrl}/api/claims`)).rejects.toThrow();
      const stored = await db.verificationSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect((stored.runState as { resources?: unknown[] }).resources).toEqual([]);
    },
    240_000,
  );
});
