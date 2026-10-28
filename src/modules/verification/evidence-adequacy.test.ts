import { describe, expect, it } from "vitest";

import {
  assessHttpEvidence,
  assessAuthentication,
  assessPositiveBehaviour,
  assessStepCoverage,
  declaredRequestSteps,
  responseAssertionCount,
} from "@/modules/verification/evidence-adequacy";
import type { HttpObservation } from "@/modules/verification/http/guard";
import { assessTestStructure } from "@/modules/verification/test-binding";
import { judgeObligations } from "@/modules/verification/verdict";

/*
 * Regression tests for evidence adequacy. The discovery-style example (a feed, a sign-in, a connect action) exists only
 * in these fixtures. The production rules read declarations and observations, never a product route.
 */

const CRITERION = "crit-feed";
const MARKER = `// verifies:${CRITERION}`;

const obs = (method: string, path: string, status: number): HttpObservation => ({
  method,
  path,
  status,
  ms: 3,
  at: "2026-10-27T00:00:00.000Z",
});

/** The defect the review found: authenticated profile discovery whose body only asserts an unauthenticated 401. */
const UNAUTHENTICATED_401_ONLY = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  MARKER,
  'test("profile discovery requires a session", async () => {',
  '  const base = process.env.VERIFICATION_BASE_URL;',
  '  const response = await fetch(`${base}/api/discovery/feed`);',
  '  assert.equal(response.status, 401);',
  "});",
].join("\n");

/** Claims authenticated-session but never signs in. */
const CLAIMS_AUTH_NEVER_AUTHENTICATES = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  MARKER,
  'test("feed for a signed-in viewer", async () => {',
  "  const accounts = JSON.parse(process.env.VERIFICATION_ACCOUNTS);",
  "  const viewer = accounts[0];",
  '  const base = process.env.VERIFICATION_BASE_URL;',
  '  const response = await fetch(`${base}/api/discovery/feed`);',
  "  assert.equal(response.status, 200);",
  "  assert.ok(viewer.email);",
  "});",
].join("\n");

/** Signs in and reads the session cookie, but never sends it on the feed request. */
const AUTHENTICATES_BUT_NEVER_USES_SESSION = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  MARKER,
  'test("feed after sign-in", async () => {',
  "  const accounts = JSON.parse(process.env.VERIFICATION_ACCOUNTS);",
  "  const paths = JSON.parse(process.env.VERIFICATION_PATHS);",
  '  const base = process.env.VERIFICATION_BASE_URL;',
  "  const login = await fetch(`${base}${paths.login}`, { method: 'POST', body: JSON.stringify(accounts[0]) });",
  "  const cookie = login.headers.getSetCookie().join('; ');",
  "  assert.ok(cookie);",
  '  const feed = await fetch(`${base}/api/discovery/feed`);',
  "  assert.equal(feed.status, 200);",
  "});",
].join("\n");

/** Signs in, uses the session on a feed request, and asserts both the status and the body. */
const AUTHENTICATED_BEHAVIOUR = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  MARKER,
  'test("signed-in viewer sees the feed", async () => {',
  "  const accounts = JSON.parse(process.env.VERIFICATION_ACCOUNTS);",
  "  const paths = JSON.parse(process.env.VERIFICATION_PATHS);",
  '  const base = process.env.VERIFICATION_BASE_URL;',
  "  const login = await fetch(`${base}${paths.login}`, { method: 'POST', body: JSON.stringify(accounts[0]) });",
  "  const cookie = login.headers.getSetCookie().join('; ');",
  '  const feed = await fetch(`${base}/api/discovery/feed`, { headers: { cookie } });',
  "  assert.equal(feed.status, 200);",
  "  const body = await feed.json();",
  "  assert.ok(Array.isArray(body.items));",
  "});",
].join("\n");

/** Two-step criterion (sign in then connect) where only the connect path was exercised. */
const MULTI_STEP_PARTIAL = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  MARKER,
  'test("connect after sign-in", async () => {',
  "  const accounts = JSON.parse(process.env.VERIFICATION_ACCOUNTS);",
  "  const paths = JSON.parse(process.env.VERIFICATION_PATHS);",
  '  const base = process.env.VERIFICATION_BASE_URL;',
  "  const login = await fetch(`${base}${paths.login}`, { method: 'POST', body: JSON.stringify(accounts[0]) });",
  "  const cookie = login.headers.getSetCookie().join('; ');",
  '  const connect = await fetch(`${base}/api/discovery/action`, { method: "POST", headers: { cookie } });',
  "  assert.equal(connect.status, 200);",
  "  const body = await connect.json();",
  "  assert.equal(body.result, 'connected');",
  "});",
].join("\n");

const AUTH = ["authenticated-session"];

