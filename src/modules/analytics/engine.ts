import { AGENT_CATALOG, type AgentType } from "@/domain/constants";
import { METRIC_DEFINITIONS, definitionsFor } from "@/modules/analytics/catalogue";
import { countMetric, durationAggregate, rateMetric, textMetric, unavailableDuration } from "@/modules/analytics/metric";
import {
  average,
  durationMs,
  formatDuration,
  inRange,
  inWindow,
  median,
  p85,
  P85_MINIMUM,
  previousWindowStart,
  windowStart,
  type TimeWindow,
} from "@/modules/analytics/time";
import type {
  AgentStat,
  AnalyticsInput,
  BottleneckSignal,
  CalcContext,
  ChartPoint,
  ChartSet,
  DrillItem,
  FactoryEvent,
  FlowSegment,
  InterventionCount,
  MetricValue,
  OutcomeView,
  ProductIntelligence,
  ReworkEvent,
  ScopeChangeEvent,
  WaitInterval,
  WaitType,
} from "@/modules/analytics/types";

const STAGE_LABEL: Record<string, string> = {
  EXPLORE: "Explore",
  DEFINE: "Define",
  BUILD: "Build",
  PROVE: "Prove",
  SHIP: "Ship",
  LEARN: "Learn",
};

const WAIT_LABEL: Record<WaitType, string> = {
  BRIEF_APPROVAL: "Waiting for Product Brief approval",
  DEFINITION_APPROVAL: "Waiting for Definition approval",
  ARCHITECTURE_APPROVAL: "Waiting for Architecture approval",
  PLAN_APPROVAL: "Waiting for Implementation Plan approval",
  GOVERNANCE_APPROVAL: "Waiting for Governance approval",
  CODING_POLICY_APPROVAL: "Waiting for Coding Policy approval",
  CODE_REVIEW: "Waiting for Code Review",
  VERIFICATION_APPROVAL: "Waiting for Verification approval",
  PR_REVIEW: "Waiting for PR review",
  CI: "Waiting for CI",
  RELEASE_APPROVAL: "Waiting for Release approval",
  DEPLOYMENT: "Waiting for Deployment",
};

const APPROVAL_GATES: { key: string; types: string[]; wait: WaitType }[] = [
  { key: "approval_wait_brief", types: ["PRODUCT_DISCOVERY"], wait: "BRIEF_APPROVAL" },
  { key: "approval_wait_definition", types: ["PRODUCT_DEFINITION"], wait: "DEFINITION_APPROVAL" },
  { key: "approval_wait_architecture", types: ["SOLUTION_ARCHITECTURE", "ARCHITECTURE"], wait: "ARCHITECTURE_APPROVAL" },
  { key: "approval_wait_plan", types: ["IMPLEMENTATION_PLAN"], wait: "PLAN_APPROVAL" },
  { key: "approval_wait_governance", types: ["ENGINEERING_GOVERNANCE"], wait: "GOVERNANCE_APPROVAL" },
  { key: "approval_wait_coding_policy", types: ["CODING_POLICY"], wait: "CODING_POLICY_APPROVAL" },
  { key: "approval_wait_code_change", types: ["CODE_CHANGE"], wait: "CODE_REVIEW" },
  { key: "approval_wait_verification", types: ["VERIFICATION"], wait: "VERIFICATION_APPROVAL" },
];

const IMPLEMENTATION_NOTE =
  "Tasks do not store an IN_PROGRESS timestamp. Start is coding-workspace creation. End is the code-change approval when it exists, otherwise workspace completion, otherwise the task update time.";

const LEAD_TIME_CHANGES_NOTE =
  "Commit author time is not stored. This uses the earliest coding workspace for the released tasks through the successful production deployment.";

export function calculateProduct(input: AnalyticsInput, window: TimeWindow): ProductIntelligence {
  const now = new Date(input.now);
  const ctx: CalcContext = {
    input,
    window,
    start: windowStart(window, now),
    previousStart: previousWindowStart(window, now),
    now,
    calculatedAt: input.now,
  };
  const metrics: MetricValue[] = [];
  const events: FactoryEvent[] = [];
  const waits: WaitInterval[] = [];
  const rework: ReworkEvent[] = [];
  const scopeChanges: ScopeChangeEvent[] = [];

  const push = (metric: MetricValue) => metrics.push(metric);
  const succeeded = input.deployments.filter(isSuccessfulProduction);
  const firstDeployment = earliest(succeeded.map((item) => item.completedAt));

  buildEvents(ctx, events);
  buildApprovalWaits(ctx, waits, push);
  buildPullRequestWaits(ctx, waits, push);
  buildReleaseWaits(ctx, waits, push);
  buildFlow(ctx, push, firstDeployment);
  const implementationSamples = buildImplementation(ctx, push);
  buildVerification(ctx, push);
  buildPredictability(ctx, push);
  buildRework(ctx, rework);
  buildScope(ctx, scopeChanges, push);
  buildQuality(ctx, rework, push);
  const agentStats = buildAi(ctx, push);
  buildGovernance(ctx, push);
  buildRelease(ctx, push);
  const outcomes = buildOutcomes(ctx, push, succeeded.length > 0);

  for (const change of scopeChanges) {
    change.downstreamRework = rework.filter((item) => item.timestamp >= change.at).length;
    change.impact =
      change.downstreamRework === 0
        ? "No later rework event is recorded after this change."
        : `${change.downstreamRework} rework event${change.downstreamRework === 1 ? "" : "s"} recorded at or after this change.`;
  }

  const order = new Map(METRIC_DEFINITIONS.map((definition, index) => [definition.key, index]));
  metrics.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
  const missing = definitionsFor("product").filter((definition) => !metrics.some((metric) => metric.key === definition.key));
  if (missing.length > 0) {
    throw new Error(`Analytics did not calculate: ${missing.map((definition) => definition.key).join(", ")}`);
  }

  const segments = buildSegments(events, waits);
  const bottlenecks = buildBottlenecks(input, metrics, rework, scopeChanges);
  const charts = buildCharts(input, metrics, waits, implementationSamples, ctx);
  const interventions = interventionCounts(input, ctx);

  return {
    productId: input.product.id,
    productName: input.product.name,
    stage: input.product.currentStage,
    status: input.product.status,
    window,
    calculatedAt: input.now,
    blocked: isBlocked(input),
    readyForHuman: input.approvals.some((approval) => approval.status === "PENDING"),
    metrics,
    events: events.sort((a, b) => a.at.localeCompare(b.at)),
    waits,
    scopeChanges,
    rework,
    bottlenecks,
    segments,
    outcomes,
    agents: agentStats,
    interventions,
    charts,
  };
}

function isSuccessfulProduction(deployment: AnalyticsInput["deployments"][number]) {
  return isProduction(deployment) && deployment.status === "SUCCEEDED" && Boolean(deployment.completedAt);
}

function isProduction(deployment: AnalyticsInput["deployments"][number]) {
  return !deployment.demo && deployment.environment.trim().toLowerCase() !== "demo";
}

function namesPullRequest(description: string, number: number) {
  return new RegExp(`(?:^|\\D)#${number}(?:\\D|$)`).test(description);
}

function earliest(values: (string | null | undefined)[]) {
  return values.filter((value): value is string => Boolean(value)).sort()[0] ?? null;
}

function latest(values: (string | null | undefined)[]) {
  const sorted = values.filter((value): value is string => Boolean(value)).sort();
  return sorted[sorted.length - 1] ?? null;
}

function inCurrent(ctx: CalcContext, iso: string | null | undefined) {
  return inWindow(iso, ctx.start);
}

function inPrevious(ctx: CalcContext, iso: string | null | undefined) {
  if (!ctx.previousStart || !ctx.start) return false;
  return inRange(iso, ctx.previousStart, ctx.start);
}

function comparisonText(currentCount: number, previous: number[], window: TimeWindow) {
  if (window === "all") return null;
  if (previous.length === 0) return "The previous period has insufficient data for a comparison.";
  return `Previous period median: ${formatDuration(median(previous))} (n = ${previous.length}). Current n = ${currentCount}.`;
}

function agentName(agentType: string) {
  if (agentType in AGENT_CATALOG) return AGENT_CATALOG[agentType as AgentType].name;
  return agentType;
}

function event(events: FactoryEvent[], type: string, label: string, at: string | null, entityId: string, entityLabel: string, stage: string, demo = false) {
  if (!at) return;
  events.push({ id: `${type}:${entityId}:${at}`, type, label, at, entityId, entityLabel, stage, demo });
}

function buildEvents(ctx: CalcContext, events: FactoryEvent[]) {
  const { input } = ctx;
  const keep = (at: string | null) => (at && inCurrent(ctx, at) ? at : null);
  event(events, "DISCOVERY_STARTED", "Discovery started", keep(input.discovery?.startedAt ?? input.discovery?.createdAt ?? null), input.product.id, input.product.name, "EXPLORE");
  event(events, "BRIEF_APPROVED", "Brief approved", keep(earliest(resolved(input, ["PRODUCT_DISCOVERY"]))), input.product.id, "Product Brief", "EXPLORE");
  if (input.definition && input.definition.status !== "NOT_STARTED") {
    event(events, "DEFINITION_STARTED", "Definition started", keep(input.definition.createdAt), input.product.id, "Product Definition", "DEFINE");
  }
  event(events, "DEFINITION_APPROVED", "Definition approved", keep(input.definition?.approvedAt ?? earliest(resolved(input, ["PRODUCT_DEFINITION"]))), input.product.id, "Product Definition", "DEFINE");
  event(events, "ARCHITECTURE_STARTED", "Architecture started", keep(earliest(input.architectures.map((item) => item.createdAt))), input.product.id, "Solution architecture", "BUILD");
  event(events, "ARCHITECTURE_APPROVED", "Architecture approved", keep(earliest(resolved(input, ["SOLUTION_ARCHITECTURE", "ARCHITECTURE"]))), input.product.id, "Solution architecture", "BUILD");
  event(events, "GOVERNANCE_APPROVED", "Governance approved", keep(earliest(resolved(input, ["ENGINEERING_GOVERNANCE"]))), input.product.id, "Governance", "BUILD");
  event(events, "CODING_STARTED", "Coding started", keep(earliest(input.workspaces.map((item) => item.createdAt))), input.product.id, "Coding workspace", "BUILD");
  event(events, "CODING_COMPLETED", "Coding completed", keep(earliest(input.tasks.filter((task) => task.status === "COMPLETED").map((task) => completionOf(input, task)))), input.product.id, "Implementation", "BUILD");
  for (const session of input.sessions) {
    event(events, "VERIFICATION_STARTED", "Verification started", keep(session.startedAt), session.id, session.demo ? "Demo verification" : "Verification", "PROVE", session.demo);
    const approved = input.verificationApprovals.find((item) => item.sessionId === session.id && item.status === "APPROVED" && item.resolvedAt);
    event(events, "VERIFICATION_APPROVED", "Verification approved", keep(approved?.resolvedAt ?? null), session.id, "Verification", "PROVE", session.demo);
  }
  for (const pullRequest of input.pullRequests) {
    event(events, "PR_CREATED", "PR created", keep(pullRequest.createdAt), pullRequest.id, pullRequest.demo ? `Demo PR #${pullRequest.number}` : `PR #${pullRequest.number}`, "PROVE", pullRequest.demo);
    event(events, "PR_MERGED", "PR merged", keep(pullRequest.mergedAt), pullRequest.id, `PR #${pullRequest.number}`, "PROVE", pullRequest.demo);
  }
  for (const release of input.releases) {
    const approval = input.releaseApprovals.find((item) => item.candidateId === release.id && item.status === "APPROVED" && item.resolvedAt);
    event(events, "RELEASE_APPROVED", "Release approved", keep(approval?.resolvedAt ?? null), release.id, release.version, "SHIP", release.demo);
  }
  for (const deployment of input.deployments) {
    event(events, "DEPLOYMENT_STARTED", "Deployment started", keep(deployment.startedAt), deployment.id, deployment.version, "SHIP", deployment.demo || !isProduction(deployment));
    if (deployment.status === "SUCCEEDED") {
      event(events, "DEPLOYMENT_SUCCEEDED", "Deployment succeeded", keep(deployment.completedAt), deployment.id, deployment.version, "SHIP", !isSuccessfulProduction(deployment));
    }
  }
  for (const observation of input.observations) {
    event(events, "OUTCOME_OBSERVED", "Outcome observed", keep(observation.observedAt), observation.id, observation.demo ? "Demo observation" : observation.measure, "LEARN", observation.demo);
  }
  for (const record of input.learning) {
    event(events, "LEARNING_DECISION", "Learning decision", keep(record.createdAt), record.id, record.decision, "LEARN");
  }
}

