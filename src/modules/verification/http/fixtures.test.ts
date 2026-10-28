import { describe, expect, it, vi } from "vitest";

import {
  accountsEnvironment,
  cookieFromHeaders,
  establishAccounts,
  generateAccounts,
  runFixtureSteps,
  secretsOf,
  validateFixturePlan,
  type FixturePlan,
} from "@/modules/verification/http/fixtures";

const ROUTES = ["/api/auth/signup", "/api/auth/login", "/api/profile", "/api/discovery/feed", "/api/discovery/action"];

const PLAN: FixturePlan = {
  authentication: {
    required: true,
    signupPath: "/api/auth/signup",
    loginPath: "/api/auth/login",
    accountKeys: ["viewer", "candidate"],
  },
  steps: [
    { account: "viewer", method: "PUT", path: "/api/profile", body: '{"displayName":"Verifier"}', purpose: "profile" },
  ],
};

describe("validateFixturePlan", () => {
  it("keeps a plan whose paths are approved routes and whose accounts are valid", () => {
    const { plan, notes } = validateFixturePlan(PLAN, ROUTES);
    expect(notes).toEqual([]);
    expect(plan.authentication.required).toBe(true);
    expect(plan.steps).toHaveLength(1);
  });

  it("refuses a setup step for a path that is not an approved route, and says why", () => {
    const plan = validateFixturePlan(
      { ...PLAN, steps: [{ account: "viewer", method: "POST", path: "/api/admin/reset", body: "", purpose: "reset" }] },
      ROUTES,
    );
    expect(plan.plan.steps).toEqual([]);
    expect(plan.notes.join(" ")).toMatch(/not a route in the approved snapshot/);
  });

  it("refuses a setup step for an account that is not set up", () => {
    const plan = validateFixturePlan(
      { ...PLAN, steps: [{ account: "stranger", method: "GET", path: "/api/profile", body: "", purpose: "read" }] },
      ROUTES,
    );
    expect(plan.plan.steps).toEqual([]);
    expect(plan.notes.join(" ")).toMatch(/not set up/);
  });

  it("refuses a setup body that is not a JSON object", () => {
    const plan = validateFixturePlan(
      { ...PLAN, steps: [{ account: "viewer", method: "PUT", path: "/api/profile", body: "[1,2]", purpose: "bad" }] },
      ROUTES,
    );
    expect(plan.plan.steps).toEqual([]);
    expect(plan.notes.join(" ")).toMatch(/not a JSON object/);
  });

  it("turns authentication off when the signup or login path is not an approved route", () => {
    const plan = validateFixturePlan(
      { ...PLAN, authentication: { ...PLAN.authentication, loginPath: "/api/session" } },
      ROUTES,
    );
    expect(plan.plan.authentication).toEqual({ required: false, signupPath: "", loginPath: "", accountKeys: [] });
    expect(plan.notes.join(" ")).toMatch(/not set up/);
  });

  it("refuses an account key that could be used to inject a value into an email or a file name", () => {
    const plan = validateFixturePlan(
      { ...PLAN, authentication: { ...PLAN.authentication, accountKeys: ["../escape", "viewer"] } },
      ROUTES,
    );
    expect(plan.plan.authentication.accountKeys).toEqual(["viewer"]);
    expect(plan.notes.join(" ")).toMatch(/Account key "..\/escape" was refused/);
  });

  it("refuses a path with a query string, so a step cannot smuggle parameters past the route check", () => {
    const plan = validateFixturePlan(
      { ...PLAN, steps: [{ account: "viewer", method: "GET", path: "/api/profile?admin=1", body: "", purpose: "x" }] },
      ROUTES,
    );
    expect(plan.plan.steps).toEqual([]);
  });
});

describe("verification-only accounts", () => {
  it("generates accounts on the reserved .invalid domain with distinct random passwords", () => {
    const accounts = generateAccounts("0123456789abcdef", ["viewer", "candidate"]);
    expect(accounts.map((item) => item.email)).toEqual([
      expect.stringMatching(/^verifier-viewer-[a-z0-9]+@verification\.invalid$/),
      expect.stringMatching(/^verifier-candidate-[a-z0-9]+@verification\.invalid$/),
    ]);
    expect(accounts[0]?.password.length).toBeGreaterThanOrEqual(24);
    expect(accounts[0]?.password).not.toBe(accounts[1]?.password);
  });

  it("passes accounts to the test process without cookies, and reports the passwords as secrets to remove", () => {
    const accounts = generateAccounts("attempt1", ["viewer"]).map((item) => ({ ...item, cookie: "session=abc123xyz" }));
    const environment = accountsEnvironment(accounts);
    expect(JSON.parse(environment)).toEqual([
      { key: "viewer", email: accounts[0]?.email, password: accounts[0]?.password },
    ]);
    expect(environment).not.toContain("session=abc123xyz");
    expect(secretsOf(accounts)).toEqual(expect.arrayContaining([accounts[0]?.password, "abc123xyz"]));
  });

  it("joins the session cookie pairs from Set-Cookie headers without their attributes", () => {
    const headers = new Headers();
    headers.append("set-cookie", "session=abc123xyz; Path=/; HttpOnly");
    headers.append("set-cookie", "theme=dark; Path=/");
    expect(cookieFromHeaders(headers)).toBe("session=abc123xyz; theme=dark");
  });
});

