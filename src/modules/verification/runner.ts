import "server-only";

import fs from "node:fs";
import path from "node:path";

import { aiRunEvidence, combineAIEvidence, type AIRunEvidence } from "@/modules/ai/evidence";
import { getAIProvider } from "@/modules/ai/provider";
import type { AgentExecutionRequest, AgentRunner } from "@/modules/agent/types";
import { codingConfigurationGap } from "@/modules/coding/config";
import { parsePlannedCommands } from "@/modules/coding/commands";
import { asStrings } from "@/modules/coding/strings";
import { db } from "@/lib/db";
import { recomputeSession } from "@/modules/verification/assess";
import { sessionResourceTracker } from "@/modules/verification/recovery";
import { commandFailureIsEnvironment } from "@/modules/coding/bootstrap";
import { commandUnavailable, selectVerificationChecks, type VerificationCheck } from "@/modules/verification/commands";
import { failureReason } from "@/modules/verification/failure";
import { verificationEntryBlockers } from "@/modules/verification/gates";
import {
  VERIFICATION_SYSTEM_PROMPT,
  verificationUserMessage,
  withDeclaredAccountKeys,
} from "@/modules/verification/prompt";
import {
  conditionAnalysisSchema,
  coverageMappingSchema,
  defectProposalSchema,
  interpretationSchema,
  testCaseSchema,
  verificationPlanSchema,
  verificationSummarySchema,
} from "@/modules/verification/schema";
import { contractText } from "@/modules/verification/contract";
import { executeVerificationTool } from "@/modules/verification/tools";
import { inspectImplementation, type ImplementationProfile } from "@/modules/verification/inspection";
import { LEGACY_ADAPTER_ID, verificationAdapters } from "@/modules/verification/adapters/registry";
import { persistTestResult } from "@/modules/verification/adapters/results";
import {
  defaultHttpDeps,
  HTTP_ADAPTER_ID,
  runHttpAcceptance,
  type HttpAcceptanceCase,
} from "@/modules/verification/http/acceptance";
import { validateFixturePlan } from "@/modules/verification/http/fixtures";
import { EMPTY_FIXTURE_PLAN, type FixturePlan } from "@/modules/verification/http/fixtures";
import {
  correctionMessage,
  validatePlanProposal,
  validateWithBoundedCorrection,
  type PlanningError,
  type PlanProposal,
} from "@/modules/verification/planning-validation";
import type { HttpObservation } from "@/modules/verification/http/guard";
import { assertSnapshotUnchanged, changedProductFiles } from "@/modules/verification/snapshot";
import { assessTestStructure } from "@/modules/verification/test-binding";
import { assessHttpEvidence } from "@/modules/verification/evidence-adequacy";
import { assertVerificationEvidenceMutable } from "@/modules/verification/integrity";
import type { TestRunOutcome } from "@/modules/verification/test-outcome";
import { DomainError } from "@/modules/shared/errors";
import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";

const refusal = "The Verification Agent returned a response that did not match the required structure. Nothing further was written.";

export const verificationRunner: AgentRunner = {
  agentType: "TESTING",
  isConfigured() {
    return codingConfigurationGap() === null;
  },
  async assertCanRun(request) {
    const sessionId = text(request.input.sessionId);
    const session = await db.verificationSession.findFirst({
      where: { id: sessionId, productId: request.productId },
      include: {
        approvals: { include: { approval: true } },
        executions: { select: { id: true, exitCode: true, status: true } },
        coverages: { select: { acceptanceCriterionId: true, status: true } },
      },
    });
    if (!session) throw new DomainError("Verification requires a session.");
    assertVerificationEvidenceMutable(session);
    const blockers = await verificationEntryBlockers(request.productId, session.implementationTaskId);
    if (blockers.length > 0) throw new DomainError(blockers.join(" "));
  },
  async execute(request) {
    const session = await loadSession(request.productId, text(request.input.sessionId));
    if (request.input.phase === "execute") return runExecute(session);
    return runPlan(session);
  },
};

async function loadSession(productId: string, sessionId: string) {
  const session = await db.verificationSession.findFirst({
    where: { id: sessionId, productId },
    include: {
      contract: true,
      workspace: true,
      testCases: true,
      coverages: true,
      task: { include: { workItem: { include: { acceptanceCriteria: true } } } },
    },
  });
  if (!session?.contract || !session.workspace) throw new DomainError("Verification requires an isolated workspace.");
  return session;
}

async function ask<T>(
  schema: ZodType<T>,
  schemaName: string,
  phase: string,
  contract: string,
  context: string,
  evidence: AIRunEvidence[],
) {
  const provider = await getAIProvider();
  const result = await provider.generate({
    systemPrompt: VERIFICATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: verificationUserMessage({ phase, contract, context }) }],
    responseSchema: schema,
    schemaName,
    temperature: 0.1,
  });
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new DomainError(refusal);
  evidence.push(aiRunEvidence(result));
  return parsed.data;
}

