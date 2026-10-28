import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { childEnv } from "@/modules/coding/git";
import { assertSnapshotUnchanged } from "@/modules/verification/snapshot";
import type { TestRunOutcome } from "@/modules/verification/test-outcome";
import {
  allocateLoopbackPort,
  planApplication,
  readApplicationManifest,
  runPhase,
  startApplication,
  APPLICATION_TIMEOUTS,
  type ApplicationPlan,
  type ManagedApplication,
  type PhaseResult,
  type StartResult,
} from "@/modules/verification/http/lifecycle";
import { provisionVerificationDatabase, type VerificationDatabase } from "@/modules/verification/http/database";
import { VERIFICATION_DATABASE_CONFIGURATION_MESSAGE, verificationDatabaseAdminUrl } from "@/modules/verification/http/config";
import {
  accountsEnvironment,
  establishAccounts,
  generateAccounts,
  runFixtureSteps,
  secretsOf,
  type FixtureAccount,
  type FixturePlan,
} from "@/modules/verification/http/fixtures";
import { readObservations, writeGuard, type HttpObservation } from "@/modules/verification/http/guard";
import { NO_RESOURCE_TRACKER, processStartTime, type ResourceTracker } from "@/modules/verification/resources";

/**
 * Runs the HTTP black-box acceptance tests for one verification attempt.
 *
 * Order of work, and the stage name recorded when each step fails:
 *   configuration -> database provisioning -> install -> Prisma generate -> schema push (DATABASE_SETUP_FAILED)
 *   -> build -> start and health check -> accounts and login (AUTHENTICATION_SETUP_FAILED)
 *   -> setup requests (FIXTURE_SEEDING_FAILED) -> test files, one process each.
 *
 * A failure before the test files run blocks every case with the stage name. It is an environment or infrastructure
 * stop, not a product verdict. Whatever happens, the application is stopped and the database dropped in `finally`.
 */

export const HTTP_ADAPTER_ID = "http-blackbox";

export const HTTP_STAGE = {
  CONFIGURATION: "CONFIGURATION_MISSING",
  DATABASE: "DATABASE_SETUP_FAILED",
  INSTALL: "INSTALL_FAILED",
  BUILD: "APPLICATION_BUILD_FAILED",
  START: "APPLICATION_START_FAILED",
  HEALTH: "HEALTH_CHECK_FAILED",
  AUTHENTICATION: "AUTHENTICATION_SETUP_FAILED",
  FIXTURES: "FIXTURE_SEEDING_FAILED",
  /** An unexpected exception in the framework itself. Recorded as infrastructure so the session cannot stall. */
  HARNESS: "HARNESS_FAILED",
} as const;

export type HttpStage = (typeof HTTP_STAGE)[keyof typeof HTTP_STAGE];

export type HttpAcceptanceCase = {
  testCaseId: string;
  acceptanceCriterionId: string | null;
  filePath: string;
  body: string;
};

export type HttpCaseResult = {
  testCaseId: string;
  command: string;
  /** False when the test process did not start, for example because the stage before it failed. */
  attempted: boolean;
  stage: HttpStage | null;
  outcome: TestRunOutcome;
  exitCode: number | null;
  /** Redacted, bounded output. Passwords, cookies and connection strings are removed before storage. */
  output: string;
  observations: HttpObservation[];
  startedAt: Date;
};

export type HttpAcceptanceInput = {
  attemptId: string;
  workspacePath: string;
  baseCommit: string;
  cases: HttpAcceptanceCase[];
  fixturePlan: FixturePlan;
  forbiddenDatabaseNames: string[];
  /** Records temporary resources as they are created, so an interrupted attempt can be cleaned up. */
  tracker?: ResourceTracker;
};

