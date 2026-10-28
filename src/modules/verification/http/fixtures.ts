import crypto from "node:crypto";

/**
 * Test accounts and seeded test data for HTTP acceptance tests.
 *
 * The Verification Agent proposes which accounts and setup requests a test needs. The framework decides what runs:
 * - every path must be one of the routes the inspection found in the approved snapshot;
 * - only the listed HTTP methods are allowed, and bodies must be JSON objects;
 * - accounts are created with generated `.invalid` addresses and random passwords, so they cannot be real users;
 * - the requests go only to the managed application, through the same origin the tests use.
 *
 * Passwords and cookies are returned to the caller for the test process and for redaction. They are not logged.
 */

export const FIXTURE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type FixtureMethod = (typeof FIXTURE_METHODS)[number];

export type FixtureStep = {
  account: string;
  method: FixtureMethod;
  path: string;
  body: string;
  purpose: string;
};

export type FixtureAuthentication = {
  required: boolean;
  signupPath: string;
  loginPath: string;
  accountKeys: string[];
};

export type FixturePlan = {
  authentication: FixtureAuthentication;
  steps: FixtureStep[];
};

export type FixtureAccount = {
  key: string;
  email: string;
  password: string;
  cookie: string;
};

const ACCOUNT_KEY = /^[a-z][a-z0-9-]{0,23}$/;
const MAX_STEP_BODY = 4_000;

/** Empty plan: no accounts and no setup. Used when the agent proposes none. */
export const EMPTY_FIXTURE_PLAN: FixturePlan = {
  authentication: { required: false, signupPath: "", loginPath: "", accountKeys: [] },
  steps: [],
};

function routeSet(routes: string[]) {
  return new Set(routes.map((route) => route.replace(/\/+$/, "") || "/"));
}

function isRoutePath(path: string, routes: Set<string>) {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\s]/.test(path)) return false;
  return routes.has(path.replace(/\/+$/, "") || "/");
}

/**
 * Validates a proposed plan against the inspected routes. Invalid steps are dropped and each drop is explained, so the
 * reviewer can see what was refused. Authentication that cannot be established is turned off with a reason.
 */
export function validateFixturePlan(
  proposed: FixturePlan,
  routes: string[],
): { plan: FixturePlan; notes: string[] } {
  const known = routeSet(routes);
  const notes: string[] = [];
  const accountKeys = [...new Set(proposed.authentication.accountKeys)].filter((key) => {
    const valid = ACCOUNT_KEY.test(key);
    if (!valid) notes.push(`Account key "${key}" was refused: use lowercase letters, digits and hyphens.`);
    return valid;
  });

  let authentication: FixtureAuthentication = { required: false, signupPath: "", loginPath: "", accountKeys: [] };
  if (proposed.authentication.required || accountKeys.length > 0) {
    const signupOk = isRoutePath(proposed.authentication.signupPath, known);
    const loginOk = isRoutePath(proposed.authentication.loginPath, known);
    if (accountKeys.length === 0) {
      notes.push("Authentication was not set up because no valid account key was proposed.");
    } else if (!signupOk || !loginOk) {
      notes.push(
        `Authentication was not set up because the proposed signup path (${proposed.authentication.signupPath || "none"}) or login path (${proposed.authentication.loginPath || "none"}) is not a route in the approved snapshot.`,
      );
    } else {
      authentication = {
        required: true,
        signupPath: proposed.authentication.signupPath,
        loginPath: proposed.authentication.loginPath,
        accountKeys,
      };
    }
  }

  const steps: FixtureStep[] = [];
  for (const step of proposed.steps) {
    if (!authentication.accountKeys.includes(step.account)) {
      notes.push(`A setup step for ${step.path} was refused: its account ${step.account || "(none)"} is not set up.`);
      continue;
    }
    if (!isRoutePath(step.path, known)) {
      notes.push(`A setup step for ${step.path} was refused: the path is not a route in the approved snapshot.`);
      continue;
    }
    if (!(FIXTURE_METHODS as readonly string[]).includes(step.method)) {
      notes.push(`A setup step for ${step.path} was refused: ${step.method} is not an allowed method.`);
      continue;
    }
    if (step.body.length > MAX_STEP_BODY) {
      notes.push(`A setup step for ${step.path} was refused: the body is too large.`);
      continue;
    }
    if (step.body.trim()) {
      try {
        const parsed: unknown = JSON.parse(step.body);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      } catch {
        notes.push(`A setup step for ${step.path} was refused: its body is not a JSON object.`);
        continue;
      }
    }
    steps.push(step);
  }
  return { plan: { authentication, steps }, notes };
}