async function runPlan(session: NonNullable<Awaited<ReturnType<typeof loadSession>>>) {
  const contract = contractText(session.contract!);
  const criterionIds = new Set((session.task.workItem?.acceptanceCriteria ?? []).map((item) => item.id));
  const workspacePath = session.workspace!.workspacePath;
  await assertSnapshotUnchanged(workspacePath, session.workspace!.baseCommit);
  const inspection = inspectImplementation({
    workspacePath,
    changedFiles: asStrings(session.contract?.changedFiles),
  });
  await db.verificationEvidence.create({
    data: {
      sessionId: session.id,
      type: "STATIC_ANALYSIS",
      source: "REPOSITORY",
      description: inspection.summary,
      result: "INSPECTED",
      command: "",
    },
  });
  const context = inspection.context;
  const evidence: AIRunEvidence[] = [];
  const conditions = await ask(conditionAnalysisSchema, "verification_conditions", "conditions", contract, context, evidence);
  const plan = await ask(verificationPlanSchema, "verification_plan", "plan", contract, context, evidence);
  const routes = inspection.profile.routes.map((route) => route.url);
  const validatedFixtures = validateFixturePlan(
    { authentication: plan.authentication, steps: plan.fixtureSteps },
    routes,
  );
  // Test generation sees exactly the validated keys that the harness will provision.
  const casesContext = withDeclaredAccountKeys(context, validatedFixtures.plan.authentication);
  const cases = await ask(testCaseSchema, "verification_test_cases", "test cases", contract, casesContext, evidence);
  const mapping = await ask(coverageMappingSchema, "verification_coverage", "coverage", contract, context, evidence);
  // Validate the whole proposal before accepting it. One correction is allowed, and only for correctable errors.
  const known = (id: string) => criterionIds.has(id);
  // Cases that cite no approved criterion are dropped before validation, so each validated case index matches the
  // case that is stored below.
  const knownCases = cases.testCases.filter((item) => !item.acceptanceCriterionId || known(item.acceptanceCriterionId));
  const accepted = await validateOrCorrect({
    session,
    contract,
    context: casesContext,
    evidence,
    initial: { authentication: plan.authentication, fixtureSteps: plan.fixtureSteps, testCases: knownCases },
    routes,
    profile: inspection.profile,
    workspacePath,
  });
  const fixtures = { plan: accepted.validation.fixturePlan, notes: accepted.validation.fixtureNotes };
  if (fixtures.notes.length > 0) {
    await db.verificationEvidence.create({
      data: {
        sessionId: session.id,
        type: "STATIC_ANALYSIS",
        source: "REPOSITORY",
        description: `Fixture plan: ${fixtures.notes.join(" ")}`,
        result: "INSPECTED",
        command: "",
      },
    });
  }
  for (const criterion of session.task.workItem?.acceptanceCriteria ?? []) {
    await db.verificationCondition.create({
      data: {
        sessionId: session.id,
        acceptanceCriterionId: criterion.id,
        title: criterion.description.slice(0, 180),
        description: "Positive path derived from the approved acceptance criterion.",
        negative: false,
        source: "ACCEPTANCE_CRITERION",
      },
    });
    await db.verificationCoverage.create({
      data: {
        sessionId: session.id,
        acceptanceCriterionId: criterion.id,
        status: "NOT_TESTED",
        rationale: mapping.mappings.find((item) => item.acceptanceCriterionId === criterion.id)?.rationale ?? "",
      },
    });
  }
  if (session.contract?.securityConstraints.trim()) {
    await db.verificationCondition.create({
      data: {
        sessionId: session.id,
        title: "Security-relevant behaviour from governance findings",
        description: session.contract.securityConstraints,
        negative: true,
        source: "SECURITY_FINDING",
      },
    });
  }
  await recordExistingTests(session.id, session.workspace!.workspacePath);
  for (const condition of conditions.conditions) {
    if (condition.acceptanceCriterionId && !known(condition.acceptanceCriterionId)) continue;
    await db.verificationCondition.create({
      data: {
        sessionId: session.id,
        acceptanceCriterionId: known(condition.acceptanceCriterionId) ? condition.acceptanceCriterionId : null,
        title: condition.title,
        description: condition.description,
        negative: condition.negative,
        source: condition.source,
      },
    });
  }
  const acceptedCases = accepted.testCases;
  for (const [caseIndex, testCase] of acceptedCases.entries()) {
    if (testCase.acceptanceCriterionId && !known(testCase.acceptanceCriterionId)) continue;
    const criterionId = known(testCase.acceptanceCriterionId) ? testCase.acceptanceCriterionId : null;
    // The model proposes; the platform decides. The governance result was computed by the shared validator, so the
    // case is manual with its reason stored whenever it cannot be executed.
    const governed = accepted.validation.cases[caseIndex] ?? {
      index: caseIndex,
      automated: false,
      adapterId: "",
      manualReason: "The case was not validated, so a person must verify it.",
      errors: [],
    };
    await db.verificationTestCase.create({
      data: {
        sessionId: session.id,
        acceptanceCriterionId: criterionId,
        title: testCase.title,
        purpose: conditionPurpose(conditions.conditions, testCase.acceptanceCriterionId, testCase.purpose),
        preconditions: testCase.preconditions,
        steps: testCase.steps,
        expectedResult: testCase.expectedResult,
        testType: testCase.testType,
        priority: testCase.priority,
        source: testCase.source,
        provenance: "VERIFICATION_AGENT",
        automated: governed.automated,
        manualReason: governed.automated ? "" : governed.manualReason,
        adapterId: governed.adapterId,
        targetSurface: testCase.targetSurface,
        requiredCapabilities: testCase.requiredCapabilities,
        status: "READY",
        filePath: testCase.filePath,
        body: testCase.body,
      },
    });
  }
  await db.verificationSession.update({
    where: { id: session.id },
    data: {
      status: "READY",
      existingTestNotes: plan.existingTestNotes,
      aiSummary: plan.summary,
      fixturePlan: { ...fixtures.plan, notes: fixtures.notes } as unknown as object,
    },
  });
  return {
    output: {
      phase: "plan",
      sessionId: session.id,
      summary: plan.summary,
      blocked: false,
      ...combineAIEvidence(evidence),
    },
  };
}

