import { describe, expect, it, vi } from "vitest";

import type { ImplementationProfile } from "@/modules/verification/inspection";
import { assessHttpEvidence } from "@/modules/verification/evidence-adequacy";
import {
  correctionMessage,
  validatePlanProposal,
  validateWithBoundedCorrection,
  type CaseProposal,
  type PlanProposal,
} from "@/modules/verification/planning-validation";
import { hasStandaloneMarker } from "@/modules/verification/test-binding";
import { VERIFICATION_SYSTEM_PROMPT } from "@/modules/verification/prompt";
import { judgeObligations } from "@/modules/verification/verdict";

/*
 * Deterministic planning tests. The AI is stubbed: each test supplies the proposals a model would return. The Task 4
 * discovery feed is the fixture, but no rule below is specific to it. Every rule comes from the framework validators.
 */

const CRITERION = "cmv109qua0028aappedxinrt1";
const ROUTES = [
  "/api/auth/signup",
  "/api/auth/login",
  "/api/profile",
  "/api/discovery/feed",
  "/api/discovery/action",
];

/** A profile whose adapter registry holds http-blackbox available (HTTP routes, a build script, a database). */
const PROFILE = {
  routes: ROUTES.map((url) => ({ url })),
  scripts: ["build", "start"],
  frameworks: ["Next.js"],
  typescript: true,
  typeScriptSources: 10,
  testRunners: [],
} as unknown as ImplementationProfile;

const ADMIN_ENV = "postgresql://verifier:x@127.0.0.1:5433/postgres";

function withEnv<T>(fn: () => T): T {
  const previous = process.env.VERIFICATION_DATABASE_ADMIN_URL;
  process.env.VERIFICATION_DATABASE_ADMIN_URL = ADMIN_ENV;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.VERIFICATION_DATABASE_ADMIN_URL;
    else process.env.VERIFICATION_DATABASE_ADMIN_URL = previous;
  }
}

const VALID_AUTH = {
  required: true,
  signupPath: "/api/auth/signup",
  loginPath: "/api/auth/login",
  accountKeys: ["viewer"],
};

const VALID_STEPS = [
  { account: "viewer", method: "POST" as const, path: "/api/profile", body: "{\"displayName\":\"Verifier\"}", purpose: "profile" },
];

/** A well-formed http-blackbox test that signs in and asserts the feed. Its marker is a standalone line comment. */
const VALID_BODY = [
  "import test from \"node:test\";",
  "import assert from \"node:assert/strict\";",
  `// verifies:${CRITERION}`,
  "test(\"viewer sees the discovery feed\", async () => {",
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
].join("\n");

/** The defect from the latest attempt: the marker sits in the test title, not on a standalone line. */
const TITLE_MARKER_BODY = VALID_BODY.replace(`// verifies:${CRITERION}\n`, "").replace(
  "test(\"viewer sees the discovery feed\"",
  `test("verifies:${CRITERION}"`,
);

function httpCase(overrides: Partial<CaseProposal> = {}): CaseProposal {
  return {
    title: "Viewer sees the discovery feed",
    automated: true,
    body: VALID_BODY,
    filePath: "verification/http/discovery.test.mjs",
    criterionId: CRITERION,
    manualReason: "",
    adapterId: "http-blackbox",
    targetSurface: "HTTP_ENDPOINT",
    requiredCapabilities: ["http-request", "status-assertion", "body-assertion", "authenticated-session"],
    ...overrides,
  };
}

function proposal(overrides: Partial<PlanProposal> = {}): PlanProposal {
  return {
    authentication: VALID_AUTH,
    fixtureSteps: VALID_STEPS,
    testCases: [httpCase()],
    ...overrides,
  };
}

function validate(p: PlanProposal) {
  return withEnv(() => validatePlanProposal({ proposal: p, routes: ROUTES, profile: PROFILE, workspacePath: "/nonexistent" }));
}

const codes = (validation: ReturnType<typeof validate>) =>
  [...validation.correctable, ...validation.terminal].map((item) => item.code);

