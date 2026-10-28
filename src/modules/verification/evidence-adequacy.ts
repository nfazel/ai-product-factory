import { assertionArguments, stripComments } from "@/modules/verification/test-binding";
import type { HttpObservation } from "@/modules/verification/http/guard";

/**
 * Deterministic evidence-adequacy checks. They sit between "the test passed" and "the criterion is verified".
 *
 * Three distinct states are kept apart:
 * - EXECUTED: the test ran.
 * - PASSED: its assertions passed.
 * - CRITERION_VERIFIED: the executed evidence is adequate for the linked acceptance criterion.
 *
 * A passing test is adequate only when its declared shape and its observed behaviour support the criterion. When
 * adequacy cannot be shown, the result is EVIDENCE_INSUFFICIENT: the execution is kept, the criterion is not verified,
 * and no product defect is raised. The checks are generic. They read the declarations a test makes, the environment
 * names it uses, and the requests the guard recorded. They never hard-code a product's routes.
 *
 * What these checks cannot prove is recorded in the Phase report as a limitation: they can confirm that an
 * authenticated request succeeded, but they cannot confirm that the response means what the criterion says.
 */

export type EvidenceAdequacy =
  | { adequate: true; reasons: string[] }
  | { adequate: false; reasons: string[] };

export type EvidenceAdequacyInput = {
  body: string;
  /** Capabilities the test declared, for example authenticated-session. */
  requiredCapabilities: string[];
  observations: HttpObservation[];
  /** The framework's sign-in route, from the approved fixture plan. Its success is not criterion behaviour. */
  loginPath?: string;
};

const UNAUTHENTICATED_STATUSES = new Set([401, 403]);

/** The environment names an authenticated HTTP test must read from the framework. */
const ACCOUNTS_ENV = "VERIFICATION_ACCOUNTS";
const PATHS_ENV = "VERIFICATION_PATHS";

/** True when the test reads the framework's verification accounts from the environment. */
function readsAccounts(code: string) {
  return new RegExp(`\\b${ACCOUNTS_ENV}\\b`).test(code);
}

/** True when the test reads the framework-supplied login route, not a literal it chose itself. */
function readsLoginPath(code: string) {
  return new RegExp(`\\b${PATHS_ENV}\\b`).test(code) && /\blogin\b/i.test(code);
}

/** True when the test reads a session cookie from a login response (Set-Cookie / getSetCookie). */
function capturesSessionCookie(code: string) {
  return /\bset-cookie\b|\bgetSetCookie\s*\(/i.test(code);
}

/**
 * True when the test sends a cookie value on a later request. The cookie must be named in a headers position
 * (`cookie:` or `headers: { cookie`), not merely mentioned.
 */
function sendsSessionCookie(code: string) {
  return /\bheaders\s*:\s*\{[^}]*\bcookie\s*[:,}]|\bcookie\s*:\s*[A-Za-z_$][\w$.]*/i.test(code);
}

/**
 * A request that counts as the criterion's behaviour: a 2xx on any request other than the framework's sign-in route.
 * A successful login proves sign-in, not the behaviour the criterion describes, so it is excluded.
 */
function behaviourObservations(observations: HttpObservation[], loginPath: string) {
  return observations.filter(
    (item) => item.status >= 200 && item.status < 300 && item.path !== loginPath,
  );
}

/**
 * Structural authentication requirements for a test that declares authenticated-session. Planning uses this before
 * execution. Runtime evidence assessment adds observation checks on top. Comment-only mentions do not count.
 */
