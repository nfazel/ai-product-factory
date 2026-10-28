import type { ImplementationProfile } from "@/modules/verification/inspection";
import { verificationAdapters } from "@/modules/verification/adapters/registry";
import { validateFixturePlan, type FixturePlan } from "@/modules/verification/http/fixtures";
import { hasStandaloneMarker, assessTestBinding } from "@/modules/verification/test-binding";
import { verificationMarker } from "@/modules/verification/policy";
import {
  assessAccountKeyLiterals,
  assessAuthenticatedSessionStructure,
} from "@/modules/verification/evidence-adequacy";

/**
 * Validates an AI-proposed verification plan before the framework accepts it.
 *
 * It reuses the existing validators rather than restating their rules:
 * - fixture configuration and account keys: validateFixturePlan (http/fixtures.ts);
 * - the criterion marker and test binding: hasStandaloneMarker and assessTestBinding (test-binding.ts);
 * - adapter compatibility, surface, file convention, and capabilities: the adapter registry's select();
 * - authentication capability: a test declaring authenticated-session needs configured verification accounts, and
 *   its body must show the authenticated-session structure (accounts, login path, cookie capture and reuse) and must
 *   not look up literal account keys that are absent from the fixture plan.
 *
 * Errors are split into two kinds:
 * - CORRECTABLE: a planning mistake the AI can fix in its own proposal (a marker form, an account key, a refused
 *   capability). These may trigger one correction request.
 * - TERMINAL: a case the framework can never run for this implementation (no adapter is available). Correction would
 *   not change the outcome, so it is not requested.
 *
 * Nothing here writes data, runs a test, or changes an approved criterion.
 */

export type PlanningErrorCode =
  | "FIXTURE_ACCOUNT_KEY_INVALID"
  | "FIXTURE_STEP_REFUSED"
  | "FIXTURE_AUTHENTICATION_NOT_ESTABLISHED"
  | "MARKER_MISSING"
  | "BINDING_REFUSED"
  | "AUTHENTICATION_NOT_CONFIGURED"
  | "AUTH_ACCOUNTS_NOT_READ"
  | "AUTH_LOGIN_PATH_NOT_READ"
  | "AUTH_SESSION_COOKIE_NOT_CAPTURED"
  | "AUTH_SESSION_COOKIE_NOT_REUSED"
  | "AUTH_ACCOUNT_KEY_UNKNOWN"
  | "ADAPTER_REFUSED"
  | "ADAPTER_UNAVAILABLE";

export type PlanningError = {
  code: PlanningErrorCode;
  /** Whether the AI can fix this in its own proposal. Only correctable errors trigger a correction request. */
  correctable: boolean;
  /** The test case it concerns, when the error is about one case. */
  testTitle: string;
  message: string;
};

export type CaseProposal = {
  title: string;
  automated: boolean;
  body: string;
  filePath: string;
  criterionId: string | null;
  manualReason: string;
  adapterId: string;
  targetSurface: string;
  requiredCapabilities: string[];
};

export type PlanProposal = {
  authentication: FixturePlan["authentication"];
  fixtureSteps: FixturePlan["steps"];
  testCases: CaseProposal[];
};

export type PlanValidation = {
  valid: boolean;
  /** Errors the AI could correct. */
  correctable: PlanningError[];
  /** Errors no correction can resolve. */
  terminal: PlanningError[];
  /** The fixture plan as the framework would store it, after dropping refused steps and accounts. */
  fixturePlan: FixturePlan;
  fixtureNotes: string[];
  /** Per-case governance result, keyed by the case's index in the proposal. */
  cases: GovernedCaseResult[];
};

export type GovernedCaseResult = {
  index: number;
  automated: boolean;
  adapterId: string;
  manualReason: string;
  errors: PlanningError[];
};

/** Adapter-level refusal for one case. Matches the decision the runner recorded before this module existed. */
function refuseAsManual(index: number, reason: string, errors: PlanningError[]): GovernedCaseResult {
  return { index, automated: false, adapterId: "", manualReason: reason, errors };
}

/**
 * Validates one proposed plan against the implementation. `routes` are the inspected route urls. `profile` supplies
 * adapter availability. `workspacePath` is the approved snapshot used for product module checks.
 */
