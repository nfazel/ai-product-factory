import "server-only";

import { db } from "@/lib/db";
import type { ProductStage } from "@/domain/constants";
import { BLOCKING_FINDING_TYPES } from "@/modules/intake/readiness";
import { entryBlockers, learnBlockers, type ReleaseFacts, type ReleaseTaskFact } from "@/modules/release/readiness";
import type { GuidanceSnapshot, TaskSnapshot } from "@/modules/guidance/types";

const STAGES = new Set(["EXPLORE", "DEFINE", "BUILD", "PROVE", "SHIP", "LEARN"]);

function stageOf(value: string): ProductStage {
  return STAGES.has(value) ? (value as ProductStage) : "EXPLORE";
}

function countJson(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export async function loadSnapshots(productId?: string): Promise<GuidanceSnapshot[]> {
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
      db.solutionArchitecture.findMany({ where: { productId: { in: ids }, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } }),
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
      db.repositoryWorkspace.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: "desc" }, include: { contract: true } }),
      db.codeChangeApproval.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: "desc" } }),
      db.verificationSession.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: "desc" } }),
      db.verificationApproval.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: "desc" } }),
      db.publishedChange.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: "desc" } }),
      db.pullRequestRecord.findMany({ where: { productId: { in: ids } }, include: { publishedChange: true } }),
      db.releaseCandidate.findMany({
        where: { productId: { in: ids } },
        orderBy: { createdAt: "desc" },
        include: { approvals: { include: { approval: true } }, risk: { include: { factors: true } }, plans: { include: { checks: true } }, deployments: true, issues: true },
      }),
      db.learningRecord.findMany({ where: { productId: { in: ids } } }),
      db.workItem.findMany({ where: { productId: { in: ids }, type: "DEFECT" } }),
      db.integratedVerificationSession.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: "desc" } }),
    ]);

  const [requirementSources, analyses, intakeRequirements, intakeFindings, intakeQuestions] = await Promise.all([
    db.requirementSource.findMany({ where: { productId: { in: ids } } }),
    db.requirementsAnalysis.findMany({ where: { productId: { in: ids } }, include: { sources: true }, orderBy: { version: "desc" } }),
    db.sourceRequirement.findMany({ where: { productId: { in: ids } }, include: { traces: true } }),
    db.requirementFinding.findMany({ where: { productId: { in: ids }, status: "OPEN" } }),
    db.intakeQuestion.findMany({ where: { productId: { in: ids }, status: "OPEN" } }),
  ]);

  return products.map((product) => {
    const brief = briefs.find((item) => item.productId === product.id);
    const definition = definitions.find((item) => item.productId === product.id);
    const definitionApproved = Boolean(definition?.status === "APPROVED" && definitionApprovals.some((item) => item.productId === product.id));
    const slice = slices.find((item) => item.productId === product.id && item.status === "APPROVED") ?? slices.find((item) => item.productId === product.id);
    const architecture = architectures.find((item) => item.productId === product.id);
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
      const level = risk?.overrideRiskLevel ?? risk?.riskLevel;
      const mode = risk?.overrideExecutionMode ?? risk?.recommendedExecutionMode;
      const workspace = workspaces.find((item) => item.implementationTaskId === task.id);
      const approval = codeApprovals.find((item) => item.implementationTaskId === task.id);
      const session = verifications.find((item) => item.implementationTaskId === task.id && !item.demo) ?? verifications.find((item) => item.implementationTaskId === task.id);
      const verificationApproval = verificationApprovals.find((item) => item.implementationTaskId === task.id && item.sessionId === session?.id);
      const publication = published.find((item) => item.implementationTaskId === task.id);
      const pull = pullRequests.find((item) => item.publishedChange.implementationTaskId === task.id && !item.demo) ?? pullRequests.find((item) => item.publishedChange.implementationTaskId === task.id);
      let verification: TaskSnapshot["verification"] = "NONE";
      if (session?.demo) verification = "DEMO";
      else if (session?.stale || verificationApproval?.stale) verification = "STALE";
      else if (session && verificationApproval && !verificationApproval.stale && (session.overallVerdict === "PASS" || session.overallVerdict === "PASS_WITH_CONCERNS")) verification = "APPROVED";
      else if (session) verification = "AWAITING";
      let pullRequest: TaskSnapshot["pullRequest"] = "NONE";
      if (pull?.demo) pullRequest = "DEMO";
      else if (pull?.state === "MERGED") pullRequest = "MERGED";
      else if (pull) pullRequest = "OPEN";
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        humanOnly: mode === "HUMAN_ONLY",
        prohibited: level === "PROHIBITED" && !(risk?.overriddenBy && risk.overriddenBy.trim().length > 0),
        contractStale: Boolean(workspace?.executionContractStale || workspace?.contract?.stale),
        codeApproval: !approval ? "NONE" : approval.stale ? "STALE" : "CURRENT",
        workspace: !workspace ? "NONE" : workspace.completedAt || workspace.status === "COMPLETED" ? "DONE" : "OPEN",
        published: publication?.status === "PUBLISHED",
        pullRequest,
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
      },
      review: {
        exists: Boolean(review),
        approved: reviewApproved,
        reviewRequired: Boolean(review?.reviewRequired),
        reviewReason: review?.reviewReason ?? "",
        openCritical: review?.findings.filter((item) => item.severity === "CRITICAL" && item.status === "OPEN").length ?? 0,
        openHighBeforeCoding: review?.findings.filter((item) => item.severity === "HIGH" && item.dueBeforeCoding && item.status === "OPEN").length ?? 0,
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