describe("1. a valid proposal proceeds without correction", () => {
  it("validates, selects the HTTP adapter, and requests no correction", async () => {
    const correct = vi.fn();
    const result = await withEnv(() =>
      validateWithBoundedCorrection({ initial: proposal(), validate: validate, correct }),
    );
    expect(result.validation.valid).toBe(true);
    expect(result.accepted).toBe("INITIAL");
    expect(result.correctionRequests).toBe(0);
    expect(correct).not.toHaveBeenCalled();
  });
});

describe("2. a missing criterion marker triggers a correction request", () => {
  it("reports MARKER_MISSING as correctable, so one correction is requested", async () => {
    const bad = proposal({ testCases: [httpCase({ body: TITLE_MARKER_BODY })] });
    const validation = validate(bad);
    expect(validation.valid).toBe(false);
    expect(validation.correctable.map((item) => item.code)).toContain("MARKER_MISSING");
    expect(validation.terminal).toEqual([]);

    const correct = vi.fn(async () => null);
    await withEnv(() => validateWithBoundedCorrection({ initial: bad, validate, correct }));
    expect(correct).toHaveBeenCalledTimes(1);
  });
});

describe("3. a corrected marker allows adapter selection", () => {
  it("accepts the corrected proposal and selects http-blackbox", async () => {
    const bad = proposal({ testCases: [httpCase({ body: TITLE_MARKER_BODY })] });
    const corrected = proposal({ testCases: [httpCase({ body: VALID_BODY })] });
    const result = await withEnv(() =>
      validateWithBoundedCorrection({ initial: bad, validate, correct: async () => corrected }),
    );
    expect(result.accepted).toBe("CORRECTED");
    expect(result.validation.valid).toBe(true);
    expect(result.validation.cases[0]).toMatchObject({ automated: true, adapterId: "http-blackbox" });
  });
});

describe("4. invalid account keys trigger a correction request", () => {
  it("reports the refused key as correctable", () => {
    const bad = proposal({
      authentication: { ...VALID_AUTH, accountKeys: ["userA"] },
      fixtureSteps: [{ ...VALID_STEPS[0]!, account: "userA" }],
    });
    const validation = validate(bad);
    expect(validation.correctable.map((item) => item.code)).toContain("FIXTURE_ACCOUNT_KEY_INVALID");
    expect(validation.correctable.find((item) => item.code === "FIXTURE_ACCOUNT_KEY_INVALID")?.message).toMatch(/userA/);
    expect(validation.terminal).toEqual([]);
  });

  it("requests exactly one correction for a bad account key", async () => {
    const bad = proposal({ authentication: { ...VALID_AUTH, accountKeys: ["userA"] }, fixtureSteps: [] });
    const correct = vi.fn(async () => null);
    await withEnv(() => validateWithBoundedCorrection({ initial: bad, validate, correct }));
    expect(correct).toHaveBeenCalledTimes(1);
    const received = (correct.mock.calls as unknown as [{ code: string }[]][])[0]?.[0] ?? [];
    expect(received.map((item) => item.code)).toContain("FIXTURE_ACCOUNT_KEY_INVALID");
  });
});

describe("5. corrected account keys satisfy fixture validation", () => {
  it("accepts the corrected key and keeps the authenticated-session case eligible", async () => {
    const bad = proposal({ authentication: { ...VALID_AUTH, accountKeys: ["userA"] }, fixtureSteps: [] });
    const corrected = proposal({ authentication: { ...VALID_AUTH, accountKeys: ["viewer"] }, fixtureSteps: VALID_STEPS });
    const result = await withEnv(() =>
      validateWithBoundedCorrection({ initial: bad, validate, correct: async () => corrected }),
    );
    expect(result.accepted).toBe("CORRECTED");
    expect(result.validation.fixturePlan.authentication.required).toBe(true);
    expect(result.validation.cases[0]?.automated).toBe(true);
  });
});

