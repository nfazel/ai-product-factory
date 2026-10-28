import "server-only";

import { db } from "@/lib/db";
import type { AdapterTestResult } from "@/modules/verification/adapters/types";
import type { HttpObservation } from "@/modules/verification/http/guard";
import type { TestRunOutcome } from "@/modules/verification/test-outcome";

const OUTPUT_LIMIT = 2_000;

/**
 * Stores one adapter execution with the fields that tie it together: the criterion (on the evidence), the test case,
 * the execution, the adapter, the approved snapshot it ran against, and any HTTP requests it made. The caller decides
 * the evidence wording, because that wording depends on binding, which the adapter does not know about.
 *
 * `failureCategory` defaults to the outcome category. A framework stage such as DATABASE_SETUP_FAILED replaces it, so
 * a setup failure can be told apart from a test-run failure later.
 */
export async function persistTestResult(input: {
  sessionId: string;
  testCaseId: string;
  acceptanceCriterionId: string | null;
  adapterId: string;
  command: string;
  exitCode: number | null;
  output: string;
  outcome: TestRunOutcome;
  failureCategory?: string;
  observations?: HttpObservation[];
  snapshotCommit: string;
  startedAt: Date;
  evidenceDescription: string;
  evidenceResult: string;
}): Promise<AdapterTestResult> {
  const completedAt = new Date();
  const durationMs = Math.max(0, completedAt.getTime() - input.startedAt.getTime());
  const output = input.output.slice(0, OUTPUT_LIMIT);
  const observations = input.observations ?? [];
  const failureCategory = input.failureCategory ?? input.outcome.category;
  const execution = await db.verificationExecution.create({
    data: {
      sessionId: input.sessionId,
      testCaseId: input.testCaseId,
      command: input.command,
      kind: "NEW_VERIFICATION",
      status: input.outcome.status,
      exitCode: input.exitCode,
      outputSummary: output || input.outcome.reason,
      startedAt: input.startedAt,
      completedAt,
      adapterId: input.adapterId,
      failureCategory,
      snapshotCommit: input.snapshotCommit,
      durationMs,
      observations: observations as unknown as object[],
    },
  });
  const evidence = await db.verificationEvidence.create({
    data: {
      sessionId: input.sessionId,
      testCaseId: input.testCaseId,
      acceptanceCriterionId: input.acceptanceCriterionId,
      type: "TEST_RESULT",
      source: "COMMAND_RUNNER",
      description: input.evidenceDescription,
      result: input.evidenceResult,
      command: input.command,
      exitCode: input.exitCode,
      adapterId: input.adapterId,
      executionId: execution.id,
      snapshotCommit: input.snapshotCommit,
    },
  });
  return {
    executionId: execution.id,
    evidenceId: evidence.id,
    testCaseId: input.testCaseId,
    acceptanceCriterionId: input.acceptanceCriterionId,
    adapterId: input.adapterId,
    command: input.command,
    executionStatus: input.outcome.status,
    failureCategory,
    durationMs,
    output,
    snapshotCommit: input.snapshotCommit,
    observations,
  };
}
