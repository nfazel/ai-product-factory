import { Suspense } from "react";

import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { listAgentCatalogue } from "@/modules/agent/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Agents" };

export default function AgentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Agents />
    </Suspense>
  );
}

async function Agents() {
  await markDynamic();
  const agents = await listAgentCatalogue();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agents"
        title="Agent control centre"
        description="Product Discovery, the Requirements Agent, the Architecture Agent, and the Security & Engineering Governance Agent run when OPENAI_API_KEY is set on the server. Coding, testing, and review stay unavailable until they are introduced."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {agents.map((agent) => (
          <article key={agent.agentType} className="rounded-2xl border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">{agent.name}</h2>
              <span
                className={
                  agent.configured
                    ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
                    : "rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700"
                }
              >
                {agent.configured ? "CONFIGURED" : "NOT CONFIGURED"}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {agent.responsibility}
            </p>
            {agent.agentType === "PRODUCT_DISCOVERY" ||
            agent.agentType === "REQUIREMENTS" ||
            agent.agentType === "ARCHITECTURE" ||
            agent.agentType === "SECURITY" ? (
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Runs</dt>
                  <dd className="font-medium">{agent.runCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Completed</dt>
                  <dd className="font-medium">{agent.completedCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Failed</dt>
                  <dd className="font-medium">{agent.failedCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Average duration</dt>
                  <dd className="font-medium">{formatDuration(agent.averageDurationMs)}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">No runs recorded.</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function formatDuration(durationMs: number | null) {
  if (durationMs == null) return "—";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}
