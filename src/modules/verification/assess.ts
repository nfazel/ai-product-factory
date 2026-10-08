import "server-only";

import { db } from "@/lib/db";
import { demonstratesCriterion } from "@/modules/verification/policy";
import { decideVerdict, evidenceAreas, sessionStatusFor } from "@/modules/verification/verdict";

export async function recomputeSession(sessionId: string) {
  const session = await db.verificationSession.findUnique({
    where: { id: sessionId },
    include: {
      coverages: true,
      testCases: true,
      executions: true,
      escalations: true,
      nfrResults: true,
      defectLinks: { include: { workItem: true } },
      evidence: true,
    },
  });
  if (!session) return null;
  for (const coverage of session.coverages) {
    const cases = session.testCases.filter((item) => item.acceptanceCriterionId === coverage.acceptanceCriterionId);
    const executions = session.executions.filter((item) =>
      cases.some((testCase) => testCase.id === item.testCaseId),
    );
    const failed = executions.some((item) => item.status === "FAILED");
    const verifiedAutomatic = cases.some(
      (testCase) =>
        testCase.automated &&
        testCase.provenance === "VERIFICATION_AGENT" &&
        demonstratesCriterion(testCase.body, coverage.acceptanceCriterionId) &&
        executions.some((item) => item.testCaseId === testCase.id && item.status === "PASSED"),
    );
    const verifiedManual = cases.some((testCase) => !testCase.automated && testCase.status === "PASSED");
    let status: "VERIFIED" | "FAILED" | "NOT_TESTED" | "BLOCKED" | "NOT_APPLICABLE" = "NOT_TESTED";
    if (failed) status = "FAILED";
    else if (verifiedAutomatic || verifiedManual) status = "VERIFIED";
    else if (coverage.humanConfirmed && coverage.status === "NOT_APPLICABLE") status = "NOT_APPLICABLE";
    if (coverage.status !== status || (status === "VERIFIED" && coverage.rationale === "")) {
      await db.verificationCoverage.update({
        where: { id: coverage.id },
        data: {
          status,
          rationale:
            status === "VERIFIED"
              ? verifiedManual
                ? "A person recorded a manual pass."
                : "An independent verification test demonstrated this criterion."
              : status === "FAILED"
                ? "A linked verification test failed."
                : coverage.rationale,
        },
      });
    }
  }
  const fresh = await db.verificationSession.findUnique({
    where: { id: sessionId },
    include: {
      coverages: true,
      testCases: true,
      executions: true,
      escalations: true,
      nfrResults: true,
      conditions: true,
      defectLinks: { include: { workItem: true } },
      evidence: true,
    },
  });
  if (!fresh) return null;
  const blocking = fresh.escalations.some(
    (item) => item.status === "OPEN" && (item.type === "IMPLEMENTATION_CHANGE" || item.type === "SECRET_ACCESS"),
  );
  const decision = decideVerdict({
    coverages: fresh.coverages.map((item) => ({ status: item.status, humanConfirmed: item.humanConfirmed })),
    executions: fresh.executions.map((item) => ({ kind: item.kind, status: item.status })),
    defects: fresh.defectLinks.map((item) => ({
      severity: item.workItem.priority,
      status: item.workItem.status,
    })),
    blockingEscalation: blocking,
  });
  const status = sessionStatusFor(decision.verdict);
  await db.verificationSession.update({
    where: { id: sessionId },
    data: {
      overallVerdict: decision.verdict,
      verdictReason: decision.reason,
      status,
      completedAt: new Date(),
    },
  });
  const passedCase = (testCaseId: string) =>
    fresh.executions.some((execution) => execution.testCaseId === testCaseId && execution.status === "PASSED");
  const positivePassed = fresh.testCases.some(
    (item) => item.automated && !item.purpose.startsWith("Negative path") && passedCase(item.id),
  );
  const negativePassed = fresh.testCases.some(
    (item) => item.purpose.startsWith("Negative path") && passedCase(item.id),
  );
  const areas = evidenceAreas({
    coverages: fresh.coverages.map((item) => ({ status: item.status, humanConfirmed: item.humanConfirmed })),
    positivePassed,
    negativePassed,
    regressionPassed: fresh.executions.some((item) => item.kind === "EXISTING_REGRESSION" && item.status === "PASSED"),
    securityPassed: fresh.testCases.some(
      (item) =>
        item.testType === "SECURITY" &&
        fresh.executions.some((execution) => execution.testCaseId === item.id && execution.status === "PASSED"),
    ),
    securityRequired: fresh.conditions.some((item) => item.source === "SECURITY_FINDING"),
    nfrTested: fresh.nfrResults.some((item) => item.status === "VERIFIED"),
    evidenceComplete:
      fresh.coverages.every((item) => fresh.evidence.some((entry) => entry.acceptanceCriterionId === item.acceptanceCriterionId)) &&
      fresh.executions.some((item) => item.kind === "EXISTING_REGRESSION"),
  });
  return { ...decision, status, areas };
}