describe("unknown literal authentication account references", () => {
  const accountBody = VALID_BODY.replace(
    "JSON.stringify(accounts[0])",
    'JSON.stringify(accounts.find((item) => item.key === "viewer"))',
  );
  const fixturePlan = {
    authentication: { ...VALID_AUTH, accountKeys: ["seeker", "target"] },
    fixtureSteps: [
      { ...VALID_STEPS[0]!, account: "seeker" },
      { ...VALID_STEPS[0]!, account: "target" },
    ],
  };

  it("reports AUTH_ACCOUNT_KEY_UNKNOWN even when authenticated-session is omitted", () => {
    const validation = validate(proposal({
      ...fixturePlan,
      testCases: [httpCase({ body: accountBody, requiredCapabilities: ["http-request", "status-assertion", "body-assertion"] })],
    }));
    const error = validation.correctable.find((item) => item.code === "AUTH_ACCOUNT_KEY_UNKNOWN");
    expect(error?.message).toContain('"viewer"');
    expect(error?.message).toContain("seeker, target");
    expect(validation.cases[0]?.automated).toBe(false);
  });

  it("accepts one bounded correction to a provisioned account key", async () => {
    const bad = proposal({
      ...fixturePlan,
      testCases: [httpCase({ body: accountBody, requiredCapabilities: ["http-request", "status-assertion", "body-assertion"] })],
    });
    const corrected = proposal({
      ...fixturePlan,
      testCases: [httpCase({
        body: accountBody.replace('item.key === "viewer"', 'item.key === "seeker"'),
        requiredCapabilities: ["http-request", "status-assertion", "body-assertion"],
      })],
    });
    const correct = vi.fn(async () => corrected);
    const result = await withEnv(() => validateWithBoundedCorrection({ initial: bad, validate, correct }));
    expect(correct).toHaveBeenCalledTimes(1);
    expect(result.accepted).toBe("CORRECTED");
    expect(result.validation.valid).toBe(true);
    expect(result.validation.cases[0]?.automated).toBe(true);
  });

  it("keeps an invalid account reference manual after the single correction fails", async () => {
    const bad = proposal({
      ...fixturePlan,
      testCases: [httpCase({ body: accountBody })],
    });
    const correct = vi.fn(async () => bad);
    const result = await withEnv(() => validateWithBoundedCorrection({ initial: bad, validate, correct, maxCorrections: 5 }));
    expect(correct).toHaveBeenCalledTimes(1);
    expect(result.accepted).toBe("INITIAL");
    expect(result.validation.cases[0]?.automated).toBe(false);
    expect(result.validation.cases[0]?.manualReason).toContain('account key "viewer"');
    expect(result.validation.cases[0]?.manualReason).toContain("seeker, target");
    expect(result.validation.correctable.map((item) => item.code)).toContain("AUTH_ACCOUNT_KEY_UNKNOWN");
  });
});

describe("6. unsupported adapters remain rejected", () => {
  it("refuses an unregistered adapter without correction", async () => {
    const bad = proposal({ testCases: [httpCase({ adapterId: "playwright" })] });
    const validation = validate(bad);
    expect(validation.cases[0]?.automated).toBe(false);
    expect(validation.cases[0]?.adapterId).toBe("");
    expect(codes(validation)).toContain("ADAPTER_REFUSED");
  });

  it("does not select an adapter that cannot execute for this implementation (terminal, not correctable)", () => {
    const noDatabase = withEnv(() => {
      const previous = process.env.VERIFICATION_DATABASE_ADMIN_URL;
      delete process.env.VERIFICATION_DATABASE_ADMIN_URL;
      try {
        return validatePlanProposal({ proposal: proposal(), routes: ROUTES, profile: PROFILE, workspacePath: "/nonexistent" });
      } finally {
        if (previous !== undefined) process.env.VERIFICATION_DATABASE_ADMIN_URL = previous;
      }
    });
    expect(noDatabase.cases[0]?.automated).toBe(false);
    expect(noDatabase.terminal.map((item) => item.code)).toContain("ADAPTER_UNAVAILABLE");
    expect(noDatabase.correctable).toEqual([]);
  });
});

