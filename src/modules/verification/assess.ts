import {hashText} from '@/modules/coding/policy';
import {assertSessionRuntimeBinding} from './runtime-review';
import {signedCoverage,criterionStatus} from './signed-coverage';
import { approvedBehaviors, behaviorMarkers, assessBehavior } from './behavior-evidence';
import "server-only";

import { db } from "@/lib/db";
import { asStrings } from "@/modules/coding/strings";
import { sanitizeFailureDetail } from "@/modules/verification/diagnostics";
import { failureClassForEscalation, failureClassForVerdict } from "@/modules/verification/failure";
import { executionIsCredible } from "@/modules/verification/adapters/registry";
import { requiredFunctionalCriteria, deriveObligations, inspectWorkspace, type ObligationStatus } from "@/modules/verification/obligations";
import { decideVerdict, evidenceAreas, sessionStatusFor } from "@/modules/verification/verdict";
import { assessTestStructure } from "@/modules/verification/test-binding";
import { assessHttpEvidence } from "@/modules/verification/evidence-adequacy";
import { assertVerificationEvidenceMutable } from "@/modules/verification/integrity";
import type { HttpObservation } from "@/modules/verification/http/guard";

/**
 * Re-judges a recorded passing execution against its stored evidence. Only HTTP black-box records carry observed
 * requests, so only they are re-checked. Other records keep their existing binding rules.
 */
function evidenceSufficient(
  testCase: { body: string; requiredCapabilities: unknown },
  execution: { adapterId: string; observations: unknown },
  loginPath: string,
) {
  if (execution.adapterId !== "http-blackbox") return true;
  const observations = Array.isArray(execution.observations) ? (execution.observations as HttpObservation[]) : [];
  return assessHttpEvidence({
    body: testCase.body,
    requiredCapabilities: asStrings(testCase.requiredCapabilities),
    observations,
    loginPath,
  }).adequate;
}

/** The sign-in route the session's approved fixture plan names, or empty when the plan has none. */
function loginPathOf(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as { authentication?: { loginPath?: unknown } }) : null;
  return typeof record?.authentication?.loginPath === "string" ? record.authentication.loginPath : "";
}

