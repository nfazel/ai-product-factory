import "server-only";

import fs from "node:fs";
import path from "node:path";

import { isProviderFailureCategory } from "@/modules/ai/failures";
import { assessBootstrapCompleteness, designFactsFromSources, NEXT_ENTRY_CANDIDATES } from "@/modules/coding/bootstrap";
import { repairResultNeedsRecording } from "@/modules/coding/diff";
import { assessImplementationCompleteness, classifyCodingFailure, initialSchemaContext, readPlannedImplementationFiles, repairsForCurrentImplementation } from "@/modules/coding/implementation";
import { asStrings } from "@/modules/coding/strings";
import { compileExecutionContract, parsePlannedCommands } from "@/modules/coding/commands";
import { recoverApprovedPlansAfterProviderFailure, restoreApprovedPlanAfterValidationFailure } from "@/modules/coding/restore-approval";
import { codingRunFromWorkspace, snapshotCodingRun } from "@/modules/coding/progress";
import { classifyPlanDiff, isGeneratedReviewPath } from "@/modules/coding/review";
import { MAX_VALIDATION_REPAIRS, requiredValidationCommands } from "@/modules/coding/repair";
import { db } from "@/lib/db";
import type { ProductStage } from "@/domain/constants";
import { BLOCKING_FINDING_TYPES } from "@/modules/intake/readiness";
import { codebaseCaptured } from "@/modules/architecture/development-context";
import { repositoryRootConfigured } from "@/modules/coding/config";
import { entryBlockers, learnBlockers, type ReleaseFacts, type ReleaseTaskFact } from "@/modules/release/readiness";
import type { GuidanceSnapshot, TaskSnapshot } from "@/modules/guidance/types";
import { clarificationReviewFromRecords } from "@/modules/clarification/service";
import { verificationProgress } from "@/modules/verification/disposition";
import { approvedPublication } from "@/modules/source-control/publication-state";
import { classifyMergeability, pullRequestNextAction, type PullRequestGate } from "@/modules/source-control/pull-request-gate";
import { countsAsHumanReviewer, effectiveReviews } from "@/modules/source-control/readiness";
import { staleDesignReferenceMessage } from "@/modules/traceability/references";

const STAGES = new Set(["EXPLORE", "DEFINE", "BUILD", "PROVE", "SHIP", "LEARN"]);

function pullRequestGate(
  pull: {
    protectionAccess: string;
    ciState: "PASSED" | "FAILED" | "PENDING" | "NOT_CONFIGURED" | "UNKNOWN";
    mergeable: boolean | null;
    mergeableState: string;
    headSha: string;
    protection: unknown;
    reviews: { reviewer: string; state: string; submittedAt: Date | null; commitSha: string }[];
  },
  approvalCommit: string,
  approvalCurrent: boolean,
  minimumHumanApprovals: number,
  ciRequired: boolean,
): PullRequestGate {
  const protection = pull.protection && typeof pull.protection === "object" && !Array.isArray(pull.protection)
    ? pull.protection as { requiredApprovals?: unknown }
    : {};
  const protectionApprovals = typeof protection.requiredApprovals === "number" ? protection.requiredApprovals : 0;
  const effective = effectiveReviews(pull.reviews, pull.headSha);
  const access: PullRequestGate["protectionAccess"] = pull.protectionAccess === "READABLE" || pull.protectionAccess === "NOT_PROTECTED" || pull.protectionAccess === "FORBIDDEN" || pull.protectionAccess === "UNAVAILABLE"
    ? pull.protectionAccess
    : "";
  return {
    classified: access !== "",
    protectionAccess: access,
    ciState: pull.ciState,
    ciRequired,
    validApprovals: effective.filter((review) => review.state === "APPROVED" && countsAsHumanReviewer(review.reviewer)).length,
    requiredApprovals: Math.max(minimumHumanApprovals, protectionApprovals, 1),
    changesRequested: effective.some((review) => review.state === "CHANGES_REQUESTED"),
    mergeability: access ? classifyMergeability(pull.mergeable, pull.mergeableState) : "UNREAD" as const,
    headMatches: approvalCurrent && approvalCommit === pull.headSha,
  };
}

function stageOf(value: string): ProductStage {
  return STAGES.has(value) ? (value as ProductStage) : "EXPLORE";
}