function resolved(input: AnalyticsInput, types: string[]) {
  return input.approvals.filter((approval) => types.includes(approval.type) && approval.status === "APPROVED").map((approval) => approval.resolvedAt);
}

function completionOf(input: AnalyticsInput, task: AnalyticsInput["tasks"][number]) {
  const approval = earliest(input.codeApprovals.filter((item) => item.taskId === task.id && item.status === "APPROVED").map((item) => item.createdAt));
  if (approval) return approval;
  return latest(input.workspaces.filter((item) => item.taskId === task.id).map((item) => item.completedAt)) ?? task.updatedAt;
}

function buildApprovalWaits(ctx: CalcContext, waits: WaitInterval[], push: (metric: MetricValue) => void) {
  for (const gate of APPROVAL_GATES) {
    const samples: { ms: number; drill: DrillItem }[] = [];
    const previous: number[] = [];
    for (const approval of ctx.input.approvals.filter((item) => gate.types.includes(item.type))) {
      const closed = approval.status !== "PENDING" && approval.resolvedAt ? durationMs(approval.requestedAt, approval.resolvedAt) : null;
      const open = approval.status === "PENDING";
      if (open || inCurrent(ctx, approval.requestedAt) || inCurrent(ctx, approval.resolvedAt)) {
        waits.push({
          id: approval.id,
          type: gate.wait,
          label: WAIT_LABEL[gate.wait],
          startedAt: approval.requestedAt,
          endedAt: approval.resolvedAt,
          durationMs: closed,
          relatedEntity: approval.id,
          reason: open ? "Still waiting for a person." : `Approval ${approval.status.toLowerCase()}.`,
          demo: false,
        });
      }
      if (closed != null && inCurrent(ctx, approval.resolvedAt)) {
        samples.push({
          ms: closed,
          drill: { id: approval.id, label: WAIT_LABEL[gate.wait], detail: `${approval.requestedAt} → ${approval.resolvedAt} (${formatDuration(closed)})` },
        });
      }
      if (closed != null && inPrevious(ctx, approval.resolvedAt)) previous.push(closed);
    }
    push(
      durationAggregate({
        key: gate.key,
        window: ctx.window,
        calculatedAt: ctx.calculatedAt,
        samples,
        pick: "median",
        qualityNote: "Median wait from the approval request to the human decision.",
        insufficientNote: "No resolved approval with both a request time and a decision time in this period.",
        comparison: comparisonText(samples.length, previous, ctx.window),
      }),
    );
  }
  push(
    unavailableDuration(
      "approval_wait_execution_plan",
      ctx.window,
      ctx.calculatedAt,
      "Execution plan approval has no request timestamp and no resolution timestamp, so a wait cannot be calculated.",
    ),
  );
}

function buildPullRequestWaits(ctx: CalcContext, waits: WaitInterval[], push: (metric: MetricValue) => void) {
  const cycle: { ms: number; drill: DrillItem }[] = [];
  const firstReview: { ms: number; drill: DrillItem }[] = [];
  const ci: { ms: number; drill: DrillItem }[] = [];
  const changes: { ms: number; drill: DrillItem }[] = [];
  const ready: { ms: number; drill: DrillItem }[] = [];
  const previousCycle: number[] = [];

  for (const pullRequest of ctx.input.pullRequests.filter((item) => !item.demo)) {
    const reviews = ctx.input.reviews
      .filter((review) => review.pullRequestId === pullRequest.id && review.submittedAt)
      .sort((a, b) => a.submittedAt!.localeCompare(b.submittedAt!));
    const first = reviews[0];
    if (first?.submittedAt) {
      const ms = durationMs(pullRequest.createdAt, first.submittedAt);
      if (ms != null) {
        if (inCurrent(ctx, first.submittedAt) || inCurrent(ctx, pullRequest.createdAt)) {
          waits.push(wait(pullRequest.id, "PR_REVIEW", pullRequest.createdAt, first.submittedAt, ms, `PR #${pullRequest.number}`, "First review submitted."));
        }
        if (inCurrent(ctx, first.submittedAt)) {
          firstReview.push({ ms, drill: drill(pullRequest.id, `PR #${pullRequest.number}`, `${pullRequest.createdAt} → first review ${first.submittedAt}`) });
        }
      }
    } else if (pullRequest.state !== "MERGED" && pullRequest.state !== "CLOSED") {
      waits.push(wait(pullRequest.id, "PR_REVIEW", pullRequest.createdAt, null, null, `PR #${pullRequest.number}`, "No review timestamp is recorded yet."));
    }

    const requested = reviews.find((review) => review.state === "CHANGES_REQUESTED" && review.submittedAt);
    if (requested?.submittedAt) {
      const later = reviews.find((review) => review.state === "APPROVED" && review.submittedAt && review.submittedAt > requested.submittedAt!);
      const end = later?.submittedAt ?? pullRequest.mergedAt;
      const ms = durationMs(requested.submittedAt, end);
      if (ms != null && inCurrent(ctx, end)) {
        changes.push({ ms, drill: drill(pullRequest.id, `PR #${pullRequest.number}`, `${requested.submittedAt} → ${end}`) });
      } else if (!end) {
        waits.push(wait(`${pullRequest.id}-changes`, "PR_REVIEW", requested.submittedAt, null, null, `PR #${pullRequest.number}`, "Changes were requested and have not been closed."));
      }
    }

    const checks = ctx.input.checks.filter((check) => check.pullRequestId === pullRequest.id);
    const timed = checks.filter((check) => check.startedAt && check.completedAt);
    if (timed.length > 0) {
      const start = earliest(timed.map((check) => check.startedAt));
      const end = latest(timed.map((check) => check.completedAt));
      const ms = durationMs(start, end);
      if (ms != null && inCurrent(ctx, end)) {
        ci.push({ ms, drill: drill(pullRequest.id, `PR #${pullRequest.number} CI`, `${start} → ${end}. Checks without timestamps were left out.`) });
        waits.push(wait(`${pullRequest.id}-ci`, "CI", start!, end, ms, `PR #${pullRequest.number}`, "Measured from recorded check timestamps."));
      }
    } else if (checks.length > 0) {
      waits.push(wait(`${pullRequest.id}-ci`, "CI", pullRequest.createdAt, null, null, `PR #${pullRequest.number}`, "CI checks exist, but they have no start and finish timestamps."));
    }

    if (pullRequest.mergedAt) {
      const ms = durationMs(pullRequest.createdAt, pullRequest.mergedAt);
      if (ms != null && inCurrent(ctx, pullRequest.mergedAt)) {
        cycle.push({ ms, drill: drill(pullRequest.id, `PR #${pullRequest.number}`, `${pullRequest.createdAt} → ${pullRequest.mergedAt} (${formatDuration(ms)})`) });
      }
      if (ms != null && inPrevious(ctx, pullRequest.mergedAt)) previousCycle.push(ms);
      const readyAt = earliest(
        ctx.input.activities
          .filter((activity) => activity.type === "PULL_REQUEST_READY" && namesPullRequest(activity.description, pullRequest.number))
          .map((activity) => activity.createdAt),
      );
      const readyMs = durationMs(readyAt, pullRequest.mergedAt);
      if (readyMs != null && inCurrent(ctx, pullRequest.mergedAt)) {
        ready.push({ ms: readyMs, drill: drill(pullRequest.id, `PR #${pullRequest.number}`, `Ready ${readyAt} → merged ${pullRequest.mergedAt}`) });
      }
    }
  }

  push(durationAggregate({ key: "pr_cycle", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: cycle, pick: "median", qualityNote: "Created to merged, demo pull requests excluded.", insufficientNote: "No merged non-demo pull request in this period.", comparison: comparisonText(cycle.length, previousCycle, ctx.window) }));
  push(durationAggregate({ key: "pr_time_to_first_review", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: firstReview, pick: "median", qualityNote: "Created to the earliest review submittedAt.", insufficientNote: "No pull request has a review timestamp in this period.", comparison: null }));
  push(durationAggregate({ key: "pr_ci_wait", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: ci, pick: "median", qualityNote: "Earliest recorded check start to latest recorded check finish. Missing check timestamps are not treated as zero.", insufficientNote: "No pull request has check start and finish timestamps in this period.", comparison: null }));
  push(durationAggregate({ key: "pr_changes_requested", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: changes, pick: "median", qualityNote: "Changes-requested review to the next approval or merge.", insufficientNote: "No closed changes-requested interval in this period.", comparison: null }));
  push(durationAggregate({ key: "pr_ready_to_merge", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: ready, pick: "median", qualityNote: "Readiness comes from the PULL_REQUEST_READY activity that names the pull request number.", insufficientNote: "No ready-for-merge activity can be tied to a merged pull request in this period.", comparison: null }));
}