describe("account sign-in and seeding", () => {
  it("creates each account, logs it in, and keeps its session cookie", async () => {
    const accounts = generateAccounts("attempt2", ["viewer"]);
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("/api/auth/signup")
        ? new Response("", { status: 201 })
        : new Response("", { status: 200, headers: { "set-cookie": "session=sess-value-1; Path=/; HttpOnly" } }),
    );
    const result = await establishAccounts({
      baseUrl: "http://127.0.0.1:4000",
      authentication: PLAN.authentication,
      accounts,
      fetcher,
    });
    expect(result).toEqual({ ok: true });
    expect(accounts[0]?.cookie).toBe("session=sess-value-1");
    expect(fetcher.mock.calls[0]?.[0]).toBe("http://127.0.0.1:4000/api/auth/signup");
  });

  it("treats an existing account (409) as set up when its login still works", async () => {
    const accounts = generateAccounts("attempt3", ["viewer"]);
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("/api/auth/signup")
        ? new Response("", { status: 409 })
        : new Response("", { status: 200, headers: { "set-cookie": "session=again; Path=/" } }),
    );
    const result = await establishAccounts({ baseUrl: "http://127.0.0.1:4000", authentication: PLAN.authentication, accounts, fetcher });
    expect(result).toEqual({ ok: true });
  });

  it("fails authentication setup when the signup is rejected, and names the account but not its password", async () => {
    const accounts = generateAccounts("attempt4", ["viewer"]);
    const result = await establishAccounts({
      baseUrl: "http://127.0.0.1:4000",
      authentication: PLAN.authentication,
      accounts,
      fetcher: async () => new Response("", { status: 500 }),
    });
    expect(result).toMatchObject({ ok: false, stage: "AUTHENTICATION_SETUP_FAILED" });
    expect(result.ok === false && result.reason).toMatch(/viewer/);
    expect(result.ok === false && result.reason).not.toContain(accounts[0]?.password ?? "x");
  });

  it("fails authentication setup when login succeeds without a session cookie", async () => {
    const accounts = generateAccounts("attempt5", ["viewer"]);
    const result = await establishAccounts({
      baseUrl: "http://127.0.0.1:4000",
      authentication: PLAN.authentication,
      accounts,
      fetcher: async (url: string) => new Response("", { status: url.endsWith("/signup") ? 201 : 200 }),
    });
    expect(result).toMatchObject({ ok: false, stage: "AUTHENTICATION_SETUP_FAILED" });
  });

  it("runs seeding steps as their account and stops at the first failed step", async () => {
    const accounts = generateAccounts("attempt6", ["viewer"]);
    accounts[0]!.cookie = "session=seeded";
    const seen: { url: string; cookie: string | undefined }[] = [];
    const result = await runFixtureSteps({
      baseUrl: "http://127.0.0.1:4000",
      steps: [
        { account: "viewer", method: "PUT", path: "/api/profile", body: '{"displayName":"x"}', purpose: "a" },
        { account: "viewer", method: "GET", path: "/api/discovery/feed", body: "", purpose: "b" },
      ],
      accounts,
      fetcher: async (url: string, init?: RequestInit) => {
        seen.push({ url, cookie: (init?.headers as Record<string, string>)?.cookie });
        return new Response("", { status: url.endsWith("/feed") ? 500 : 200 });
      },
    });
    expect(result).toMatchObject({ ok: false, stage: "FIXTURE_SEEDING_FAILED" });
    expect(seen.map((item) => item.cookie)).toEqual(["session=seeded", "session=seeded"]);
    expect(result.ok === false && result.reason).toMatch(/Setup step 2/);
  });

  it("refuses to run a setup step whose account has no session", async () => {
    const accounts = generateAccounts("attempt7", ["viewer"]);
    const fetcher = vi.fn(async () => new Response("", { status: 200 }));
    const result = await runFixtureSteps({
      baseUrl: "http://127.0.0.1:4000",
      steps: [{ account: "viewer", method: "GET", path: "/api/profile", body: "", purpose: "x" }],
      accounts,
      fetcher,
    });
    expect(result).toMatchObject({ ok: false, stage: "FIXTURE_SEEDING_FAILED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