/** Generates verification-only accounts. The `.invalid` top-level domain can never resolve to a real mailbox. */
export function generateAccounts(attemptSuffix: string, keys: string[]): FixtureAccount[] {
  const suffix = attemptSuffix.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12) || "attempt";
  return keys.map((key) => ({
    key,
    email: `verifier-${key}-${suffix}@verification.invalid`,
    password: crypto.randomBytes(18).toString("base64url"),
    cookie: "",
  }));
}

/** Joins the cookie pairs from Set-Cookie headers into a single Cookie header value. */
export function cookieFromHeaders(headers: Headers): string {
  const lines =
    typeof (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [headers.get("set-cookie") ?? ""].filter(Boolean);
  return lines
    .map((line) => line.split(";")[0]?.trim() ?? "")
    .filter((pair) => pair.includes("=") && pair.split("=")[1]?.length)
    .join("; ");
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type FixtureOutcome = { ok: true } | { ok: false; stage: "AUTHENTICATION_SETUP_FAILED" | "FIXTURE_SEEDING_FAILED"; reason: string };

/** Creates each account through the signup route and logs it in. Every account must end with a session cookie. */
export async function establishAccounts(input: {
  baseUrl: string;
  authentication: FixtureAuthentication;
  accounts: FixtureAccount[];
  fetcher?: Fetcher;
}): Promise<FixtureOutcome> {
  const fetcher: Fetcher = input.fetcher ?? ((url, init) => fetch(url, init));
  if (!input.authentication.required) return { ok: true };
  for (const account of input.accounts) {
    const signup = await fetcher(`${input.baseUrl}${input.authentication.signupPath}`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    // A 409 means the account already exists; the login below decides whether the credentials work.
    if (!(signup.status >= 200 && signup.status < 300) && signup.status !== 409) {
      return {
        ok: false,
        stage: "AUTHENTICATION_SETUP_FAILED",
        reason: `Creating the verification account ${account.key} returned status ${signup.status}.`,
      };
    }
    const login = await fetcher(`${input.baseUrl}${input.authentication.loginPath}`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    const cookie = cookieFromHeaders(login.headers);
    if (login.status !== 200 || !cookie) {
      return {
        ok: false,
        stage: "AUTHENTICATION_SETUP_FAILED",
        reason: `Logging in as the verification account ${account.key} returned status ${login.status} without a session.`,
      };
    }
    account.cookie = cookie;
  }
  return { ok: true };
}

/** Runs the setup requests in order, each as its account. Any non-success status stops the seeding. */
export async function runFixtureSteps(input: {
  baseUrl: string;
  steps: FixtureStep[];
  accounts: FixtureAccount[];
  fetcher?: Fetcher;
}): Promise<FixtureOutcome> {
  const fetcher: Fetcher = input.fetcher ?? ((url, init) => fetch(url, init));
  for (const [index, step] of input.steps.entries()) {
    const account = input.accounts.find((item) => item.key === step.account);
    if (!account?.cookie) {
      return { ok: false, stage: "FIXTURE_SEEDING_FAILED", reason: `Setup step ${index + 1} has no signed-in account.` };
    }
    const response = await fetcher(`${input.baseUrl}${step.path}`, {
      method: step.method,
      redirect: "manual",
      headers: {
        cookie: account.cookie,
        ...(step.body.trim() ? { "content-type": "application/json" } : {}),
      },
      body: step.body.trim() ? step.body : undefined,
    });
    if (!(response.status >= 200 && response.status < 300)) {
      return {
        ok: false,
        stage: "FIXTURE_SEEDING_FAILED",
        reason: `Setup step ${index + 1} (${step.method} ${step.path}) returned status ${response.status}.`,
      };
    }
  }
  return { ok: true };
}

/** The environment the acceptance tests receive. Passwords are included only for the test process. */
export function accountsEnvironment(accounts: FixtureAccount[]) {
  return JSON.stringify(accounts.map((account) => ({ key: account.key, email: account.email, password: account.password })));
}

/** Every secret value that must be removed from output and evidence. */
export function secretsOf(accounts: FixtureAccount[]) {
  return accounts.flatMap((account) => [account.password, account.cookie.split("=")[1] ?? ""]).filter((value) => value.length >= 6);
}