function buildReleaseWaits(ctx: CalcContext, waits: WaitInterval[], push: (metric: MetricValue) => void) {
  const cycle: { ms: number; drill: DrillItem }[] = [];
  const toApproval: { ms: number; drill: DrillItem }[] = [];
  const toDeployment: { ms: number; drill: DrillItem }[] = [];
  const deploymentDuration: { ms: number; drill: DrillItem }[] = [];
  const releaseWait: { ms: number; drill: DrillItem }[] = [];

  for (const approval of ctx.input.releaseApprovals.filter((item) => !item.demo)) {
    const release = ctx.input.releases.find((item) => item.id === approval.candidateId);
    if (!approval.requestedAt) continue;
    const closed = approval.resolvedAt ? durationMs(approval.requestedAt, approval.resolvedAt) : null;
    if (approval.status === "PENDING" || inCurrent(ctx, approval.resolvedAt)) {
      waits.push(wait(approval.id, "RELEASE_APPROVAL", approval.requestedAt, approval.resolvedAt, closed, release?.version ?? approval.candidateId, approval.status === "PENDING" ? "Still waiting for release approval." : "Release decision recorded."));
    }
    if (closed != null && approval.resolvedAt && inCurrent(ctx, approval.resolvedAt)) {
      releaseWait.push({ ms: closed, drill: drill(approval.id, release?.version ?? "Release", `${approval.requestedAt} → ${approval.resolvedAt}`) });
    }
  }
  push(durationAggregate({ key: "approval_wait_release", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: releaseWait, pick: "median", qualityNote: "Demo release candidates are excluded.", insufficientNote: "No resolved non-demo release approval with both timestamps in this period.", comparison: null }));

  for (const release of ctx.input.releases.filter((item) => !item.demo)) {
    const deployment = ctx.input.deployments.find((item) => item.candidateId === release.id && isSuccessfulProduction(item));
    const cycleMs = durationMs(release.createdAt, deployment?.completedAt);
    if (cycleMs != null && deployment?.completedAt && inCurrent(ctx, deployment.completedAt)) {
      cycle.push({ ms: cycleMs, drill: drill(release.id, release.version, `${release.createdAt} → ${deployment.completedAt}`) });
    }
    const approval = ctx.input.releaseApprovals.find((item) => item.candidateId === release.id && item.status === "APPROVED" && item.resolvedAt);
    const approvalMs = durationMs(release.createdAt, approval?.resolvedAt);
    if (approvalMs != null && approval?.resolvedAt && inCurrent(ctx, approval.resolvedAt)) {
      toApproval.push({ ms: approvalMs, drill: drill(release.id, release.version, `Candidate ${release.createdAt} → approval ${approval.resolvedAt}`) });
    }
    const deployMs = durationMs(approval?.resolvedAt, deployment?.startedAt);
    if (deployMs != null && deployment?.startedAt && inCurrent(ctx, deployment.startedAt)) {
      toDeployment.push({ ms: deployMs, drill: drill(release.id, release.version, `Approval ${approval?.resolvedAt} → deployment ${deployment.startedAt}`) });
      waits.push(wait(`${release.id}-deploy`, "DEPLOYMENT", approval!.resolvedAt!, deployment.startedAt, deployMs, release.version, "Approved release waiting to start deployment."));
    } else if (approval?.resolvedAt && !deployment) {
      waits.push(wait(`${release.id}-deploy`, "DEPLOYMENT", approval.resolvedAt, null, null, release.version, "Approved, and no production deployment is recorded."));
    }
    const duration = durationMs(deployment?.startedAt, deployment?.completedAt);
    if (duration != null && deployment?.completedAt && inCurrent(ctx, deployment.completedAt)) {
      const post = ctx.input.deploymentChecks.filter((check) => check.candidateId === release.id && check.phase === "POST" && check.completedAt);
      const postNote = post.length === 0 ? "No post-deployment check has a completion time." : `Latest post-check ${latest(post.map((check) => check.completedAt))}.`;
      deploymentDuration.push({ ms: duration, drill: drill(deployment.id, release.version, `${deployment.startedAt} → ${deployment.completedAt}. ${postNote}`) });
    }
  }

  push(durationAggregate({ key: "release_cycle", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: cycle, pick: "median", qualityNote: "Non-demo candidate creation to successful production deployment.", insufficientNote: "No non-demo candidate has a successful production deployment in this period.", comparison: null }));
  push(durationAggregate({ key: "release_to_approval", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: toApproval, pick: "median", qualityNote: "Candidate creation to release approval.", insufficientNote: "No approved non-demo release in this period.", comparison: null }));
  push(durationAggregate({ key: "release_approval_to_deployment", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: toDeployment, pick: "median", qualityNote: "Release approval to deployment start.", insufficientNote: "No approved release has a deployment start in this period.", comparison: null }));
  push(durationAggregate({ key: "deployment_to_completion", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: deploymentDuration, pick: "median", quality: deploymentDuration.length ? "PARTIAL" : "INSUFFICIENT", qualityNote: "Deployment start to deployment completedAt. Post-deployment check time is included in the drill-down only when a check has completedAt.", insufficientNote: "No successful production deployment has both a start and a finish in this period.", comparison: null }));
}

function wait(id: string, type: WaitType, startedAt: string, endedAt: string | null, duration: number | null, relatedEntity: string, reason: string): WaitInterval {
  return { id: `${type}:${id}`, type, label: WAIT_LABEL[type], startedAt, endedAt, durationMs: duration, relatedEntity, reason, demo: false };
}

function drill(id: string, label: string, detail: string): DrillItem {
  return { id, label, detail };
}

function buildFlow(ctx: CalcContext, push: (metric: MetricValue) => void, firstDeployment: string | null) {
  const { input } = ctx;
  const start = input.discovery?.createdAt ?? input.product.createdAt;
  const lead = durationMs(start, firstDeployment);
  const leadInWindow = Boolean(firstDeployment && inCurrent(ctx, firstDeployment));
  if (lead != null && leadInWindow && firstDeployment) {
    push(
      durationAggregate({
        key: "idea_to_deployment_lead_time",
        window: ctx.window,
        calculatedAt: ctx.calculatedAt,
        samples: [{ ms: lead, drill: drill(input.product.id, input.product.name, `Start ${start}. End ${firstDeployment}. ${formatDuration(lead)}.`) }],
        pick: "median",
        qualityNote: input.discovery ? "Start is the discovery session createdAt." : "No discovery session exists. Start is the product createdAt.",
        insufficientNote: "",
        comparison: null,
      }),
    );
  } else {
    push(
      textMetric({
        key: "idea_to_deployment_lead_time",
        window: ctx.window,
        calculatedAt: ctx.calculatedAt,
        display: "INSUFFICIENT DATA",
        quality: "INSUFFICIENT",
        note: firstDeployment ? "The successful deployment is outside this period." : "No successful non-demo deployment with a completion time is recorded. Demo deployments are not used.",
        sampleSize: 0,
      }),
    );
  }

  const discoveryStart = input.discovery?.startedAt ?? input.discovery?.createdAt ?? null;
  const briefApproved = earliest(resolved(input, ["PRODUCT_DISCOVERY"]));
  const definitionStarted = input.definition && input.definition.status !== "NOT_STARTED" ? input.definition.createdAt : null;
  const definitionApproved = input.definition?.approvedAt ?? earliest(resolved(input, ["PRODUCT_DEFINITION"]));
  const architectureStarted = earliest(input.architectures.map((item) => item.createdAt));
  const codingCompleted = latest(input.tasks.filter((task) => task.status === "COMPLETED").map((task) => completionOf(input, task)));
  const verificationStarted = earliest(input.sessions.filter((session) => !session.demo).map((session) => session.startedAt));
  const verificationApproved = earliest(
    input.verificationApprovals
      .filter((approval) => approval.status === "APPROVED" && input.sessions.some((session) => session.id === approval.sessionId && !session.demo))
      .map((approval) => approval.resolvedAt),
  );
  const merged = earliest(input.pullRequests.filter((item) => !item.demo).map((item) => item.mergedAt));
  const releaseCreated = earliest(input.releases.filter((item) => !item.demo).map((item) => item.createdAt));
  const learned = earliest([...input.learning.map((item) => item.createdAt), ...input.observations.filter((item) => !item.demo).map((item) => item.observedAt)]);

  const bounds = [
    { key: "explore", start: discoveryStart, end: briefApproved ?? definitionStarted },
    { key: "define", start: definitionStarted, end: definitionApproved },
    { key: "build", start: architectureStarted ?? definitionApproved, end: codingCompleted ?? verificationStarted },
    { key: "prove", start: verificationStarted, end: verificationApproved ?? merged },
    { key: "ship", start: releaseCreated, end: firstDeployment },
    { key: "learn", start: firstDeployment, end: learned },
  ];
  const spans = executionSpans(input);
  const elapsedForEfficiency: number[] = [];
  const activeForEfficiency: Array<number | null> = [];

  for (const bound of bounds) {
    const elapsedKey = `stage_elapsed_${bound.key}`;
    const activeKey = `stage_active_${bound.key}`;
    const elapsed = durationMs(bound.start, bound.end);
    const inPeriod = Boolean(bound.end && inCurrent(ctx, bound.end));
    if (elapsed == null || !inPeriod) {
      push(textMetric({ key: elapsedKey, window: ctx.window, calculatedAt: ctx.calculatedAt, display: "INSUFFICIENT DATA", quality: "INSUFFICIENT", note: "One or both stage milestones are missing, or the stage did not finish in this period. Elapsed time is not filled with zero.", sampleSize: 0 }));
      push(unavailableDuration(activeKey, ctx.window, ctx.calculatedAt, "Active time is not calculated when the elapsed stage interval is unavailable."));
      continue;
    }
    push(
      durationAggregate({
        key: elapsedKey,
        window: ctx.window,
        calculatedAt: ctx.calculatedAt,
        samples: [{ ms: elapsed, drill: drill(bound.key, STAGE_LABEL[bound.key.toUpperCase()] ?? bound.key, `${bound.start} → ${bound.end}`) }],
        pick: "median",
        quality: "PARTIAL",
        qualityNote: "Milestone-to-milestone elapsed time. The product does not store a stage-history clock.",
        insufficientNote: "",
      }),
    );
    elapsedForEfficiency.push(elapsed);
    const inside = spans.filter((span) => span.start >= bound.start! && span.start < bound.end!);
    if (inside.length === 0) {
      activeForEfficiency.push(null);
      push(unavailableDuration(activeKey, ctx.window, ctx.calculatedAt, "No agent run or verification execution with a start and finish falls inside this stage. Active time was not invented from the elapsed duration."));
    } else {
      const total = inside.reduce((sum, span) => sum + span.ms, 0);
      activeForEfficiency.push(total);
      push(
        durationAggregate({
          key: activeKey,
          window: ctx.window,
          calculatedAt: ctx.calculatedAt,
          samples: [{ ms: total, drill: drill(bound.key, "Recorded execution", `${inside.length} span${inside.length === 1 ? "" : "s"}.`) }],
          pick: "median",
          quality: "PARTIAL",
          qualityNote: "Sum of recorded agent-run and verification-command spans. Human work inside the stage is not included.",
          insufficientNote: "",
        }),
      );
    }
  }

  if (elapsedForEfficiency.length === 0 || activeForEfficiency.some((value) => value == null)) {
    push(
      unavailableDuration(
        "flow_efficiency",
        ctx.window,
        ctx.calculatedAt,
        elapsedForEfficiency.length === 0
          ? "Flow efficiency needs elapsed stage intervals, and those milestones are not both present."
          : "Active time is missing for at least one stage that has an elapsed duration. Dividing a partial active total by elapsed time would understate the work, so the percentage is not shown.",
      ),
    );
  } else {
    const active = activeForEfficiency.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const elapsed = elapsedForEfficiency.reduce((sum, value) => sum + value, 0);
    push(
      rateMetric({
        key: "flow_efficiency",
        window: ctx.window,
        calculatedAt: ctx.calculatedAt,
        numerator: active,
        denominator: elapsed,
        quality: "PARTIAL",
        note: "Recorded execution time divided by milestone elapsed time. Human effort is not in the numerator.",
        insufficientNote: "Elapsed time is zero.",
        drilldown: [drill("flow", "Flow efficiency", `${formatDuration(active)} recorded execution / ${formatDuration(elapsed)} elapsed`)],
        sampleSize: elapsedForEfficiency.length,
      }),
    );
  }
}

function executionSpans(input: AnalyticsInput) {
  const spans: { start: string; end: string; ms: number }[] = [];
  for (const run of input.agentRuns) {
    if (!run.startedAt || !run.completedAt) continue;
    const ms = run.durationMs ?? durationMs(run.startedAt, run.completedAt);
    if (ms == null) continue;
    spans.push({ start: run.startedAt, end: run.completedAt, ms });
  }
  for (const execution of input.executions) {
    const ms = durationMs(execution.startedAt, execution.completedAt);
    if (ms == null || !execution.startedAt || !execution.completedAt) continue;
    spans.push({ start: execution.startedAt, end: execution.completedAt, ms });
  }
  return spans;
}

