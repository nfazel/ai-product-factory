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
        description="AI agents will be introduced progressively as the Product Factory capabilities are enabled."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {agents.map((agent) => (
          <article key={agent.agentType} className="rounded-2xl border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">{agent.name}</h2>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
                Not configured
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {agent.responsibility}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              {agent.runCount === 0
                ? "No runs recorded."
                : `${agent.runCount} historical runs.`}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