function conditionPurpose(
  conditions: { acceptanceCriterionId: string; negative: boolean; description: string }[],
  criterionId: string,
  purpose: string,
) {
  const negative = conditions.some((item) => item.acceptanceCriterionId === criterionId && item.negative);
  return negative ? `Negative path. ${purpose}` : purpose;
}

const MANUAL_NOT_RUN =
  "This case is manual. A person must run it and record the result in Execution & results. The verification run did not execute it.";

function manualNote(manualReason: string) {
  return manualReason ? `${manualReason} ${MANUAL_NOT_RUN}` : MANUAL_NOT_RUN;
}

const TEST_RESULT_LABEL = {
  PASSED: "EXECUTED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
  NOT_RUN: "NOT RUN",
} as const;

/**
 * Verification must not change the approved snapshot. A product file changed during the run means the verdict
 * would judge something other than what was approved, so it is recorded as a blocking escalation.
 */
async function recordProductChanges(sessionId: string, workspacePath: string) {
  const changed = await changedProductFiles(workspacePath);
  if (changed.length === 0) return;
  await db.verificationEscalation.create({
    data: {
      sessionId,
      type: "IMPLEMENTATION_CHANGE",
      description: `Verification changed files outside verification/: ${changed.slice(0, 20).join(", ")}.`,
      reason: "The approved snapshot must not change during verification, so this verdict cannot judge it.",
      status: "OPEN",
    },
  });
}

/**
 * Makes a skipped test case visible. The row has no acceptance-criterion link, so it cannot satisfy
 * coverage or change the verdict; it only explains why nothing was executed.
 */
async function recordNotRun(sessionId: string, testCaseId: string, reason: string) {
  const existing = await db.verificationEvidence.findFirst({
    where: { sessionId, testCaseId, result: "NOT RUN" },
    select: { id: true },
  });
  if (existing) return;
  await db.verificationEvidence.create({
    data: {
      sessionId,
      testCaseId,
      acceptanceCriterionId: null,
      type: "TEST_RESULT",
      source: "COMMAND_RUNNER",
      description: reason,
      result: "NOT RUN",
      command: "",
      exitCode: null,
    },
  });
}