function buildImplementation(ctx: CalcContext, push: (metric: MetricValue) => void) {
  const current: { ms: number; drill: DrillItem }[] = [];
  const previous: number[] = [];
  for (const task of ctx.input.tasks.filter((item) => item.status === "COMPLETED")) {
    const spaces = ctx.input.workspaces.filter((workspace) => workspace.taskId === task.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const workspace = spaces[0];
    if (!workspace) continue;
    const end = completionOf(ctx.input, task);
    const ms = durationMs(workspace.createdAt, end);
    if (ms == null) continue;
    const item = { ms, drill: drill(task.id, task.title, `Started ${workspace.createdAt}. Completed ${end}. Task ${task.id}. Workspace ${workspace.id}.`) };
    if (inCurrent(ctx, end)) current.push(item);
    if (inPrevious(ctx, end)) previous.push(ms);
  }
  const comparison = comparisonText(current.length, previous, ctx.window);
  push(durationAggregate({ key: "implementation_cycle_median", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: current, pick: "median", quality: current.length ? "PARTIAL" : "INSUFFICIENT", qualityNote: IMPLEMENTATION_NOTE, insufficientNote: IMPLEMENTATION_NOTE, comparison }));
  push(durationAggregate({ key: "implementation_cycle_average", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: current, pick: "average", quality: current.length ? "PARTIAL" : "INSUFFICIENT", qualityNote: IMPLEMENTATION_NOTE, insufficientNote: IMPLEMENTATION_NOTE, comparison }));
  if (current.length >= P85_MINIMUM) {
    const value = p85(current.map((sample) => sample.ms));
    push(durationAggregate({ key: "implementation_cycle_p85", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: value == null ? [] : [{ ms: value, drill: drill("p85", "P85", formatDuration(value)) }], pick: "median", quality: "PARTIAL", qualityNote: IMPLEMENTATION_NOTE, insufficientNote: IMPLEMENTATION_NOTE, sampleSize: current.length }));
  } else {
    push(unavailableDuration("implementation_cycle_p85", ctx.window, ctx.calculatedAt, `P85 is hidden because the sample has ${current.length} item${current.length === 1 ? "" : "s"}. It is shown from ${P85_MINIMUM} items upward.`, current.length));
  }
  return current;
}

function buildVerification(ctx: CalcContext, push: (metric: MetricValue) => void) {
  const cycle: { ms: number; drill: DrillItem }[] = [];
  const execution: { ms: number; drill: DrillItem }[] = [];
  for (const session of ctx.input.sessions.filter((item) => !item.demo)) {
    const approval = ctx.input.verificationApprovals.find((item) => item.sessionId === session.id && item.status === "APPROVED" && item.resolvedAt);
    const cycleMs = durationMs(session.startedAt, approval?.resolvedAt);
    if (cycleMs != null && approval?.resolvedAt && inCurrent(ctx, approval.resolvedAt)) {
      cycle.push({ ms: cycleMs, drill: drill(session.id, "Verification", `Start ${session.startedAt}. Approval ${approval.resolvedAt}. Session ${session.id}.`) });
    }
    const spans = ctx.input.executions
      .filter((item) => item.sessionId === session.id)
      .map((item) => durationMs(item.startedAt, item.completedAt))
      .filter((item): item is number => item != null);
    const end = latest(ctx.input.executions.filter((item) => item.sessionId === session.id).map((item) => item.completedAt));
    if (spans.length > 0 && end && inCurrent(ctx, end)) {
      const total = spans.reduce((sum, value) => sum + value, 0);
      execution.push({ ms: total, drill: drill(session.id, "Verification execution", `${spans.length} command span${spans.length === 1 ? "" : "s"}, ${formatDuration(total)}.`) });
    }
  }
  push(durationAggregate({ key: "verification_cycle", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: cycle, pick: "median", qualityNote: "Verification startedAt to human approval. This includes waiting.", insufficientNote: "No non-demo verification session has both a start time and an approval time in this period.", comparison: null }));
  push(durationAggregate({ key: "verification_execution", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: execution, pick: "median", qualityNote: "Sum of verification command spans. This excludes the wait for approval.", insufficientNote: "No verification command has both a start and a finish in this period.", comparison: null }));
}

function buildPredictability(ctx: CalcContext, push: (metric: MetricValue) => void) {
  const committed = ctx.input.slices.filter((slice) => ["APPROVED", "IN_PROGRESS", "COMPLETED"].includes(slice.status));
  if (committed.length === 0) {
    push(textMetric({ key: "delivery_predictability", window: ctx.window, calculatedAt: ctx.calculatedAt, display: "INSUFFICIENT COMMITMENT DATA", quality: "INSUFFICIENT", note: "No product slice is approved, in progress, or completed, so there is no commitment boundary.", sampleSize: 0 }));
    return;
  }
  const commitment = earliest(ctx.input.activities.filter((activity) => activity.type === "SLICE_APPROVED").map((activity) => activity.createdAt));
  const items = ctx.input.workItems.filter((item) => item.sliceId && committed.some((slice) => slice.id === item.sliceId));
  const completed = items.filter((item) => item.status === "DONE");
  const blocked = items.filter((item) => item.status === "BLOCKED");
  const added = commitment ? items.filter((item) => item.createdAt > commitment) : [];
  const addedText = commitment ? `${added.length} added after commitment` : "added-after is not separated because no SLICE_APPROVED time is recorded";
  push(
    textMetric({
      key: "delivery_predictability",
      window: ctx.window,
      calculatedAt: ctx.calculatedAt,
      display: `${completed.length} completed / ${items.length} planned, ${blocked.length} blocked, ${addedText}`,
      quality: commitment ? "GOOD" : "PARTIAL",
      note: "Removals after commitment are not recorded, so they are not shown as zero. Deferred items are those currently blocked on the approved slice.",
      sampleSize: items.length,
      drilldown: items.map((item) => drill(item.id, item.title, `${item.type} ${item.status}${commitment && item.createdAt > commitment ? " · added after commitment" : ""}`)),
    }),
  );
}

function buildRework(ctx: CalcContext, rework: ReworkEvent[]) {
  for (const revision of ctx.input.revisions.filter((item) => inCurrent(ctx, item.createdAt))) {
    const pullRequests = ctx.input.pullRequests.filter((item) => item.workspaceId === revision.workspaceId && !item.demo);
    const afterPullRequest = pullRequests.some((pullRequest) =>
      ctx.input.reviews.some((review) => review.pullRequestId === pullRequest.id && review.state === "CHANGES_REQUESTED" && review.submittedAt && review.submittedAt < revision.createdAt),
    );
    const afterHuman = ctx.input.codeApprovals.some((approval) => approval.workspaceId === revision.workspaceId && approval.createdAt < revision.createdAt);
    if (!afterPullRequest && !afterHuman) continue;
    const task = taskForWorkspace(ctx.input, revision.workspaceId);
    rework.push({
      id: revision.id,
      source: afterPullRequest ? "CODING_AFTER_PR_REVIEW" : "CODING_AFTER_HUMAN_REVIEW",
      trigger: afterPullRequest ? "Pull request review requested changes" : "Human code review",
      affectedEntity: task?.title ?? revision.workspaceId,
      timestamp: revision.createdAt,
      reason: afterPullRequest ? "A coding revision was recorded after a changes-requested review." : "A coding revision was recorded after a code-change approval.",
    });
  }
  const sessions = ctx.input.sessions.filter((session) => !session.demo);
  const byTask = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const list = byTask.get(session.taskId) ?? [];
    list.push(session);
    byTask.set(session.taskId, list);
  }
  for (const [taskId, list] of byTask) {
    const ordered = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      const changed = previous.stale || (previous.commitSha !== "" && current.commitSha !== "" && previous.commitSha !== current.commitSha);
      if (!changed || !inCurrent(ctx, current.createdAt)) continue;
      rework.push({
        id: current.id,
        source: "REVERIFICATION",
        trigger: previous.stale ? "Previous verification became stale" : "Commit changed",
        affectedEntity: ctx.input.tasks.find((task) => task.id === taskId)?.title ?? taskId,
        timestamp: current.createdAt,
        reason: "Verification ran again after the implementation changed.",
      });
    }
  }
  for (const architecture of ctx.input.architectures.filter((item) => item.reviewRequired && inCurrent(ctx, item.createdAt))) {
    rework.push({ id: architecture.id, source: "ARCHITECTURE_REREVIEW", trigger: "Architecture flagged for review", affectedEntity: `Architecture v${architecture.version}`, timestamp: architecture.createdAt, reason: architecture.reviewReason || "The architecture record requires another review." });
  }
  for (const review of ctx.input.governanceReviews.filter((item) => item.reviewRequired && inCurrent(ctx, item.createdAt))) {
    rework.push({ id: review.id, source: "GOVERNANCE_REREVIEW", trigger: "Governance flagged for review", affectedEntity: `Governance v${review.version}`, timestamp: review.createdAt, reason: review.reviewReason || "The governance record requires another review." });
  }
  for (const approval of ctx.input.releaseApprovals.filter((item) => item.stale && item.staleFlaggedAt && inCurrent(ctx, item.staleFlaggedAt))) {
    rework.push({ id: approval.id, source: "RELEASE_REAPPROVAL", trigger: "Release approval became stale", affectedEntity: approval.candidateId, timestamp: approval.staleFlaggedAt!, reason: approval.staleReason || "The release approval no longer matches the evidence." });
  }
  for (const workspace of ctx.input.workspaces.filter((item) => inCurrent(ctx, item.createdAt))) {
    const task = ctx.input.tasks.find((item) => item.id === workspace.taskId);
    const workItem = ctx.input.workItems.find((item) => item.id === task?.workItemId);
    if (workItem?.type !== "DEFECT") continue;
    rework.push({ id: workspace.id, source: "DEFECT_DRIVEN_CODING", trigger: "Defect work item", affectedEntity: task?.title ?? workspace.id, timestamp: workspace.createdAt, reason: `Coding workspace opened for defect “${workItem.title}”.` });
  }
}

function taskForWorkspace(input: AnalyticsInput, workspaceId: string) {
  const workspace = input.workspaces.find((item) => item.id === workspaceId);
  return input.tasks.find((item) => item.id === workspace?.taskId) ?? null;
}

function buildScope(ctx: CalcContext, scopeChanges: ScopeChangeEvent[], push: (metric: MetricValue) => void) {
  const approvedDefinition = ctx.input.definition?.approvedAt;
  if (approvedDefinition) {
    for (const proposal of ctx.input.definitionProposals.filter((item) => item.createdAt > approvedDefinition && inCurrent(ctx, item.createdAt))) {
      scopeChanges.push(change(proposal.id, "REQUIREMENT", proposal.createdAt, "A definition proposal was created after the product definition was approved.", proposal.id));
    }
  }
  const architectureApproved = earliest(resolved(ctx.input, ["SOLUTION_ARCHITECTURE", "ARCHITECTURE"]));
  if (architectureApproved) {
    for (const architecture of ctx.input.architectures) {
      const after = architecture.createdAt > architectureApproved;
      if (!after || !inCurrent(ctx, architecture.createdAt)) continue;
      if (architecture.version > 1 || architecture.reviewRequired) {
        scopeChanges.push(change(architecture.id, "ARCHITECTURE", architecture.createdAt, architecture.reviewReason || `Architecture version ${architecture.version} was created after approval.`, architecture.id));
      }
    }
  }
  const planApproved = earliest(resolved(ctx.input, ["IMPLEMENTATION_PLAN"]));
  if (planApproved) {
    for (const plan of ctx.input.plans.filter((item) => (item.version > 1 || item.reviewRequired) && item.createdAt > planApproved && inCurrent(ctx, item.createdAt))) {
      scopeChanges.push(change(plan.id, "IMPLEMENTATION", plan.createdAt, plan.reviewReason || `Implementation plan version ${plan.version} was created after approval.`, plan.id));
    }
  }
  for (const contract of ctx.input.contracts.filter((item) => item.stale && item.staleFlaggedAt && inCurrent(ctx, item.staleFlaggedAt))) {
    scopeChanges.push(change(contract.id, "IMPLEMENTATION", contract.staleFlaggedAt!, contract.staleReason || "The coding execution contract became stale.", contract.taskId));
  }
  for (const policy of ctx.input.policies.filter((item) => item.reapprovalRequired && item.reapprovalFlaggedAt && inCurrent(ctx, item.reapprovalFlaggedAt))) {
    scopeChanges.push(change(`policy-${policy.reapprovalFlaggedAt}`, "IMPLEMENTATION", policy.reapprovalFlaggedAt!, policy.reapprovalReason || "Coding policy requires reapproval.", "coding-policy"));
  }
  for (const approval of ctx.input.releaseApprovals.filter((item) => item.stale && item.staleFlaggedAt && inCurrent(ctx, item.staleFlaggedAt))) {
    scopeChanges.push(change(approval.id, "RELEASE", approval.staleFlaggedAt!, approval.staleReason || "Release approval became stale.", approval.candidateId));
  }
  push(
    countMetric({
      key: "scope_change_count",
      window: ctx.window,
      calculatedAt: ctx.calculatedAt,
      count: scopeChanges.length,
      note: "Only changes with a recorded timestamp after the relevant approval are counted. A stale record without a flagged time is omitted.",
      drilldown: scopeChanges.map((item) => drill(item.id, item.category, `${item.at}: ${item.summary}`)),
    }),
  );
}

