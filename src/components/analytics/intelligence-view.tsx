import Link from "next/link";

import { BarList, FlowTimeline } from "@/components/analytics/charts";
import { InsightsPanel } from "@/components/analytics/insights-panel";
import { MetricGrid } from "@/components/analytics/metric-card";
import { getMetricDefinition } from "@/modules/analytics/catalogue";
import type { MetricCategory, MetricValue, ProductIntelligence } from "@/modules/analytics/types";

const SECTIONS: { category: MetricCategory; title: string; keys: string[] }[] = [
  {
    category: "FLOW",
    title: "Flow",
    keys: ["idea_to_deployment_lead_time", "flow_efficiency", "approval_wait_brief", "approval_wait_definition", "approval_wait_code_change", "approval_wait_release"],
  },
  {
    category: "DELIVERY",
    title: "Delivery",
    keys: ["implementation_cycle_median", "pr_cycle", "delivery_predictability", "scope_change_count", "verification_cycle"],
  },
  {
    category: "QUALITY",
    title: "Quality",
    keys: ["rework_rate_tasks", "defect_escape_rate", "defects_open_critical_high", "defects_found_in_verification", "defects_found_after_deployment"],
  },
  {
    category: "AI",
    title: "AI contribution",
    keys: ["agent_runs", "ai_execution_time", "human_approval_time", "automation_rate", "first_pass_coding", "first_pass_verification", "escalation_count", "human_intervention_count"],
  },
  {
    category: "GOVERNANCE",
    title: "Risk",
    keys: ["governance_findings", "risks_accepted", "governance_cycle", "governance_rereview_rate"],
  },
  {
    category: "RELEASE",
    title: "Release",
    keys: ["release_candidates", "approved_releases", "successful_deployments", "failed_deployments", "rollbacks", "deployment_frequency_30d", "change_failure_rate", "lead_time_for_changes", "mttr"],
  },
  {
    category: "OUTCOME",
    title: "Outcome",
    keys: ["outcomes_achieved", "outcomes_awaiting_evidence", "delivery_complete_outcome_pending"],
  },
];