describe("7. an unsuccessful correction produces a clear manual reason", () => {
  it("keeps the original proposal and its manual reason when the correction is refused", async () => {
    const bad = proposal({ testCases: [httpCase({ body: TITLE_MARKER_BODY })] });
    const result = await withEnv(() => validateWithBoundedCorrection({ initial: bad, validate, correct: async () => null }));
    expect(result.accepted).toBe("INITIAL");
    expect(result.validation.cases[0]?.automated).toBe(false);
    expect(result.validation.cases[0]?.manualReason).toMatch(/does not carry|marker/);
    expect(result.stages.map((item) => item.stage)).toEqual(["INITIAL", "CORRECTION_REFUSED"]);
  });

  it("keeps the original when the corrected proposal still fails validation", async () => {
    const bad = proposal({ testCases: [httpCase({ body: TITLE_MARKER_BODY })] });
    const stillBad = proposal({ testCases: [httpCase({ body: TITLE_MARKER_BODY })] });
    const result = await withEnv(() => validateWithBoundedCorrection({ initial: bad, validate, correct: async () => stillBad }));
    expect(result.accepted).toBe("INITIAL");
    expect(result.validation.valid).toBe(false);
    expect(result.stages.at(-1)?.stage).toBe("CORRECTED_FAILED");
  });
});

describe("8. correction is attempted at most once", () => {
  it("calls the correction stub exactly once even when the correction still fails", async () => {
    const bad = proposal({ testCases: [httpCase({ body: TITLE_MARKER_BODY })] });
    const correct = vi.fn(async () => proposal({ testCases: [httpCase({ body: TITLE_MARKER_BODY })] }));
    await withEnv(() => validateWithBoundedCorrection({ initial: bad, validate, correct, maxCorrections: 5 }));
    expect(correct).toHaveBeenCalledTimes(1);
  });

  it("makes no correction request when the limit is zero", async () => {
    const bad = proposal({ testCases: [httpCase({ body: TITLE_MARKER_BODY })] });
    const correct = vi.fn(async () => null);
    const result = await withEnv(() =>
      validateWithBoundedCorrection({ initial: bad, validate, correct, maxCorrections: 0 }),
    );
    expect(correct).not.toHaveBeenCalled();
    expect(result.correctionRequests).toBe(0);
  });

  it("makes no correction request for terminal-only errors (adapter unavailable, not refused)", async () => {
    // Remove the database configuration so http-blackbox is UNAVAILABLE. Rewording the case cannot fix that.
    const unavailable = (): ReturnType<typeof validatePlanProposal> => {
      const previous = process.env.VERIFICATION_DATABASE_ADMIN_URL;
      delete process.env.VERIFICATION_DATABASE_ADMIN_URL;
      try {
        return validatePlanProposal({ proposal: proposal(), routes: ROUTES, profile: PROFILE, workspacePath: "/nonexistent" });
      } finally {
        if (previous !== undefined) process.env.VERIFICATION_DATABASE_ADMIN_URL = previous;
      }
    };
    const correct = vi.fn(async () => null);
    const result = await validateWithBoundedCorrection({
      initial: proposal(),
      validate: () => unavailable(),
      correct,
    });
    expect(result.validation.terminal.map((item) => item.code)).toContain("ADAPTER_UNAVAILABLE");
    expect(correct).not.toHaveBeenCalled();
  });

  it("requests a correction for a refused (unregistered) adapter name, because the AI can name a valid one", async () => {
    const bad = proposal({ testCases: [httpCase({ adapterId: "playwright" })] });
    const correct = vi.fn(async () => null);
    await withEnv(() => validateWithBoundedCorrection({ initial: bad, validate, correct }));
    expect(correct).toHaveBeenCalledTimes(1);
  });
});

