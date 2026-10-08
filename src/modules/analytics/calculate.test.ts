import { describe, expect, it } from "vitest";

import { METRIC_DEFINITIONS } from "@/modules/analytics/catalogue";
import { calculateProduct } from "@/modules/analytics/engine";
import { exportCsv, exportJson } from "@/modules/analytics/export";
import { explainMetrics } from "@/modules/analytics/insights";
import { calculatePortfolio } from "@/modules/analytics/portfolio";
import { createAnalyticsInput, type AnalyticsInput } from "@/modules/analytics/types";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";

const NOW = "2026-10-08T12:00:00.000Z";

function product(rest: Partial<Omit<AnalyticsInput, "now" | "product">> = {}, name = "Claims") {
  return createAnalyticsInput(NOW, { id: "prod-1", name, createdAt: "2026-10-01T12:00:00.000Z" }, rest);
}

function metric(view: ReturnType<typeof calculateProduct>, key: string) {
  const found = view.metrics.find((item) => item.key === key);
  if (!found) throw new Error(`Missing ${key}`);
  return found;
}

describe("factory intelligence", () => {
  it("calculates every catalogue metric for an empty product without inventing numbers", () => {
    const view = calculateProduct(product(), "all");
    const productKeys = METRIC_DEFINITIONS.filter((definition) => definition.scope !== "portfolio").map((definition) => definition.key);
    expect(view.metrics.map((item) => item.key).sort()).toEqual([...productKeys].sort());
    expect(metric(view, "idea_to_deployment_lead_time").display).toBe("INSUFFICIENT DATA");
    expect(metric(view, "idea_to_deployment_lead_time").value).toBeNull();
    expect(metric(view, "flow_efficiency").display).toBe("NOT AVAILABLE");
    expect(metric(view, "stage_active_build").display).toBe("NOT AVAILABLE");
    expect(metric(view, "delivery_predictability").display).toBe("INSUFFICIENT COMMITMENT DATA");
    expect(metric(view, "implementation_cycle_p85").display).toBe("NOT AVAILABLE");
    expect(metric(view, "mttr").display).toBe("INSUFFICIENT DATA");
    expect(metric(view, "change_failure_rate").display).toBe("INSUFFICIENT DATA");
    expect(metric(view, "agent_cost").display).toBe("COST NOT AVAILABLE");
    expect(view.metrics.some((item) => /saved/i.test(item.display))).toBe(false);
  });

  it("measures idea to deployment only when both ends exist", () => {
    const view = calculateProduct(
      product({
        discovery: { createdAt: "2026-10-01T12:00:00.000Z", startedAt: "2026-10-01T12:00:00.000Z", completedAt: null },
        releases: [{ id: "rel-1", version: "1.0.0", status: "DEPLOYED", demo: false, sliceId: "slice-1", createdAt: "2026-10-02T12:00:00.000Z", taskIds: ["task-1"] }],
        deployments: [{ id: "dep-1", candidateId: "rel-1", version: "1.0.0", status: "SUCCEEDED", demo: false, environment: "production", startedAt: "2026-10-03T10:00:00.000Z", completedAt: "2026-10-03T12:00:00.000Z" }],
      }),
      "all",
    );
    expect(metric(view, "idea_to_deployment_lead_time").display).toBe("2d");
    expect(metric(view, "idea_to_deployment_lead_time").drilldown[0]?.detail).toContain("2026-10-01T12:00:00.000Z");
    const demoOnly = calculateProduct(
      product({
        discovery: { createdAt: "2026-10-01T12:00:00.000Z", startedAt: null, completedAt: null },
        deployments: [{ id: "dep-demo", candidateId: "rel-demo", version: "DEMO-0.1.0", status: "SUCCEEDED", demo: true, environment: "demo", startedAt: "2026-10-03T10:00:00.000Z", completedAt: "2026-10-03T12:00:00.000Z" }],
      }),
      "all",
    );
    expect(metric(demoOnly, "idea_to_deployment_lead_time").display).toBe("INSUFFICIENT DATA");
  });

  it("uses workspace time for implementation cycle and hides P85 on a small sample", () => {
    const view = calculateProduct(
      product({
        tasks: [
          { id: "task-1", title: "Submit claim", status: "COMPLETED", workItemId: "story-1", createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T18:00:00.000Z" },
          { id: "task-2", title: "Save draft", status: "COMPLETED", workItemId: null, createdAt: "2026-10-02T08:00:00.000Z", updatedAt: "2026-10-02T12:00:00.000Z" },
        ],
        workspaces: [
          { id: "ws-1", taskId: "task-1", contractStale: false, staleReason: "", staleFlaggedAt: null, createdAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T16:00:00.000Z" },
          { id: "ws-2", taskId: "task-2", contractStale: false, staleReason: "", staleFlaggedAt: null, createdAt: "2026-10-02T09:00:00.000Z", completedAt: null },
        ],
        codeApprovals: [
          { id: "code-1", taskId: "task-1", workspaceId: "ws-1", createdAt: "2026-10-01T13:00:00.000Z", status: "APPROVED" },
          { id: "code-2", taskId: "task-2", workspaceId: "ws-2", createdAt: "2026-10-02T10:00:00.000Z", status: "APPROVED" },
        ],
      }),
      "all",
    );
    const cycle = metric(view, "implementation_cycle_median");
    expect(cycle.quality).toBe("PARTIAL");
    expect(cycle.sampleSize).toBe(2);
    expect(cycle.display).toBe("2h");
    expect(cycle.drilldown[0]?.detail).toContain("Workspace ws-1");
    expect(metric(view, "implementation_cycle_p85").display).toBe("NOT AVAILABLE");
    expect(metric(view, "implementation_cycle_p85").sampleSize).toBe(2);
  });

  it("separates verification execution from approval wait", () => {
    const view = calculateProduct(
      product({
        sessions: [{ id: "ver-1", taskId: "task-1", verdict: "PASS", stale: false, demo: false, commitSha: "abc", startedAt: "2026-10-04T10:00:00.000Z", completedAt: "2026-10-04T12:00:00.000Z", createdAt: "2026-10-04T10:00:00.000Z" }],
        executions: [{ id: "ex-1", sessionId: "ver-1", kind: "NEW_VERIFICATION", status: "PASSED", startedAt: "2026-10-04T10:00:00.000Z", completedAt: "2026-10-04T10:09:00.000Z" }],
        verificationApprovals: [{ id: "va-1", sessionId: "ver-1", resolvedAt: "2026-10-04T12:00:00.000Z", status: "APPROVED" }],
        approvals: [{ id: "ap-1", type: "VERIFICATION", status: "APPROVED", requestedAt: "2026-10-04T10:09:00.000Z", resolvedAt: "2026-10-04T12:00:00.000Z" }],
      }),
      "all",
    );
    expect(metric(view, "verification_cycle").display).toBe("2h");
    expect(metric(view, "verification_execution").display).toBe("9m");
    expect(metric(view, "approval_wait_verification").display).toBe("1h 51m");
  });

  it("breaks down pull request cycle time and ignores demo pull requests", () => {
    const view = calculateProduct(
      product({
        pullRequests: [
          { id: "pr-1", number: 7, title: "Submit", state: "MERGED", demo: false, workspaceId: "ws-1", taskId: "task-1", createdAt: "2026-10-05T08:00:00.000Z", mergedAt: "2026-10-06T08:00:00.000Z" },
          { id: "pr-demo", number: 8, title: "Demo", state: "MERGED", demo: true, workspaceId: null, taskId: null, createdAt: "2026-10-05T08:00:00.000Z", mergedAt: "2026-10-05T09:00:00.000Z" },
        ],
        reviews: [
          { id: "rev-1", pullRequestId: "pr-1", state: "CHANGES_REQUESTED", submittedAt: "2026-10-05T14:00:00.000Z" },
          { id: "rev-2", pullRequestId: "pr-1", state: "APPROVED", submittedAt: "2026-10-06T06:00:00.000Z" },
        ],
        checks: [{ id: "check-1", pullRequestId: "pr-1", name: "ci", status: "COMPLETED", startedAt: "2026-10-05T08:05:00.000Z", completedAt: "2026-10-05T08:20:00.000Z" }],
        activities: [{ id: "act-ready", type: "PULL_REQUEST_READY", description: "Pull request #7 is ready for a person to merge in GitHub.", createdAt: "2026-10-06T07:00:00.000Z" }],
      }),
      "all",
    );
    expect(metric(view, "pr_cycle").display).toBe("1d");
    expect(metric(view, "pr_cycle").sampleSize).toBe(1);
    expect(metric(view, "pr_time_to_first_review").display).toBe("6h");
    expect(metric(view, "pr_ci_wait").display).toBe("15m");
    expect(metric(view, "pr_changes_requested").display).toBe("16h");
    expect(metric(view, "pr_ready_to_merge").display).toBe("1h");
    expect(view.waits.some((wait) => wait.type === "CI" && wait.durationMs === 15 * 60 * 1000)).toBe(true);
  });

  it("splits release cycle time and keeps deployment frequency on real records", () => {
    const view = calculateProduct(
      product({
        releases: [{ id: "rel-1", version: "1.2.0", status: "DEPLOYED", demo: false, sliceId: "slice-1", createdAt: "2026-10-06T08:00:00.000Z", taskIds: ["task-1"] }],
        releaseApprovals: [{ id: "ra-1", candidateId: "rel-1", stale: false, staleReason: "", staleFlaggedAt: null, status: "APPROVED", requestedAt: "2026-10-06T08:00:00.000Z", resolvedAt: "2026-10-06T12:00:00.000Z", demo: false }],
        deployments: [
          { id: "dep-1", candidateId: "rel-1", version: "1.2.0", status: "SUCCEEDED", demo: false, environment: "production", startedAt: "2026-10-06T13:00:00.000Z", completedAt: "2026-10-06T14:00:00.000Z" },
          { id: "dep-demo", candidateId: "rel-demo", version: "DEMO-0.1.0", status: "SUCCEEDED", demo: true, environment: "demo", startedAt: "2026-10-06T13:00:00.000Z", completedAt: "2026-10-06T13:05:00.000Z" },
        ],
        workspaces: [{ id: "ws-1", taskId: "task-1", contractStale: false, staleReason: "", staleFlaggedAt: null, createdAt: "2026-10-06T08:30:00.000Z", completedAt: null }],
      }),
      "all",
    );
    expect(metric(view, "release_cycle").display).toBe("6h");
    expect(metric(view, "release_to_approval").display).toBe("4h");
    expect(metric(view, "release_approval_to_deployment").display).toBe("1h");
    expect(metric(view, "deployment_to_completion").display).toBe("1h");
    expect(metric(view, "deployment_frequency_7d").value).toBe(1);
    expect(metric(view, "successful_deployments").value).toBe(1);
    expect(metric(view, "lead_time_for_changes").qualityNote).toContain("Commit author time is not stored");
    expect(metric(view, "lead_time_for_changes").display).toBe("5h 30m");
  });

  it("requires a commitment boundary and classifies rework only after review", () => {
    const committed = calculateProduct(
      product({
        slices: [{ id: "slice-1", name: "Simple claim", status: "APPROVED", createdAt: "2026-10-01T12:00:00.000Z" }],
        activities: [{ id: "slice-ok", type: "SLICE_APPROVED", description: "Slice approved", createdAt: "2026-10-02T12:00:00.000Z" }],
        workItems: [
          { id: "story-1", title: "Submit", type: "STORY", status: "DONE", priority: "MEDIUM", sliceId: "slice-1", capabilityId: null, capabilityName: null, sliceName: "Simple claim", createdAt: "2026-10-01T12:00:00.000Z" },
          { id: "story-2", title: "Extra", type: "STORY", status: "BLOCKED", priority: "LOW", sliceId: "slice-1", capabilityId: null, capabilityName: null, sliceName: "Simple claim", createdAt: "2026-10-03T12:00:00.000Z" },
        ],
        tasks: [
          { id: "task-1", title: "Submit claim", status: "COMPLETED", workItemId: "story-1", createdAt: "2026-10-04T08:00:00.000Z", updatedAt: "2026-10-04T12:00:00.000Z" },
          { id: "task-2", title: "Untouched", status: "COMPLETED", workItemId: null, createdAt: "2026-10-04T08:00:00.000Z", updatedAt: "2026-10-04T12:00:00.000Z" },
        ],
        workspaces: [
          { id: "ws-1", taskId: "task-1", contractStale: false, staleReason: "", staleFlaggedAt: null, createdAt: "2026-10-04T09:00:00.000Z", completedAt: null },
          { id: "ws-2", taskId: "task-2", contractStale: false, staleReason: "", staleFlaggedAt: null, createdAt: "2026-10-04T09:00:00.000Z", completedAt: null },
        ],
        codeApprovals: [{ id: "code-1", taskId: "task-1", workspaceId: "ws-1", createdAt: "2026-10-04T10:00:00.000Z", status: "APPROVED" }],
        revisions: [
          { id: "revision-before", workspaceId: "ws-2", createdAt: "2026-10-04T09:30:00.000Z" },
          { id: "revision-after", workspaceId: "ws-1", createdAt: "2026-10-04T11:00:00.000Z" },
        ],
      }),
      "all",
    );
    expect(metric(committed, "delivery_predictability").display).toContain("1 completed / 2 planned");
    expect(metric(committed, "delivery_predictability").display).toContain("1 added after commitment");
    expect(committed.rework.map((item) => item.id)).toEqual(["revision-after"]);
    expect(metric(committed, "rework_rate_tasks").display).toBe("1 / 2 = 50%");
    expect(metric(committed, "rework_rate_tasks").numerator).toBe(1);
    expect(metric(committed, "rework_rate_tasks").denominator).toBe(2);
  });

  it("records scope changes and the rework that follows", () => {
    const view = calculateProduct(
      product({
        definition: { status: "APPROVED", createdAt: "2026-10-01T08:00:00.000Z", approvedAt: "2026-10-02T08:00:00.000Z" },
        definitionProposals: [{ id: "prop-2", status: "OPEN", createdAt: "2026-10-03T08:00:00.000Z" }],
        revisions: [{ id: "revision-after", workspaceId: "ws-1", createdAt: "2026-10-04T11:00:00.000Z" }],
        codeApprovals: [{ id: "code-1", taskId: "task-1", workspaceId: "ws-1", createdAt: "2026-10-04T10:00:00.000Z", status: "APPROVED" }],
        workspaces: [{ id: "ws-1", taskId: "task-1", contractStale: false, staleReason: "", staleFlaggedAt: null, createdAt: "2026-10-04T09:00:00.000Z", completedAt: null }],
        tasks: [{ id: "task-1", title: "Submit claim", status: "COMPLETED", workItemId: null, createdAt: "2026-10-04T08:00:00.000Z", updatedAt: "2026-10-04T12:00:00.000Z" }],
      }),
      "all",
    );
    expect(view.scopeChanges).toHaveLength(1);
    expect(view.scopeChanges[0]?.category).toBe("REQUIREMENT");
    expect(view.scopeChanges[0]?.downstreamRework).toBe(1);
    expect(metric(view, "scope_change_count").value).toBe(1);
  });

  it("counts defects, escape, and change failure without treating a low issue as a failed change", () => {
    const view = calculateProduct(
      product({
        releases: [{ id: "rel-1", version: "1.0.0", status: "DEPLOYED", demo: false, sliceId: "slice-1", createdAt: "2026-10-01T08:00:00.000Z", taskIds: ["task-1"] }],
        deployments: [
          { id: "dep-ok", candidateId: "rel-1", version: "1.0.0", status: "SUCCEEDED", demo: false, environment: "production", startedAt: "2026-10-02T08:00:00.000Z", completedAt: "2026-10-02T09:00:00.000Z" },
          { id: "dep-bad", candidateId: "rel-1", version: "1.0.1", status: "ROLLED_BACK", demo: false, environment: "production", startedAt: "2026-10-03T08:00:00.000Z", completedAt: "2026-10-03T09:00:00.000Z" },
          { id: "dep-low", candidateId: "rel-1", version: "1.0.2", status: "SUCCEEDED", demo: false, environment: "production", startedAt: "2026-10-04T08:00:00.000Z", completedAt: "2026-10-04T09:00:00.000Z" },
        ],
        issues: [
          { id: "issue-low", candidateId: "rel-1", deploymentId: "dep-low", severity: "LOW", status: "OPEN", description: "Copy tweak", detectedAt: "2026-10-04T10:00:00.000Z", resolvedAt: null },
          { id: "issue-high", candidateId: "rel-1", deploymentId: "dep-ok", severity: "HIGH", status: "OPEN", description: "Payments doubled", detectedAt: "2026-10-02T12:00:00.000Z", resolvedAt: null },
        ],
        defectLinks: [{ id: "link-1", workItemId: "defect-1", taskId: "task-1", createdAt: "2026-10-01T10:00:00.000Z" }],
        workItems: [{ id: "defect-1", title: "Wrong total", type: "DEFECT", status: "READY", priority: "HIGH", sliceId: "slice-1", capabilityId: "cap-1", capabilityName: "Notice", sliceName: "Simple", createdAt: "2026-10-01T10:00:00.000Z" }],
      }),
      "all",
    );
    expect(metric(view, "defects_found_in_verification").value).toBe(1);
    expect(metric(view, "defects_found_after_deployment").value).toBe(2);
    expect(metric(view, "defects_open_critical_high").value).toBe(2);
    expect(metric(view, "defect_escape_rate").display).toBe("2 / 3 = 66.7%");
    expect(metric(view, "change_failure_rate").display).toBe("2 / 3 = 66.7%");
    expect(metric(view, "change_failure_rate").drilldown.map((item) => item.detail)).toEqual([
      "SUCCEEDED · counts as a failed change",
      "ROLLED_BACK · counts as a failed change",
      "SUCCEEDED · success",
    ]);
    expect(metric(view, "open_defect_age").sampleSize).toBe(1);
  });

  it("leaves time to restore insufficient until a restoration is recorded", () => {
    const missing = calculateProduct(
      product({
        deployments: [{ id: "dep-bad", candidateId: "rel-1", version: "1.0.0", status: "FAILED", demo: false, environment: "production", startedAt: "2026-10-03T08:00:00.000Z", completedAt: "2026-10-03T09:00:00.000Z" }],
      }),
      "all",
    );
    expect(metric(missing, "mttr").display).toBe("INSUFFICIENT DATA");
    const restored = calculateProduct(
      product({
        deployments: [
          { id: "dep-bad", candidateId: "rel-1", version: "1.0.0", status: "FAILED", demo: false, environment: "production", startedAt: "2026-10-03T08:00:00.000Z", completedAt: "2026-10-03T09:00:00.000Z" },
          { id: "dep-ok", candidateId: "rel-1", version: "1.0.1", status: "SUCCEEDED", demo: false, environment: "production", startedAt: "2026-10-03T10:00:00.000Z", completedAt: "2026-10-03T11:00:00.000Z" },
        ],
      }),
      "all",
    );
    expect(metric(restored, "mttr").display).toBe("2h");
  });

  it("reports agent runs, first pass, escalations, and human time without a cost", () => {
    const view = calculateProduct(
      product({
        agentRuns: [
          { id: "run-1", agentType: "CODING", status: "COMPLETED", startedAt: "2026-10-05T10:00:00.000Z", completedAt: "2026-10-05T10:11:00.000Z", durationMs: 11 * 60 * 1000, estimatedCost: null, inputTokens: 100, outputTokens: 40, escalated: false, workspaceId: "ws-1" },
          { id: "run-2", agentType: "CODING", status: "COMPLETED", startedAt: "2026-10-05T11:00:00.000Z", completedAt: "2026-10-05T11:20:00.000Z", durationMs: 20 * 60 * 1000, estimatedCost: null, inputTokens: null, outputTokens: null, escalated: true, workspaceId: "ws-2" },
        ],
        revisions: [{ id: "revision-1", workspaceId: "ws-2", createdAt: "2026-10-05T12:00:00.000Z" }],
        codingEscalations: [{ id: "esc-1", workspaceId: "ws-2", type: "REQUIREMENT_AMBIGUITY", reason: "The acceptance criterion contradicts the story.", status: "RESOLVED", createdAt: "2026-10-05T11:05:00.000Z", resolvedAt: "2026-10-05T13:05:00.000Z" }],
        approvals: [{ id: "ap-1", type: "CODE_CHANGE", status: "APPROVED", requestedAt: "2026-10-05T10:11:00.000Z", resolvedAt: "2026-10-05T17:32:00.000Z" }],
        activities: [{ id: "edit-1", type: "DISCOVERY_BRIEF_EDITED", description: "Edited the brief", createdAt: "2026-10-05T09:00:00.000Z" }],
        architectureProposals: [{ id: "arch-prop", status: "COMMITTED", createdAt: "2026-10-01T09:00:00.000Z" }],
      }),
      "all",
    );
    expect(view.agents[0]).toMatchObject({ runs: 2, completed: 2, failed: 0, escalated: 1, cost: "COST NOT AVAILABLE", totalTokens: 140 });
    expect(metric(view, "first_pass_coding").display).toBe("1 / 2 = 50%");
    expect(metric(view, "first_pass_architecture").display).toBe("1 / 1 = 100%");
    expect(metric(view, "first_pass_requirements").display).toBe("INSUFFICIENT DATA");
    expect(metric(view, "escalation_count").value).toBe(1);
    expect(metric(view, "escalation_resolution").display).toBe("2h");
    expect(metric(view, "ai_execution_time").display).toBe("31m");
    expect(metric(view, "human_approval_time").display).toBe("7h 21m");
    expect(metric(view, "human_intervention_count").value).toBe(1);
    expect(metric(view, "human_intervention_count").qualityNote).toContain("control");
    expect(metric(view, "token_usage").display).toContain("Input 100");
    expect(view.bottlenecks.some((item) => item.type === "CODE_REVIEW_WAIT")).toBe(true);
  });

  it("keeps automation, governance, quality, and outcome gaps explicit", () => {
    const view = calculateProduct(
      product({
        codingRisks: [
          { id: "risk-1", taskId: "task-1", taskTitle: "Submit", riskLevel: "LOW", executionMode: "AUTONOMOUS", overrideRiskLevel: null, overrideExecutionMode: null, overriddenAt: null },
          { id: "risk-2", taskId: "task-2", taskTitle: "Pay", riskLevel: "LOW", executionMode: "SUPERVISED", overrideRiskLevel: null, overrideExecutionMode: null, overriddenAt: "2026-10-05T09:00:00.000Z" },
        ],
        workspaces: [
          { id: "ws-1", taskId: "task-1", contractStale: false, staleReason: "", staleFlaggedAt: null, createdAt: "2026-10-05T10:00:00.000Z", completedAt: null },
          { id: "ws-2", taskId: "task-2", contractStale: false, staleReason: "", staleFlaggedAt: null, createdAt: "2026-10-05T11:00:00.000Z", completedAt: null },
        ],
        findings: [
          { id: "find-1", title: "Open redirect", severity: "HIGH", status: "OPEN", dueBeforeCoding: true, createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z" },
          { id: "find-2", title: "Logging", severity: "LOW", status: "MITIGATED", dueBeforeCoding: true, createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z" },
        ],
        governanceReviews: [{ id: "gov-1", version: 2, status: "APPROVED", reviewRequired: false, reviewReason: "", createdAt: "2026-10-01T08:00:00.000Z" }],
        coverages: [
          { id: "cov-1", sessionId: "ver-1", criterionId: "ac-1", status: "VERIFIED", humanConfirmed: false },
          { id: "cov-2", sessionId: "ver-1", criterionId: "ac-2", status: "FAILED", humanConfirmed: true },
        ],
        sessions: [{ id: "ver-1", taskId: "task-1", verdict: "FAIL", stale: false, demo: false, commitSha: "abc", startedAt: null, completedAt: null, createdAt: "2026-10-05T12:00:00.000Z" }],
        executions: [{ id: "ex-1", sessionId: "ver-1", kind: "EXISTING_REGRESSION", status: "FAILED", startedAt: "2026-10-05T12:00:00.000Z", completedAt: "2026-10-05T12:05:00.000Z" }],
        releases: [{ id: "rel-1", version: "1.0.0", status: "DEPLOYED", demo: false, sliceId: "slice-1", createdAt: "2026-10-06T08:00:00.000Z", taskIds: [] }],
        deployments: [{ id: "dep-1", candidateId: "rel-1", version: "1.0.0", status: "SUCCEEDED", demo: false, environment: "production", startedAt: "2026-10-06T09:00:00.000Z", completedAt: "2026-10-06T10:00:00.000Z" }],
        outcomes: [{ id: "out-1", title: "Reduce customer effort", successMeasure: "Percentage submitted digitally", targetValue: "80%", status: "CONFIRMED" }],
        observations: [
          { id: "obs-demo", outcomeId: "out-1", measure: "Percentage submitted digitally", value: "DEMO / SAMPLE", unit: "", observedAt: "2026-10-06T11:00:00.000Z", demo: true, releaseVersion: "DEMO-0.1.0" },
          { id: "obs-1", outcomeId: "out-1", measure: "Percentage submitted digitally", value: "62%", unit: "", observedAt: "2026-10-06T12:00:00.000Z", demo: false, releaseVersion: "1.0.0" },
        ],
        learning: [{ id: "learn-1", outcomeId: "out-1", decision: "ITERATE", createdAt: "2026-10-06T13:00:00.000Z" }],
      }),
      "all",
    );
    expect(metric(view, "automation_rate").display).toBe("1 / 2 = 50%");
    expect(metric(view, "automation_rate").qualityNote).toContain("1 supervised");
    expect(metric(view, "policy_overrides").value).toBe(1);
    expect(metric(view, "governance_findings").value).toBe(2);
    expect(metric(view, "governance_rereview_rate").display).toBe("1 / 1 = 100%");
    expect(metric(view, "acceptance_verified").value).toBe(1);
    expect(metric(view, "acceptance_failed").value).toBe(1);
    expect(metric(view, "acceptance_manual").value).toBe(1);
    expect(metric(view, "regression_failures").value).toBe(1);
    expect(metric(view, "outcomes_achieved").value).toBe(0);
    expect(metric(view, "outcomes_awaiting_evidence").value).toBe(0);
    expect(metric(view, "delivery_complete_outcome_pending").value).toBe(1);
    expect(view.outcomes[0]).toMatchObject({ latest: "62%", target: "80%", decision: "ITERATE", baseline: "Baseline not recorded", deliveryCompleteOutcomePending: true });
    expect(view.charts.outcomeObservations[0]?.value).toBe(62);
  });

  it("does not invent active time or a flow-efficiency percentage", () => {
    const view = calculateProduct(
      product({
        discovery: { createdAt: "2026-10-01T08:00:00.000Z", startedAt: "2026-10-01T08:00:00.000Z", completedAt: null },
        approvals: [{ id: "brief", type: "PRODUCT_DISCOVERY", status: "APPROVED", requestedAt: "2026-10-01T09:00:00.000Z", resolvedAt: "2026-10-01T12:00:00.000Z" }],
      }),
      "all",
    );
    expect(metric(view, "stage_elapsed_explore").quality).toBe("PARTIAL");
    expect(metric(view, "stage_active_explore").display).toBe("NOT AVAILABLE");
    expect(metric(view, "flow_efficiency").display).toBe("NOT AVAILABLE");
    expect(metric(view, "flow_efficiency").value).toBeNull();
  });

  it("applies the time window and withholds a previous-period comparison", () => {
    const input = product({
      tasks: [{ id: "task-1", title: "Submit claim", status: "COMPLETED", workItemId: null, createdAt: "2026-08-01T08:00:00.000Z", updatedAt: "2026-08-01T12:00:00.000Z" }],
      workspaces: [{ id: "ws-1", taskId: "task-1", contractStale: false, staleReason: "", staleFlaggedAt: null, createdAt: "2026-08-01T09:00:00.000Z", completedAt: null }],
      codeApprovals: [{ id: "code-1", taskId: "task-1", workspaceId: "ws-1", createdAt: "2026-08-01T12:00:00.000Z", status: "APPROVED" }],
    });
    expect(metric(calculateProduct(input, "7d"), "implementation_cycle_median").display).toBe("INSUFFICIENT DATA");
    const all = metric(calculateProduct(input, "all"), "implementation_cycle_median");
    expect(all.display).toBe("3h");
    expect(all.comparison).toBeNull();
    const recent = calculateProduct(
      product({
        tasks: [{ id: "task-1", title: "Submit claim", status: "COMPLETED", workItemId: null, createdAt: "2026-10-07T08:00:00.000Z", updatedAt: "2026-10-07T12:00:00.000Z" }],
        workspaces: [{ id: "ws-1", taskId: "task-1", contractStale: false, staleReason: "", staleFlaggedAt: null, createdAt: "2026-10-07T09:00:00.000Z", completedAt: null }],
        codeApprovals: [{ id: "code-1", taskId: "task-1", workspaceId: "ws-1", createdAt: "2026-10-07T12:00:00.000Z", status: "APPROVED" }],
      }),
      "7d",
    );
    expect(metric(recent, "implementation_cycle_median").comparison).toContain("insufficient");
  });

  it("aggregates a portfolio from product samples", () => {
    const slow = product({
      discovery: { createdAt: "2026-10-01T12:00:00.000Z", startedAt: null, completedAt: null },
      releases: [{ id: "rel-1", version: "1.0.0", status: "DEPLOYED", demo: false, sliceId: "slice-1", createdAt: "2026-10-01T12:00:00.000Z", taskIds: [] }],
      deployments: [{ id: "dep-1", candidateId: "rel-1", version: "1.0.0", status: "SUCCEEDED", demo: false, environment: "production", startedAt: "2026-10-02T12:00:00.000Z", completedAt: "2026-10-02T22:00:00.000Z" }],
      workItems: [{ id: "blocked-1", title: "Waiting", type: "STORY", status: "BLOCKED", priority: "MEDIUM", sliceId: null, capabilityId: null, capabilityName: null, sliceName: null, createdAt: NOW }],
    });
    const fast = createAnalyticsInput(NOW, { id: "prod-2", name: "Payments", createdAt: "2026-10-06T12:00:00.000Z" }, {
      discovery: { createdAt: "2026-10-06T12:00:00.000Z", startedAt: null, completedAt: null },
      releases: [{ id: "rel-2", version: "2.0.0", status: "DEPLOYED", demo: false, sliceId: "slice-2", createdAt: "2026-10-06T12:00:00.000Z", taskIds: [] }],
      deployments: [{ id: "dep-2", candidateId: "rel-2", version: "2.0.0", status: "SUCCEEDED", demo: false, environment: "production", startedAt: "2026-10-07T12:00:00.000Z", completedAt: "2026-10-07T18:00:00.000Z" }],
      approvals: [{ id: "pending-1", type: "RELEASE", status: "PENDING", requestedAt: "2026-10-07T18:00:00.000Z", resolvedAt: null }],
    });
    const portfolio = calculatePortfolio([slow, fast], "all");
    expect(metricOf(portfolio.metrics, "idea_to_deployment_lead_time").display).toBe("1d 8h");
    expect(metricOf(portfolio.metrics, "idea_to_deployment_lead_time").sampleSize).toBe(2);
    expect(portfolio.blocked.map((item) => item.name)).toEqual(["Claims"]);
    expect(portfolio.ready.map((item) => item.name)).toEqual(["Payments"]);
    expect(metricOf(portfolio.metrics, "products_blocked").value).toBe(1);
    expect(portfolio.stageCounts.reduce((sum, item) => sum + item.count, 0)).toBe(2);
  });

  it("exports the displayed value and omits drill-down text", () => {
    const view = calculateProduct(product(), "30d");
    const csv = exportCsv(view.metrics, "30d", view.calculatedAt);
    expect(csv.split("\n")[0]).toBe("metric,value,unit,period,sampleSize,dataQuality,calculatedAt");
    expect(csv).toContain("INSUFFICIENT DATA");
    expect(csv).not.toContain("diff");
    const json = JSON.parse(exportJson(view.metrics, "30d", view.calculatedAt)) as { metrics: { value: string; dataQuality: string }[] };
    expect(json.metrics[0]?.dataQuality).toBeTruthy();
    expect(JSON.stringify(json)).not.toContain("patch");
  });

  it("grounds insights in calculated metrics and cannot change them", async () => {
    const view = calculateProduct(
      product({
        pullRequests: [{ id: "pr-1", number: 4, title: "Submit", state: "MERGED", demo: false, workspaceId: null, taskId: null, createdAt: "2026-10-05T08:00:00.000Z", mergedAt: "2026-10-06T08:00:00.000Z" }],
        agentRuns: [{ id: "run-1", agentType: "CODING", status: "COMPLETED", startedAt: "2026-10-05T10:00:00.000Z", completedAt: "2026-10-05T10:11:00.000Z", durationMs: 11 * 60 * 1000, estimatedCost: null, inputTokens: null, outputTokens: null, escalated: false, workspaceId: "ws-1" }],
      }),
      "all",
    );
    const before = metric(view, "pr_cycle").value;
    const provider: AIProvider = {
      async generate() {
        return {
          data: {
            summary: "Review is the long wait.",
            observations: [
              { statement: "Pull request cycle time is the measured wait.", metricKeys: ["pr_cycle"] },
              { statement: "The team saved 40 hours.", metricKeys: ["pr_cycle"] },
              { statement: "A secret metric says 99.", metricKeys: ["not-a-metric"] },
            ],
            risks: [],
            opportunities: [],
            questions: ["Which reviews are waiting?"],
          },
          usage: { inputTokens: null, outputTokens: null },
          model: "test",
        } as never;
      },
    };
    setAIProviderForTests(provider);
    const insight = await explainMetrics(view.metrics);
    setAIProviderForTests(null);
    expect(metric(view, "pr_cycle").value).toBe(before);
    expect(insight.available).toBe(true);
    if (!insight.available) return;
    expect(insight.observations).toHaveLength(1);
    expect(insight.observations[0]?.evidence[0]).toContain("1d");
    expect(insight.observations[0]?.metricKeys).toEqual(["pr_cycle"]);
  });
});

function metricOf(metrics: { key: string; display: string; value: number | null; sampleSize: number | null }[], key: string) {
  const found = metrics.find((item) => item.key === key);
  if (!found) throw new Error(key);
  return found;
}