function change(id: string, category: ScopeChangeEvent["category"], at: string, summary: string, entityId: string): ScopeChangeEvent {
  return { id, category, at, summary, impact: "", downstreamRework: 0, entityId };
}

function buildQuality(ctx: CalcContext, rework: ReworkEvent[], push: (metric: MetricValue) => void) {
  const executed = ctx.input.tasks.filter((task) => ctx.input.workspaces.some((workspace) => workspace.taskId === task.id && inCurrent(ctx, workspace.createdAt)));
  const revised = new Set(rework.filter((item) => item.source === "CODING_AFTER_HUMAN_REVIEW" || item.source === "CODING_AFTER_PR_REVIEW").map((item) => item.affectedEntity));
  const revisedTasks = executed.filter((task) => revised.has(task.title) || rework.some((item) => (item.source === "CODING_AFTER_HUMAN_REVIEW" || item.source === "CODING_AFTER_PR_REVIEW") && item.affectedEntity === task.title));
  push(rateMetric({ key: "rework_rate_tasks", window: ctx.window, calculatedAt: ctx.calculatedAt, numerator: revisedTasks.length, denominator: executed.length, note: "Revisions before any human or pull-request review are not included.", insufficientNote: "No implementation task has a coding workspace in this period.", drilldown: executed.map((task) => drill(task.id, task.title, revisedTasks.some((item) => item.id === task.id) ? "Revised after review" : "No post-review revision")) }));

  const pullRequests = ctx.input.pullRequests.filter((item) => !item.demo && inCurrent(ctx, item.createdAt));
  const changed = pullRequests.filter((item) => ctx.input.reviews.some((review) => review.pullRequestId === item.id && review.state === "CHANGES_REQUESTED"));
  push(rateMetric({ key: "rework_rate_pull_requests", window: ctx.window, calculatedAt: ctx.calculatedAt, numerator: changed.length, denominator: pullRequests.length, note: "Demo pull requests are excluded.", insufficientNote: "No non-demo pull request was created in this period.", drilldown: pullRequests.map((item) => drill(item.id, `PR #${item.number}`, changed.some((change) => change.id === item.id) ? "Changes requested" : item.state)) }));

  const verifiedTasks = new Set(ctx.input.sessions.filter((session) => !session.demo && inCurrent(ctx, session.createdAt)).map((session) => session.taskId));
  const repeated = new Set(rework.filter((item) => item.source === "REVERIFICATION").map((item) => ctx.input.tasks.find((task) => task.title === item.affectedEntity)?.id).filter((id): id is string => Boolean(id)));
  push(rateMetric({ key: "rework_rate_verification", window: ctx.window, calculatedAt: ctx.calculatedAt, numerator: [...verifiedTasks].filter((id) => repeated.has(id)).length, denominator: verifiedTasks.size, note: "A later session counts only when the previous session was stale or the commit changed.", insufficientNote: "No non-demo verification session was recorded in this period." }));
  push(rateMetric({ key: "reverification_rate", window: ctx.window, calculatedAt: ctx.calculatedAt, numerator: [...verifiedTasks].filter((id) => repeated.has(id)).length, denominator: verifiedTasks.size, note: "Same evidence as the verification repeat rate.", insufficientNote: "No non-demo verification session was recorded in this period." }));

  const linked = ctx.input.defectLinks.filter((link) => inCurrent(ctx, link.createdAt));
  push(countMetric({ key: "defects_found_in_verification", window: ctx.window, calculatedAt: ctx.calculatedAt, count: linked.length, note: "Defects with a verification defect link.", drilldown: linked.map((link) => drill(link.id, ctx.input.workItems.find((item) => item.id === link.workItemId)?.title ?? link.workItemId, `Task ${link.taskId}`)) }));

  const anyProduction = ctx.input.deployments.some(isProduction);
  const post = ctx.input.issues.filter((issue) => !ctx.input.releases.some((release) => release.id === issue.candidateId && release.demo) && inCurrent(ctx, issue.detectedAt));
  if (!anyProduction) {
    push(textMetric({ key: "defects_found_after_deployment", window: ctx.window, calculatedAt: ctx.calculatedAt, display: "INSUFFICIENT DATA", quality: "INSUFFICIENT", note: "No production deployment is recorded, so post-deployment defects cannot be counted.", sampleSize: 0 }));
  } else {
    push(countMetric({ key: "defects_found_after_deployment", window: ctx.window, calculatedAt: ctx.calculatedAt, count: post.length, note: "Release issues on non-demo candidates. Zero means none were recorded. Low severity does not fail the change.", drilldown: post.map((issue) => drill(issue.id, issue.severity, issue.description)) }));
  }

  const openDefects = ctx.input.workItems.filter((item) => item.type === "DEFECT" && item.status !== "DONE" && (item.priority === "CRITICAL" || item.priority === "HIGH"));
  const openIssues = ctx.input.issues.filter((issue) => issue.status === "OPEN" && (issue.severity === "HIGH" || issue.severity === "CRITICAL"));
  push(countMetric({ key: "defects_open_critical_high", window: ctx.window, calculatedAt: ctx.calculatedAt, count: openDefects.length + openIssues.length, note: "Current open snapshot. The time window does not hide an issue that is still open.", drilldown: [...openDefects.map((item) => drill(item.id, item.title, `${item.priority} defect`)), ...openIssues.map((issue) => drill(issue.id, issue.severity, issue.description))] }));

  const ages = ctx.input.workItems
    .filter((item) => item.type === "DEFECT" && item.status !== "DONE")
    .map((item) => ({ ms: durationMs(item.createdAt, ctx.input.now), item }))
    .filter((item): item is { ms: number; item: AnalyticsInput["workItems"][number] } => item.ms != null);
  push(durationAggregate({ key: "open_defect_age", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: ages.map((item) => ({ ms: item.ms, drill: drill(item.item.id, item.item.title, `${item.item.createdAt} → ${ctx.input.now}`) })), pick: "median", qualityNote: "Age of defects that are not done, measured to the calculation time.", insufficientNote: "No open defect work item is recorded." }));

  const released = ctx.input.releases.filter((release) => !release.demo && ctx.input.deployments.some((deployment) => deployment.candidateId === release.id && isSuccessfulProduction(deployment)));
  const releasedTasks = new Set(released.flatMap((release) => release.taskIds));
  const escaped = ctx.input.issues.filter((issue) => released.some((release) => release.id === issue.candidateId));
  const foundBefore = ctx.input.defectLinks.filter((link) => releasedTasks.has(link.taskId));
  push(rateMetric({ key: "defect_escape_rate", window: ctx.window, calculatedAt: ctx.calculatedAt, numerator: escaped.length, denominator: escaped.length + foundBefore.length, note: "Post-deployment issues divided by those issues plus verification defects on the released tasks.", insufficientNote: released.length === 0 ? "No successful production deployment, so released scope cannot be traced." : "No defects are traced to the released scope.", drilldown: [...escaped.map((issue) => drill(issue.id, "After deployment", issue.description)), ...foundBefore.map((link) => drill(link.id, "In verification", link.taskId))] }));

  const coverages = ctx.input.coverages.filter((coverage) => ctx.input.sessions.some((session) => session.id === coverage.sessionId && !session.demo));
  if (coverages.length === 0) {
    for (const key of ["acceptance_verified", "acceptance_failed", "acceptance_manual"] as const) {
      push(textMetric({ key, window: ctx.window, calculatedAt: ctx.calculatedAt, display: "INSUFFICIENT DATA", quality: "INSUFFICIENT", note: "No non-demo verification coverage is recorded.", sampleSize: 0 }));
    }
  } else {
    push(countMetric({ key: "acceptance_verified", window: ctx.window, calculatedAt: ctx.calculatedAt, count: coverages.filter((item) => item.status === "VERIFIED").length, note: "Coverage status VERIFIED.", sampleSize: coverages.length }));
    push(countMetric({ key: "acceptance_failed", window: ctx.window, calculatedAt: ctx.calculatedAt, count: coverages.filter((item) => item.status === "FAILED").length, note: "Coverage status FAILED.", sampleSize: coverages.length }));
    push(countMetric({ key: "acceptance_manual", window: ctx.window, calculatedAt: ctx.calculatedAt, count: coverages.filter((item) => item.humanConfirmed).length, note: "A person confirmed the coverage row.", sampleSize: coverages.length }));
  }
  const regressions = ctx.input.executions.filter((execution) => execution.kind === "EXISTING_REGRESSION");
  if (regressions.length === 0) {
    push(textMetric({ key: "regression_failures", window: ctx.window, calculatedAt: ctx.calculatedAt, display: "INSUFFICIENT DATA", quality: "INSUFFICIENT", note: "No existing-regression execution is recorded, so a failure count of zero would be a claim the factory cannot make.", sampleSize: 0 }));
  } else {
    push(countMetric({ key: "regression_failures", window: ctx.window, calculatedAt: ctx.calculatedAt, count: regressions.filter((item) => item.status === "FAILED").length, note: "Failed EXISTING_REGRESSION executions.", sampleSize: regressions.length }));
  }
}