export function validatePlanProposal(input: {
  proposal: PlanProposal;
  routes: string[];
  profile: ImplementationProfile;
  workspacePath: string;
}): PlanValidation {
  const fixtures = validateFixturePlan(
    { authentication: input.proposal.authentication, steps: input.proposal.fixtureSteps },
    input.routes,
  );
  const authenticationAvailable = fixtures.plan.authentication.required;
  const correctable: PlanningError[] = [];
  const terminal: PlanningError[] = [];

  // Fixture problems are correctable when the AI can name a valid key or route. Each note from validateFixturePlan is
  // one precise refusal, so each becomes one actionable error.
  for (const note of fixtures.notes) {
    const code: PlanningErrorCode = /Account key/.test(note)
      ? "FIXTURE_ACCOUNT_KEY_INVALID"
      : /Authentication was not set up/.test(note)
        ? "FIXTURE_AUTHENTICATION_NOT_ESTABLISHED"
        : "FIXTURE_STEP_REFUSED";
    correctable.push({ code, correctable: true, testTitle: "", message: note });
  }

  const accountKeys = fixtures.plan.authentication.accountKeys;
  const cases: GovernedCaseResult[] = input.proposal.testCases.map((testCase, index) => {
    const governed = governCase({
      testCase,
      index,
      profile: input.profile,
      workspacePath: input.workspacePath,
      authenticationAvailable,
      accountKeys,
    });
    for (const error of governed.errors) (error.correctable ? correctable : terminal).push(error);
    return governed;
  });

  return {
    valid: correctable.length === 0 && terminal.length === 0,
    correctable,
    terminal,
    fixturePlan: fixtures.plan,
    fixtureNotes: fixtures.notes,
    cases,
  };
}

/**
 * Decides whether one proposed case can be executed. This is the rule set the runner previously held in its own
 * function. Every refusal is one structured error. The case becomes manual when any error is raised.
 */
export function governCase(input: {
  testCase: CaseProposal;
  index: number;
  profile: ImplementationProfile;
  workspacePath: string;
  authenticationAvailable: boolean;
  /** Validated fixture-plan account keys. Literal lookups in the body must be members of this list. */
  accountKeys?: string[];
}): GovernedCaseResult {
  const { testCase: c, index } = input;
  const title = c.title;
  const accountKeys = input.accountKeys ?? [];
  const manual = (reason: string, errors: PlanningError[]) => refuseAsManual(index, reason, errors);
  const error = (code: PlanningErrorCode, correctable: boolean, message: string): PlanningError => ({
    code,
    correctable,
    testTitle: title,
    message,
  });

  if (!c.automated) {
    return {
      index,
      automated: false,
      adapterId: "",
      manualReason: c.manualReason.trim() || "The plan did not say why this case is manual, so a person must verify it.",
      errors: [],
    };
  }
  if (!c.criterionId) {
    const message = "The automated case is not linked to an acceptance criterion, so it cannot verify one.";
    return manual(`${message} A person must review it.`, [error("BINDING_REFUSED", true, message)]);
  }
  if (c.requiredCapabilities.includes("authenticated-session") && !input.authenticationAvailable) {
    const message =
      "The case needs an authenticated session, but the validated fixture plan provides no verification test account.";
    return manual(`${message} A person must verify this criterion.`, [error("AUTHENTICATION_NOT_CONFIGURED", true, message)]);
  }

  const selection = verificationAdapters.select({
    adapterId: c.adapterId,
    surface: c.targetSurface,
    filePath: c.filePath,
    requiredCapabilities: c.requiredCapabilities,
    profile: input.profile,
  });
  if (!selection.ok) {
    const lead =
      selection.kind === "UNAVAILABLE" ? "Automated execution is not available for this implementation." : "Automated execution was refused.";
    // An unavailable adapter cannot be fixed by rewording the case. A refused one might, so only refusals are correctable.
    const correctable = selection.kind === "REFUSED";
    return manual(`${lead} ${selection.reason} A person must verify this criterion.`.trim(), [
      error(correctable ? "ADAPTER_REFUSED" : "ADAPTER_UNAVAILABLE", correctable, selection.reason),
    ]);
  }

  const binding = assessTestBinding({
    body: c.body,
    criterionId: c.criterionId,
    filePath: c.filePath,
    workspacePath: input.workspacePath,
    adapterId: c.adapterId,
    targetSurface: c.targetSurface,
  });
  if (!binding.ok) {
    const markerMissing = !hasStandaloneMarker(c.body, c.criterionId);
    const errors = binding.reasons.map((reason) =>
      error(
        markerMissing && reason.includes(verificationMarker(c.criterionId!)) ? "MARKER_MISSING" : "BINDING_REFUSED",
        true,
        reason,
      ),
    );
    return manual(`Automated execution was refused. ${binding.reasons.join(" ")} A person must verify this criterion.`, errors);
  }

  // Account references are checked for every HTTP case; authenticated-session separately requires the login workflow.
  // Runtime evidence still confirms the session actually works.
  if (c.requiredCapabilities.includes("authenticated-session") || selection.adapter.id === "http-blackbox") {
    const authReasons = [
      ...(c.requiredCapabilities.includes("authenticated-session") ? assessAuthenticatedSessionStructure(c.body) : []),
      ...(selection.adapter.id === "http-blackbox" ? assessAccountKeyLiterals(c.body, accountKeys) : []),
    ];
    if (authReasons.length > 0) {
      const errors = authReasons.map((reason) => error(authStructureCode(reason), true, reason));
      return manual(`Automated execution was refused. ${authReasons.join(" ")} A person must verify this criterion.`, errors);
    }
  }

  return { index, automated: true, adapterId: selection.adapter.id, manualReason: "", errors: [] };
}

