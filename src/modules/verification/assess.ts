import "server-only";

import { db } from "@/lib/db";
import { asStrings } from "@/modules/coding/strings";
import { demonstratesCriterion } from "@/modules/verification/policy";
import { failureClassForVerdict } from "@/modules/verification/failure";
import { deriveObligations, inspectWorkspace, type ObligationStatus } from "@/modules/verification/obligations";
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
      contract: true,
      workspace: true,
      defectLinks: { include: { workItem: true } },
      evidence: true,
    },
  });
  if (!fresh) return null;
  const blocking = fresh.escalations.some(
    (item) => item.status === "OPEN" && (item.type === "IMPLEMENTATION_CHANGE" || item.type === "SECRET_ACCESS"),
  );
  const evaluated = await evaluateObligations(fresh);
  const decision = decideVerdict({
    coverages: fresh.coverages.map((item) => ({ status: item.status, humanConfirmed: item.humanConfirmed })),
    executions: fresh.executions.map((item) => ({ kind: item.kind, status: item.status })),
    defects: fresh.defectLinks.map((item) => ({
      severity: item.workItem.priority,
      status: item.workItem.status,
    })),
    blockingEscalation: blocking,
    obligations: evaluated.obligations,
  });
  if (fresh.contract) {
    await db.verificationContract.update({
      where: { id: fresh.contract.id },
      data: {
        obligations: evaluated.obligations,
        definitionConcerns: evaluated.definitionConcerns,
        planVersion: evaluated.planVersion,
      },
    });
  }
  const status = sessionStatusFor(decision.verdict);
  await db.verificationSession.update({
    where: { id: sessionId },
    data: {
      overallVerdict: decision.verdict,
      verdictReason: decision.reason,
      failureClass: failureClassForVerdict(decision.verdict, fresh.executions),
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

async function evaluateObligations(session: {
  implementationTaskId: string;
  repositoryWorkspaceId: string | null;
  commitSha: string;
  workspace: { workspacePath: string; baseCommit: string } | null;
  contract: { architectureConstraints: string } | null;
  coverages: { acceptanceCriterionId: string; status: string; humanConfirmed: boolean }[];
  executions: { command: string; kind: string; status: string }[];
  nfrResults: { nfrId: string | null; title: string; status: string }[];
}) {
  const coding = session.repositoryWorkspaceId
    ? await db.repositoryWorkspace.findFirst({
        where: { id: session.repositoryWorkspaceId },
        include: { plan: true },
      })
    : null;
  const task = await db.implementationTask.findUnique({
    where: { id: session.implementationTaskId },
    include: {
      workItem: {
        include: {
          acceptanceCriteria: true,
          children: { include: { acceptanceCriteria: true } },
        },
      },
    },
  });
  const plan = coding?.plan;
  const files = asStrings(plan?.filesExpectedToChange);
  const ownIds = new Set((task?.workItem?.acceptanceCriteria ?? []).map((item) => item.id));
  const parentCriteria = (task?.workItem?.children ?? []).flatMap((child) =>
    child.acceptanceCriteria
      .filter((item) => !ownIds.has(item.id))
      .map((item) => ({ workItemTitle: child.title, description: item.description })),
  );
  const evaluated = deriveObligations({
    plan: plan
      ? {
          version: plan.version,
          status: plan.status,
          files,
          setupCommands: asStrings(plan.setupCommands),
          validationCommands: commandRows(plan.validationCommands),
        }
      : null,
    commitSha: session.commitSha,
    baseCommit: session.workspace?.baseCommit || coding?.headCommit || "",
    functionalCriteria: session.coverages.map((coverage) => ({
      id: coverage.acceptanceCriterionId,
      description: task?.workItem?.acceptanceCriteria.find((item) => item.id === coverage.acceptanceCriterionId)?.description
        || "Functional acceptance criterion",
      status: coverageStatus(coverage),
    })),
    parentCriteria,
    architecture: session.contract?.architectureConstraints ?? "",
    nfrs: session.nfrResults.map((item) => ({ id: item.nfrId || item.title, title: item.title, status: item.status })),
    inspection: inspectWorkspace(session.workspace?.workspacePath ?? "", files),
    executions: session.executions.map((item) => ({ command: item.command, kind: item.kind, status: item.status })),
  });
  return { ...evaluated, planVersion: plan && (plan.status === "APPROVED" || plan.status === "COMPLETED") ? plan.version : 0 };
}

function commandRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || !("command" in item) || typeof item.command !== "string") return [];
    const applicability = "applicability" in item && typeof item.applicability === "string" ? item.applicability : "REQUIRED";
    return [{ command: item.command, applicability }];
  });
}

function coverageStatus(coverage: { status: string; humanConfirmed: boolean }): ObligationStatus {
  if (coverage.status === "VERIFIED" || coverage.status === "FAILED" || coverage.status === "BLOCKED") return coverage.status;
  if (coverage.status === "NOT_APPLICABLE" && coverage.humanConfirmed) return "NOT_APPLICABLE";
  return "NOT_TESTED";
}