function countJson(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function repairAvailableFor(
  workspace: { id: string; workspacePath: string; plan: { status: string; version: number; validationCommands?: unknown; setupCommands?: unknown; steps?: unknown } | null; evidence: { result: string; command: string }[] } | null | undefined,
  run: { output: unknown } | null,
  codingRuns: { createdAt?: Date | null; input: unknown }[],
  initialModelNamed = true,
) {
  if (!workspace?.plan || workspace.plan.status !== "APPROVED" || !run) return false;
  const output = run.output && typeof run.output === "object" ? run.output as { outcome?: unknown; errorCategory?: unknown } : null;
  if (output?.outcome !== "FAILED" || (typeof output.errorCategory === "string" && output.errorCategory)) return false;
  const steps = asStrings(workspace.plan.steps);
  const gaps = assessImplementationCompleteness({
    steps,
    files: readPlannedImplementationFiles(workspace.workspacePath, steps),
  }).gaps;
  if (gaps.some((gap) => gap.kind === "MISSING_PRISMA_MODEL") && !initialModelNamed) return false;
  const required = new Set(requiredValidationCommands(workspace.plan.validationCommands));
  const setup = new Set(asStrings(workspace.plan.setupCommands));
  const latest = new Map<string, string>();
  for (const item of workspace.evidence) {
    if (item.command) latest.set(item.command, item.result);
  }
  const failed = [...latest.entries()].some(([command, result]) => result === "FAIL" && (required.has(command) || setup.has(command))) || gaps.length > 0;
  if (!failed) return false;
  const attempts = repairsForCurrentImplementation(codingRuns, workspace.id, workspace.plan.version).length;
  if (attempts >= MAX_VALIDATION_REPAIRS) return false;
  const implemented = codingRuns.filter((item) => {
    const input = item.input && typeof item.input === "object" ? item.input as { phase?: unknown; workspaceId?: unknown; planVersion?: unknown } : null;
    return input?.phase === "implement" && input.workspaceId === workspace.id;
  }).at(-1);
  const implementedVersion = implemented?.input && typeof implemented.input === "object" && "planVersion" in implemented.input && typeof implemented.input.planVersion === "number"
    ? implemented.input.planVersion
    : null;
  if (implementedVersion != null && workspace.plan.version > implementedVersion) return false;
  return true;
}

function newerApprovedPlan(planVersion: number, workspaceId: string, codingRuns: { input: unknown }[]) {
  const implemented = codingRuns.filter((item) => {
    const input = item.input && typeof item.input === "object" ? item.input as { phase?: unknown; workspaceId?: unknown; planVersion?: unknown } : null;
    return input?.phase === "implement" && input.workspaceId === workspaceId;
  }).at(-1);
  const version = implemented?.input && typeof implemented.input === "object" && "planVersion" in implemented.input
    ? implemented.input.planVersion
    : null;
  return typeof version === "number" && planVersion > version;
}

function providerBlockedFor(planStatus: string, run: { status: string; output: unknown } | null) {
  if (planStatus !== "APPROVED" || run?.status !== "FAILED") return false;
  const output = run.output && typeof run.output === "object" ? run.output as { errorCategory?: unknown } : null;
  const category = typeof output?.errorCategory === "string" ? output.errorCategory : null;
  return isProviderFailureCategory(category);
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function traceabilityIssue(coverages: { mechanism: string; nfr: { status: string; title: string; referenceCode: string } | null }[]) {
  const stale = coverages.find((coverage) => !coverage.nfr || coverage.nfr.status === "REJECTED");
  if (!stale) return "";
  return staleDesignReferenceMessage(stale.nfr?.referenceCode || stale.nfr?.title || stale.mechanism || "the design");
}

export async function loadSnapshots(productId?: string): Promise<GuidanceSnapshot[]> {
  await recoverApprovedPlansAfterProviderFailure(productId);
  await restoreApprovedPlanAfterValidationFailure(productId);
  const products = await db.product.findMany({
    where: productId ? { id: productId } : undefined,
    orderBy: { updatedAt: "desc" },
  });
  if (products.length === 0) return [];
  const ids = products.map((product) => product.id);

  const [sessions, briefs, definitions, definitionApprovals, proposals, outcomes, capabilities, questions, slices, architectures, architectureApprovals, plans, planApprovals, reviews, governanceApprovals, policyApprovals, tasks, workspaces, codeApprovals, verifications, verificationApprovals, published, pullRequests, candidates, learning, defects, integrated] =
    await Promise.all([
      db.discoverySession.findMany({ where: { productId: { in: ids } } }),
      db.productBrief.findMany({ where: { productId: { in: ids }, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } }),
      db.productDefinition.findMany({ where: { productId: { in: ids } } }),
      db.approval.findMany({ where: { productId: { in: ids }, approvalType: "PRODUCT_DEFINITION", status: "APPROVED" } }),
      db.definitionProposal.findMany({ where: { productId: { in: ids }, status: "OPEN" } }),
      db.productOutcome.findMany({ where: { productId: { in: ids } }, include: { observations: { orderBy: { observedAt: "desc" } } }, orderBy: { createdAt: "asc" } }),
      db.productCapability.findMany({ where: { productId: { in: ids } } }),
      db.requirementQuestion.findMany({ where: { productId: { in: ids }, status: "OPEN" } }),
      db.productSlice.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: "asc" } }),
      db.solutionArchitecture.findMany({
        where: { productId: { in: ids }, status: { not: "SUPERSEDED" } },
        orderBy: { version: "desc" },
        include: {
          technologies: { select: { choice: true } },
          dataEntities: { select: { name: true, description: true, relationships: true } },
        },
      }),
      db.approval.findMany({ where: { productId: { in: ids }, approvalType: "SOLUTION_ARCHITECTURE", status: "APPROVED" } }),
      db.implementationPlan.findMany({ where: { productId: { in: ids }, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } }),
      db.approval.findMany({ where: { productId: { in: ids }, approvalType: "IMPLEMENTATION_PLAN", status: "APPROVED" } }),
      db.engineeringGovernanceReview.findMany({
        where: { productId: { in: ids }, status: { not: "SUPERSEDED" } },
        orderBy: { version: "desc" },
        include: { findings: true, policy: true, codingRisks: true },
      }),
      db.approval.findMany({ where: { productId: { in: ids }, approvalType: "ENGINEERING_GOVERNANCE", status: "APPROVED" } }),
      db.approval.findMany({ where: { productId: { in: ids }, approvalType: "CODING_POLICY", status: "APPROVED" } }),
      db.implementationTask.findMany({ where: { plan: { productId: { in: ids } } }, orderBy: { sequence: "asc" }, include: { plan: true, codingRisks: true } }),
      db.repositoryWorkspace.findMany({
        where: { productId: { in: ids } },
        orderBy: { createdAt: "desc" },
        include: {
          contract: true,
          plan: true,
          escalations: true,
          evidence: { orderBy: { createdAt: "asc" }, select: { result: true, command: true, createdAt: true } },
          diff: { select: { updatedAt: true, files: true } },
        },
      }),
      db.codeChangeApproval.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: "desc" } }),
      db.verificationSession.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: "desc" } }),
      db.verificationApproval.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: "desc" } }),
      db.publishedChange.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: "desc" } }),
      db.pullRequestRecord.findMany({ where: { productId: { in: ids } }, include: { publishedChange: true, reviews: true } }),
      db.releaseCandidate.findMany({
        where: { productId: { in: ids } },
        orderBy: { createdAt: "desc" },
        include: { approvals: { include: { approval: true } }, risk: { include: { factors: true } }, plans: { include: { checks: true } }, deployments: true, issues: true },
      }),
      db.learningRecord.findMany({ where: { productId: { in: ids } } }),
      db.workItem.findMany({ where: { productId: { in: ids }, type: "DEFECT" } }),
      db.integratedVerificationSession.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: "desc" } }),
    ]);

  const [requirementSources, analyses, intakeRequirements, intakeFindings, intakeQuestions, codebaseRows, coverages] = await Promise.all([
    db.requirementSource.findMany({ where: { productId: { in: ids } } }),
    db.requirementsAnalysis.findMany({ where: { productId: { in: ids } }, include: { sources: true }, orderBy: { version: "desc" } }),
    db.sourceRequirement.findMany({ where: { productId: { in: ids } }, include: { traces: true } }),
    db.requirementFinding.findMany({ where: { productId: { in: ids }, status: "OPEN" } }),
    db.intakeQuestion.findMany({ where: { productId: { in: ids }, status: "OPEN" } }),
    db.codebaseContext.findMany({ where: { productId: { in: ids } } }),
    db.nfrCoverage.findMany({
      where: { architecture: { productId: { in: ids }, status: { not: "SUPERSEDED" } } },
      select: {
        mechanism: true,
        architecture: { select: { productId: true } },
        nfr: { select: { status: true, title: true, referenceCode: true } },
      },
    }),
  ]);

  const githubConnection = await db.sourceControlConnection.findUnique({ where: { id: "factory" } });
  const ciDecisions = await db.ciRequirementDecision.findMany({ where: { productId: { in: ids } } });
  const githubAccountConnected = githubConnection?.status === "CONNECTED";
  const repositoryRows = await db.repository.findMany({
    where: { productId: { in: ids } },
    select: { productId: true, status: true, localPath: true, owner: true, repositoryName: true, connectionStatus: true },
  });
  const legacyRepository = repositoryRootConfigured();
  const runIds = workspaces.map((workspace) => workspace.agentRunId).filter((id): id is string => Boolean(id));
  const agentRuns = runIds.length > 0 ? await db.agentRun.findMany({ where: { id: { in: runIds } } }) : [];
  const codingRuns = await db.agentRun.findMany({
    where: { productId: { in: ids }, agentType: "CODING" },
    orderBy: { createdAt: "asc" },
    select: { productId: true, input: true, output: true, createdAt: true },
  });

  return products.map((product) => {
    const brief = briefs.find((item) => item.productId === product.id);
    const definition = definitions.find((item) => item.productId === product.id);
    const definitionApproved = Boolean(definition?.status === "APPROVED" && definitionApprovals.some((item) => item.productId === product.id));
    const slice = slices.find((item) => item.productId === product.id && item.status === "APPROVED") ?? slices.find((item) => item.productId === product.id);
    const architecture = architectures.find((item) => item.productId === product.id);
    const approvedArchitecture = architectures.find((item) => item.productId === product.id && item.status === "APPROVED") ?? null;
    const architectureApproved = Boolean(architecture?.status === "APPROVED" && architectureApprovals.some((item) => item.productId === product.id));
    const plan = plans.find((item) => item.productId === product.id);
    const planApproved = Boolean(plan?.status === "APPROVED" && planApprovals.some((item) => item.productId === product.id));
    const review = reviews.find((item) => item.productId === product.id);
    const reviewApproved = Boolean(review?.status === "APPROVED" && governanceApprovals.some((item) => item.productId === product.id) && !review?.reviewRequired);
    const policyApproved = Boolean(policyApprovals.some((item) => item.productId === product.id) && review?.policy && !review.policy.reapprovalRequired);
    const productOutcomes = outcomes.filter((item) => item.productId === product.id);
    const primaryOutcome = productOutcomes[0] ?? null;
    const latestObservation = primaryOutcome?.observations.find((item) => !item.demo) ?? null;
    const sampleObservation = primaryOutcome?.observations[0] ?? null;
    const productTasks = tasks.filter((item) => item.plan.productId === product.id && (!slice || item.plan.productSliceId === slice.id || !item.plan.productSliceId));
    const taskViews: TaskSnapshot[] = productTasks.map((task) => {
      const risk = task.codingRisks[0];
      const mode = risk?.overrideExecutionMode ?? risk?.recommendedExecutionMode;
      const workspace = workspaces.find((item) => item.implementationTaskId === task.id);
      const planIncomplete = workspace?.plan?.status === "APPROVED"
        ? !assessBootstrapCompleteness({
            files: asStrings(workspace.plan.filesExpectedToChange),
            steps: asStrings(workspace.plan.steps),
            validationCommands: parsePlannedCommands(workspace.plan.validationCommands),
            validationPlan: workspace.plan.validationPlan,
            design: designFactsFromSources({
              architecture: approvedArchitecture,
              task,
              fallbackSummary: workspace.contract?.architectureConstraints ?? "",
            }),
            greenfield: product.developmentContext === "GREENFIELD",
            existingFiles: NEXT_ENTRY_CANDIDATES.filter((file) => fs.existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ workspace.workspacePath, file))),
          }).ready
        : false;
      const approval = codeApprovals.find((item) => item.implementationTaskId === task.id);
      const session = verifications.find((item) => item.implementationTaskId === task.id && !item.demo) ?? verifications.find((item) => item.implementationTaskId === task.id);
      const verificationApproval = verificationApprovals.find((item) => item.implementationTaskId === task.id && item.sessionId === session?.id);
      const currentPublication = approvedPublication(
        published.filter((item) => item.implementationTaskId === task.id),
        workspace?.branchName ?? "",
        workspace?.headCommit ?? "",
      );
      const pull = currentPublication
        ? pullRequests.find((item) => item.publishedChangeId === currentPublication.id && !item.demo) ??
          pullRequests.find((item) => item.publishedChangeId === currentPublication.id)
        : null;
      const verification = verificationProgress({
        session: session
          ? {
              status: session.status,
              overallVerdict: session.overallVerdict,
              failureClass: session.failureClass,
              demo: session.demo,
              stale: session.stale,
            }
          : null,
        approvalStale: Boolean(verificationApproval?.stale),
        approved: Boolean(session && verificationApproval && !verificationApproval.stale),
      });
      let pullRequest: TaskSnapshot["pullRequest"] = "NONE";
      if (pull?.demo) pullRequest = "DEMO";
      else if (pull?.state === "MERGED") pullRequest = "MERGED";
      else if (pull) pullRequest = "OPEN";
      const ciDecision = ciDecisions.find((item) => item.productId === product.id);
      const pullRequestNext = pull && pullRequest === "OPEN"
        ? pullRequestNextAction(pullRequestGate(pull, approval?.headCommit ?? "", Boolean(approval && !approval.stale), githubConnection?.minimumHumanApprovals ?? 1, ciDecision?.requirement !== "EXCEPTION"))
        : undefined;
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        humanOnly: mode === "HUMAN_ONLY",
        prohibited: risk?.riskLevel === "PROHIBITED" && risk.disposition === "OPEN",
        contractStale: Boolean(workspace?.executionContractStale || workspace?.contract?.stale),
        codeApproval: !approval ? "NONE" : approval.stale ? "STALE" : "CURRENT",
        workspace: !workspace ? "NONE" : workspace.status === "ABANDONED" ? "OPEN" : workspace.completedAt || workspace.status === "COMPLETED" ? "DONE" : "OPEN",
        executionPlan: workspace?.plan?.status ?? "NONE",
        providerBlocked: providerBlockedFor(workspace?.plan?.status ?? "NONE", agentRuns.find((run) => run.id === workspace?.agentRunId) ?? null),
        persistenceRecovery: Boolean(workspace?.plan && repairResultNeedsRecording({
          runs: codingRuns.filter((run) => run.productId === product.id),
          workspaceId: workspace.id,
          planVersion: workspace.plan.version,
          diffUpdatedAt: workspace.diff?.updatedAt ?? null,
          commands: workspace.evidence.map((item) => ({ command: item.command, result: item.result, createdAt: item.createdAt })),
          requiredCommands: requiredValidationCommands(workspace.plan.validationCommands),
          gaps: assessImplementationCompleteness({
            steps: asStrings(workspace.plan.steps),
            files: readPlannedImplementationFiles(workspace.workspacePath, asStrings(workspace.plan.steps)),
          }).gaps.length,
        })),
        repairAvailable: !planIncomplete && repairAvailableFor(
          workspace,
          agentRuns.find((run) => run.id === workspace?.agentRunId) ?? null,
          codingRuns,
          initialSchemaContext({
            dataApproach: approvedArchitecture?.dataApproach,
            entities: approvedArchitecture?.dataEntities,
          }).named,
        ),
        planIncomplete,
        implementationIncomplete: classifyCodingFailure({
          planReady: !planIncomplete,
          gaps: workspace?.plan ? assessImplementationCompleteness({
            steps: asStrings(workspace.plan.steps),
            files: readPlannedImplementationFiles(workspace.workspacePath, asStrings(workspace.plan.steps)),
          }).gaps : [],
          failedValidation: false,
        }) === "IMPLEMENTATION_INCOMPLETE",
        outOfScope: workspace?.diff ? classifyPlanDiff({
          files: Array.isArray(workspace.diff.files) ? workspace.diff.files.flatMap((file) => {
            if (!file || typeof file !== "object") return [];
            const item = file as { path?: unknown; status?: unknown };
            return typeof item.path === "string" && !isGeneratedReviewPath(item.path) ? [{ path: item.path, status: typeof item.status === "string" ? item.status : "added" }] : [];
          }) : [],
          approvedFiles: asStrings(workspace.plan?.filesExpectedToChange),
          setupCommands: asStrings(workspace.plan?.setupCommands),
          steps: asStrings(workspace.plan?.steps),
        }).some((file) => file.classification === "OUT_OF_SCOPE") : false,
        revisedPlanReady: Boolean(workspace?.plan?.status === "APPROVED" && !planIncomplete && newerApprovedPlan(workspace.plan.version, workspace.id, codingRuns)),
        contractBlocked: workspace?.plan?.status === "APPROVED" && workspace.contract
          ? !compileExecutionContract({
              planVersion: workspace.plan.version,
              files: workspace.plan.filesExpectedToChange,
              allowedPaths: workspace.contract.allowedPaths,
              restrictedPaths: workspace.contract.restrictedPaths,
              setupCommands: workspace.plan.setupCommands,
              validationCommands: workspace.plan.validationCommands,
            }).ready
          : false,
        codingRun: workspace ? snapshotCodingRun(codingRunFromWorkspace({
          status: workspace.status,
          plan: workspace.plan,
          escalations: workspace.escalations,
          evidence: workspace.evidence,
          agentRun: agentRuns.find((run) => run.id === workspace.agentRunId) ?? null,
        })) : "NONE",
        published: currentPublication !== null,
        pullRequest,
        pullRequestNext,
        verification,
        updatedAt: iso(task.updatedAt),
      };
    });
    const openHighDefect = defects.some((item) => item.productId === product.id && item.status !== "DONE" && (item.priority === "HIGH" || item.priority === "CRITICAL"));
    const sliceVerified = taskViews.length > 0 && taskViews.every((task) => task.status === "COMPLETED" && task.verification === "APPROVED") && !openHighDefect;
    const integratedRow = integrated.find((item) => item.productId === product.id) ?? null;
    const releaseRows = candidates.filter((item) => item.productId === product.id);
    const real = releaseRows.find((item) => !item.demo && item.status !== "SUPERSEDED") ?? null;
    const demoOnly = !real && releaseRows.some((item) => item.demo);
    const realTasks: ReleaseTaskFact[] = productTasks.map((task) => {
      const view = taskViews.find((item) => item.id === task.id);
      const pull = pullRequests.find((item) => item.publishedChange.implementationTaskId === task.id);
      const session = verifications.find((item) => item.implementationTaskId === task.id && !item.demo);
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        workItemId: task.workItemId ?? "",
        storyTitle: "",
        featureTitle: "",
        epicTitle: "",
        criteria: [],
        verifiedCriteria: [],
        commitSha: "",
        verificationSessionId: session?.id ?? "",
        verificationCommit: session?.commitSha ?? "",
        verificationApproved: view?.verification === "APPROVED",
        verificationStale: view?.verification === "STALE",
        verificationVerdict: session?.overallVerdict ?? "",
        codeApproved: view?.codeApproval === "CURRENT",
        pull: pull
          ? {
              id: pull.id,
              number: pull.number,
              state: pull.state,
              demo: pull.demo,
              headSha: pull.headSha,
              mergeSha: pull.mergeCommitSha,
              mergedBy: pull.mergedBy,
              mergedAt: pull.mergedAt?.toISOString() ?? null,
              requiredChecks: null,
              checks: [],
              reviews: [],
            }
          : null,
      };
    });
    const facts: ReleaseFacts = {
      productId: product.id,
      slice: slice ? { id: slice.id, name: slice.name, status: slice.status, description: slice.description } : null,
      outcome: primaryOutcome ? { id: primaryOutcome.id, title: primaryOutcome.title, successMeasure: primaryOutcome.successMeasure, target: primaryOutcome.targetValue, status: primaryOutcome.status } : null,
      capability: null,
      governanceCurrent: reviewApproved,
      policyCurrent: policyApproved,
      architectureApproved,
      architectureSummary: "",
      definitionApproved,
      tasks: realTasks,
      defects: defects.filter((item) => item.productId === product.id).map((item) => ({ id: item.id, title: item.title, priority: item.priority, status: item.status })),
      integrated: integratedRow ? { id: integratedRow.id, verdict: integratedRow.overallVerdict ?? "", gaps: [] } : null,
    };
    const entry = entryBlockers(facts);
    const approval = real?.approvals.find((item) => item.approval.status === "APPROVED");
    const succeeded = real?.deployments.some((item) => item.status === "SUCCEEDED" && !item.demo) ?? false;
    const checks = real?.plans[0]?.checks ?? [];
    const learnReasons = real
      ? learnBlockers({
          demo: real.demo,
          status: succeeded ? "DEPLOYED" : real.status,
          checks: checks.map((check) => ({ phase: check.phase, required: check.required, status: check.status, waiverRationale: check.waiverRationale })),
          issues: (real.issues ?? []).map((issue) => ({ severity: issue.severity, status: issue.status })),
        })
      : ["No release candidate exists."];
    const shown = latestObservation ?? sampleObservation;
    const activeSources = requirementSources.filter((item) => item.productId === product.id && item.status === "ACTIVE" && item.sourceText.trim().length > 0);
    const currentAnalysis = analyses.find((item) => item.productId === product.id && item.status === "CURRENT");
    const staleAnalysis = analyses.some((item) => item.productId === product.id && item.status === "STALE");
    const hashMatch = Boolean(
      currentAnalysis &&
        activeSources.every((source) => currentAnalysis.sources.some((link) => link.sourceId === source.id && link.sourceHash === source.sourceHash)),
    );
    const productRequirements = intakeRequirements.filter((item) => item.productId === product.id && item.analysisId === currentAnalysis?.id);
    const productFindings = intakeFindings.filter((item) => item.productId === product.id && item.analysisId === currentAnalysis?.id);
    const productQuestions = intakeQuestions.filter((item) => item.productId === product.id && item.analysisId === currentAnalysis?.id && item.priority !== "LOW");
    const materialUnmapped = productRequirements.filter(
      (item) => item.confirmation === "CONFIRMED" && (item.disposition === "UNSET" || item.disposition === "IN_SCOPE") && item.traces.length === 0,
    ).length;
    return {
      productId: product.id,
      name: product.name,
      stage: stageOf(product.currentStage),
      sample: Boolean(definition?.seededDemo || architecture?.seededDemo || plan?.seededDemo || review?.seededDemo || releaseRows.some((item) => item.demo)),
      startMode: product.startMode === "EXISTING_REQUIREMENTS" ? "EXISTING_REQUIREMENTS" : "IDEA",
      requirementsChanged: product.requirementsReviewRequired,
      developmentContext:
        product.developmentContext === "GREENFIELD" || product.developmentContext === "EXISTING_SYSTEM"
          ? product.developmentContext
          : "UNSET",
      codebaseCaptured: codebaseCaptured(codebaseRows.find((item) => item.productId === product.id) ?? null),
      clarificationReview: clarificationReviewFromRecords({
        briefRequired: brief?.reviewRequired,
        briefReason: brief?.reviewReason,
        definitionRequired: definition?.reviewRequired,
        definitionReason: definition?.reviewReason,
        designRequired: architecture?.reviewRequired,
        designReason: architecture?.reviewReason,
        deliveryRequired: plan?.reviewRequired,
        deliveryReason: plan?.reviewReason,
        governanceRequired: review?.reviewRequired,
        governanceReason: review?.reviewReason,
        planRequired: workspaces.some((item) => item.productId === product.id && (item.executionContractStale || item.contract?.stale)),
        planReason: workspaces.find((item) => item.productId === product.id && (item.executionContractStale || item.contract?.stale))?.staleReason
          || workspaces.find((item) => item.productId === product.id && item.contract?.stale)?.contract?.staleReason,
        releaseRequired: candidates.some((item) => item.productId === product.id && !item.demo && item.reviewRequired),
        releaseReason: candidates.find((item) => item.productId === product.id && !item.demo && item.reviewRequired)?.reviewReason,
      }),
      githubAccountConnected,
      productRepositoryMapped: (() => {
        const repository = repositoryRows.find((item) => item.productId === product.id);
        return Boolean(repository?.owner && repository.repositoryName && repository.connectionStatus === "CONNECTED");
      })(),
      githubConnected: (() => {
        const repository = repositoryRows.find((item) => item.productId === product.id);
        return Boolean(
          githubAccountConnected && repository?.owner && repository.repositoryName && repository.connectionStatus === "CONNECTED",
        );
      })(),
      repositoryReady: (() => {
        const repository = repositoryRows.find((item) => item.productId === product.id);
        if (repository?.status === "CONFIGURED" && repository.localPath.trim()) return true;
        return !repository && legacyRepository;
      })(),
      intake: {
        activeSources: activeSources.length,
        extractionFailed: requirementSources.some((item) => item.productId === product.id && item.status === "EXTRACTION_FAILED"),
        analysed: Boolean(currentAnalysis) && hashMatch,
        stale: staleAnalysis && !hashMatch,
        unreviewed: productRequirements.filter((item) => item.confirmation === "UNREVIEWED").length,
        needsChange: productRequirements.filter((item) => item.confirmation === "NEEDS_CHANGE").length,
        blockingFindings: productFindings.filter((item) => item.severity === "HIGH" && BLOCKING_FINDING_TYPES.has(item.findingType)).length,
        openQuestions: productQuestions.length,
        materialUnmapped,
        updatedAt: iso(currentAnalysis?.createdAt ?? activeSources[0]?.createdAt),
      },
      discovery: {
        started: sessions.some((item) => item.productId === product.id) || Boolean(brief),
        briefStatus: brief ? (brief.status === "APPROVED" || brief.status === "READY_FOR_REVIEW" || brief.status === "DRAFT" ? brief.status : "DRAFT") : "NONE",
        readyForReview: Boolean(brief?.readyForReview),
        openQuestions: countJson(brief?.openQuestions),
        demo: false,
        needsReview: Boolean(brief?.reviewRequired),
        updatedAt: iso(brief?.updatedAt),
      },
      definition: {
        exists: Boolean(definition),
        status: definition ? definition.status : "NONE",
        approved: definitionApproved,
        proposalOpen: proposals.some((item) => item.productId === product.id),
        proposedOutcomes: productOutcomes.filter((item) => item.status === "PROPOSED").length,
        proposedCapabilities: capabilities.filter((item) => item.productId === product.id && item.status === "PROPOSED").length,
        slice: !slice ? "NONE" : slice.status === "APPROVED" || slice.status === "IN_PROGRESS" || slice.status === "COMPLETED" ? "APPROVED" : "PROPOSED",
        openQuestions: questions.filter((item) => item.productId === product.id).length,
        demo: Boolean(definition?.seededDemo),
        needsReview: Boolean(definition?.reviewRequired),
        updatedAt: iso(definition?.updatedAt ?? slice?.updatedAt),
        outcome: primaryOutcome
          ? {
              title: primaryOutcome.title,
              status: primaryOutcome.status,
              measure: primaryOutcome.successMeasure,
              target: primaryOutcome.targetValue,
              latest: shown ? (shown.demo ? `Sample: ${shown.value}` : shown.value) : "",
              latestDemo: Boolean(shown?.demo && !latestObservation),
            }
          : null,
      },
      design: {
        architecture: !architecture ? "NONE" : architectureApproved ? "APPROVED" : architecture.status === "READY_FOR_REVIEW" ? "READY" : "DRAFT",
        architectureReview: Boolean(architecture?.reviewRequired),
        architectureReviewReason: architecture?.reviewReason ?? "",
        plan: !plan ? "NONE" : planApproved ? "APPROVED" : plan.status === "READY_FOR_REVIEW" ? "READY" : "DRAFT",
        planReview: Boolean(plan?.reviewRequired),
        planReviewReason: plan?.reviewReason ?? "",
        demo: Boolean(architecture?.seededDemo || plan?.seededDemo),
        updatedAt: iso(architecture?.updatedAt ?? plan?.updatedAt),
        traceabilityIssue: traceabilityIssue(coverages.filter((item) => item.architecture.productId === product.id)),
      },
      review: {
        exists: Boolean(review),
        approved: reviewApproved,
        reviewRequired: Boolean(review?.reviewRequired),
        reviewReason: review?.reviewReason ?? "",
        openCritical: review?.findings.filter((item) => item.severity === "CRITICAL" && item.status === "OPEN").length ?? 0,
        openHighBeforeCoding: review?.findings.filter((item) => item.severity === "HIGH" && item.dueBeforeCoding && item.status === "OPEN").length ?? 0,
        openFindings: review?.findings.filter((item) => item.status === "OPEN" || item.status === "ACCEPTED").length ?? 0,
        policyApproved,
        policyReapproval: Boolean(review?.policy?.reapprovalRequired),
        policyReason: review?.policy?.reapprovalReason ?? "",
        demo: Boolean(review?.seededDemo),
        updatedAt: iso(review?.updatedAt),
      },
      tasks: taskViews,
      prove: {
        sliceVerified,
        integrated: Boolean(integratedRow),
        entryOpen: entry.length === 0,
        entryReason: entry[0] ?? "",
      },
      release: {
        real: real
          ? {
              version: real.version,
              status: real.status,
              approval: !approval ? "NONE" : approval.stale ? "STALE" : "CURRENT",
              staleReason: approval?.staleReason ?? "",
              openBlockingRisks: real.risk?.factors.filter((factor) => factor.blocking && factor.status === "OPEN").length ?? 0,
              planApproved: real.plans.some((item) => item.status === "APPROVED"),
              deployed: succeeded || real.status === "DEPLOYED",
              postChecksReady: learnReasons.length === 0 || !learnReasons.some((reason) => reason.includes("post-deployment")),
              updatedAt: iso(real.updatedAt),
            }
          : null,
        demoOnly,
        readyToLearn: learnReasons.length === 0,
        learnReason: learnReasons[0] ?? "",
      },
      learn: {
        realEvidence: Boolean(latestObservation),
        decisionRecorded: learning.some((item) => item.productId === product.id),
        outcomeAchieved: productOutcomes.some((item) => item.status === "ACHIEVED"),
        updatedAt: iso(latestObservation?.observedAt ?? learning.find((item) => item.productId === product.id)?.createdAt),
      },
    };
  });
}