function buildAi(ctx: CalcContext, push: (metric: MetricValue) => void) {
  const runs = ctx.input.agentRuns.filter((run) => inCurrent(ctx, run.completedAt ?? run.startedAt));
  const durations = runs.map((run) => run.durationMs).filter((value): value is number => value != null);
  push(
    countMetric({
      key: "agent_runs",
      window: ctx.window,
      calculatedAt: ctx.calculatedAt,
      count: runs.length,
      note: `${runs.filter((run) => run.status === "COMPLETED").length} completed, ${runs.filter((run) => run.status === "FAILED").length} failed, ${runs.filter((run) => run.escalated).length} escalated. This is not a productivity score.`,
      drilldown: runs.map((run) => drill(run.id, agentName(run.agentType), `${run.status}${run.durationMs != null ? ` · ${formatDuration(run.durationMs)}` : ""}`)),
    }),
  );
  push(
    durations.length === 0
      ? textMetric({ key: "ai_execution_time", window: ctx.window, calculatedAt: ctx.calculatedAt, display: "INSUFFICIENT DATA", quality: "INSUFFICIENT", note: "No agent run in this period stored a duration.", sampleSize: 0 })
      : durationAggregate({
          key: "ai_execution_time",
          window: ctx.window,
          calculatedAt: ctx.calculatedAt,
          samples: [{ ms: durations.reduce((sum, value) => sum + value, 0), drill: drill("agents", "Agent execution", `${durations.length} runs with a duration.`) }],
          pick: "median",
          sampleSize: durations.length,
          qualityNote: "Sum of stored run durations. This is not a claim of time saved.",
          insufficientNote: "",
        }),
  );
  const approvalDurations = ctx.input.approvals
    .filter((approval) => approval.status !== "PENDING" && approval.resolvedAt && inCurrent(ctx, approval.resolvedAt))
    .map((approval) => durationMs(approval.requestedAt, approval.resolvedAt))
    .filter((value): value is number => value != null);
  push(
    approvalDurations.length === 0
      ? textMetric({ key: "human_approval_time", window: ctx.window, calculatedAt: ctx.calculatedAt, display: "INSUFFICIENT DATA", quality: "INSUFFICIENT", note: "No resolved approval in this period has both timestamps.", sampleSize: 0 })
      : durationAggregate({
          key: "human_approval_time",
          window: ctx.window,
          calculatedAt: ctx.calculatedAt,
          samples: [{ ms: approvalDurations.reduce((sum, value) => sum + value, 0), drill: drill("approvals", "Human approval wait", `${approvalDurations.length} resolved approvals.`) }],
          pick: "median",
          sampleSize: approvalDurations.length,
          qualityNote: "Sum of resolved approval waits. It is shown beside agent execution and is not subtracted from it.",
          insufficientNote: "",
        }),
  );

  const executedLow = ctx.input.codingRisks.filter((risk) => {
    const level = risk.overrideRiskLevel ?? risk.riskLevel;
    const workspace = ctx.input.workspaces.find((item) => item.taskId === risk.taskId);
    return level === "LOW" && workspace && inCurrent(ctx, workspace.createdAt);
  });
  const modeOf = (risk: AnalyticsInput["codingRisks"][number]) => risk.overrideExecutionMode ?? risk.executionMode;
  const autonomous = executedLow.filter((risk) => modeOf(risk) === "AUTONOMOUS");
  push(
    rateMetric({
      key: "automation_rate",
      window: ctx.window,
      calculatedAt: ctx.calculatedAt,
      numerator: autonomous.length,
      denominator: executedLow.length,
      note: `${executedLow.filter((risk) => modeOf(risk) === "SUPERVISED").length} supervised, ${executedLow.filter((risk) => modeOf(risk) === "HUMAN_ONLY").length} human only. A higher autonomous share is not a target.`,
      insufficientNote: "No low-risk coding task was executed in this period.",
      drilldown: executedLow.map((risk) => drill(risk.id, risk.taskTitle, modeOf(risk))),
    }),
  );

  const codingRuns = runs.filter((run) => run.agentType === "CODING" && run.status === "COMPLETED" && run.workspaceId);
  const codingFirst = codingRuns.filter((run) => !run.escalated && !ctx.input.revisions.some((revision) => revision.workspaceId === run.workspaceId));
  push(rateMetric({ key: "first_pass_coding", window: ctx.window, calculatedAt: ctx.calculatedAt, numerator: codingFirst.length, denominator: codingRuns.length, note: "Completed coding runs with no revision and no escalation. Not combined with other agents.", insufficientNote: "No completed coding run can be tied to a workspace in this period.", drilldown: codingRuns.map((run) => drill(run.id, "Coding", codingFirst.some((item) => item.id === run.id) ? "First pass" : "Revised or escalated")) }));

  const verificationTasks = new Map<string, AnalyticsInput["sessions"]>();
  for (const session of ctx.input.sessions.filter((item) => !item.demo && item.verdict && inCurrent(ctx, item.completedAt ?? item.createdAt))) {
    const list = verificationTasks.get(session.taskId) ?? [];
    list.push(session);
    verificationTasks.set(session.taskId, list);
  }
  const verificationFirst = [...verificationTasks.values()].filter((list) => list.length === 1);
  push(rateMetric({ key: "first_pass_verification", window: ctx.window, calculatedAt: ctx.calculatedAt, numerator: verificationFirst.length, denominator: verificationTasks.size, note: "Tasks with exactly one completed non-demo verification session.", insufficientNote: "No completed non-demo verification session in this period." }));

  push(proposalRate(ctx, "first_pass_architecture", ctx.input.architectureProposals, "No architecture proposal is recorded."));
  push(proposalRate(ctx, "first_pass_requirements", ctx.input.definitionProposals, "No definition proposal is recorded."));

  const escalations = [
    ...ctx.input.codingEscalations.filter((item) => inCurrent(ctx, item.createdAt)).map((item) => ({ ...item, agent: "Coding" })),
    ...ctx.input.verificationEscalations.filter((item) => inCurrent(ctx, item.createdAt)).map((item) => ({ ...item, agent: "Verification" })),
  ];
  push(countMetric({ key: "escalation_count", window: ctx.window, calculatedAt: ctx.calculatedAt, count: escalations.length, note: "Escalations by recorded category.", drilldown: escalations.map((item) => drill(item.id, `${item.agent}: ${item.type}`, item.reason || item.status)) }));
  const resolvedEscalations = escalations
    .map((item) => ({ ms: durationMs(item.createdAt, item.resolvedAt), item }))
    .filter((item): item is { ms: number; item: (typeof escalations)[number] } => item.ms != null);
  push(durationAggregate({ key: "escalation_resolution", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: resolvedEscalations.map((item) => ({ ms: item.ms, drill: drill(item.item.id, item.item.type, `${item.item.createdAt} → ${item.item.resolvedAt}`) })), pick: "median", qualityNote: "Resolved escalations only. Open escalations stay in the count without a duration.", insufficientNote: "No escalation has both an open time and a resolved time." }));

  const interventions = interventionCounts(ctx.input, ctx);
  const totalInterventions = interventions.reduce((sum, item) => sum + item.count, 0);
  const top = [...interventions].sort((a, b) => b.count - a.count)[0];
  push(
    countMetric({
      key: "human_intervention_count",
      window: ctx.window,
      calculatedAt: ctx.calculatedAt,
      count: totalInterventions,
      display: totalInterventions === 0 ? "0" : `${top?.label ?? "Interventions"}: ${top?.count ?? 0}`,
      note: "A control and learning signal. It does not mean the factory failed. People are expected at the approval gates.",
      drilldown: interventions.filter((item) => item.count > 0).map((item) => drill(item.type, item.label, String(item.count))),
    }),
  );

  const tokenRuns = runs.filter((run) => run.inputTokens != null || run.outputTokens != null);
  const inputTokens = tokenRuns.reduce((sum, run) => sum + (run.inputTokens ?? 0), 0);
  const outputTokens = tokenRuns.reduce((sum, run) => sum + (run.outputTokens ?? 0), 0);
  if (tokenRuns.length === 0) {
    push(textMetric({ key: "token_usage", window: ctx.window, calculatedAt: ctx.calculatedAt, display: "NOT AVAILABLE", quality: "INSUFFICIENT", note: "No run in this period stored input or output token counts.", sampleSize: runs.length }));
  } else {
    push(countMetric({ key: "token_usage", window: ctx.window, calculatedAt: ctx.calculatedAt, count: inputTokens + outputTokens, display: `Input ${inputTokens}, output ${outputTokens}, total ${inputTokens + outputTokens}`, note: "Token counts stored on the run. Runs without tokens are omitted from the sum.", sampleSize: tokenRuns.length }));
  }
  const costs = runs.map((run) => run.estimatedCost).filter((cost): cost is string => Boolean(cost));
  const costTotal = sumNumbers(costs);
  push(
    costTotal == null
      ? textMetric({ key: "agent_cost", window: ctx.window, calculatedAt: ctx.calculatedAt, display: "COST NOT AVAILABLE", quality: "INSUFFICIENT", note: "No agent run stored a provider cost. A price was not estimated.", sampleSize: runs.length })
      : countMetric({ key: "agent_cost", window: ctx.window, calculatedAt: ctx.calculatedAt, count: costTotal, display: String(costTotal), note: "Sum of stored estimatedCost values.", sampleSize: costs.length }),
  );

  const grouped = new Map<string, typeof runs>();
  for (const run of runs) {
    const list = grouped.get(run.agentType) ?? [];
    list.push(run);
    grouped.set(run.agentType, list);
  }
  const stats: AgentStat[] = [...grouped.entries()].map(([agentType, group]) => {
    const values = group.map((run) => run.durationMs).filter((value): value is number => value != null);
    const withTokens = group.filter((run) => run.inputTokens != null || run.outputTokens != null);
    const groupInput = withTokens.reduce((sum, run) => sum + (run.inputTokens ?? 0), 0);
    const groupOutput = withTokens.reduce((sum, run) => sum + (run.outputTokens ?? 0), 0);
    const groupCost = sumNumbers(group.map((run) => run.estimatedCost).filter((cost): cost is string => Boolean(cost)));
    return {
      agentType,
      name: agentName(agentType),
      runs: group.length,
      completed: group.filter((run) => run.status === "COMPLETED").length,
      failed: group.filter((run) => run.status === "FAILED").length,
      escalated: group.filter((run) => run.escalated).length,
      averageDuration: values.length ? formatDuration(average(values)) : "INSUFFICIENT DATA",
      medianDuration: values.length ? formatDuration(median(values)) : "INSUFFICIENT DATA",
      sampleSize: values.length,
      inputTokens: withTokens.length ? groupInput : null,
      outputTokens: withTokens.length ? groupOutput : null,
      totalTokens: withTokens.length ? groupInput + groupOutput : null,
      cost: groupCost == null ? "COST NOT AVAILABLE" : String(groupCost),
    };
  });
  return stats;
}

function proposalRate(ctx: CalcContext, key: string, proposals: { id: string; status: string; createdAt: string }[], empty: string) {
  if (proposals.length === 0) {
    return textMetric({ key, window: ctx.window, calculatedAt: ctx.calculatedAt, display: "INSUFFICIENT DATA", quality: "INSUFFICIENT", note: empty, sampleSize: 0 });
  }
  const ordered = [...proposals].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const firstPass = ordered.length === 1 && ordered[0]?.status === "COMMITTED";
  return rateMetric({
    key,
    window: ctx.window,
    calculatedAt: ctx.calculatedAt,
    numerator: firstPass ? 1 : 0,
    denominator: 1,
    note: firstPass ? "The only proposal was committed." : "More than one proposal exists, or the proposal was not committed.",
    insufficientNote: empty,
    drilldown: ordered.map((proposal) => drill(proposal.id, proposal.status, proposal.createdAt)),
  });
}

function sumNumbers(values: string[]) {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    total += parsed;
  }
  return total;
}