async function runExecute(session: NonNullable<Awaited<ReturnType<typeof loadSession>>>) {
  await db.verificationSession.update({ where: { id: session.id }, data: { status: "EXECUTING" } });
  const workspacePath = session.workspace!.workspacePath;
  await assertSnapshotUnchanged(workspacePath, session.workspace!.baseCommit);
  const cases = await db.verificationTestCase.findMany({ where: { sessionId: session.id } });
  const httpCases: TestCaseRow[] = [];
  for (const testCase of cases) {
    if (!testCase.automated) {
      // Existing repository tests are recorded as "inspected only" and are not verification cases.
      if (testCase.provenance === "VERIFICATION_AGENT") {
        await recordNotRun(session.id, testCase.id, manualNote(testCase.manualReason));
      }
      continue;
    }
    if (!testCase.body || !testCase.filePath) {
      await recordNotRun(session.id, testCase.id, "The automated case has no test file or body, so it was not executed.");
      continue;
    }
    // HTTP cases share one managed application and one disposable database, so they run as a single attempt below.
    if (testCase.adapterId === HTTP_ADAPTER_ID) {
      httpCases.push(testCase);
      continue;
    }
    // Cases planned before adapters existed have no adapter id and ran node:test. Any other case runs only through
    // the adapter it names, and only if that adapter is registered, can execute, and accepts the file.
    const adapter = verificationAdapters.get(testCase.adapterId || LEGACY_ADAPTER_ID);
    if (!adapter?.canExecute || !adapter.acceptsFile(testCase.filePath)) {
      await recordNotRun(
        session.id,
        testCase.id,
        `The adapter ${testCase.adapterId || LEGACY_ADAPTER_ID} cannot execute ${testCase.filePath || "this case"}, so it was not run. A person must verify this criterion.`,
      );
      continue;
    }
    const written = await executeVerificationTool(
      { sessionId: session.id, productId: session.productId, workspacePath },
      { action: "WRITE_FILE", path: testCase.filePath, content: testCase.body },
    );
    if (!written.allowed) {
      await recordNotRun(
        session.id,
        testCase.id,
        `The test file ${testCase.filePath} was refused by verification policy, so the case was not executed. ${written.reason}`,
      );
      continue;
    }
    const command = adapter.commandFor(testCase.filePath);
    const startedAt = new Date();
    // The adapter proposed the command. It still runs only through the approved command gate.
    const ran = await executeVerificationTool(
      { sessionId: session.id, productId: session.productId, workspacePath },
      { action: "RUN_COMMAND", command },
    );
    const outcome = ran.allowed
      ? adapter.classify({ exitCode: ran.exitCode, output: ran.output, timedOut: ran.timedOut })
      : {
          category: "NOT_EXECUTED" as const,
          status: "NOT_RUN" as const,
          reason: ran.reason || "The command was refused by verification policy, so the test did not run.",
          counts: { tests: 0, passed: 0, failed: 0, skipped: 0, reported: false },
        };
    const result = await recordExecution(session, testCase, {
      adapterId: adapter.id,
      command,
      exitCode: ran.allowed ? ran.exitCode : null,
      output: ran.output,
      outcome,
      startedAt,
    });
    await db.verificationTestCase.update({
      where: { id: testCase.id },
      data: { status: result.executionStatus },
    });
  }
  if (httpCases.length > 0) {
    await runHttpCases(session, workspacePath, httpCases, storedFixturePlan(session.fixturePlan));
  }
  const checkLines = await runRepositoryChecks(session, workspacePath);
  await recordProductChanges(session.id, workspacePath);
  const contract = contractText(session.contract!);
  const context = [
    "Independent execution finished. Coding self-review is not a verdict.",
    "Technical checks:",
    checkLines.join("\n") || "No repository or plan check was selected.",
    "A passing technical check does not prove a product acceptance criterion.",
    "A missing test command is not a product defect.",
  ].join("\n");
  const evidence: AIRunEvidence[] = [];
  const interpretation = await ask(interpretationSchema, "verification_interpretation", "interpretation", contract, context, evidence);
  const defects = await ask(defectProposalSchema, "verification_defects", "defects", contract, context, evidence);
  const summary = await ask(verificationSummarySchema, "verification_summary", "summary", contract, context, evidence);
  await db.verificationEvidence.create({
    data: {
      sessionId: session.id,
      type: "AI_ANALYSIS",
      source: "AI_ANALYSIS",
      description: interpretation.summary || summary.rationale,
      result: "AI ANALYSIS",
    },
  });
  const failedCases = await db.verificationTestCase.findMany({
    where: { sessionId: session.id, status: "FAILED" },
  });
  for (const failedCase of failedCases) {
    const proposal = defects.defects.find(
      (item) => item.acceptanceCriterionId === failedCase.acceptanceCriterionId,
    );
    await createDefect(session, {
      title: proposal?.title || `Verification failed: ${failedCase.title}`,
      description: proposal?.description || failedCase.purpose,
      severity: proposal?.severity ?? "MEDIUM",
      acceptanceCriterionId: failedCase.acceptanceCriterionId,
      condition: proposal?.condition || failedCase.title,
      expected: proposal?.expected || failedCase.expectedResult,
      actual: proposal?.actual || "The verification test failed.",
    });
  }
  await db.verificationSession.update({
    where: { id: session.id },
    data: { proposedVerdict: summary.proposedVerdict, aiSummary: summary.rationale || interpretation.summary },
  });
  const decision = await recomputeSession(session.id);
  return {
    output: {
      phase: "execute",
      sessionId: session.id,
      summary: decision?.reason ?? summary.rationale,
      proposedVerdict: summary.proposedVerdict,
      verdict: decision?.verdict ?? "INCONCLUSIVE",
      blocked: decision?.status === "BLOCKED",
      ...combineAIEvidence(evidence),
    },
  };
}

type TestCaseRow = Awaited<ReturnType<typeof db.verificationTestCase.findMany>>[number];

/**
 * Records one adapter run as an execution and its evidence. A case is demonstrated only when it passed, is linked to a
 * criterion, is bound to product behaviour, and, for HTTP tests, made at least one request to the managed application.
 */