const CONTRADICTED_NOTE = "An AI-written verification test failed; that failure is kept as a concern for a person to weigh.";

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
      workspace: true,
      codingWorkspace: {include:{plan:true}},
      approvals: { include: { approval: true } },
    },
  });
  if (!session) return null;
  assertVerificationEvidenceMutable(session);
  const runtimeBinding = await assertSessionRuntimeBinding(session.id);
  // The approved snapshot is the commit the verification workspace was prepared from.
  const approvedSnapshot = session.workspace?.baseCommit ?? "";
  const bodyMatches = (executionId:string,body:string) => session.evidence.some(e => e.executionId===executionId && e.source==="COMMAND_RUNNER" && e.artifactReference===`sha256:${hashText(body)}`);
  const contradictedCriteria: string[] = [];
  for (const coverage of session.coverages) {
    const cases = session.testCases.filter((item) => item.acceptanceCriterionId === coverage.acceptanceCriterionId);
    const executions = session.executions.filter((item) =>
      cases.some((testCase) => testCase.id === item.testCaseId),
    );
    const failed = executions.some((item) => item.status === "FAILED");
    // An automated pass verifies the criterion only when the test is bound to product code and asserts on it, and
    // the execution came from an adapter that can run, against the approved snapshot. Passing a test that does not
    // meet these is a process success, not evidence.
    const requirementSet = approvedBehaviors(runtimeBinding.manifest.plan.validationPlan).filter(r => r.criterionId === coverage.acceptanceCriterionId);
    const behaviorComplete = requirementSet.every(r => cases.some(c => c.automated && c.provenance === "VERIFICATION_AGENT" && behaviorMarkers(c.body).includes(r.id) && executions.some(e => e.testCaseId === c.id && bodyMatches(e.id,c.body) && e.status === "PASSED" && e.snapshotCommit === approvedSnapshot && assessBehavior(r,c.body,Array.isArray(e.observations)?e.observations as HttpObservation[]:[],loginPathOf(session.fixturePlan)).length === 0 && evidenceSufficient(c,e,loginPathOf(session.fixturePlan)))));
    const verifiedAutomatic = behaviorComplete && cases.some(
      (testCase) =>
        testCase.automated &&
        testCase.provenance === "VERIFICATION_AGENT" &&
        assessTestStructure(testCase.body, coverage.acceptanceCriterionId, {
          filePath: testCase.filePath,
          adapterId: testCase.adapterId,
          targetSurface: testCase.targetSurface,
        }).ok &&
        executions.some(
          (item) =>
            item.testCaseId === testCase.id &&
            bodyMatches(item.id,testCase.body) &&
            item.status === "PASSED" &&
            executionIsCredible(
              {
                adapterId: item.adapterId,
                command: item.command,
                snapshotCommit: item.snapshotCommit,
                observationCount: Array.isArray(item.observations) ? item.observations.length : 0,
              },
              approvedSnapshot,
            ) &&
            // Independent re-check: a recorded PASS is not enough. The observed evidence must still demonstrate the
            // criterion. Legacy and non-HTTP records are not affected by this check.
            evidenceSufficient(testCase, item, loginPathOf(session.fixturePlan)),
        ),
    );
    // A person's signed statement that an existing test proves this criterion counts only while that test passes on the approved snapshot.
    const signed = signedCoverage(runtimeBinding.manifest.reviewerCoverage, coverage.acceptanceCriterionId, session.executions, approvedSnapshot);
    const verifiedSigned = signed.verified;
    const verifiedManual = cases.some((testCase) => !testCase.automated && testCase.status === "PASSED");
    const blocked = executions.some((item) => item.status === "BLOCKED");
    const decided = criterionStatus({
      independentFailed: failed,
      independentOrManualVerified: verifiedAutomatic || verifiedManual,
      signed,
      humanConfirmedNotApplicable: coverage.humanConfirmed && coverage.status === "NOT_APPLICABLE",
      blocked,
    });
    const status = decided.status;
    if (decided.contradicted) contradictedCriteria.push(coverage.acceptanceCriterionId);
    if (coverage.status !== status || (status === "VERIFIED" && coverage.rationale === "") || (decided.contradicted && !coverage.rationale.includes(CONTRADICTED_NOTE))) {
      await db.verificationCoverage.update({
        where: { id: coverage.id },
        data: {
          status,
          rationale:
            status === "VERIFIED"
              ? decided.contradicted
                ? `A person's signed review states that an existing test proves this criterion, and it passed on this version. ${CONTRADICTED_NOTE}`
                : verifiedManual
                ? "A person recorded a manual pass."
                : verifiedSigned && !verifiedAutomatic
                  ? "A person's signed review states that an existing test proves this criterion, and it passed on this version."
                  : "An independent verification test demonstrated this criterion."
              : status === "FAILED"
                ? "A linked verification test failed."
                : status === "BLOCKED"
                  ? "A linked verification test could not run in this environment. This is not a product failure."
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
  const blockingEscalation = fresh.escalations.find(
    (item) => item.status === "OPEN" && (item.type === "IMPLEMENTATION_CHANGE" || item.type === "SECRET_ACCESS"),
  );
  const blocking = Boolean(blockingEscalation);
  const evaluated = await evaluateObligations(fresh);
  // A failing AI-written test that a signed passing test outranks is not hidden: it is a concern, so the verdict cannot be a plain pass.
  for (const criterionId of contradictedCriteria) {
    evaluated.obligations.push({
      id: `concern:contradicted-independent-test:${criterionId}`,
      title: "An AI-written verification test failed although a person's signed test for the same criterion passed",
      kind: "TECHNICAL_COMPLETION",
      source: "FUNCTIONAL_ACCEPTANCE_CRITERION",
      mandatory: false,
      status: "FAILED",
      evidence: "The failing test and its output are recorded in this session's evidence. Review them before approving.",
    });
  }
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
  // A blocking escalation is recorded as its own class and is never reported as a product failure. It is
  // recomputed from the open escalation on every recompute, so the class survives later recomputation.
  const escalationClass = blockingEscalation ? failureClassForEscalation(blockingEscalation.type) : "";
  const status = sessionStatusFor(decision.verdict);
  const failureClass = escalationClass || failureClassForVerdict(decision.verdict, fresh.executions);
  // The classified reason for a blocked verification test is stored as evidence. That is the detail to show.
  const environmentDetail =
    failureClass === "VERIFICATION_TEST_ENVIRONMENT_FAILED"
      ? fresh.evidence.find(
          (item) => item.result === "BLOCKED" && item.type === "TEST_RESULT" && item.source === "COMMAND_RUNNER",
        )
      : undefined;
  await db.verificationSession.update({
    where: { id: sessionId },
    data: {
      overallVerdict: decision.verdict,
      verdictReason: decision.reason,
      failureClass,
      failureStage: escalationClass || environmentDetail ? "AGENT_EXECUTE" : "",
      failureDetail: escalationClass && blockingEscalation
        ? sanitizeFailureDetail(blockingEscalation.description)
        : environmentDetail ? sanitizeFailureDetail(environmentDetail.description) : "",
      // A blocked session stays BLOCKED rather than FAILED: it is not a product failure and needs a person.
      status: escalationClass ? "BLOCKED" : status,
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
    functionalCriteria: requiredFunctionalCriteria(task?.workItem?.acceptanceCriteria ?? [], session.coverages.map((coverage) => ({
      id: coverage.acceptanceCriterionId,
      description: task?.workItem?.acceptanceCriteria.find((item) => item.id === coverage.acceptanceCriterionId)?.description
        || "Functional acceptance criterion",
      status: coverageStatus(coverage),
    }))),
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
