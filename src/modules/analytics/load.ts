import "server-only";

import { db } from "@/lib/db";
import { createAnalyticsInput, type AnalyticsInput, type ProductStageName } from "@/modules/analytics/types";

const STAGES = new Set<ProductStageName>(["EXPLORE", "DEFINE", "BUILD", "PROVE", "SHIP", "LEARN"]);

const ACTIVITY_TYPES = [
  "SLICE_APPROVED",
  "DISCOVERY_BRIEF_EDITED",
  "REQUIREMENT_UPDATED",
  "CODING_RISK_OVERRIDDEN",
  "CODING_PLAN_APPROVED",
  "CODING_CHANGES_REQUESTED",
  "VERIFICATION_MANUAL_RESULT",
  "CHANGES_REQUESTED",
  "RELEASE_RISK_ACCEPTED",
  "DEPLOYMENT_STARTED",
  "PULL_REQUEST_READY",
];

export async function loadAnalyticsInputs(productId?: string): Promise<AnalyticsInput[]> {
  const now = new Date().toISOString();
  const products = await db.product.findMany({
    where: productId ? { id: productId } : undefined,
    select: { id: true, name: true, status: true, currentStage: true, createdAt: true },
    orderBy: { updatedAt: "desc" },
  });
  if (products.length === 0) return [];
  const ids = products.map((product) => product.id);
  const where = { productId: { in: ids } };

  const [
    discoveries,
    definitions,
    definitionProposals,
    architectureProposals,
    architectures,
    plans,
    governanceReviews,
    policies,
    slices,
    workItems,
    workspaces,
    sessions,
    pullRequests,
    releases,
    outcomes,
    observations,
    learning,
    approvals,
    agentRuns,
    activities,
  ] = await Promise.all([
    db.discoverySession.findMany({ where, select: { productId: true, createdAt: true, startedAt: true, completedAt: true } }),
    db.productDefinition.findMany({ where, select: { productId: true, status: true, createdAt: true, approvedAt: true } }),
    db.definitionProposal.findMany({ where, select: { id: true, productId: true, status: true, createdAt: true } }),
    db.architectureProposal.findMany({ where, select: { id: true, productId: true, status: true, createdAt: true } }),
    db.solutionArchitecture.findMany({ where, select: { id: true, productId: true, version: true, status: true, reviewRequired: true, reviewReason: true, createdAt: true } }),
    db.implementationPlan.findMany({
      where,
      select: {
        id: true,
        productId: true,
        version: true,
        status: true,
        reviewRequired: true,
        reviewReason: true,
        createdAt: true,
        tasks: { select: { id: true, title: true, status: true, workItemId: true, createdAt: true, updatedAt: true } },
      },
    }),
    db.engineeringGovernanceReview.findMany({
      where,
      select: {
        id: true,
        productId: true,
        version: true,
        status: true,
        reviewRequired: true,
        reviewReason: true,
        createdAt: true,
        findings: { select: { id: true, title: true, severity: true, status: true, dueBeforeCoding: true, createdAt: true, updatedAt: true } },
        codingRisks: {
          select: {
            id: true,
            implementationTaskId: true,
            riskLevel: true,
            recommendedExecutionMode: true,
            overrideRiskLevel: true,
            overrideExecutionMode: true,
            overriddenAt: true,
            task: { select: { title: true } },
          },
        },
      },
    }),
    db.codingPolicy.findMany({ where, select: { productId: true, reapprovalRequired: true, reapprovalReason: true, reapprovalFlaggedAt: true } }),
    db.productSlice.findMany({ where, select: { id: true, productId: true, name: true, status: true, createdAt: true } }),
    db.workItem.findMany({
      where,
      select: {
        id: true,
        productId: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        sliceId: true,
        capabilityId: true,
        createdAt: true,
        capability: { select: { name: true } },
        slice: { select: { name: true } },
      },
    }),
    db.repositoryWorkspace.findMany({
      where,
      select: {
        id: true,
        productId: true,
        implementationTaskId: true,
        executionContractStale: true,
        staleReason: true,
        staleFlaggedAt: true,
        createdAt: true,
        completedAt: true,
        revisions: { select: { id: true, createdAt: true } },
        contract: { select: { id: true, implementationTaskId: true, stale: true, staleReason: true, staleFlaggedAt: true, executionMode: true, riskLevel: true, createdAt: true } },
        codeApprovals: { select: { id: true, implementationTaskId: true, createdAt: true, approval: { select: { status: true } } } },
        escalations: { select: { id: true, type: true, reason: true, status: true, createdAt: true, resolvedAt: true } },
      },
    }),
    db.verificationSession.findMany({
      where,
      select: {
        id: true,
        productId: true,
        implementationTaskId: true,
        overallVerdict: true,
        stale: true,
        demo: true,
        commitSha: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        executions: { select: { id: true, kind: true, status: true, startedAt: true, completedAt: true } },
        coverages: { select: { id: true, acceptanceCriterionId: true, status: true, humanConfirmed: true } },
        approvals: { select: { id: true, approval: { select: { status: true, resolvedAt: true } } } },
        escalations: { select: { id: true, type: true, reason: true, status: true, createdAt: true } },
        defectLinks: { select: { id: true, workItemId: true, implementationTaskId: true, createdAt: true } },
      },
    }),
    db.pullRequestRecord.findMany({
      where,
      select: {
        id: true,
        productId: true,
        number: true,
        title: true,
        state: true,
        demo: true,
        createdAt: true,
        mergedAt: true,
        publishedChange: { select: { workspaceId: true, implementationTaskId: true } },
        reviews: { select: { id: true, state: true, submittedAt: true } },
        checks: { select: { id: true, name: true, status: true, startedAt: true, completedAt: true } },
      },
    }),
    db.releaseCandidate.findMany({
      where,
      select: {
        id: true,
        productId: true,
        productSliceId: true,
        version: true,
        status: true,
        demo: true,
        createdAt: true,
        items: { select: { implementationTaskId: true } },
        approvals: {
          select: {
            id: true,
            stale: true,
            staleReason: true,
            staleFlaggedAt: true,
            approval: { select: { status: true, requestedAt: true, resolvedAt: true } },
          },
        },
        deployments: { select: { id: true, status: true, demo: true, environment: true, startedAt: true, completedAt: true, deployedVersion: true } },
        issues: { select: { id: true, deploymentRecordId: true, severity: true, status: true, description: true, detectedAt: true, resolvedAt: true } },
        plans: { select: { checks: { select: { id: true, phase: true, status: true, completedAt: true } } } },
        risk: { select: { factors: { select: { id: true, status: true, severity: true } } } },
        questions: { select: { id: true, status: true, resolvedAt: true } },
      },
    }),
    db.productOutcome.findMany({ where, select: { id: true, productId: true, title: true, successMeasure: true, targetValue: true, status: true } }),
    db.outcomeObservation.findMany({
      where,
      select: { id: true, productId: true, productOutcomeId: true, measure: true, value: true, unit: true, observedAt: true, demo: true, releaseCandidate: { select: { version: true } } },
    }),
    db.learningRecord.findMany({ where, select: { id: true, productId: true, productOutcomeId: true, decision: true, createdAt: true } }),
    db.approval.findMany({ where, select: { id: true, productId: true, approvalType: true, status: true, requestedAt: true, resolvedAt: true } }),
    db.agentRun.findMany({
      where,
      select: { id: true, productId: true, agentType: true, status: true, startedAt: true, completedAt: true, duration: true, estimatedCost: true, output: true },
    }),
    db.activity.findMany({
      where: { productId: { in: ids }, type: { in: ACTIVITY_TYPES } },
      select: { id: true, productId: true, type: true, description: true, createdAt: true },
    }),
  ]);

  return products.map((product) => {
    const stage = STAGES.has(product.currentStage as ProductStageName) ? (product.currentStage as ProductStageName) : "EXPLORE";
    const productPlans = plans.filter((plan) => plan.productId === product.id);
    const productReviews = governanceReviews.filter((review) => review.productId === product.id);
    const productWorkspaces = workspaces.filter((workspace) => workspace.productId === product.id);
    const productSessions = sessions.filter((session) => session.productId === product.id);
    const productPullRequests = pullRequests.filter((pullRequest) => pullRequest.productId === product.id);
    const productReleases = releases.filter((release) => release.productId === product.id);
    const discovery = discoveries.find((item) => item.productId === product.id) ?? null;
    const definition = definitions.find((item) => item.productId === product.id) ?? null;

    return createAnalyticsInput(
      now,
      { id: product.id, name: product.name, status: product.status, currentStage: stage, createdAt: product.createdAt.toISOString() },
      {
        discovery: discovery
          ? { createdAt: discovery.createdAt.toISOString(), startedAt: iso(discovery.startedAt), completedAt: iso(discovery.completedAt) }
          : null,
        definition: definition
          ? { status: definition.status, createdAt: definition.createdAt.toISOString(), approvedAt: iso(definition.approvedAt) }
          : null,
        definitionProposals: definitionProposals
          .filter((item) => item.productId === product.id)
          .map((item) => ({ id: item.id, status: item.status, createdAt: item.createdAt.toISOString() })),
        architectureProposals: architectureProposals
          .filter((item) => item.productId === product.id)
          .map((item) => ({ id: item.id, status: item.status, createdAt: item.createdAt.toISOString() })),
        architectures: architectures
          .filter((item) => item.productId === product.id)
          .map((item) => ({ id: item.id, version: item.version, status: item.status, reviewRequired: item.reviewRequired, reviewReason: item.reviewReason, createdAt: item.createdAt.toISOString() })),
        plans: productPlans.map((item) => ({ id: item.id, version: item.version, status: item.status, reviewRequired: item.reviewRequired, reviewReason: item.reviewReason, createdAt: item.createdAt.toISOString() })),
        governanceReviews: productReviews.map((item) => ({ id: item.id, version: item.version, status: item.status, reviewRequired: item.reviewRequired, reviewReason: item.reviewReason, createdAt: item.createdAt.toISOString() })),
        findings: productReviews.flatMap((review) =>
          review.findings.map((finding) => ({
            id: finding.id,
            title: finding.title,
            severity: finding.severity,
            status: finding.status,
            dueBeforeCoding: finding.dueBeforeCoding,
            createdAt: finding.createdAt.toISOString(),
            updatedAt: finding.updatedAt.toISOString(),
          })),
        ),
        codingRisks: productReviews.flatMap((review) =>
          review.codingRisks.map((risk) => ({
            id: risk.id,
            taskId: risk.implementationTaskId,
            taskTitle: risk.task.title,
            riskLevel: risk.riskLevel,
            executionMode: risk.recommendedExecutionMode,
            overrideRiskLevel: risk.overrideRiskLevel,
            overrideExecutionMode: risk.overrideExecutionMode,
            overriddenAt: iso(risk.overriddenAt),
          })),
        ),
        policies: policies
          .filter((item) => item.productId === product.id)
          .map((item) => ({ reapprovalRequired: item.reapprovalRequired, reapprovalReason: item.reapprovalReason, reapprovalFlaggedAt: iso(item.reapprovalFlaggedAt) })),
        slices: slices
          .filter((item) => item.productId === product.id)
          .map((item) => ({ id: item.id, name: item.name, status: item.status, createdAt: item.createdAt.toISOString() })),
        workItems: workItems
          .filter((item) => item.productId === product.id)
          .map((item) => ({
            id: item.id,
            title: item.title,
            type: item.type,
            status: item.status,
            priority: item.priority,
            sliceId: item.sliceId,
            capabilityId: item.capabilityId,
            capabilityName: item.capability?.name ?? null,
            sliceName: item.slice?.name ?? null,
            createdAt: item.createdAt.toISOString(),
          })),
        tasks: productPlans.flatMap((plan) =>
          plan.tasks.map((task) => ({ id: task.id, title: task.title, status: task.status, workItemId: task.workItemId, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() })),
        ),
        workspaces: productWorkspaces.map((workspace) => ({
          id: workspace.id,
          taskId: workspace.implementationTaskId,
          contractStale: workspace.executionContractStale,
          staleReason: workspace.staleReason,
          staleFlaggedAt: iso(workspace.staleFlaggedAt),
          createdAt: workspace.createdAt.toISOString(),
          completedAt: iso(workspace.completedAt),
        })),
        contracts: productWorkspaces.flatMap((workspace) =>
          workspace.contract
            ? [{
                id: workspace.contract.id,
                taskId: workspace.contract.implementationTaskId,
                workspaceId: workspace.id,
                stale: workspace.contract.stale,
                staleReason: workspace.contract.staleReason,
                staleFlaggedAt: iso(workspace.contract.staleFlaggedAt),
                executionMode: workspace.contract.executionMode,
                riskLevel: workspace.contract.riskLevel,
                createdAt: workspace.contract.createdAt.toISOString(),
              }]
            : [],
        ),
        revisions: productWorkspaces.flatMap((workspace) => workspace.revisions.map((revision) => ({ id: revision.id, workspaceId: workspace.id, createdAt: revision.createdAt.toISOString() }))),
        codingEscalations: productWorkspaces.flatMap((workspace) =>
          workspace.escalations.map((escalation) => ({
            id: escalation.id,
            workspaceId: workspace.id,
            type: escalation.type,
            reason: escalation.reason,
            status: escalation.status,
            createdAt: escalation.createdAt.toISOString(),
            resolvedAt: iso(escalation.resolvedAt),
          })),
        ),
        codeApprovals: productWorkspaces.flatMap((workspace) =>
          workspace.codeApprovals.map((approval) => ({
            id: approval.id,
            taskId: approval.implementationTaskId,
            workspaceId: workspace.id,
            createdAt: approval.createdAt.toISOString(),
            status: approval.approval.status,
          })),
        ),
        sessions: productSessions.map((session) => ({
          id: session.id,
          taskId: session.implementationTaskId,
          verdict: session.overallVerdict,
          stale: session.stale,
          demo: session.demo,
          commitSha: session.commitSha,
          startedAt: iso(session.startedAt),
          completedAt: iso(session.completedAt),
          createdAt: session.createdAt.toISOString(),
        })),
        executions: productSessions.flatMap((session) =>
          session.executions.map((execution) => ({
            id: execution.id,
            sessionId: session.id,
            kind: execution.kind,
            status: execution.status,
            startedAt: iso(execution.startedAt),
            completedAt: iso(execution.completedAt),
          })),
        ),
        coverages: productSessions.flatMap((session) =>
          session.coverages.map((coverage) => ({
            id: coverage.id,
            sessionId: session.id,
            criterionId: coverage.acceptanceCriterionId,
            status: coverage.status,
            humanConfirmed: coverage.humanConfirmed,
          })),
        ),
        verificationApprovals: productSessions.flatMap((session) =>
          session.approvals.map((approval) => ({
            id: approval.id,
            sessionId: session.id,
            resolvedAt: iso(approval.approval.resolvedAt),
            status: approval.approval.status,
          })),
        ),
        verificationEscalations: productSessions.flatMap((session) =>
          session.escalations.map((escalation) => ({
            id: escalation.id,
            sessionId: session.id,
            type: escalation.type,
            reason: escalation.reason,
            status: escalation.status,
            createdAt: escalation.createdAt.toISOString(),
            resolvedAt: null,
          })),
        ),
        defectLinks: productSessions.flatMap((session) =>
          session.defectLinks.map((link) => ({ id: link.id, workItemId: link.workItemId, taskId: link.implementationTaskId, createdAt: link.createdAt.toISOString() })),
        ),
        pullRequests: productPullRequests.map((pullRequest) => ({
          id: pullRequest.id,
          number: pullRequest.number,
          title: pullRequest.title,
          state: pullRequest.state,
          demo: pullRequest.demo,
          workspaceId: pullRequest.publishedChange.workspaceId,
          taskId: pullRequest.publishedChange.implementationTaskId,
          createdAt: pullRequest.createdAt.toISOString(),
          mergedAt: iso(pullRequest.mergedAt),
        })),
        reviews: productPullRequests.flatMap((pullRequest) => pullRequest.reviews.map((review) => ({ id: review.id, pullRequestId: pullRequest.id, state: review.state, submittedAt: iso(review.submittedAt) }))),
        checks: productPullRequests.flatMap((pullRequest) =>
          pullRequest.checks.map((check) => ({
            id: check.id,
            pullRequestId: pullRequest.id,
            name: check.name,
            status: check.status,
            startedAt: iso(check.startedAt),
            completedAt: iso(check.completedAt),
          })),
        ),
        releases: productReleases.map((release) => ({
          id: release.id,
          version: release.version,
          status: release.status,
          demo: release.demo,
          sliceId: release.productSliceId,
          createdAt: release.createdAt.toISOString(),
          taskIds: release.items.map((item) => item.implementationTaskId).filter((id): id is string => Boolean(id)),
        })),
        releaseApprovals: productReleases.flatMap((release) =>
          release.approvals.map((approval) => ({
            id: approval.id,
            candidateId: release.id,
            stale: approval.stale,
            staleReason: approval.staleReason,
            staleFlaggedAt: iso(approval.staleFlaggedAt),
            status: approval.approval.status,
            requestedAt: approval.approval.requestedAt.toISOString(),
            resolvedAt: iso(approval.approval.resolvedAt),
            demo: release.demo,
          })),
        ),
        deployments: productReleases.flatMap((release) =>
          release.deployments.map((deployment) => ({
            id: deployment.id,
            candidateId: release.id,
            version: deployment.deployedVersion || release.version,
            status: deployment.status,
            demo: deployment.demo || release.demo,
            environment: deployment.environment,
            startedAt: iso(deployment.startedAt),
            completedAt: iso(deployment.completedAt),
          })),
        ),
        deploymentChecks: productReleases.flatMap((release) =>
          release.plans.flatMap((plan) => plan.checks.map((check) => ({ id: check.id, candidateId: release.id, phase: check.phase, status: check.status, completedAt: iso(check.completedAt) }))),
        ),
        issues: productReleases.flatMap((release) =>
          release.issues.map((issue) => ({
            id: issue.id,
            candidateId: release.id,
            deploymentId: issue.deploymentRecordId,
            severity: issue.severity,
            status: issue.status,
            description: issue.description,
            detectedAt: issue.detectedAt.toISOString(),
            resolvedAt: iso(issue.resolvedAt),
          })),
        ),
        releaseRisks: productReleases.flatMap((release) => release.risk?.factors.map((factor) => ({ id: factor.id, status: factor.status, severity: factor.severity, candidateId: release.id })) ?? []),
        releaseQuestions: productReleases.flatMap((release) => release.questions.map((question) => ({ id: question.id, status: question.status, resolvedAt: iso(question.resolvedAt) }))),
        outcomes: outcomes
          .filter((item) => item.productId === product.id)
          .map((item) => ({ id: item.id, title: item.title, successMeasure: item.successMeasure, targetValue: item.targetValue, status: item.status })),
        observations: observations
          .filter((item) => item.productId === product.id)
          .map((item) => ({
            id: item.id,
            outcomeId: item.productOutcomeId,
            measure: item.measure,
            value: item.value,
            unit: item.unit,
            observedAt: item.observedAt.toISOString(),
            demo: item.demo,
            releaseVersion: item.releaseCandidate?.version ?? null,
          })),
        learning: learning
          .filter((item) => item.productId === product.id)
          .map((item) => ({ id: item.id, outcomeId: item.productOutcomeId, decision: item.decision, createdAt: item.createdAt.toISOString() })),
        approvals: approvals
          .filter((item) => item.productId === product.id)
          .map((item) => ({ id: item.id, type: item.approvalType, status: item.status, requestedAt: item.requestedAt.toISOString(), resolvedAt: iso(item.resolvedAt) })),
        agentRuns: agentRuns
          .filter((item) => item.productId === product.id)
          .map((item) => {
            const usage = readUsage(item.output);
            return {
              id: item.id,
              agentType: item.agentType,
              status: item.status,
              startedAt: iso(item.startedAt),
              completedAt: iso(item.completedAt),
              durationMs: item.duration,
              estimatedCost: item.estimatedCost == null ? null : item.estimatedCost.toString(),
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              escalated: usage.escalated,
              workspaceId: usage.workspaceId,
            };
          }),
        activities: activities
          .filter((item) => item.productId === product.id)
          .map((item) => ({ id: item.id, type: item.type, description: item.description, createdAt: item.createdAt.toISOString() })),
      },
    );
  });
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function readUsage(output: unknown) {
  const empty = { inputTokens: null as number | null, outputTokens: null as number | null, escalated: false, workspaceId: null as string | null };
  if (!output || typeof output !== "object") return empty;
  const record = output as Record<string, unknown>;
  const usage = record.usage;
  if (usage && typeof usage === "object") {
    const tokens = usage as Record<string, unknown>;
    if (typeof tokens.inputTokens === "number") empty.inputTokens = tokens.inputTokens;
    if (typeof tokens.outputTokens === "number") empty.outputTokens = tokens.outputTokens;
  }
  empty.escalated = record.escalated === true;
  empty.workspaceId = typeof record.workspaceId === "string" ? record.workspaceId : null;
  return empty;
}