async function recordExecution(
  session: { id: string; workspace: { baseCommit: string } | null },
  testCase: TestCaseRow,
  run: {
    adapterId: string;
    command: string;
    exitCode: number | null;
    output: string;
    outcome: TestRunOutcome;
    startedAt: Date;
    failureCategory?: string;
    observations?: HttpObservation[];
    requiresRequests?: boolean;
    /** The framework's sign-in route for this session, so a successful login is not counted as the behaviour. */
    loginPath?: string;
  },
) {
  const structure = assessTestStructure(testCase.body, testCase.acceptanceCriterionId ?? "", {
    filePath: testCase.filePath,
    adapterId: testCase.adapterId,
    targetSurface: testCase.targetSurface,
  });
  const observed = !run.requiresRequests || (run.observations?.length ?? 0) > 0;
  const bound = run.outcome.status === "PASSED" && Boolean(testCase.acceptanceCriterionId) && structure.ok && observed;
  // A bound pass still has to show the criterion's behaviour: authenticated sessions, a positive outcome, and every
  // step reaching the application. Anything not shown leaves the execution PASSED but the criterion unverified.
  const adequacy = bound && run.requiresRequests
    ? assessHttpEvidence({
        body: testCase.body ?? "",
        requiredCapabilities: asStrings(testCase.requiredCapabilities),
        observations: run.observations ?? [],
        loginPath: run.loginPath,
      })
    : { adequate: true as const, reasons: [] as string[] };
  const demonstrated = bound && adequacy.adequate;
  const insufficient = bound && !adequacy.adequate;
  const basis = run.requiresRequests ? "observed HTTP responses" : "product code";
  const unbound = [
    ...structure.reasons,
    ...(observed ? [] : ["The test made no HTTP request to the managed application, so it observed no behaviour."]),
    ...(insufficient ? adequacy.reasons : []),
  ];
  return persistTestResult({
    sessionId: session.id,
    testCaseId: testCase.id,
    acceptanceCriterionId: testCase.acceptanceCriterionId,
    adapterId: run.adapterId,
    command: run.command,
    exitCode: run.exitCode,
    output: run.output,
    outcome: run.outcome,
    failureCategory: run.failureCategory,
    observations: run.observations,
    // The approved snapshot is what this run judged. Later credibility checks compare against it.
    snapshotCommit: session.workspace!.baseCommit,
    startedAt: run.startedAt,
    evidenceDescription: demonstrated
      ? `The verification test executed, passed, and is bound to the linked acceptance criterion through ${basis}.`
      : insufficient
        ? `The test executed and its assertions passed, but the evidence does not demonstrate the linked acceptance criterion. The criterion is not verified. This is an evidence gap, not a product defect. ${adequacy.reasons.join(" ")}`
        : run.outcome.status === "PASSED"
          ? `The command exited 0, but the test is not bound to product behaviour, so it does not verify the criterion. ${unbound.join(" ")}`
          : run.outcome.reason,
    evidenceResult: demonstrated
      ? "DEMONSTRATED"
      : insufficient
        ? "EVIDENCE INSUFFICIENT"
        : TEST_RESULT_LABEL[run.outcome.status],
  });
}

/**
 * Runs every HTTP case as one attempt: a managed application, a disposable database, and the framework's accounts and
 * setup. A failed setup stage is recorded as that stage, so it is never mistaken for a product verdict.
 */
async function runHttpCases(
  session: { id: string; productId: string; workspace: { baseCommit: string } | null },
  workspacePath: string,
  cases: TestCaseRow[],
  fixturePlan: FixturePlan,
) {
  const gate = { sessionId: session.id, productId: session.productId, workspacePath };
  const adapter = verificationAdapters.get(HTTP_ADAPTER_ID);
  if (!adapter) {
    for (const testCase of cases) {
      await recordNotRun(session.id, testCase.id, "The HTTP verification adapter is not registered, so the case was not executed.");
    }
    return;
  }
  const results = await runHttpAcceptance(
    {
      attemptId: randomUUID(),
      workspacePath,
      baseCommit: session.workspace!.baseCommit,
      cases: cases.map((testCase) => ({
        testCaseId: testCase.id,
        acceptanceCriterionId: testCase.acceptanceCriterionId,
        filePath: testCase.filePath ?? "",
        body: testCase.body ?? "",
      })),
      fixturePlan,
      forbiddenDatabaseNames: forbiddenDatabaseNames(),
      tracker: sessionResourceTracker(session.id),
    },
    defaultHttpDeps({
      writeTest: async (item: HttpAcceptanceCase) => {
        // The framework writes only approved HTTP paths. The adapter and the policy gate both check the path.
        if (!adapter.acceptsFile(item.filePath)) {
          return { allowed: false, reason: `The test file ${item.filePath} is not an approved HTTP verification path.` };
        }
        const written = await executeVerificationTool(gate, { action: "WRITE_FILE", path: item.filePath, content: item.body });
        return { allowed: written.allowed, reason: written.allowed ? "" : written.reason };
      },
      runTest: async (input: { command: string; environment: Record<string, string> }) => {
        const ran = await executeVerificationTool(gate, {
          action: "RUN_COMMAND",
          command: input.command,
          environment: input.environment,
        });
        return {
          allowed: ran.allowed,
          reason: ran.reason ?? "",
          exitCode: ran.exitCode,
          output: ran.output,
          timedOut: ran.timedOut,
        };
      },
      classify: (run: { exitCode: number | null; output: string; timedOut: boolean }) => adapter.classify(run),
    }),
  );
  const byId = new Map(cases.map((testCase) => [testCase.id, testCase]));
  for (const result of results) {
    const testCase = byId.get(result.testCaseId);
    if (!testCase) continue;
    if (!result.attempted && !result.stage) {
      await recordNotRun(session.id, testCase.id, result.outcome.reason);
      continue;
    }
    const recorded = await recordExecution(session, testCase, {
      adapterId: HTTP_ADAPTER_ID,
      command: result.command,
      exitCode: result.exitCode,
      output: result.output,
      outcome: result.outcome,
      startedAt: result.startedAt,
      failureCategory: result.stage ?? undefined,
      observations: result.observations,
      requiresRequests: true,
      loginPath: fixturePlan.authentication.loginPath,
    });
    await db.verificationTestCase.update({
      where: { id: testCase.id },
      data: { status: recorded.executionStatus },
    });
  }
}