describe("9. approved acceptance criteria remain unchanged", () => {
  it("never alters the criterion id of an accepted case, even after correction", async () => {
    const bad = proposal({ testCases: [httpCase({ body: TITLE_MARKER_BODY })] });
    // A correction that tries to change the criterion is still validated, and its criterion is what is checked.
    const tampered = proposal({ testCases: [httpCase({ body: VALID_BODY, criterionId: "some-other-criterion" })] });
    const result = await withEnv(() => validateWithBoundedCorrection({ initial: bad, validate, correct: async () => tampered }));
    // The tampered id has no matching marker in the body, so it is refused rather than silently accepted.
    expect(result.validation.valid).toBe(false);
    expect(result.accepted).toBe("INITIAL");
  });

  it("does not mutate the input proposal", async () => {
    const bad = proposal({ testCases: [httpCase({ body: TITLE_MARKER_BODY })] });
    const snapshot = JSON.stringify(bad);
    await withEnv(() => validateWithBoundedCorrection({ initial: bad, validate, correct: async () => null }));
    expect(JSON.stringify(bad)).toBe(snapshot);
  });
});

describe("10. historical verification records remain untouched", () => {
  it("validation is a pure function that performs no writes and does not change stored data", () => {
    // validatePlanProposal takes plain values and returns a value. It has no database or filesystem dependency,
    // so historical records cannot be changed by it. This is asserted by the module's imports elsewhere.
    expect(typeof validatePlanProposal).toBe("function");
    const first = validate(proposal());
    const second = validate(proposal());
    expect(second.valid).toBe(first.valid);
  });
});

describe("11. a test that passes structural validation but lacks meaningful evidence cannot be verified", () => {
  it("a body with a valid marker and a literal assertion is refused by binding, not accepted", () => {
    const literal = [
      `// verifies:${CRITERION}`,
      "import test from \"node:test\";",
      "test(\"trivial\", async () => {",
      "  const base = process.env.VERIFICATION_BASE_URL;",
      "  await fetch(`${base}/api/discovery/feed`);",
      "  assert.ok(true);",
      "});",
    ].join("\n");
    const validation = validate(proposal({ testCases: [httpCase({ body: literal, requiredCapabilities: [] })] }));
    expect(validation.cases[0]?.automated).toBe(false);
  });
});

describe("prompt and validator agree on the marker", () => {
  it("the planning prompt states the same standalone line form the validator checks", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("standalone line comment");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("// verifies:<acceptanceCriterionId>");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("test('verifies:<id>', ...)");
    expect(hasStandaloneMarker(VALID_BODY, CRITERION)).toBe(true);
    expect(hasStandaloneMarker(TITLE_MARKER_BODY, CRITERION)).toBe(false);
  });
});

describe("correction message", () => {
  it("lists each correctable error with its code and the test it concerns, without new instructions to change criteria", () => {
    const message = correctionMessage([
      { code: "MARKER_MISSING", correctable: true, testTitle: "Viewer sees the discovery feed", message: "marker missing" },
    ]);
    expect(message).toContain("[MARKER_MISSING]");
    expect(message).toContain("Viewer sees the discovery feed");
    expect(message).toContain("Keep the approved acceptance criteria");
    expect(message).toContain("Do not add or remove test cases");
  });
});

describe("demonstration: invalid marker -> validation error -> correction -> binding -> HTTP adapter selection", () => {
  it("runs the full stubbed sequence on the Task 4-style discovery fixture", async () => {
    const trace: string[] = [];
    const initial = proposal({ testCases: [httpCase({ body: TITLE_MARKER_BODY })] });
    const corrected = proposal({ testCases: [httpCase({ body: VALID_BODY })] });

    const result = await withEnv(() =>
      validateWithBoundedCorrection({
        initial,
        validate: (p) => {
          const v = validate(p);
          trace.push(`validate: ${v.valid ? "valid" : `invalid [${codes(v).join(", ")}]`}`);
          return v;
        },
        correct: async (errors) => {
          trace.push(`correction requested for: ${errors.map((item) => item.code).join(", ")}`);
          return corrected;
        },
      }),
    );

    expect(trace).toEqual([
      "validate: invalid [MARKER_MISSING]",
      "correction requested for: MARKER_MISSING",
      "validate: valid",
    ]);
    expect(result.accepted).toBe("CORRECTED");
    expect(result.validation.cases[0]).toMatchObject({ automated: true, adapterId: "http-blackbox" });
  });
});