export function assessAuthenticatedSessionStructure(body: string): string[] {
  const code = stripComments(body);
  const reasons: string[] = [];
  if (!readsAccounts(code)) {
    reasons.push(
      `The test declares authenticated-session but never reads ${ACCOUNTS_ENV}, so it cannot use a verification account.`,
    );
  }
  if (!readsLoginPath(code)) {
    reasons.push(
      `The test declares authenticated-session but never reads the login route from ${PATHS_ENV}, so it never signs in.`,
    );
  }
  if (!capturesSessionCookie(code)) {
    reasons.push(
      "The test declares authenticated-session but never extracts a session cookie from the login response (Set-Cookie or getSetCookie).",
    );
  }
  if (!sendsSessionCookie(code)) {
    reasons.push(
      "The test declares authenticated-session but never sends a session cookie on a later request, so the authenticated session is unused.",
    );
  }
  return reasons;
}

/**
 * Literal account keys compared against `.key` in the test body (both `item.key === 'x'` and `'x' === item.key`).
 * Dynamic lookups such as `accounts[0]` or `item.key === someVariable` produce no literals and are not reported.
 * Comment-only mentions do not count.
 */
export function literalAccountKeysInBody(body: string): string[] {
  const code = stripComments(body);
  if (!/\bVERIFICATION_ACCOUNTS\b/.test(code)) return [];

  const found = new Set<string>();
  const keyProperty = String.raw`(?:\?\.\s*key\b|\.\s*key\b|\?\.\s*\[\s*["']key["']\s*\]|\[\s*["']key["']\s*\])`;
  const forward = new RegExp(`${keyProperty}\\s*={2,3}\\s*(['"])([a-z][a-z0-9-]{0,23})\\1`, "g");
  const reversed = new RegExp(`(['"])([a-z][a-z0-9-]{0,23})\\1\\s*={2,3}\\s*[A-Za-z_$][\\w$]*(?:${keyProperty})`, "g");
  for (const pattern of [forward, reversed]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
      const key = match[2];
      if (key) found.add(key);
    }
  }

  const keyBindings = new Set<string>();
  const destructuredKey = /\{([^{}]*)\}\s*\)\s*=>/g;
  for (const match of code.matchAll(destructuredKey)) {
    const keyField = /(?:^|,)\s*key(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*(?=,|$)/.exec(match[1] ?? "");
    if (keyField) keyBindings.add(keyField[1] ?? "key");
  }
  for (const binding of keyBindings) {
    const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const forwardBinding = new RegExp(`\\b${escapedBinding}\\b\\s*={2,3}\\s*(['"])([a-z][a-z0-9-]{0,23})\\1`, "g");
    const reverseBinding = new RegExp(`(['"])([a-z][a-z0-9-]{0,23})\\1\\s*={2,3}\\s*\\b${escapedBinding}\\b`, "g");
    for (const match of code.matchAll(forwardBinding)) {
      if (match[2]) found.add(match[2]);
    }
    for (const match of code.matchAll(reverseBinding)) {
      if (match[2]) found.add(match[2]);
    }
  }
  return [...found];
}

/**
 * Whether every literal account-key lookup in a test using verification accounts is one of the fixture plan's account keys.
 * Unknown literals are correctable planning errors. Array-index and other dynamic lookups are left alone.
 */
export function assessAccountKeyLiterals(body: string, accountKeys: string[]): string[] {
  const allowed = new Set(accountKeys);
  const available = accountKeys.length > 0 ? accountKeys.join(", ") : "(none)";
  const reasons: string[] = [];
  for (const key of literalAccountKeysInBody(body)) {
    if (allowed.has(key)) continue;
    reasons.push(
      `The test looks up account key "${key}", which is not in the fixture plan. Available account keys: ${available}. Use one of those keys (or accounts[0]); do not invent account identifiers.`,
    );
  }
  return reasons;
}

/**
 * Whether a test that declares authenticated-session actually establishes and uses an authenticated session.
 * Structure is checked first; when observations are present, a successful non-login request is also required.
 */
export function assessAuthentication(body: string, observations: HttpObservation[], loginPath = ""): string[] {
  const reasons = assessAuthenticatedSessionStructure(body);
  if (observations.length > 0 && behaviourObservations(observations, loginPath).length === 0) {
    reasons.push("No request the test made succeeded, so no authenticated behaviour was observed.");
  }
  return reasons;
}

