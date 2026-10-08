import "server-only";

import fs from "node:fs";
import path from "node:path";

import { aiRunEvidence, combineAIEvidence, type AIRunEvidence } from "@/modules/ai/evidence";
import { getAIProvider } from "@/modules/ai/provider";
import type { AgentExecutionRequest, AgentRunner } from "@/modules/agent/types";
import { codingConfigurationGap } from "@/modules/coding/config";
import { db } from "@/lib/db";
import { recomputeSession } from "@/modules/verification/assess";
import { verificationEntryBlockers } from "@/modules/verification/gates";
import { VERIFICATION_SYSTEM_PROMPT, verificationUserMessage } from "@/modules/verification/prompt";
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
import { demonstratesCriterion } from "@/modules/verification/policy";
import { executeVerificationTool } from "@/modules/verification/tools";
import { DomainError } from "@/modules/shared/errors";
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
    });
    if (!session) throw new DomainError("Verification requires a session.");
    if (session.stale) throw new DomainError(session.staleReason || "RE-VERIFICATION REQUIRED.");
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
  const provider = getAIProvider();
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
  const context = boundedContext(session.workspace!.workspacePath);
  const evidence: AIRunEvidence[] = [];
  const conditions = await ask(conditionAnalysisSchema, "verification_conditions", "conditions", contract, context, evidence);
  const plan = await ask(verificationPlanSchema, "verification_plan", "plan", contract, context, evidence);
  const cases = await ask(testCaseSchema, "verification_test_cases", "test cases", contract, context, evidence);
  const mapping = await ask(coverageMappingSchema, "verification_coverage", "coverage", contract, context, evidence);
  const known = (id: string) => criterionIds.has(id);
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
  for (const testCase of cases.testCases) {
    if (testCase.acceptanceCriterionId && !known(testCase.acceptanceCriterionId)) continue;
    await db.verificationTestCase.create({
      data: {
        sessionId: session.id,
        acceptanceCriterionId: known(testCase.acceptanceCriterionId) ? testCase.acceptanceCriterionId : null,
        title: testCase.title,
        purpose: conditionPurpose(conditions.conditions, testCase.acceptanceCriterionId, testCase.purpose),
        preconditions: testCase.preconditions,
        steps: testCase.steps,
        expectedResult: testCase.expectedResult,
        testType: testCase.testType,
        priority: testCase.priority,
        source: testCase.source,
        provenance: "VERIFICATION_AGENT",
        automated: testCase.automated,
        status: "READY",
        filePath: testCase.filePath,
        body: testCase.body,
      },
    });
  }
  await db.verificationSession.update({
    where: { id: session.id },
    data: { status: "READY", existingTestNotes: plan.existingTestNotes, aiSummary: plan.summary },
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

async function runExecute(session: NonNullable<Awaited<ReturnType<typeof loadSession>>>) {
  await db.verificationSession.update({ where: { id: session.id }, data: { status: "EXECUTING" } });
  const workspacePath = session.workspace!.workspacePath;
  const cases = await db.verificationTestCase.findMany({ where: { sessionId: session.id } });
  for (const testCase of cases) {
    if (!testCase.automated || !testCase.body || !testCase.filePath) continue;
    const written = await executeVerificationTool(
      { sessionId: session.id, productId: session.productId, workspacePath },
      { action: "WRITE_FILE", path: testCase.filePath, content: testCase.body },
    );
    if (!written.allowed) continue;
    const command = `node --test ${testCase.filePath}`;
    const startedAt = new Date();
    const ran = await executeVerificationTool(
      { sessionId: session.id, productId: session.productId, workspacePath },
      { action: "RUN_COMMAND", command },
    );
    const exitCode = ran.exitCode;
    const passed = ran.allowed && exitCode === 0;
    await db.verificationExecution.create({
      data: {
        sessionId: session.id,
        testCaseId: testCase.id,
        command,
        kind: "NEW_VERIFICATION",
        status: ran.allowed ? (passed ? "PASSED" : "FAILED") : "NOT_RUN",
        exitCode,
        outputSummary: ran.output,
        startedAt,
        completedAt: new Date(),
      },
    });
    const demonstrated =
      passed &&
      Boolean(testCase.acceptanceCriterionId) &&
      demonstratesCriterion(testCase.body, testCase.acceptanceCriterionId ?? "");
    await db.verificationEvidence.create({
      data: {
        sessionId: session.id,
        testCaseId: testCase.id,
        acceptanceCriterionId: testCase.acceptanceCriterionId,
        type: "TEST_RESULT",
        source: "COMMAND_RUNNER",
        description: demonstrated
          ? "The verification test executed and demonstrates the linked acceptance criterion."
          : passed
            ? "The command exited 0. That execution success is not acceptance-criterion verification."
            : "The verification test failed.",
        result: demonstrated ? "DEMONSTRATED" : passed ? "EXECUTED" : "FAILED",
        command,
        exitCode,
      },
    });
    await db.verificationTestCase.update({
      where: { id: testCase.id },
      data: { status: passed ? "PASSED" : "FAILED" },
    });
  }
  const regression = await executeVerificationTool(
    { sessionId: session.id, productId: session.productId, workspacePath },
    { action: "RUN_COMMAND", command: "npm test" },
  );
  await db.verificationExecution.create({
    data: {
      sessionId: session.id,
      command: "npm test",
      kind: "EXISTING_REGRESSION",
      status: regression.allowed ? (regression.exitCode === 0 ? "PASSED" : "FAILED") : "NOT_RUN",
      exitCode: regression.exitCode,
      outputSummary: regression.output,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  const contract = contractText(session.contract!);
  const context = "Independent execution finished. Coding self-review is not a verdict.";
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

function boundedContext(workspacePath: string) {
  const chunks: string[] = [];
  const root = path.join(workspacePath, "src");
  const files: string[] = [];
  const walk = (directory: string, depth: number) => {
    if (depth > 3 || !fs.existsSync(directory)) return;
    for (const name of fs.readdirSync(directory)) {
      if (name === "node_modules" || name === ".git") continue;
      const absolute = path.join(directory, name);
      if (fs.statSync(absolute).isDirectory()) walk(absolute, depth + 1);
      else if (/\.(test|spec)\./.test(name) || name.endsWith(".ts") || name.endsWith(".js")) files.push(absolute);
    }
  };
  walk(workspacePath, 0);
  walk(root, 0);
  for (const file of files.slice(0, 8)) {
    const relative = path.relative(workspacePath, file);
    if (relative.includes(".env")) continue;
    chunks.push(`File ${relative}\n${fs.readFileSync(file, "utf8").slice(0, 1500)}`);
  }
  return chunks.join("\n\n").slice(0, 12_000) || "No project files were readable.";
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export type { AgentExecutionRequest };