/** Maps a structural authentication reason to a stable planning error code for correction and audit. */
function authStructureCode(reason: string): PlanningErrorCode {
  if (reason.includes("VERIFICATION_ACCOUNTS")) return "AUTH_ACCOUNTS_NOT_READ";
  if (reason.includes("VERIFICATION_PATHS")) return "AUTH_LOGIN_PATH_NOT_READ";
  if (reason.includes("extracts a session cookie") || reason.includes("getSetCookie")) return "AUTH_SESSION_COOKIE_NOT_CAPTURED";
  if (reason.includes("sends a session cookie") || reason.includes("authenticated session is unused")) {
    return "AUTH_SESSION_COOKIE_NOT_REUSED";
  }
  if (reason.includes("is not in the fixture plan") || reason.includes("Available account keys")) {
    return "AUTH_ACCOUNT_KEY_UNKNOWN";
  }
  return "BINDING_REFUSED";
}

/**
 * Builds the single correction request. It lists each correctable error with its test title, so the AI can see exactly
 * what to fix. It restates the approved criteria and asks only for the failing parts to be corrected.
 */
export function correctionMessage(errors: PlanningError[]) {
  const lines = errors.map((item, index) => {
    const where = item.testTitle ? ` (test "${item.testTitle}")` : "";
    return `${index + 1}. [${item.code}]${where}: ${item.message}`;
  });
  return [
    "Your previous verification plan failed framework validation. Correct only the parts listed below.",
    "Keep the approved acceptance criteria and the intended behaviour of each test unchanged.",
    "Do not add or remove test cases. Do not rename criteria. Return the complete corrected plan.",
    "",
    "Validation errors:",
    ...lines,
    "",
    `Standalone marker rule: each automated test body must contain a line exactly like // verifies:<approved criterion id>. A test title is not a marker.`,
    `Authenticated-session rule: the body must read VERIFICATION_ACCOUNTS, read VERIFICATION_PATHS.login, extract the session cookie from the login response, and send that cookie on a later request.`,
    `Account-key rule: any literal account key compared to .key must be one of the fixture plan's authentication.accountKeys. Do not invent keys. accounts[0] is allowed.`,
  ].join("\n");
}

export type CorrectionStep = {
  validation: PlanValidation;
  /** The proposal the framework accepts. Original when correction did not help. */
  accepted: "INITIAL" | "CORRECTED" | "NONE";
  correctionRequests: number;
  stages: { stage: string; valid: boolean; errorCodes: string[] }[];
  /** The corrected proposal, when one was requested and returned. */
  corrected: PlanProposal | null;
};

/**
 * The bounded validate-and-correct decision, free of I/O. `correct` is the only outside call. The runner supplies the
 * real Verification Agent request; tests supply a stub. At most `maxCorrections` requests are made (default one).
 *
 * A corrected proposal replaces the original only when it passes validation. Otherwise the original is kept, and its
 * failures are the diagnostics the reviewer sees.
 */
export async function validateWithBoundedCorrection(input: {
  initial: PlanProposal;
  validate: (proposal: PlanProposal) => PlanValidation;
  correct: (errors: PlanningError[]) => Promise<PlanProposal | null>;
  maxCorrections?: number;
}): Promise<CorrectionStep> {
  const maxCorrections = input.maxCorrections ?? 1;
  const summarise = (stage: string, validation: PlanValidation) => ({
    stage,
    valid: validation.valid,
    errorCodes: [...validation.correctable, ...validation.terminal].map((item) => item.code),
  });

  const first = input.validate(input.initial);
  const stages = [summarise("INITIAL", first)];
  if (first.valid || first.correctable.length === 0 || maxCorrections < 1) {
    return { validation: first, accepted: "INITIAL", correctionRequests: 0, stages, corrected: null };
  }

  const corrected = await input.correct(first.correctable);
  if (!corrected) {
    stages.push({ stage: "CORRECTION_REFUSED", valid: false, errorCodes: [] });
    return { validation: first, accepted: "INITIAL", correctionRequests: 1, stages, corrected: null };
  }
  const second = input.validate(corrected);
  stages.push(summarise(second.valid ? "CORRECTED_PASSED" : "CORRECTED_FAILED", second));
  if (second.valid) {
    return { validation: second, accepted: "CORRECTED", correctionRequests: 1, stages, corrected };
  }
  return { validation: first, accepted: "INITIAL", correctionRequests: 1, stages, corrected };
}