/** Reads the fixture plan stored at planning time. Anything malformed means no fixtures, so no account is assumed. */
function storedFixturePlan(value: unknown): FixturePlan {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<FixturePlan>) : null;
  if (!record?.authentication || !Array.isArray(record.steps)) return EMPTY_FIXTURE_PLAN;
  return { authentication: record.authentication, steps: record.steps };
}

/** The builder's own database must never be created, used or dropped by verification. */
function forbiddenDatabaseNames() {
  const names = ["ai_product_factory"];
  const builder = process.env.DATABASE_URL;
  if (builder) {
    try {
      names.push(decodeURIComponent(new URL(builder).pathname.replace(/^\//, "")));
    } catch {
      // A malformed builder URL names no database, so there is nothing more to forbid.
    }
  }
  return names.filter((name) => name.length > 0);
}

async function createDefect(
  session: { id: string; productId: string; implementationTaskId: string; commitSha: string; task: { workItemId: string | null } },
  defect: {
    title: string;
    description: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    acceptanceCriterionId: string | null;
    condition: string;
    expected: string;
    actual: string;
  },
) {
  const workItem = await db.workItem.create({
    data: {
      productId: session.productId,
      parentId: session.task.workItemId,
      title: defect.title,
      description: [
        defect.description,
        `Condition: ${defect.condition}`,
        `Expected: ${defect.expected}`,
        `Actual: ${defect.actual}`,
        `Implementation task: ${session.implementationTaskId}`,
        `Commit: ${session.commitSha}`,
      ].join("\n"),
      type: "DEFECT",
      status: "DRAFT",
      stage: "PROVE",
      priority: defect.severity,
      provenance: "AI_PROPOSAL",
    },
  });
  await db.verificationDefectLink.create({
    data: {
      sessionId: session.id,
      workItemId: workItem.id,
      acceptanceCriterionId: defect.acceptanceCriterionId,
      implementationTaskId: session.implementationTaskId,
      commitSha: session.commitSha,
    },
  });
}

async function runRepositoryChecks(
  session: { id: string; productId: string; repositoryWorkspaceId: string | null },
  workspacePath: string,
) {
  const coding = session.repositoryWorkspaceId
    ? await db.repositoryWorkspace.findFirst({
        where: { id: session.repositoryWorkspaceId },
        include: { plan: true },
      })
    : null;
  const planned = [
    ...asStrings(coding?.plan?.setupCommands).map((command) => ({
      command,
      applicability: "REQUIRED" as const,
      kind: "SETUP" as const,
    })),
    ...parsePlannedCommands(coding?.plan?.validationCommands),
  ];
  const checks = selectVerificationChecks({ workspacePath, planned });
  const lines: string[] = [];
  for (const check of checks) {
    const recorded = await recordCheck(session, workspacePath, check);
    lines.push(`${check.command}: ${recorded}`);
    if (check.kind === "SETUP" && recorded !== "PASSED") {
      await db.verificationSession.update({
        where: { id: session.id },
        data: {
          status: "FAILED",
          failureClass: "VERIFICATION_SETUP_FAILED",
          verdictReason: failureReason("VERIFICATION_SETUP_FAILED"),
        },
      });
      throw new DomainError("Verification setup could not be completed. The product was not judged.");
    }
  }
  return lines;
}

async function recordCheck(
  session: { id: string; productId: string },
  workspacePath: string,
  check: VerificationCheck,
) {
  if (check.disposition === "NOT_APPLICABLE") {
    await db.verificationExecution.create({
      data: {
        sessionId: session.id,
        command: check.command,
        kind: "PLAN_CHECK",
        status: "NOT_RUN",
        outputSummary: check.reason,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await db.verificationEvidence.create({
      data: {
        sessionId: session.id,
        type: commandEvidenceType(check.command),
        source: "REPOSITORY",
        description: check.reason,
        result: "NOT APPLICABLE",
        command: check.command,
      },
    });
    return "NOT APPLICABLE";
  }
  if (check.disposition === "UNAVAILABLE") {
    await db.verificationExecution.create({
      data: {
        sessionId: session.id,
        command: check.command,
        kind: check.kind === "EXISTING_REGRESSION" ? "EXISTING_REGRESSION" : "PLAN_CHECK",
        status: "BLOCKED",
        outputSummary: check.reason,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await db.verificationEvidence.create({
      data: {
        sessionId: session.id,
        type: commandEvidenceType(check.command),
        source: "REPOSITORY",
        description: check.reason,
        result: "UNAVAILABLE",
        command: check.command,
      },
    });
    return "UNAVAILABLE";
  }
  const ran = await executeVerificationTool(
    { sessionId: session.id, productId: session.productId, workspacePath },
    { action: "RUN_COMMAND", command: check.command },
  );
  const unavailable = !ran.allowed || commandUnavailable(ran.output, ran.exitCode) || commandFailureIsEnvironment(ran.output);
  // An interrupted check is an infrastructure stop, not a product failure.
  const status = !ran.allowed || unavailable || ran.timedOut ? "BLOCKED" : ran.exitCode === 0 ? "PASSED" : "FAILED";
  await db.verificationExecution.create({
    data: {
      sessionId: session.id,
      command: check.command,
      kind: check.kind === "SETUP" ? "PLAN_CHECK" : check.kind,
      status,
      exitCode: ran.exitCode,
      outputSummary: ran.output || ran.reason || check.reason,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  if (status === "PASSED") return "PASSED";
  if (status === "BLOCKED") return "UNAVAILABLE";
  return "FAILED";
}

function commandEvidenceType(command: string) {
  if (command.includes("build")) return "BUILD_RESULT" as const;
  if (command.includes("typecheck")) return "TYPECHECK_RESULT" as const;
  return "TEST_RESULT" as const;
}

async function recordExistingTests(sessionId: string, workspacePath: string) {
  const files: string[] = [];
  const walk = (directory: string, depth: number) => {
    if (depth > 3 || !fs.existsSync(directory)) return;
    for (const name of fs.readdirSync(directory)) {
      if (name === "node_modules" || name === ".git" || name === "verification") continue;
      const absolute = path.join(directory, name);
      if (fs.statSync(absolute).isDirectory()) walk(absolute, depth + 1);
      else if (/\.(test|spec)\./.test(name)) files.push(absolute);
    }
  };
  walk(workspacePath, 0);
  for (const file of files.slice(0, 8)) {
    const body = fs.readFileSync(file, "utf8");
    const relative = path.relative(workspacePath, file);
    await db.verificationTestCase.create({
      data: {
        sessionId,
        title: relative,
        purpose: "Existing test inspected. Filename coverage is not acceptance-criterion verification.",
        expectedResult: "Inspected only.",
        provenance: body.includes("AI Product Factory Task") ? "CODING_AGENT" : "HUMAN_EXISTING",
        automated: false,
        status: "NOT_RUN",
        filePath: relative,
        source: "AGENT_ANALYSIS",
        testType: "UNIT",
      },
    });
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export type { AgentExecutionRequest };

/** The maximum number of correction requests for one plan. Deliberately one: a second failure is a diagnostic, not a loop. */
export const MAX_PLAN_CORRECTIONS = 1;

type ProposedPlan = {
  authentication: FixturePlan["authentication"];
  fixtureSteps: FixturePlan["steps"];
  testCases: TestCaseProposalShape[];
};

type TestCaseProposalShape = {
  title: string;
  purpose: string;
  preconditions: string;
  steps: string[];
  expectedResult: string;
  testType: string;
  priority: string;
  source: string;
  acceptanceCriterionId: string;
  automated: boolean;
  adapterId: string;
  targetSurface: string;
  requiredCapabilities: string[];
  filePath: string;
  body: string;
  manualReason: string;
};

/**
 * Validates the AI's proposal. If it has correctable errors, asks the Verification Agent once to correct its own
 * proposal, then revalidates. Each stage is recorded as evidence, so the outcome can be explained later.
 *
 * The approved criteria are not sent for change and the framework's rules are not relaxed. A correction that still
 * fails leaves the affected cases manual, with the validator's reasons.
 */
async function validateOrCorrect(input: {
  session: { id: string };
  contract: string;
  context: string;
  evidence: AIRunEvidence[];
  initial: ProposedPlan;
  routes: string[];
  profile: ImplementationProfile;
  workspacePath: string;
}) {
  const validate = (proposal: ProposedPlan) =>
    validatePlanProposal({
      proposal: toPlanProposal(proposal),
      routes: input.routes,
      profile: input.profile,
      workspacePath: input.workspacePath,
    });

  const outcome = await validateWithBoundedCorrection({
    initial: toPlanProposal(input.initial),
    validate: (proposal) => validate(fromPlanProposal(proposal, input.initial)),
    correct: async (errors) => {
      const corrected = await askCorrection({ ...input, errors });
      return corrected ? toPlanProposal(corrected) : null;
    },
    maxCorrections: MAX_PLAN_CORRECTIONS,
  });
  for (const stage of outcome.stages) {
    await recordPlanValidation(input.session.id, stage.stage, stage.valid, stage.errorCodes, outcome.correctionRequests);
  }
  const acceptedPlan = outcome.accepted === "CORRECTED" && outcome.corrected ? fromPlanProposal(outcome.corrected, input.initial) : input.initial;
  return { validation: outcome.validation, testCases: acceptedPlan.testCases, corrected: outcome.accepted === "CORRECTED" };
}

/** Maps the runner's proposal shape to the validator's. The mapping is one-to-one; nothing is rewritten. */
function toPlanProposal(proposal: ProposedPlan): PlanProposal {
  return {
    authentication: proposal.authentication,
    fixtureSteps: proposal.fixtureSteps,
    testCases: proposal.testCases.map((item) => ({
      title: item.title,
      automated: item.automated,
      body: item.body,
      filePath: item.filePath,
      criterionId: item.acceptanceCriterionId || null,
      manualReason: item.manualReason,
      adapterId: item.adapterId,
      targetSurface: item.targetSurface,
      requiredCapabilities: item.requiredCapabilities,
    })),
  };
}

/** Restores the runner's shape from a validator proposal, keeping the non-validated fields from the original. */
function fromPlanProposal(proposal: PlanProposal, original: ProposedPlan): ProposedPlan {
  return {
    authentication: proposal.authentication,
    fixtureSteps: proposal.fixtureSteps,
    testCases: proposal.testCases.map((item, index) => ({
      ...original.testCases[index]!,
      title: item.title,
      automated: item.automated,
      body: item.body,
      filePath: item.filePath,
      acceptanceCriterionId: item.criterionId ?? "",
      manualReason: item.manualReason,
      adapterId: item.adapterId,
      targetSurface: item.targetSurface,
      requiredCapabilities: item.requiredCapabilities,
    })),
  };
}

/**
 * Asks the Verification Agent once to correct its proposal. The corrected plan and corrected test cases are requested
 * with the same schemas as the original, so the correction cannot introduce a shape the framework does not accept.
 * Returns null when either response fails schema validation.
 */
async function askCorrection(input: {
  contract: string;
  context: string;
  evidence: AIRunEvidence[];
  errors: PlanningError[];
  routes: string[];
}): Promise<ProposedPlan | null> {
  const message = correctionMessage(input.errors);
  const planResult = await requestCorrected(verificationPlanSchema, "verification_plan", "plan correction", input, message);
  if (!planResult) return null;
  const correctedFixtures = validateFixturePlan(
    { authentication: planResult.authentication, steps: planResult.fixtureSteps },
    input.routes,
  );
  const correctionInput = {
    ...input,
    context: withDeclaredAccountKeys(input.context, correctedFixtures.plan.authentication),
  };
  const casesResult = await requestCorrected(testCaseSchema, "verification_test_cases", "test case correction", correctionInput, message);
  if (!casesResult) return null;
  return {
    authentication: planResult.authentication,
    fixtureSteps: planResult.fixtureSteps,
    testCases: casesResult.testCases,
  };
}

async function requestCorrected<T>(
  schema: ZodType<T>,
  schemaName: string,
  phase: string,
  input: { contract: string; context: string; evidence: AIRunEvidence[] },
  correction: string,
): Promise<T | null> {
  const provider = await getAIProvider();
  const result = await provider.generate({
    systemPrompt: VERIFICATION_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: verificationUserMessage({ phase, contract: input.contract, context: input.context }) },
      { role: "user", content: correction },
    ],
    responseSchema: schema,
    schemaName,
    temperature: 0.1,
  });
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) return null;
  input.evidence.push(aiRunEvidence(result));
  return parsed.data;
}

/** Stores one validation stage as an evidence row, so the audit trail explains the decision without a migration. */
async function recordPlanValidation(sessionId: string, stage: string, valid: boolean, codes: string[], correctionRequests: number) {
  await db.verificationEvidence.create({
    data: {
      sessionId,
      type: "STATIC_ANALYSIS",
      source: "REPOSITORY",
      description: `Plan validation ${stage} (correction requests: ${correctionRequests}). ${
        valid ? "No validation errors." : `Errors: ${codes.join(", ")}.`
      }`,
      result: valid ? "INSPECTED" : "NOT APPLICABLE",
      command: "",
    },
  });
}