/** Everything the orchestrator touches from the outside world. Tests replace these with fakes. */
export type HttpAcceptanceDeps = {
  env: Record<string, string | undefined>;
  assertSnapshot(workspacePath: string, baseCommit: string): Promise<void>;
  readManifest(workspacePath: string): ReturnType<typeof readApplicationManifest>;
  allocatePort(): Promise<number>;
  provisionDatabase(input: { adminUrl: string; attemptId: string; forbiddenNames: string[] }): Promise<VerificationDatabase>;
  runPhase(input: {
    argv: string[];
    cwd: string;
    env: Record<string, string>;
    timeoutMs: number;
    port: number;
    onStart?: (pid: number) => Promise<void>;
  }): Promise<PhaseResult>;
  startApplication(input: {
    argv: string[];
    cwd: string;
    env: Record<string, string>;
    port: number;
    onStart?: (pid: number) => Promise<void>;
  }): Promise<StartResult>;
  makeRuntimeDir(): string;
  removeRuntimeDir(directory: string): void;
  /** Writes one framework-approved test file into the verification workspace through the policy gate. */
  writeTest(input: HttpAcceptanceCase): Promise<{ allowed: boolean; reason: string }>;
  /** Runs one test command through the approved command gate, with extra environment. */
  runTest(input: { command: string; environment: Record<string, string> }): Promise<{
    allowed: boolean;
    reason: string;
    exitCode: number | null;
    output: string;
    timedOut: boolean;
  }>;
  classify(run: { exitCode: number | null; output: string; timedOut: boolean }): TestRunOutcome;
  /** Injected for tests; defaults to the platform fetch. */
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
};

const OUTPUT_LIMIT = 2_000;

type DepsOverride = (base: HttpAcceptanceDeps) => Partial<HttpAcceptanceDeps>;
let testOverride: DepsOverride | null = null;

/**
 * Test seam only. Lets an integration test wrap the real functions, for example to capture a managed application's
 * output or to replace database provisioning with a fake that still runs real HTTP. Pass null to clear it.
 */
export function setHttpAcceptanceOverridesForTests(override: DepsOverride | null) {
  testOverride = override;
}

/** Production wiring. The runner supplies the three functions that go through the verification policy gates. */
export function defaultHttpDeps(gates: Pick<HttpAcceptanceDeps, "writeTest" | "runTest" | "classify">): HttpAcceptanceDeps {
  const base = baseHttpDeps(gates);
  return testOverride ? { ...base, ...testOverride(base) } : base;
}

function baseHttpDeps(gates: Pick<HttpAcceptanceDeps, "writeTest" | "runTest" | "classify">): HttpAcceptanceDeps {
  return {
    env: process.env,
    assertSnapshot: assertSnapshotUnchanged,
    readManifest: readApplicationManifest,
    allocatePort: allocateLoopbackPort,
    provisionDatabase: provisionVerificationDatabase,
    runPhase,
    startApplication,
    makeRuntimeDir() {
      return fs.mkdtempSync(path.join(os.tmpdir(), "apf-verify-"));
    },
    removeRuntimeDir(directory) {
      fs.rmSync(directory, { recursive: true, force: true });
    },
    ...gates,
  };
}

/** Removes every value that must never appear in output or evidence. Longer secrets are replaced first. */
export function redact(text: string, secrets: string[]) {
  let result = text;
  for (const secret of [...new Set(secrets)].filter((value) => value.length >= 4).sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join("[redacted]");
  }
  return result;
}

function urlSecrets(url: string) {
  try {
    const parsed = new URL(url);
    return [url, decodeURIComponent(parsed.password)].filter(Boolean);
  } catch {
    return [url];
  }
}

function tail(text: string, limit = OUTPUT_LIMIT) {
  return text.length > limit ? text.slice(text.length - limit) : text;
}

function stageCategory(stage: HttpStage) {
  return stage === HTTP_STAGE.BUILD || stage === HTTP_STAGE.START || stage === HTTP_STAGE.HEALTH || stage === HTTP_STAGE.HARNESS
    ? ("INFRASTRUCTURE_FAILURE" as const)
    : ("ENVIRONMENT_FAILURE" as const);
}