export function IntelligenceView({
  view,
  mode,
}: {
  view: ProductIntelligence;
  mode: "leadership" | "engineering";
}) {
  const byKey = new Map(view.metrics.map((metric) => [metric.key, metric]));
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Where time goes</h2>
        <FlowTimeline segments={view.segments} />
      </section>

      {view.bottlenecks.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Bottlenecks</h2>
          <ul className="space-y-2">
            {view.bottlenecks.map((signal) => (
              <li key={signal.id} className="rounded-2xl border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{signal.type.replaceAll("_", " ")}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{signal.severity}</span>
                </div>
                <p className="mt-2 leading-6">{signal.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {signal.observedValue}. {signal.comparison}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">No bottleneck rule fired. That is not a claim that the product is fast.</p>
      )}

      {SECTIONS.map((section) => (
        <section key={section.category} className="space-y-4" data-section={section.category}>
          <h2 className="text-base font-semibold">{section.title}</h2>
          <MetricGrid metrics={pick(byKey, section.keys, mode)} />
          {section.category === "FLOW" ? (
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="mb-3 text-sm font-medium">Wait breakdown</h3>
              <BarList points={view.charts.waitBreakdown} empty="INSUFFICIENT DATA. No closed wait has both a start and a finish." />
            </div>
          ) : null}
          {section.category === "QUALITY" ? (
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="mb-3 text-sm font-medium">Defects by where they were found</h3>
              <BarList points={view.charts.defectsByStage} empty="INSUFFICIENT DATA. Defect counts are not both available." />
            </div>
          ) : null}
          {section.category === "AI" && mode === "engineering" ? <AgentTable view={view} /> : null}
          {section.category === "AI" ? (
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="mb-3 text-sm font-medium">Agent runs by result</h3>
              <BarList points={view.charts.agentRunsByResult} empty="INSUFFICIENT DATA. No agent run was recorded in this period." />
            </div>
          ) : null}
          {section.category === "DELIVERY" && mode === "engineering" ? (
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="mb-3 text-sm font-medium">Implementation cycle samples</h3>
              <BarList points={view.charts.cycleTime} empty="INSUFFICIENT DATA. No completed implementation task has a workspace clock." />
            </div>
          ) : null}
          {section.category === "OUTCOME" ? <OutcomeList view={view} /> : null}
          {mode === "engineering" ? <Remainder metrics={view.metrics} category={section.category} shown={section.keys} /> : null}
        </section>
      ))}

      {mode === "engineering" ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Rework events</h2>
          {view.rework.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rework event matched the rules in this period. Planned iteration before review is not counted.</p>
          ) : (
            <ul className="space-y-2">
              {view.rework.map((event) => (
                <li key={event.id} className="rounded-2xl border bg-card p-4 text-sm">
                  <p className="font-medium">{event.trigger}</p>
                  <p className="mt-1 text-muted-foreground">{event.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.affectedEntity} · {event.timestamp}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="text-primary hover:underline" href={`/api/products/${view.productId}/intelligence/export?format=csv&window=${view.window}`}>
          Export CSV
        </Link>
        <Link className="text-primary hover:underline" href={`/api/products/${view.productId}/intelligence/export?format=json&window=${view.window}`}>
          Export JSON
        </Link>
      </div>
      <InsightsPanel productId={view.productId} window={view.window} />
    </div>
  );
}

function pick(byKey: Map<string, MetricValue>, keys: string[], mode: "leadership" | "engineering") {
  return keys
    .map((key) => byKey.get(key))
    .filter((metric): metric is MetricValue => Boolean(metric))
    .filter((metric) => {
      if (mode === "engineering") return true;
      const definition = getMetricDefinition(metric.key);
      return definition?.audience !== "engineering";
    });
}

function Remainder({ metrics, category, shown }: { metrics: MetricValue[]; category: MetricCategory; shown: string[] }) {
  const rest = metrics.filter((metric) => getMetricDefinition(metric.key)?.category === category && !shown.includes(metric.key));
  if (rest.length === 0) return null;
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">All {category.toLowerCase()} metrics</summary>
      <div className="mt-3">
        <MetricGrid metrics={rest} />
      </div>
    </details>
  );
}

function AgentTable({ view }: { view: ProductIntelligence }) {
  if (view.agents.length === 0) {
    return <p className="text-sm text-muted-foreground">No agent run in this period.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Agent</th>
            <th className="px-3 py-2 font-medium">Runs</th>
            <th className="px-3 py-2 font-medium">Completed</th>
            <th className="px-3 py-2 font-medium">Failed</th>
            <th className="px-3 py-2 font-medium">Escalated</th>
            <th className="px-3 py-2 font-medium">Median</th>
            <th className="px-3 py-2 font-medium">Tokens</th>
            <th className="px-3 py-2 font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {view.agents.map((agent) => (
            <tr key={agent.agentType} className="border-b last:border-0">
              <td className="px-3 py-2">{agent.name}</td>
              <td className="px-3 py-2">{agent.runs}</td>
              <td className="px-3 py-2">{agent.completed}</td>
              <td className="px-3 py-2">{agent.failed}</td>
              <td className="px-3 py-2">{agent.escalated}</td>
              <td className="px-3 py-2">
                {agent.medianDuration}
                <span className="block text-xs text-muted-foreground">n = {agent.sampleSize}</span>
              </td>
              <td className="px-3 py-2">{agent.totalTokens == null ? "Not available" : agent.totalTokens}</td>
              <td className="px-3 py-2">{agent.cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeList({ view }: { view: ProductIntelligence }) {
  if (view.outcomes.length === 0) {
    return <p className="text-sm text-muted-foreground">No product outcome is recorded.</p>;
  }
  return (
    <ul className="space-y-3">
      {view.outcomes.map((outcome) => (
        <li key={outcome.id} className="rounded-2xl border bg-card p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{outcome.title}</h3>
            <span className="text-xs text-muted-foreground">{outcome.status}</span>
          </div>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Success measure</dt>
              <dd>{outcome.successMeasure}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Target</dt>
              <dd>{outcome.target}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Baseline</dt>
              <dd>{outcome.baseline}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Latest observation</dt>
              <dd>{outcome.latest}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Trend</dt>
              <dd>{outcome.trend}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Learning decision</dt>
              <dd>{outcome.decision}</dd>
            </div>
          </dl>
          {outcome.deliveryCompleteOutcomePending ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">Delivery complete, outcome not yet achieved. Learning is still required.</p>
          ) : null}
        </li>
      ))}
      {view.charts.outcomeObservations.length > 0 ? (
        <li className="rounded-2xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-medium">Numeric observations</h3>
          <BarList points={view.charts.outcomeObservations} empty="" />
        </li>
      ) : null}
    </ul>
  );
}
