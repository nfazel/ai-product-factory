import { afterEach, describe, expect, it, vi } from "vitest";

import { executionIsCredible, verificationAdapters } from "@/modules/verification/adapters/registry";
import { httpBlackboxAdapter } from "@/modules/verification/adapters/http-blackbox";
import { VERIFICATION_DATABASE_CONFIGURATION_MESSAGE } from "@/modules/verification/http/config";
import type { ImplementationProfile } from "@/modules/verification/inspection";
import { approveVerificationCommand } from "@/modules/verification/policy";
import { assessTestBinding, isHttpBlackboxTest } from "@/modules/verification/test-binding";

const ROUTED: ImplementationProfile = {
  packageManager: "npm",
  typescript: true,
  frameworks: ["Next.js"],
  testRunners: [],
  scripts: ["build", "start"],
  dependencies: ["next"],
  routes: [
    { file: "src/app/api/discovery/feed/route.ts", url: "/api/discovery/feed" },
    { file: "src/app/api/discovery/action/route.ts", url: "/api/discovery/action" },
  ],
  components: [],
  existingTests: [],
  plainJavaScriptSources: 0,
  typeScriptSources: 40,
};

const UNROUTED: ImplementationProfile = { ...ROUTED, routes: [] };

const ADMIN = "postgresql://verifier:secret@127.0.0.1:5433/postgres";

const HTTP_BODY = `// verifies:ac-feed
import { test } from "node:test";
import assert from "node:assert/strict";

const base = process.env.VERIFICATION_BASE_URL;

test("the discovery feed answers 200 to a signed-in verifier", async () => {
  const response = await fetch(new URL("/api/discovery/feed", base));
  assert.equal(response.status, 200);
});
`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("http-blackbox adapter registration and selection", () => {
  it("is registered beside node-test-mjs, in deterministic order", () => {
    expect(verificationAdapters.list().map((adapter) => adapter.id)).toEqual(["http-blackbox", "node-test-mjs"]);
    expect(verificationAdapters.get("http-blackbox")).toBe(httpBlackboxAdapter);
  });

  it("is selected for an HTTP endpoint case when routes exist and a verification database is configured", () => {
    vi.stubEnv("VERIFICATION_DATABASE_ADMIN_URL", ADMIN);
    const selection = verificationAdapters.select({
      adapterId: "",
      surface: "HTTP_ENDPOINT",
      filePath: "verification/http/feed.test.mjs",
      requiredCapabilities: ["http-request", "status-assertion"],
      profile: ROUTED,
    });
    expect(selection).toMatchObject({ ok: true, adapter: { id: "http-blackbox" } });
  });

  it("is unavailable, with the configuration requirement, when no verification database is configured", () => {
    vi.stubEnv("VERIFICATION_DATABASE_ADMIN_URL", "");
    const selection = verificationAdapters.select({
      adapterId: "",
      surface: "HTTP_ENDPOINT",
      filePath: "verification/http/feed.test.mjs",
      requiredCapabilities: ["http-request"],
      profile: ROUTED,
    });
    expect(selection).toMatchObject({ ok: false, kind: "UNAVAILABLE" });
    expect(selection.ok === false && selection.reason).toBe(VERIFICATION_DATABASE_CONFIGURATION_MESSAGE);
  });

  it("is unavailable when the approved snapshot exposes no route to test", () => {
    vi.stubEnv("VERIFICATION_DATABASE_ADMIN_URL", ADMIN);
    const selection = verificationAdapters.select({
      adapterId: "",
      surface: "HTTP_ENDPOINT",
      filePath: "verification/http/feed.test.mjs",
      requiredCapabilities: ["http-request"],
      profile: UNROUTED,
    });
    expect(selection).toMatchObject({ ok: false, kind: "UNAVAILABLE" });
    expect(selection.ok === false && selection.reason).toMatch(/no API route handlers/);
  });

  it("refuses a named HTTP adapter for a module surface, and never substitutes another adapter", () => {
    vi.stubEnv("VERIFICATION_DATABASE_ADMIN_URL", ADMIN);
    const selection = verificationAdapters.select({
      adapterId: "http-blackbox",
      surface: "MODULE_EXPORT",
      filePath: "verification/http/feed.test.mjs",
      requiredCapabilities: [],
      profile: ROUTED,
    });
    expect(selection).toMatchObject({ ok: false, kind: "REFUSED" });
  });

  it("refuses a capability the HTTP adapter does not provide", () => {
    vi.stubEnv("VERIFICATION_DATABASE_ADMIN_URL", ADMIN);
    const selection = verificationAdapters.select({
      adapterId: "",
      surface: "HTTP_ENDPOINT",
      filePath: "verification/http/feed.test.mjs",
      requiredCapabilities: ["browser-session"],
      profile: ROUTED,
    });
    expect(selection).toMatchObject({ ok: false, kind: "REFUSED" });
  });
});