/**
 * Whether the test exercised a positive outcome: at least one request that succeeded (2xx), with the status
 * assertion and a body or structural assertion on the response. A test whose only observed request is refused
 * (401, 403) shows that the product refuses, not that it does what the criterion describes.
 */
export function assessPositiveBehaviour(observations: HttpObservation[], loginPath = ""): string[] {
  if (observations.length === 0) {
    return ["The test made no HTTP request to the managed application, so it observed no behaviour."];
  }
  const succeeded = behaviourObservations(observations, loginPath);
  if (succeeded.length === 0) {
    const refused = observations.every((item) => UNAUTHENTICATED_STATUSES.has(item.status));
    return [
      refused
        ? "Every observed request was refused as unauthenticated (401 or 403). That shows the product refuses anonymous access, not that the criterion's behaviour works."
        : "No observed request returned a successful (2xx) response, so no positive behaviour was demonstrated.",
    ];
  }
  return [];
}

/**
 * Whether the observed requests cover the behaviour the test asserts. A criterion that describes several steps
 * (for example sign in, then request the feed, then act on a result) needs requests for more than one distinct
 * method and path. A single request cannot cover a multi-step criterion. The number of steps is read from the
 * declared test purpose, not from any product route.
 */
export function assessStepCoverage(input: {
  observations: HttpObservation[];
  declaredSteps: number;
}): string[] {
  if (input.declaredSteps <= 1) return [];
  // Each fetch the test makes should leave one observation. Fewer observations than steps means some step never
  // reached the application, so that part of the behaviour was not demonstrated.
  if (input.observations.length < input.declaredSteps) {
    return [
      `The test issues ${input.declaredSteps} requests but only ${input.observations.length} reached the managed application. Part of the behaviour was not exercised.`,
    ];
  }
  return [];
}

/**
 * How many separate requests the test body issues, counted from its fetch() calls. Each fetch is one step the
 * criterion must be shown to exercise. Counted from the code, so no product route is hard-coded.
 */
export function declaredRequestSteps(body: string) {
  const code = stripComments(body);
  return (code.match(/\bfetch\s*\(/g) ?? []).length;
}

/**
 * Count of assertions whose argument reads a response: a `.status`, `.ok`, `.headers` or a body accessor (`.json()`,
 * `.text()`) on something. Matching the access shape, not a bare keyword, keeps a literal such as "status" from
 * counting as a response check.
 */
export function responseAssertionCount(body: string) {
  const code = stripComments(body);
  const assertions = assertionArguments(code);
  const readsResponse = /\.\s*(?:status|ok|headers|json|text)\b/;
  return assertions.filter((args) => args.some((item) => readsResponse.test(item))).length;
}

/**
 * Decides whether one HTTP test's executed evidence sufficiently demonstrates its criterion. It is called only for
 * tests that already passed structural binding and an execution with observations. It is conservative: when any
 * requirement is not shown, the result is inadequate.
 */
export function assessHttpEvidence(input: EvidenceAdequacyInput): EvidenceAdequacy {
  const reasons: string[] = [];
  const declaresAuth = input.requiredCapabilities.includes("authenticated-session");
  if (declaresAuth) {
    reasons.push(...assessAuthentication(input.body, input.observations, input.loginPath ?? ""));
  }
  reasons.push(...assessPositiveBehaviour(input.observations, input.loginPath ?? ""));
  reasons.push(...assessStepCoverage({ observations: input.observations, declaredSteps: declaredRequestSteps(input.body) }));
  if (responseAssertionCount(input.body) === 0) {
    reasons.push("The test makes no assertion on a response status or body, so it does not check what the product returned.");
  }
  return reasons.length === 0 ? { adequate: true, reasons: [] } : { adequate: false, reasons };
}