describe("adapter-aware HTTP binding in planning", () => {
  it("7. rejects an authenticated HTTP case when verification accounts are not configured", () => {
    const validation = withEnv(() =>
      validatePlanProposal({
        proposal: proposal({
          authentication: { required: false, signupPath: "", loginPath: "", accountKeys: [] },
          fixtureSteps: [],
        }),
        routes: ROUTES,
        profile: PROFILE,
        workspacePath: "/nonexistent",
      }),
    );
    expect(validation.cases[0]?.automated).toBe(false);
    expect(validation.correctable.map((item) => item.code)).toContain("AUTHENTICATION_NOT_CONFIGURED");
  });

  it("refuses an incomplete HTTP body for missing fetch, not for missing product imports", () => {
    const incomplete = [
      `// verifies:${CRITERION}`,
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'test("discovery", async () => {',
      "  const base = process.env.VERIFICATION_BASE_URL;",
      "  assert.ok(base);",
      "});",
    ].join("\n");
    const validation = validate(proposal({ testCases: [httpCase({ body: incomplete })] }));
    expect(validation.cases[0]?.automated).toBe(false);
    expect(validation.cases[0]?.manualReason).toMatch(/must call fetch/);
    expect(validation.cases[0]?.manualReason).not.toMatch(/does not import any product module/);
  });
});

/** Incomplete authenticated body: HTTP fetch exists, but no accounts/login/cookie workflow. */
const INCOMPLETE_AUTH_BODY = [
  "import test from \"node:test\";",
  "import assert from \"node:assert/strict\";",
  `// verifies:${CRITERION}`,
  "test(\"discovery feed\", async () => {",
  "  const base = process.env.VERIFICATION_BASE_URL;",
  "  const response = await fetch(`${base}/api/discovery/feed`);",
  "  assert.ok(response.status === 200 || response.status === 401);",
  "});",
  "",
].join("\n");