describe("http-blackbox file and command rules", () => {
  it("accepts only verification/http/ test files", () => {
    expect(httpBlackboxAdapter.acceptsFile("verification/http/feed.test.mjs")).toBe(true);
    expect(httpBlackboxAdapter.acceptsFile("verification/claim/feed.test.mjs")).toBe(false);
    expect(httpBlackboxAdapter.acceptsFile("src/feed.test.mjs")).toBe(false);
    expect(httpBlackboxAdapter.acceptsFile("verification/http/../../src/feed.test.mjs")).toBe(false);
  });

  it("proposes a command the command gate approves, and only that command", () => {
    const command = httpBlackboxAdapter.commandFor("verification/http/feed.test.mjs");
    expect(command).toBe("node --test verification/http/feed.test.mjs");
    expect(approveVerificationCommand(command).ok).toBe(true);
  });
});

describe("http-blackbox classification", () => {
  it("classifies a failed assertion against the product as a product failure", () => {
    const outcome = httpBlackboxAdapter.classify({
      exitCode: 1,
      timedOut: false,
      output: "# tests 1\n# pass 0\n# fail 1\nAssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 500 !== 200\n",
    });
    expect(outcome).toMatchObject({ category: "PRODUCT_FAILURE", status: "FAILED" });
  });

  it("classifies a refused connection as an environment failure, not a product failure", () => {
    const outcome = httpBlackboxAdapter.classify({
      exitCode: 1,
      timedOut: false,
      output: "# tests 1\n# pass 0\n# fail 1\nError: fetch failed\n  code: 'ECONNREFUSED'\n",
    });
    expect(outcome.category).not.toBe("PRODUCT_FAILURE");
    expect(outcome.status).toBe("BLOCKED");
  });

  it("classifies a request the guard refused as an infrastructure stop, never a verdict on the product", () => {
    const outcome = httpBlackboxAdapter.classify({
      exitCode: 1,
      timedOut: false,
      output: "# tests 1\n# pass 0\n# fail 1\nError: Verification guard refused http://example.com:443. Verification tests may reach only the managed application.\n",
    });
    expect(outcome).toMatchObject({ category: "INFRASTRUCTURE_FAILURE", status: "BLOCKED" });
  });

  it("classifies a timed-out run as infrastructure", () => {
    const outcome = httpBlackboxAdapter.classify({ exitCode: null, timedOut: true, output: "" });
    expect(outcome).toMatchObject({ category: "INFRASTRUCTURE_FAILURE", status: "BLOCKED" });
  });

  it("never reports a passing run that declared no test as a product pass", () => {
    const outcome = httpBlackboxAdapter.classify({ exitCode: 0, timedOut: false, output: "" });
    expect(outcome.status).toBe("NOT_RUN");
  });
});

describe("http-blackbox credibility", () => {
  const record = { adapterId: "http-blackbox", command: "node --test verification/http/feed.test.mjs", snapshotCommit: "abc" };

  it("is credible only when the run made at least one observed request to the managed application", () => {
    expect(executionIsCredible({ ...record, observationCount: 0 }, "abc")).toBe(false);
    expect(executionIsCredible({ ...record, observationCount: 1 }, "abc")).toBe(true);
    expect(executionIsCredible(record, "abc")).toBe(false);
  });

  it("is not credible against a different approved snapshot", () => {
    expect(executionIsCredible({ ...record, observationCount: 2 }, "def")).toBe(false);
  });
});

describe("HTTP test binding", () => {
  it("recognises a black-box test by its base URL and fetch call, not by a product import", () => {
    expect(isHttpBlackboxTest(HTTP_BODY)).toBe(true);
    expect(isHttpBlackboxTest(`import { x } from "../src/x.js";\nconst y = 1;`)).toBe(false);
  });

  it("binds a black-box test that stays on the managed application and is filed under verification/http/", () => {
    const binding = assessTestBinding({
      body: HTTP_BODY,
      criterionId: "ac-feed",
      filePath: "verification/http/feed.test.mjs",
      workspacePath: "/nonexistent",
    });
    expect(binding.ok).toBe(true);
  });

  it("refuses a black-box test that imports a product module", () => {
    const body = HTTP_BODY.replace('import { test }', 'import { feed } from "../src/feed.js";\nimport { test }');
    const binding = assessTestBinding({
      body,
      criterionId: "ac-feed",
      filePath: "verification/http/feed.test.mjs",
      workspacePath: "/nonexistent",
    });
    expect(binding.ok).toBe(false);
    expect(binding.reasons.join(" ")).toMatch(/must not import product modules/);
  });

  it("refuses an HTTP test filed outside verification/http/", () => {
    const binding = assessTestBinding({
      body: HTTP_BODY,
      criterionId: "ac-feed",
      filePath: "verification/feed.test.mjs",
      workspacePath: "/nonexistent",
    });
    expect(binding.ok).toBe(false);
    expect(binding.reasons.join(" ")).toMatch(/verification\/http\/<name>\.test\.mjs/);
  });

  it("refuses an HTTP test that lacks the marker for its criterion", () => {
    const binding = assessTestBinding({
      body: HTTP_BODY,
      criterionId: "ac-other",
      filePath: "verification/http/feed.test.mjs",
      workspacePath: "/nonexistent",
    });
    expect(binding.ok).toBe(false);
  });
});