describe("1. unauthenticated 401 test that passes but does not verify authenticated behaviour", () => {
  it("is inadequate when it declares authenticated-session", () => {
    const result = assessHttpEvidence({
      body: UNAUTHENTICATED_401_ONLY,
      requiredCapabilities: AUTH,
      observations: [obs("GET", "/api/discovery/feed", 401)],
    });
    expect(result.adequate).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/never reads VERIFICATION_ACCOUNTS/);
    expect(result.reasons.join(" ")).toMatch(/refused as unauthenticated/);
  });

  it("is inadequate even without the capability declared, because it shows only a refusal", () => {
    const result = assessHttpEvidence({
      body: UNAUTHENTICATED_401_ONLY,
      requiredCapabilities: [],
      observations: [obs("GET", "/api/discovery/feed", 401)],
    });
    expect(result.adequate).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/refused as unauthenticated/);
  });
});

describe("2. test that claims authenticated-session but never authenticates", () => {
  it("is inadequate: it reads the account name but never signs in or sends a session", () => {
    const reasons = assessAuthentication(CLAIMS_AUTH_NEVER_AUTHENTICATES, [obs("GET", "/api/discovery/feed", 200)]);
    expect(reasons.join(" ")).toMatch(/never reads the login route/);
    expect(reasons.join(" ")).toMatch(/login route|session cookie|VERIFICATION_PATHS/);
  });

  it("does not accept a mere account reference in a comment as authentication", () => {
    const commentOnly = [
      "// VERIFICATION_ACCOUNTS VERIFICATION_PATHS login cookie set-cookie",
      'test("x", async () => { const base = process.env.VERIFICATION_BASE_URL; await fetch(base); assert.equal(1, 1); });',
    ].join("\n");
    const reasons = assessAuthentication(commentOnly, []);
    expect(reasons.length).toBeGreaterThan(0);
  });
});

describe("3. test that establishes authentication but never uses the authenticated session", () => {
  it("is inadequate: the session cookie is captured but no later request carries it", () => {
    const observations = [obs("POST", "/api/auth/login", 200), obs("GET", "/api/discovery/feed", 200)];
    const reasons = assessAuthentication(AUTHENTICATES_BUT_NEVER_USES_SESSION, observations);
    // The cookie is read from the login response, but the feed request sends no cookie header.
    expect(reasons.join(" ")).toMatch(/never sends a session cookie|authenticated session is unused/);
  });
});

describe("4. test that exercises only one part of a multi-step acceptance criterion", () => {
  it("is inadequate when the criterion's steps outnumber the requests that reached the application", () => {
    const reasons = assessStepCoverage({
      observations: [obs("POST", "/api/discovery/action", 200)],
      declaredSteps: declaredRequestSteps(MULTI_STEP_PARTIAL),
    });
    expect(reasons.join(" ")).toMatch(/issues 2 requests but only 1 reached/);
  });

  it("is adequate when every declared step produced an observed request", () => {
    expect(
      assessStepCoverage({
        observations: [obs("POST", "/api/auth/login", 200), obs("POST", "/api/discovery/action", 200)],
        declaredSteps: 2,
      }),
    ).toEqual([]);
  });
});

describe("5. valid HTTP test with observable evidence supporting its criterion", () => {
  it("is adequate: signs in, uses the session, observes a 2xx, and asserts status and body", () => {
    const result = assessHttpEvidence({
      body: AUTHENTICATED_BEHAVIOUR,
      requiredCapabilities: AUTH,
      observations: [obs("POST", "/api/auth/login", 200), obs("GET", "/api/discovery/feed", 200)],
    });
    expect(result).toEqual({ adequate: true, reasons: [] });
  });

  it("is structurally bound as well, so the existing binding rules still accept it", () => {
    expect(assessTestStructure(AUTHENTICATED_BEHAVIOUR, CRITERION).ok).toBe(true);
  });

  it("is adequate for an unauthenticated behavioural test that asserts a positive response", () => {
    const body = [
      MARKER,
      'test("public health", async () => {',
      '  const base = process.env.VERIFICATION_BASE_URL;',
      '  const response = await fetch(`${base}/api/health`);',
      "  assert.equal(response.status, 200);",
      "});",
    ].join("\n");
    expect(
      assessHttpEvidence({ body, requiredCapabilities: [], observations: [obs("GET", "/api/health", 200)] }).adequate,
    ).toBe(true);
  });
});