function blockedResult(input: HttpAcceptanceCase, stage: HttpStage, reason: string, startedAt: Date): HttpCaseResult {
  return {
    testCaseId: input.testCaseId,
    command: `node --test ${input.filePath}`,
    attempted: false,
    stage,
    outcome: {
      category: stageCategory(stage),
      status: "BLOCKED",
      reason,
      counts: { tests: 0, passed: 0, failed: 0, skipped: 0, reported: false },
    },
    exitCode: null,
    output: reason,
    observations: [],
    startedAt,
  };
}

/** Environment for install, schema and build commands. NODE_ENV is not set, so dev dependencies are installed. */
function toolEnvironment(databaseUrl: string | null): Record<string, string> {
  const env: Record<string, string> = { ...(childEnv() as Record<string, string>), CI: "1", NEXT_TELEMETRY_DISABLED: "1" };
  delete env.NODE_ENV;
  if (databaseUrl) env.DATABASE_URL = databaseUrl;
  return env;
}

/** Environment for the production build and the running application. */
function applicationEnvironment(databaseUrl: string, sessionSecret: string): Record<string, string> {
  return {
    ...(childEnv() as Record<string, string>),
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: sessionSecret,
  };
}

export async function runHttpAcceptance(input: HttpAcceptanceInput, deps: HttpAcceptanceDeps): Promise<HttpCaseResult[]> {
  if (input.cases.length === 0) return [];
  const startedAt = new Date();
  // The source must be the approved snapshot before anything is provisioned or started.
  await deps.assertSnapshot(input.workspacePath, input.baseCommit);

  const adminUrl = verificationDatabaseAdminUrl(deps.env);
  if (!adminUrl) {
    return input.cases.map((item) => blockedResult(item, HTTP_STAGE.CONFIGURATION, VERIFICATION_DATABASE_CONFIGURATION_MESSAGE, startedAt));
  }

  const manifest = deps.readManifest(input.workspacePath);
  const port = await deps.allocatePort();
  const plan: ApplicationPlan = planApplication({ ...manifest, port });
  if (!plan.ok) {
    return input.cases.map((item) => blockedResult(item, HTTP_STAGE.CONFIGURATION, plan.reason, startedAt));
  }

  const runtimeDir = deps.makeRuntimeDir();
  const tracker = input.tracker ?? NO_RESOURCE_TRACKER;
  const runtimeId = `runtime:${runtimeDir}`;
  const cleanups: { label: string; run: () => Promise<string> }[] = [];
  const secrets: string[] = urlSecrets(adminUrl);
  let outcomes: HttpCaseResult[] = [];
  try {
    await tracker.record({ id: runtimeId, kind: "runtime-directory", path: runtimeDir });
    outcomes = await executeAttempt({ input, deps, plan, port, runtimeDir, cleanups, secrets, adminUrl, startedAt, tracker });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    outcomes = input.cases.map((item) =>
      blockedResult(item, HTTP_STAGE.HARNESS, redact(`The verification harness stopped unexpectedly. ${reason}`, secrets), startedAt),
    );
  } finally {
    // Last in, first out: the application stops before its database is dropped.
    const problems: string[] = [];
    for (const cleanup of cleanups.reverse()) {
      const note = await cleanup.run().catch((error: unknown) => `${cleanup.label} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      if (note) problems.push(note);
    }
    deps.removeRuntimeDir(runtimeDir);
    await tracker.release(runtimeId).catch(() => undefined);
    if (problems.length > 0) {
      outcomes = outcomes.map((item) => ({
        ...item,
        output: redact(`${item.output}\nCleanup: ${problems.join(" ")}`, secrets),
      }));
    }
  }
  return outcomes;
}

async function executeAttempt(args: {
  input: HttpAcceptanceInput;
  deps: HttpAcceptanceDeps;
  plan: Extract<ApplicationPlan, { ok: true }>;
  port: number;
  runtimeDir: string;
  cleanups: { label: string; run: () => Promise<string> }[];
  secrets: string[];
  adminUrl: string;
  startedAt: Date;
  tracker: ResourceTracker;
}): Promise<HttpCaseResult[]> {
  const { input, deps, plan, port, runtimeDir, cleanups, secrets, adminUrl, startedAt, tracker } = args;
  const allBlocked = (stage: HttpStage, reason: string) =>
    input.cases.map((item) => blockedResult(item, stage, redact(reason, secrets), startedAt));
  const failureDetail = (result: PhaseResult) => redact(tail(result.output), secrets).trim();

  let database: VerificationDatabase;
  try {
    database = await deps.provisionDatabase({ adminUrl, attemptId: input.attemptId, forbiddenNames: input.forbiddenDatabaseNames });
  } catch (error) {
    return allBlocked(HTTP_STAGE.DATABASE, `The verification database could not be created. ${error instanceof Error ? error.message : ""}`.trim());
  }
  secrets.push(...urlSecrets(database.url));
  const databaseId = `database:${database.name}`;
  cleanups.push({
    label: "Dropping the verification database",
    run: async () => {
      const result = await database.drop();
      if (result.dropped) await tracker.release(databaseId).catch(() => undefined);
      return result.dropped ? "" : result.reason;
    },
  });
  // Recorded after the cleanup is registered, so a failure here still drops the database.
  await tracker.record({ id: databaseId, kind: "database", name: database.name });
  const sessionSecret = crypto.randomBytes(32).toString("base64url");
  secrets.push(sessionSecret);

  // Each phase process group is recorded before it is waited on and released once it has finished.
  const phase = async (argv: string[], timeoutMs: number, env: Record<string, string>) => {
    let phaseId = "";
    const result = await deps.runPhase({
      argv,
      cwd: input.workspacePath,
      env,
      timeoutMs,
      port,
      onStart: async (pid) => {
        phaseId = `phase:${pid}`;
        await tracker.record({ id: phaseId, kind: "process-group", pid, processStart: processStartTime(pid) ?? "", label: argv.join(" ") });
      },
    });
    if (phaseId) await tracker.release(phaseId).catch(() => undefined);
    return result;
  };

  const install = await phase(plan.install, APPLICATION_TIMEOUTS.installMs, toolEnvironment(database.url));
  if (!install.ok) return allBlocked(HTTP_STAGE.INSTALL, `Installing dependencies failed. ${failureDetail(install)}`);

  if (plan.prismaGenerate) {
    const generated = await phase(plan.prismaGenerate, APPLICATION_TIMEOUTS.prismaMs, toolEnvironment(database.url));
    if (!generated.ok) return allBlocked(HTTP_STAGE.BUILD, `Generating the Prisma client failed. ${failureDetail(generated)}`);
  }
  if (plan.prismaDbPush) {
    const pushed = await phase(plan.prismaDbPush, APPLICATION_TIMEOUTS.prismaMs, toolEnvironment(database.url));
    if (!pushed.ok) return allBlocked(HTTP_STAGE.DATABASE, `Applying the schema to the verification database failed. ${failureDetail(pushed)}`);
  }

  const appEnv = applicationEnvironment(database.url, sessionSecret);
  if (plan.build) {
    const built = await phase(plan.build, APPLICATION_TIMEOUTS.buildMs, appEnv);
    if (!built.ok) return allBlocked(HTTP_STAGE.BUILD, `The application build failed. ${failureDetail(built)}`);
  }

  let applicationId = "";
  const started = await deps.startApplication({
    argv: plan.start,
    cwd: input.workspacePath,
    env: appEnv,
    port,
    onStart: async (pid) => {
      applicationId = `application:${pid}`;
      await tracker.record({
        id: applicationId,
        kind: "process-group",
        pid,
        processStart: processStartTime(pid) ?? "",
        label: "The managed application",
      });
    },
  });
  if (!started.ok) {
    return allBlocked(started.stage, `${started.reason} ${redact(tail(started.output), secrets).trim()}`.trim());
  }
  const app: ManagedApplication = started.app;
  cleanups.push({
    label: "Stopping the application",
    run: async () => {
      const stopped = await app.stop();
      if (stopped.stopped && applicationId) await tracker.release(applicationId).catch(() => undefined);
      return stopped.stopped ? "" : "A managed application process may still be running.";
    },
  });
  const baseUrl = app.baseUrl;
  const fetcher = deps.fetcher;

  const accounts: FixtureAccount[] = generateAccounts(input.attemptId, input.fixturePlan.authentication.accountKeys);
  if (input.fixturePlan.authentication.required) {
    const signedIn = await establishAccounts({ baseUrl, authentication: input.fixturePlan.authentication, accounts, fetcher });
    if (!signedIn.ok) return allBlocked(HTTP_STAGE.AUTHENTICATION, signedIn.reason);
  }
  secrets.push(...secretsOf(accounts), ...accounts.map((item) => item.password));

  const seeded = await runFixtureSteps({ baseUrl, steps: input.fixturePlan.steps, accounts, fetcher });
  if (!seeded.ok) return allBlocked(HTTP_STAGE.FIXTURES, seeded.reason);

  const guard = writeGuard(runtimeDir);
  const testEnvironment = {
    NODE_OPTIONS: `--import ${guard.url}`,
    VERIFICATION_BASE_URL: baseUrl,
    VERIFICATION_ACCOUNTS: accountsEnvironment(accounts),
    VERIFICATION_PATHS: JSON.stringify({
      signup: input.fixturePlan.authentication.signupPath,
      login: input.fixturePlan.authentication.loginPath,
    }),
  };

  const results: HttpCaseResult[] = [];
  for (const [index, item] of input.cases.entries()) {
    const caseStarted = new Date();
    const command = `node --test ${item.filePath}`;
    if (!item.filePath || !item.body) {
      const reason = "The automated case has no test file or body, so it was not executed.";
      results.push({
        testCaseId: item.testCaseId,
        command,
        attempted: false,
        stage: null,
        outcome: { category: "NOT_EXECUTED", status: "NOT_RUN", reason, counts: { tests: 0, passed: 0, failed: 0, skipped: 0, reported: false } },
        exitCode: null,
        output: reason,
        observations: [],
        startedAt: caseStarted,
      });
      continue;
    }
    const written = await deps.writeTest(item);
    if (!written.allowed) {
      results.push({
        testCaseId: item.testCaseId,
        command,
        attempted: false,
        stage: null,
        outcome: { category: "NOT_EXECUTED", status: "NOT_RUN", reason: written.reason, counts: { tests: 0, passed: 0, failed: 0, skipped: 0, reported: false } },
        exitCode: null,
        output: written.reason,
        observations: [],
        startedAt: caseStarted,
      });
      continue;
    }
    const observationsFile = path.join(runtimeDir, `observations-${index}.jsonl`);
    const ran = await deps.runTest({ command, environment: { ...testEnvironment, VERIFICATION_OBSERVATIONS_FILE: observationsFile } });
    const outcome: TestRunOutcome = ran.allowed
      ? deps.classify({ exitCode: ran.exitCode, output: ran.output, timedOut: ran.timedOut })
      : {
          category: "NOT_EXECUTED",
          status: "NOT_RUN",
          reason: ran.reason || "The command was refused by verification policy, so the test did not run.",
          counts: { tests: 0, passed: 0, failed: 0, skipped: 0, reported: false },
        };
    results.push({
      testCaseId: item.testCaseId,
      command,
      attempted: ran.allowed,
      stage: null,
      outcome,
      exitCode: ran.allowed ? ran.exitCode : null,
      output: redact(tail(ran.output), secrets).trim(),
      observations: readObservations(observationsFile),
      startedAt: caseStarted,
    });
  }
  return results;
}

export const __testing = { toolEnvironment, applicationEnvironment };