export function interventionCounts(input: AnalyticsInput, ctx: CalcContext): InterventionCount[] {
  const labels: Record<string, string> = {
    DISCOVERY_BRIEF_EDITED: "Proposal edited",
    REQUIREMENT_UPDATED: "Proposal edited",
    CODING_RISK_OVERRIDDEN: "Risk overridden",
    CODING_PLAN_APPROVED: "Execution plan approval",
    CODING_CHANGES_REQUESTED: "Code changes requested",
    VERIFICATION_MANUAL_RESULT: "Manual verification",
    CHANGES_REQUESTED: "PR changes requested",
    RELEASE_RISK_ACCEPTED: "Risk accepted",
    DEPLOYMENT_STARTED: "Deployment manually recorded",
  };
  const counts = new Map<string, number>();
  for (const activity of input.activities.filter((item) => labels[item.type] && inCurrent(ctx, item.createdAt))) {
    const label = labels[activity.type]!;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const answered = input.releaseQuestions.filter((question) => question.status === "ANSWERED" && question.resolvedAt && inCurrent(ctx, question.resolvedAt)).length;
  if (answered > 0) counts.set("Release question answered", answered);
  return [...counts.entries()].map(([label, count]) => ({ type: label, label, count }));
}

function buildGovernance(ctx: CalcContext, push: (metric: MetricValue) => void) {
  const findings = ctx.input.findings.filter((finding) => inCurrent(ctx, finding.createdAt));
  const bySeverity = new Map<string, number>();
  for (const finding of findings) bySeverity.set(finding.severity, (bySeverity.get(finding.severity) ?? 0) + 1);
  push(countMetric({ key: "governance_findings", window: ctx.window, calculatedAt: ctx.calculatedAt, count: findings.length, note: "Grouped by the severity stored on the finding.", drilldown: [...bySeverity.entries()].map(([severity, count]) => drill(severity, severity, String(count))) }));
  const firstWorkspace = earliest(ctx.input.workspaces.map((workspace) => workspace.createdAt));
  const resolvedBefore = ctx.input.findings.filter((finding) => finding.status !== "OPEN" && (!firstWorkspace || finding.updatedAt <= firstWorkspace));
  push(countMetric({ key: "findings_resolved_before_coding", window: ctx.window, calculatedAt: ctx.calculatedAt, count: resolvedBefore.length, note: firstWorkspace ? "Not-open findings last updated at or before the first coding workspace." : "No coding workspace exists, so not-open findings are still before coding.", drilldown: resolvedBefore.map((finding) => drill(finding.id, finding.title, finding.status)) }));
  const acceptedFindings = ctx.input.findings.filter((finding) => finding.status === "RISK_ACCEPTED");
  const acceptedRelease = ctx.input.releaseRisks.filter((risk) => risk.status === "ACCEPTED");
  push(countMetric({ key: "risks_accepted", window: ctx.window, calculatedAt: ctx.calculatedAt, count: acceptedFindings.length + acceptedRelease.length, note: "Explicit human acceptance only.", drilldown: [...acceptedFindings.map((finding) => drill(finding.id, finding.title, "Governance risk accepted")), ...acceptedRelease.map((risk) => drill(risk.id, risk.severity, "Release risk accepted"))] }));
  const risks = ctx.input.codingRisks;
  const byLevel = new Map<string, number>();
  for (const risk of risks) {
    const level = risk.overrideRiskLevel ?? risk.riskLevel;
    byLevel.set(level, (byLevel.get(level) ?? 0) + 1);
  }
  push(countMetric({ key: "coding_risk_distribution", window: ctx.window, calculatedAt: ctx.calculatedAt, count: risks.length, display: risks.length === 0 ? "0" : `${risks.length} assessments`, note: "Effective risk after a human override, when one was recorded.", drilldown: [...byLevel.entries()].map(([level, count]) => drill(level, level, String(count))) }));
  const governanceSamples = ctx.input.approvals
    .filter((approval) => approval.type === "ENGINEERING_GOVERNANCE" && approval.status !== "PENDING" && approval.resolvedAt && inCurrent(ctx, approval.resolvedAt))
    .map((approval) => ({ ms: durationMs(approval.requestedAt, approval.resolvedAt), approval }))
    .filter((item): item is { ms: number; approval: AnalyticsInput["approvals"][number] } => item.ms != null);
  push(durationAggregate({ key: "governance_cycle", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: governanceSamples.map((item) => ({ ms: item.ms, drill: drill(item.approval.id, "Governance", `${item.approval.requestedAt} → ${item.approval.resolvedAt}`) })), pick: "median", qualityNote: "The governance approval wait.", insufficientNote: "No resolved governance approval in this period." }));
  const reviews = ctx.input.governanceReviews.filter((review) => inCurrent(ctx, review.createdAt));
  push(rateMetric({ key: "governance_rereview_rate", window: ctx.window, calculatedAt: ctx.calculatedAt, numerator: reviews.filter((review) => review.version > 1 || review.reviewRequired).length, denominator: reviews.length, note: "Later versions and reviews flagged review-required.", insufficientNote: "No governance review in this period." }));
  const overrides = ctx.input.codingRisks.filter((risk) => risk.overriddenAt && inCurrent(ctx, risk.overriddenAt));
  push(countMetric({ key: "policy_overrides", window: ctx.window, calculatedAt: ctx.calculatedAt, count: overrides.length, note: "Coding risk rows with an override time.", drilldown: overrides.map((risk) => drill(risk.id, risk.taskTitle, risk.overrideRiskLevel ?? risk.riskLevel)) }));
}

function buildRelease(ctx: CalcContext, push: (metric: MetricValue) => void) {
  const candidates = ctx.input.releases.filter((release) => !release.demo && inCurrent(ctx, release.createdAt));
  push(countMetric({ key: "release_candidates", window: ctx.window, calculatedAt: ctx.calculatedAt, count: candidates.length, note: "Demo candidates are excluded.", drilldown: candidates.map((release) => drill(release.id, release.version, release.status)) }));
  const approved = ctx.input.releases.filter((release) => !release.demo && ctx.input.releaseApprovals.some((approval) => approval.candidateId === release.id && approval.status === "APPROVED" && !approval.stale && approval.resolvedAt && inCurrent(ctx, approval.resolvedAt)));
  push(countMetric({ key: "approved_releases", window: ctx.window, calculatedAt: ctx.calculatedAt, count: approved.length, note: "Approved and not stale.", drilldown: approved.map((release) => drill(release.id, release.version, "Approved")) }));

  const production = ctx.input.deployments.filter((deployment) => isProduction(deployment) && inCurrent(ctx, deployment.completedAt ?? deployment.startedAt));
  const successful = production.filter((deployment) => deployment.status === "SUCCEEDED");
  const failed = production.filter((deployment) => deployment.status === "FAILED");
  const rolled = production.filter((deployment) => deployment.status === "ROLLED_BACK");
  push(countMetric({ key: "successful_deployments", window: ctx.window, calculatedAt: ctx.calculatedAt, count: successful.length, note: "Recorded successful production deployments.", drilldown: successful.map((item) => drill(item.id, item.version, "Succeeded")) }));
  push(countMetric({ key: "failed_deployments", window: ctx.window, calculatedAt: ctx.calculatedAt, count: failed.length, note: "Status FAILED. Rollbacks are counted separately.", drilldown: failed.map((item) => drill(item.id, item.version, "Failed")) }));
  push(countMetric({ key: "rollbacks", window: ctx.window, calculatedAt: ctx.calculatedAt, count: rolled.length, note: "Status ROLLED_BACK.", drilldown: rolled.map((item) => drill(item.id, item.version, "Rolled back")) }));

  for (const days of [7, 30, 90] as const) {
    const from = new Date(ctx.now.getTime() - days * 24 * 60 * 60 * 1000);
    const matched = ctx.input.deployments.filter((deployment) => isSuccessfulProduction(deployment) && deployment.completedAt && new Date(deployment.completedAt).getTime() >= from.getTime());
    const previousFrom = new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
    const previous = ctx.input.deployments.filter((deployment) => isSuccessfulProduction(deployment) && deployment.completedAt && new Date(deployment.completedAt).getTime() >= previousFrom.getTime() && new Date(deployment.completedAt).getTime() < from.getTime());
    const metric = countMetric({
      key: `deployment_frequency_${days}d`,
      window: ctx.window,
      calculatedAt: ctx.calculatedAt,
      count: matched.length,
      note: `Fixed ${days}-day clock ending at the calculation time. Demo records are excluded. Previous ${days} days: ${previous.length}.`,
      drilldown: matched.map((item) => drill(item.id, item.version, item.completedAt ?? "")),
    });
    metric.comparison = `Previous ${days} days: ${previous.length}.`;
    push(metric);
  }

  const failedChanges = production.filter((deployment) => deploymentFailed(ctx.input, deployment));
  push(
    rateMetric({
      key: "change_failure_rate",
      window: ctx.window,
      calculatedAt: ctx.calculatedAt,
      numerator: failedChanges.length,
      denominator: production.length,
      note: "Failed, rolled back, or linked to a high or critical release issue. A low or medium issue does not fail the change.",
      insufficientNote: "No production deployment in this period. The rate is not shown as 0%.",
      drilldown: production.map((deployment) => drill(deployment.id, `${deployment.version} · ${deployment.environment}`, deploymentFailed(ctx.input, deployment) ? `${deployment.status} · counts as a failed change` : `${deployment.status} · success`)),
    }),
  );

  const leadSamples: { ms: number; drill: DrillItem }[] = [];
  for (const deployment of ctx.input.deployments.filter((item) => isSuccessfulProduction(item) && item.completedAt && inCurrent(ctx, item.completedAt))) {
    const release = ctx.input.releases.find((item) => item.id === deployment.candidateId);
    const spaces = ctx.input.workspaces.filter((workspace) => release?.taskIds.includes(workspace.taskId));
    const start = earliest(spaces.map((workspace) => workspace.createdAt));
    const ms = durationMs(start, deployment.completedAt);
    if (ms == null || !start) continue;
    leadSamples.push({ ms, drill: drill(deployment.id, deployment.version, `Workspace ${start} → deployment ${deployment.completedAt}. ${LEAD_TIME_CHANGES_NOTE}`) });
  }
  push(durationAggregate({ key: "lead_time_for_changes", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: leadSamples, pick: "median", qualityNote: LEAD_TIME_CHANGES_NOTE, insufficientNote: `${LEAD_TIME_CHANGES_NOTE} A sample also needs a successful production deployment in this period.`, comparison: null }));

  const restores: { ms: number; drill: DrillItem }[] = [];
  for (const deployment of ctx.input.deployments.filter((item) => isProduction(item) && (item.status === "FAILED" || item.status === "ROLLED_BACK"))) {
    const failedAt = deployment.completedAt ?? deployment.startedAt;
    if (!failedAt) continue;
    const later = ctx.input.deployments
      .filter((item) => item.candidateId === deployment.candidateId && item.status === "SUCCEEDED" && item.completedAt && item.completedAt > failedAt)
      .map((item) => item.completedAt!);
    const issueEnds = ctx.input.issues.filter((issue) => issue.deploymentId === deployment.id && issue.resolvedAt && issue.resolvedAt > failedAt).map((issue) => issue.resolvedAt!);
    const end = earliest([...later, ...issueEnds]);
    const ms = durationMs(failedAt, end);
    if (ms == null || !end || !inCurrent(ctx, end)) continue;
    restores.push({ ms, drill: drill(deployment.id, deployment.version, `Failure ${failedAt} → restoration ${end}`) });
  }
  for (const issue of ctx.input.issues.filter((item) => item.severity === "CRITICAL" && item.resolvedAt && item.deploymentId == null)) {
    const ms = durationMs(issue.detectedAt, issue.resolvedAt);
    if (ms == null || !inCurrent(ctx, issue.resolvedAt)) continue;
    restores.push({ ms, drill: drill(issue.id, "Critical issue", `${issue.detectedAt} → ${issue.resolvedAt}`) });
  }
  push(durationAggregate({ key: "mttr", window: ctx.window, calculatedAt: ctx.calculatedAt, samples: restores, pick: "average", qualityNote: "Average time from a recorded failure to a recorded restoration.", insufficientNote: "No failed deployment, rollback, or critical issue has a later restoration recorded.", comparison: null }));
}

function deploymentFailed(input: AnalyticsInput, deployment: AnalyticsInput["deployments"][number]) {
  if (deployment.status === "FAILED" || deployment.status === "ROLLED_BACK") return true;
  return input.issues.some((issue) => issue.deploymentId === deployment.id && (issue.severity === "HIGH" || issue.severity === "CRITICAL"));
}

function buildOutcomes(ctx: CalcContext, push: (metric: MetricValue) => void, delivered: boolean): OutcomeView[] {
  const views = ctx.input.outcomes.map((outcome) => {
    const observations = ctx.input.observations.filter((item) => item.outcomeId === outcome.id && !item.demo).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    const latest = observations[observations.length - 1];
    const decision = [...ctx.input.learning.filter((item) => item.outcomeId === outcome.id)].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    const releases = ctx.input.observations.filter((item) => item.outcomeId === outcome.id && item.releaseVersion).map((item) => item.releaseVersion!) ;
    return {
      id: outcome.id,
      title: outcome.title,
      successMeasure: outcome.successMeasure || "No success measure recorded",
      target: outcome.targetValue || "No target recorded",
      baseline: "Baseline not recorded",
      latest: latest ? `${latest.value}${latest.unit ? ` ${latest.unit}` : ""}` : "No real observation",
      latestAt: latest?.observedAt ?? null,
      trend: observations.length >= 2 ? observations.map((item) => item.value).join(" → ") : "Trend needs at least two real observations.",
      status: outcome.status,
      releases: [...new Set(releases)],
      decision: decision?.decision ?? "No learning decision",
      deliveryCompleteOutcomePending: delivered && outcome.status !== "ACHIEVED",
    } satisfies OutcomeView;
  });
  push(countMetric({ key: "outcomes_achieved", window: ctx.window, calculatedAt: ctx.calculatedAt, count: views.filter((view) => view.status === "ACHIEVED").length, note: "Status ACHIEVED, which only a person can set.", drilldown: views.filter((view) => view.status === "ACHIEVED").map((view) => drill(view.id, view.title, view.latest)) }));
  push(countMetric({ key: "outcomes_awaiting_evidence", window: ctx.window, calculatedAt: ctx.calculatedAt, count: views.filter((view) => view.status !== "ACHIEVED" && view.latest === "No real observation").length, note: "Demo observations do not count as evidence.", drilldown: views.filter((view) => view.status !== "ACHIEVED" && view.latest === "No real observation").map((view) => drill(view.id, view.title, view.successMeasure)) }));
  push(countMetric({ key: "delivery_complete_outcome_pending", window: ctx.window, calculatedAt: ctx.calculatedAt, count: views.filter((view) => view.deliveryCompleteOutcomePending).length, note: delivered ? "A successful production deployment exists and the outcome is not achieved. Learning is still required." : "No successful production deployment, so delivery is not complete.", drilldown: views.filter((view) => view.deliveryCompleteOutcomePending).map((view) => drill(view.id, view.title, view.status)) }));
  return views;
}

function isBlocked(input: AnalyticsInput) {
  return (
    input.workItems.some((item) => item.status === "BLOCKED") ||
    input.issues.some((issue) => issue.status === "OPEN" && (issue.severity === "HIGH" || issue.severity === "CRITICAL")) ||
    input.governanceReviews.some((review) => review.reviewRequired)
  );
}

function buildBottlenecks(input: AnalyticsInput, metrics: MetricValue[], rework: ReworkEvent[], scopeChanges: ScopeChangeEvent[]): BottleneckSignal[] {
  const signals: BottleneckSignal[] = [];
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
  const hour = 60 * 60 * 1000;
  const coding = input.agentRuns.filter((run) => run.agentType === "CODING" && run.durationMs != null).map((run) => run.durationMs!);
  const codingMedian = median(coding);

  const codeWait = byKey.get("approval_wait_code_change");
  if (codeWait?.value != null) {
    const exceeds = codingMedian != null && codeWait.value > codingMedian * 4;
    if (codeWait.value >= 8 * hour || exceeds) {
      signals.push(signal("CODE_REVIEW_WAIT", codeWait.value >= 24 * hour ? "CRITICAL" : "WARNING", input.product.name, codeWait.key, codeWait.display, codingMedian == null ? "Coding execution time is not recorded." : `Median coding execution ${formatDuration(codingMedian)}.`, "Code review wait is long compared with recorded coding execution, or it has passed eight hours."));
    }
  }
  const prWait = byKey.get("pr_time_to_first_review");
  if (prWait?.value != null && prWait.value >= 8 * hour) {
    signals.push(signal("PR_REVIEW_WAIT", prWait.value >= 24 * hour ? "CRITICAL" : "WARNING", input.product.name, prWait.key, prWait.display, "Eight hours is the warning line. Twenty-four hours is critical.", "Pull requests are waiting for the first review."));
  }
  const releaseWait = byKey.get("approval_wait_release");
  if (releaseWait?.value != null && releaseWait.value >= 8 * hour) {
    signals.push(signal("RELEASE_WAIT", releaseWait.value >= 24 * hour ? "CRITICAL" : "WARNING", input.product.name, releaseWait.key, releaseWait.display, "Eight hours is the warning line.", "Release approval is a measurable wait."));
  }
  const requirementChanges = scopeChanges.filter((item) => item.category === "REQUIREMENT").length;
  if (requirementChanges >= 2) {
    signals.push(signal("REQUIREMENT_CHURN", requirementChanges >= 4 ? "CRITICAL" : "WARNING", input.product.name, "scope_change_count", String(requirementChanges), "Two requirement changes after approval is a warning.", "Requirements kept moving after definition approval."));
  }
  const verificationRework = rework.filter((item) => item.source === "REVERIFICATION").length;
  if (verificationRework >= 2) {
    signals.push(signal("VERIFICATION_REWORK", verificationRework >= 3 ? "CRITICAL" : "WARNING", input.product.name, "rework_rate_verification", String(verificationRework), "Two repeat verifications is a warning.", "Verification ran again because the implementation changed."));
  }
  const openCritical = input.findings.some((finding) => finding.status === "OPEN" && finding.severity === "CRITICAL") || input.codingRisks.some((risk) => (risk.overrideRiskLevel ?? risk.riskLevel) === "PROHIBITED");
  const openHigh = input.findings.some((finding) => finding.status === "OPEN" && finding.severity === "HIGH") || input.governanceReviews.some((review) => review.reviewRequired);
  if (openCritical || openHigh) {
    signals.push(signal("GOVERNANCE_BLOCKER", openCritical ? "CRITICAL" : "WARNING", input.product.name, "governance_findings", openCritical ? "Critical finding or prohibited risk" : "High finding or review required", "Open governance state.", openCritical ? "A critical finding is open or a coding risk is prohibited." : "Governance still has an open high finding or a review flag."));
  }
  const largest = metrics
    .filter((metric) => metric.kind === "duration" && metric.value != null && metric.key.startsWith("approval_wait_") && metric.value >= hour && metric.value < 8 * hour)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  if (largest && !signals.some((item) => item.metric === largest.key)) {
    signals.push(signal("APPROVAL_WAIT", "INFO", input.product.name, largest.key, largest.display, "Under the eight-hour warning line.", "This is the longest approval wait that is already measurable."));
  }
  return signals;
}

function signal(type: string, severity: BottleneckSignal["severity"], entity: string, metric: string, observedValue: string, comparison: string, reason: string): BottleneckSignal {
  return { id: `${type}:${entity}`, type, severity, entity, metric, observedValue, comparison, reason };
}

function buildCharts(
  input: AnalyticsInput,
  metrics: MetricValue[],
  waits: WaitInterval[],
  implementationSamples: { ms: number; drill: DrillItem }[],
  ctx: CalcContext,
): ChartSet {
  const closed = waits.filter((wait) => wait.durationMs != null && !wait.demo);
  const grouped = new Map<string, number[]>();
  for (const wait of closed) {
    const list = grouped.get(wait.label) ?? [];
    list.push(wait.durationMs!);
    grouped.set(wait.label, list);
  }
  const waitBreakdown = [...grouped.entries()]
    .map(([label, values]) => ({ label, value: median(values) ?? 0, display: `${formatDuration(median(values))} · n = ${values.length}` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const verification = metrics.find((metric) => metric.key === "defects_found_in_verification");
  const after = metrics.find((metric) => metric.key === "defects_found_after_deployment");
  const defectsByStage: ChartPoint[] = [];
  if (verification?.value != null) defectsByStage.push({ label: "Verification", value: verification.value, display: verification.display });
  if (after?.value != null) defectsByStage.push({ label: "After deployment", value: after.value, display: after.display });
  const runs = input.agentRuns.filter((run) => inCurrent(ctx, run.completedAt ?? run.startedAt));
  const agentRunsByResult: ChartPoint[] = [];
  if (runs.length > 0) {
    agentRunsByResult.push({ label: "Completed", value: runs.filter((run) => run.status === "COMPLETED").length, display: String(runs.filter((run) => run.status === "COMPLETED").length) });
    agentRunsByResult.push({ label: "Failed", value: runs.filter((run) => run.status === "FAILED").length, display: String(runs.filter((run) => run.status === "FAILED").length) });
    agentRunsByResult.push({ label: "Escalated", value: runs.filter((run) => run.escalated).length, display: String(runs.filter((run) => run.escalated).length) });
  }
  const approvalWait = metrics
    .filter((metric) => metric.key.startsWith("approval_wait_") && metric.value != null)
    .map((metric) => ({ label: metric.key.replace("approval_wait_", "").replaceAll("_", " "), value: metric.value ?? 0, display: `${metric.display} · n = ${metric.sampleSize ?? 0}` }));
  const lead = metrics.find((metric) => metric.key === "lead_time_for_changes");
  const leadTime = (lead?.samplesMs ?? []).map((value, index) => ({ label: lead?.drilldown[index]?.label ?? `Change ${index + 1}`, value, display: formatDuration(value) }));
  const cycleTime = implementationSamples.map((sample) => ({ label: sample.drill.label, value: sample.ms, display: formatDuration(sample.ms) }));
  const outcomeObservations: ChartPoint[] = [];
  for (const observation of input.observations.filter((item) => !item.demo)) {
    const match = observation.value.trim().match(/^(\d+(?:\.\d+)?)%?$/);
    if (!match) continue;
    outcomeObservations.push({ label: observation.measure || observation.value, value: Number(match[1]), display: observation.unit ? `${observation.value} ${observation.unit}` : observation.value });
  }
  return { waitBreakdown, defectsByStage, agentRunsByResult, approvalWait, leadTime, cycleTime, outcomeObservations };
}

function buildSegments(events: FactoryEvent[], waits: WaitInterval[]): FlowSegment[] {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  if (sorted.length === 0) return [];
  if (sorted.length === 1) {
    const only = sorted[0]!;
    return [{ id: only.id, label: only.label, kind: "milestone", startedAt: only.at, endedAt: null, durationMs: null, demo: only.demo }];
  }
  const start = sorted[0]!.at;
  const end = sorted[sorted.length - 1]!.at;
  const cuts = new Set<string>([start, end]);
  for (const item of sorted) cuts.add(item.at);
  for (const wait of waits) {
    if (wait.startedAt >= start && wait.startedAt <= end) cuts.add(wait.startedAt);
    if (wait.endedAt && wait.endedAt >= start && wait.endedAt <= end) cuts.add(wait.endedAt);
  }
  const points = [...cuts].sort();
  const raw: FlowSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    const ms = durationMs(from, to);
    if (ms == null || ms === 0) continue;
    const covering = waits.find((wait) => wait.endedAt && wait.startedAt <= from && wait.endedAt >= to);
    const marker = [...sorted].reverse().find((item) => item.at <= from);
    raw.push({
      id: `segment-${index}`,
      label: covering ? covering.label : STAGE_LABEL[marker?.stage ?? ""] ?? marker?.label ?? "Work",
      kind: covering ? "wait" : "work",
      startedAt: from,
      endedAt: to,
      durationMs: ms,
      demo: covering ? covering.demo : marker?.demo ?? false,
    });
  }
  const merged: FlowSegment[] = [];
  for (const segment of raw) {
    const previous = merged[merged.length - 1];
    if (previous && previous.kind === segment.kind && previous.label === segment.label && previous.endedAt === segment.startedAt) {
      previous.endedAt = segment.endedAt;
      previous.durationMs = (previous.durationMs ?? 0) + (segment.durationMs ?? 0);
      previous.demo = previous.demo && segment.demo;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}