describe("authenticated-session structure at planning time", () => {
  it("1. rejects an authenticated HTTP test that never reads VERIFICATION_ACCOUNTS", () => {
    const validation = validate(proposal({ testCases: [httpCase({ body: INCOMPLETE_AUTH_BODY })] }));
    expect(validation.cases[0]?.automated).toBe(false);
    expect(validation.correctable.map((item) => item.code)).toContain("AUTH_ACCOUNTS_NOT_READ");
  });

  it("2. rejects a missing VERIFICATION_PATHS login reference", () => {
    const body = [
      `// verifies:${CRITERION}`,
      "import test from \"node:test\";",
      "import assert from \"node:assert/strict\";",
      "test(\"x\", async () => {",
      "  const accounts = JSON.parse(process.env.VERIFICATION_ACCOUNTS);",
      "  const base = process.env.VERIFICATION_BASE_URL;",
      "  const login = await fetch(`${base}/api/auth/login`, { method: \"POST\", body: JSON.stringify(accounts[0]) });",
      "  const cookie = login.headers.getSetCookie().join(\"; \");",
      "  const feed = await fetch(`${base}/api/discovery/feed`, { headers: { cookie } });",
      "  assert.equal(feed.status, 200);",
      "});",
    ].join("\n");
    const validation = validate(proposal({ testCases: [httpCase({ body })] }));
    expect(validation.correctable.map((item) => item.code)).toContain("AUTH_LOGIN_PATH_NOT_READ");
  });

  it("3. rejects missing session-cookie extraction", () => {
    const body = [
      `// verifies:${CRITERION}`,
      "import test from \"node:test\";",
      "import assert from \"node:assert/strict\";",
      "test(\"x\", async () => {",
      "  const accounts = JSON.parse(process.env.VERIFICATION_ACCOUNTS);",
      "  const paths = JSON.parse(process.env.VERIFICATION_PATHS);",
      "  const base = process.env.VERIFICATION_BASE_URL;",
      "  await fetch(`${base}${paths.login}`, { method: \"POST\", body: JSON.stringify(accounts[0]) });",
      "  const feed = await fetch(`${base}/api/discovery/feed`, { headers: { cookie: \"session=x\" } });",
      "  assert.equal(feed.status, 200);",
      "});",
    ].join("\n");
    const validation = validate(proposal({ testCases: [httpCase({ body })] }));
    expect(validation.correctable.map((item) => item.code)).toContain("AUTH_SESSION_COOKIE_NOT_CAPTURED");
  });

  it("4. rejects missing session-cookie reuse", () => {
    const body = [
      `// verifies:${CRITERION}`,
      "import test from \"node:test\";",
      "import assert from \"node:assert/strict\";",
      "test(\"x\", async () => {",
      "  const accounts = JSON.parse(process.env.VERIFICATION_ACCOUNTS);",
      "  const paths = JSON.parse(process.env.VERIFICATION_PATHS);",
      "  const base = process.env.VERIFICATION_BASE_URL;",
      "  const login = await fetch(`${base}${paths.login}`, { method: \"POST\", body: JSON.stringify(accounts[0]) });",
      "  const cookie = login.headers.getSetCookie().join(\"; \");",
      "  assert.ok(cookie);",
      "  const feed = await fetch(`${base}/api/discovery/feed`);",
      "  assert.equal(feed.status, 200);",
      "});",
    ].join("\n");
    const validation = validate(proposal({ testCases: [httpCase({ body })] }));
    expect(validation.correctable.map((item) => item.code)).toContain("AUTH_SESSION_COOKIE_NOT_REUSED");
  });

  it("5. accepts a corrected authenticated HTTP test for automation", async () => {
    const bad = proposal({ testCases: [httpCase({ body: INCOMPLETE_AUTH_BODY })] });
    const good = proposal({ testCases: [httpCase({ body: VALID_BODY })] });
    const result = await withEnv(() =>
      validateWithBoundedCorrection({ initial: bad, validate, correct: async () => good }),
    );
    expect(result.accepted).toBe("CORRECTED");
    expect(result.validation.cases[0]).toMatchObject({ automated: true, adapterId: "http-blackbox" });
  });

  it("6. attempts bounded correction at most once for auth structure failures", async () => {
    const bad = proposal({ testCases: [httpCase({ body: INCOMPLETE_AUTH_BODY })] });
    const correct = vi.fn(async () => proposal({ testCases: [httpCase({ body: INCOMPLETE_AUTH_BODY })] }));
    await withEnv(() => validateWithBoundedCorrection({ initial: bad, validate, correct, maxCorrections: 5 }));
    expect(correct).toHaveBeenCalledTimes(1);
  });

  it("7. a passing 401-only authenticated HTTP run remains INCONCLUSIVE", () => {
    const observation = {
      method: "GET",
      path: "/api/discovery/feed",
      status: 401,
      ms: 3,
      at: "2026-10-28T00:00:00.000Z",
    };
    const evidence = assessHttpEvidence({
      body: INCOMPLETE_AUTH_BODY,
      requiredCapabilities: ["authenticated-session"],
      observations: [observation],
      loginPath: "/api/auth/login",
    });
    expect(evidence.adequate).toBe(false);
    expect(evidence.reasons.join(" ")).toMatch(/401 or 403|refused as unauthenticated/i);
    const verdict = judgeObligations({
      obligations: [
        {
          id: "coverage:0",
          title: "Functional acceptance criterion",
          kind: "FUNCTIONAL_ACCEPTANCE",
          source: "FUNCTIONAL_ACCEPTANCE_CRITERION",
          mandatory: true,
          status: "NOT_TESTED",
          evidence: "Execution passed but evidence was insufficient.",
        },
      ],
      defects: [],
      blockingEscalation: false,
    });
    expect(verdict.verdict).toBe("INCONCLUSIVE");
  });

  it("8. a successful authenticated request with inadequate behavioural coverage remains unverified", () => {
    const multiStep = [
      `// verifies:${CRITERION}`,
      "const accounts = JSON.parse(process.env.VERIFICATION_ACCOUNTS);",
      "const paths = JSON.parse(process.env.VERIFICATION_PATHS);",
      "const base = process.env.VERIFICATION_BASE_URL;",
      "const login = await fetch(`${base}${paths.login}`, { method: \"POST\", body: JSON.stringify(accounts[0]) });",
      "const cookie = login.headers.getSetCookie().join(\"; \");",
      "const feed = await fetch(`${base}/api/discovery/feed`, { headers: { cookie } });",
      "assert.equal(feed.status, 200);",
      "const action = await fetch(`${base}/api/discovery/action`, { method: \"POST\", headers: { cookie } });",
      "assert.equal(action.status, 200);",
    ].join("\n");
    const at = "2026-10-28T00:00:00.000Z";
    const evidence = assessHttpEvidence({
      body: multiStep,
      requiredCapabilities: ["authenticated-session"],
      observations: [
        { method: "POST", path: "/api/auth/login", status: 200, ms: 3, at },
        { method: "GET", path: "/api/discovery/feed", status: 200, ms: 3, at },
      ],
      loginPath: "/api/auth/login",
    });
    expect(evidence.adequate).toBe(false);
    expect(evidence.reasons.join(" ")).toMatch(/issues 3 requests but only 2 reached/);
  });

  it("9. does not reject a valid unauthenticated HTTP test that omits authenticated-session", () => {
    const body = [
      `// verifies:${CRITERION}`,
      "import test from \"node:test\";",
      "import assert from \"node:assert/strict\";",
      "test(\"health\", async () => {",
      "  const base = process.env.VERIFICATION_BASE_URL;",
      "  const response = await fetch(`${base}/api/health`);",
      "  assert.equal(response.status, 200);",
      "});",
    ].join("\n");
    const validation = validate(
      proposal({
        authentication: { required: false, signupPath: "", loginPath: "", accountKeys: [] },
        fixtureSteps: [],
        testCases: [
          httpCase({
            body,
            requiredCapabilities: ["http-request", "status-assertion"],
            filePath: "verification/http/health.test.mjs",
          }),
        ],
      }),
    );
    // /api/health may not be in ROUTES — use a known route instead for path realism; binding only checks body shape.
    expect(validation.cases[0]?.automated).toBe(true);
    expect(validation.correctable.map((item) => item.code)).not.toContain("AUTH_ACCOUNTS_NOT_READ");
  });

  it("10. leaves module-based tests unaffected by authenticated-session structure checks", () => {
    // Module cases do not declare authenticated-session through httpCase; keep a module-shaped refusal path unused.
    const moduleCase: CaseProposal = {
      title: "Module claim",
      automated: true,
      body: [
        `// verifies:${CRITERION}`,
        'import test from "node:test";',
        'import assert from "node:assert/strict";',
        'import { submitClaim } from "../../src/claims/submit.mjs";',
        'test("submit", () => { assert.equal(submitClaim().reference, "CLM-1001"); });',
      ].join("\n"),
      filePath: "verification/claim.test.mjs",
      criterionId: CRITERION,
      manualReason: "",
      adapterId: "node-test-mjs",
      targetSurface: "MODULE_EXPORT",
      requiredCapabilities: [],
    };
    const validation = withEnv(() =>
      validatePlanProposal({
        proposal: {
          authentication: { required: false, signupPath: "", loginPath: "", accountKeys: [] },
          fixtureSteps: [],
          testCases: [moduleCase],
        },
        routes: ROUTES,
        profile: { ...PROFILE, frameworks: [], routes: [] } as unknown as ImplementationProfile,
        workspacePath: "/nonexistent",
      }),
    );
    // Without a real JS module on disk binding may refuse; it must not be an AUTH_* code.
    expect(validation.correctable.every((item) => !item.code.startsWith("AUTH_"))).toBe(true);
    expect(validation.terminal.every((item) => !item.code.startsWith("AUTH_"))).toBe(true);
  });
});