describe("6. executed and passing test with insufficient evidence yields not-verified, not PASS", () => {
  it("reports inadequate for a pass whose only observation is a refusal", () => {
    const result = assessHttpEvidence({
      body: UNAUTHENTICATED_401_ONLY,
      requiredCapabilities: [],
      observations: [obs("GET", "/api/discovery/feed", 401)],
    });
    expect(result.adequate).toBe(false);
  });

  it("reports no positive behaviour when no request succeeded", () => {
    expect(assessPositiveBehaviour([obs("GET", "/x", 500)])[0]).toMatch(/No observed request returned a successful/);
  });

  it("does not count a successful sign-in as the criterion's behaviour", () => {
    const result = assessHttpEvidence({
      body: AUTHENTICATED_BEHAVIOUR,
      requiredCapabilities: AUTH,
      observations: [obs("POST", "/api/auth/login", 200)],
      loginPath: "/api/auth/login",
    });
    expect(result.adequate).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/No observed request returned a successful/);
  });

  it("reports no HTTP behaviour when nothing reached the application", () => {
    expect(assessPositiveBehaviour([])[0]).toMatch(/made no HTTP request/);
  });

  it("requires a response assertion, so a pass with no check on the response is inadequate", () => {
    const body = [
      MARKER,
      'test("reaches the app", async () => {',
      '  const base = process.env.VERIFICATION_BASE_URL;',
      '  await fetch(`${base}/api/health`);',
      "});",
    ].join("\n");
    const result = assessHttpEvidence({ body, requiredCapabilities: [], observations: [obs("GET", "/api/health", 200)] });
    expect(result.adequate).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/makes no assertion on a response/);
  });

  it("does not count a literal named status as a response check", () => {
    expect(responseAssertionCount('assert.equal("status", "status");')).toBe(0);
    expect(responseAssertionCount("assert.equal(response.status, 200);")).toBe(1);
  });
});

describe("7. genuine product assertion failure remains distinguishable from insufficient evidence", () => {
  it("evidence adequacy never treats a failing product response as an evidence gap", () => {
    // A 500 from the product is a real observed failure. Adequacy reports no positive behaviour, which is an evidence
    // reason, but the execution status stays what the runner recorded (FAILED). The two are kept as separate fields.
    const result = assessHttpEvidence({
      body: AUTHENTICATED_BEHAVIOUR,
      requiredCapabilities: AUTH,
      observations: [obs("POST", "/api/auth/login", 200), obs("GET", "/api/discovery/feed", 500)],
      loginPath: "/api/auth/login",
    });
    expect(result.adequate).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/No observed request returned a successful/);
  });
});

describe("8. existing historical verification records remain compatible", () => {
  it("does not reclassify a legacy record with no observations and no HTTP adapter", () => {
    // Legacy records predate adapters and HTTP observations. Adequacy applies only to HTTP executions, and the
    // legacy path keeps its existing command-based rule (see executionIsCredible). Nothing here changes their result.
    const legacy = assessTestStructure(
      [MARKER, 'import { submit } from "../../src/submit.mjs";', 'test("x", () => { assert.equal(submit(), 1); });'].join("\n"),
      CRITERION,
    );
    expect(legacy.ok).toBe(true);
  });

  it("keeps the authenticated-session check off tests that never declared it", () => {
    const result = assessHttpEvidence({
      body: [MARKER, 'test("p", async () => { const base = process.env.VERIFICATION_BASE_URL; const r = await fetch(`${base}/api/health`); assert.equal(r.status, 200); });'].join("\n"),
      requiredCapabilities: [],
      observations: [obs("GET", "/api/health", 200)],
    });
    expect(result.adequate).toBe(true);
  });
});

describe("6b. verdict: an inadequate pass never yields PASS or FAIL", () => {
  it("a criterion left NOT_TESTED by inadequate evidence produces INCONCLUSIVE", () => {
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
    expect(verdict.verdict).not.toBe("PASS");
    expect(verdict.verdict).not.toBe("FAIL");
  });
});

describe("9. feed-only evidence cannot demonstrate a multi-step discovery criterion", () => {
  it("is inadequate when the body declares feed and action requests but only the feed was observed", () => {
    // Task 4-style: the criterion covers feed viewing and connect/pass. A test that only reaches the feed leaves
    // the action undemonstrated. The rule is generic: declared fetch steps must all leave observations.
    const body = [
      `// verifies:${CRITERION}`,
      "const accounts = JSON.parse(process.env.VERIFICATION_ACCOUNTS);",
      "const paths = JSON.parse(process.env.VERIFICATION_PATHS);",
      "const base = process.env.VERIFICATION_BASE_URL;",
      "const login = await fetch(`${base}${paths.login}`, { method: 'POST', body: JSON.stringify(accounts[0]) });",
      "const cookie = login.headers.getSetCookie().join('; ');",
      "const feed = await fetch(`${base}/api/discovery/feed`, { headers: { cookie } });",
      "assert.equal(feed.status, 200);",
      "const action = await fetch(`${base}/api/discovery/action`, { method: 'POST', headers: { cookie } });",
      "assert.equal(action.status, 200);",
      "assert.ok((await action.json()).result);",
    ].join("\n");
    const result = assessHttpEvidence({
      body,
      requiredCapabilities: AUTH,
      observations: [obs("POST", "/api/auth/login", 200), obs("GET", "/api/discovery/feed", 200)],
      loginPath: "/api/auth/login",
    });
    expect(result.adequate).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/issues 3 requests but only 2 reached/);
  });
});
