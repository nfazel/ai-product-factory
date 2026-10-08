import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { EmptyState, PageSkeleton } from "@/components/feedback/states";
import {
  AcceptanceBadge,
  ApprovalStatusBadge,
  PriorityBadge,
  StageBadge,
  WorkItemStatusBadge,
  WorkItemTypeBadge,
  approvalLabel,
} from "@/components/status/badges";
import {
  AddCriterionForm,
  AddDependencyForm,
  CriterionStatusForm,
  RecordDecisionForm,
  UpdateWorkItemForm,
} from "@/components/work-items/work-item-forms";
import { formatDateTime } from "@/lib/format";
import { getStoryTraceability } from "@/modules/requirements/service";
import { getWorkItemDetail } from "@/modules/work-item/detail";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Work item" };

export default function WorkItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WorkItem params={params} />
    </Suspense>
  );
}

async function WorkItem({ params }: { params: Promise<{ id: string }> }) {
  await markDynamic();
  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) notFound();

  const { item, criteria, dependencies, decisions, approvals, activity, agentRuns, productItems } =
    detail;
  const trace =
    item.type === "STORY" || item.type === "FEATURE" || item.type === "EPIC"
      ? await getStoryTraceability(item.id)
      : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        <Link href={`/products/${item.productId}`} className="hover:underline">
          {item.productName}
        </Link>
        {" / "}
        <Link href={`/products/${item.productId}/backlog`} className="hover:underline">
          Backlog
        </Link>
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <header className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <WorkItemTypeBadge type={item.type} />
              <WorkItemStatusBadge status={item.status} />
              <PriorityBadge priority={item.priority} />
              <StageBadge stage={item.stage} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {item.description || "No description yet."}
            </p>
          </header>

          {trace ? (
            <Section
              title="Traceability"
              description="Why this item exists, from the story back to the outcome."
            >
              <ol className="space-y-2 text-sm">
                <TraceStep label="Product outcome" value={trace.outcome?.title} href={trace.outcome ? `/products/${item.productId}/definition#outcome-${trace.outcome.id}` : undefined} />
                <TraceStep label="Capability" value={trace.capability?.name} href={trace.capability ? `/products/${item.productId}/definition#capability-${trace.capability.id}` : undefined} />
                <TraceStep label="Epic" value={trace.epic?.title} href={trace.epic ? `/work-items/${trace.epic.id}` : undefined} />
                <TraceStep label="Feature" value={trace.feature?.title} href={trace.feature ? `/work-items/${trace.feature.id}` : undefined} />
                <TraceStep label="Story" value={trace.story?.title} href={trace.story ? `/work-items/${trace.story.id}` : undefined} />
              </ol>
            </Section>
          ) : null}

          <Section title="Acceptance criteria" description="Observable behaviour a person can test.">
            {criteria.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No acceptance criteria yet.
              </p>
            ) : (
              <ul className="space-y-4">
                {criteria.map((criterion) => (
                  <li key={criterion.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-6">{criterion.description}</p>
                      <AcceptanceBadge status={criterion.status} />
                    </div>
                    <div className="mt-3">
                      <CriterionStatusForm criterion={criterion} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 border-t pt-4">
              <AddCriterionForm workItemId={item.id} />
            </div>
          </Section>

          <Section title="Dependencies" description="Work that must finish before this item can.">
            {dependencies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No dependencies yet.</p>
            ) : (
              <ul className="space-y-2">
                {dependencies.map((dependency) => (
                  <li key={dependency.id}>
                    <Link
                      href={`/work-items/${dependency.dependsOnId}`}
                      className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm hover:border-primary/30"
                    >
                      <span>{dependency.title}</span>
                      <span className="flex gap-1.5">
                        <WorkItemTypeBadge type={dependency.type} />
                        <WorkItemStatusBadge status={dependency.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">
                Add a dependency
              </summary>
              <div className="mt-3">
                <AddDependencyForm workItemId={item.id} candidates={productItems} />
              </div>
            </details>
          </Section>

          <Section title="Decisions" description="Choices a person has made about this work.">
            {decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No decisions on this item.</p>
            ) : (
              <ul className="space-y-4">
                {decisions.map((decision) => (
                  <li key={decision.id}>
                    <p className="text-sm font-medium">{decision.title}</p>
                    <p className="mt-1 text-sm leading-6">{decision.decision}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{decision.reason}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {decision.decisionMaker} · {formatDateTime(decision.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <details className="mt-4 border-t pt-4">
              <summary className="cursor-pointer text-sm font-medium">
                Record a decision
              </summary>
              <div className="mt-4">
                <RecordDecisionForm productId={item.productId} workItemId={item.id} />
              </div>
            </details>
          </Section>

          <Section title="Approvals" description="Gates that stay with a person.">
            {approvals.length === 0 ? (
              <EmptyState
                title="No approvals on this item"
                description="Request one from the approval centre when a decision needs a named owner."
                action={
                  <Link
                    href={`/approvals?productId=${item.productId}&workItemId=${item.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    Request approval
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
                {approvals.map((approval) => (
                  <li key={approval.id} className="rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">
                        {approvalLabel(approval.approvalType)}
                      </p>
                      <ApprovalStatusBadge status={approval.status} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {approval.comments || "No comments."}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Requested {formatDateTime(approval.requestedAt)}
                      {approval.approvedBy ? ` · ${approval.approvedBy}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm">
              <Link
                href="/decisions"
                className="text-primary hover:underline"
              >
                Open decisions
              </Link>
            </p>
          </Section>

          <Section
            title="Agent activity"
            description="Agent runs recorded for this work item."
          >
            {agentRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No agent runs for this work item. Status: Not configured.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {agentRuns.map((run) => (
                  <li key={run.id}>
                    {run.agentType} · {run.status}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="History" description="Changes recorded for this work item.">
            <ActivityFeed
              items={activity}
              emptyDescription="Updates, criteria, and approvals will be listed here."
            />
          </Section>
        </div>

        <aside className="h-fit rounded-2xl border bg-card p-5 lg:sticky lg:top-20">
          <h2 className="text-sm font-semibold">Update</h2>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">
            Type stays fixed so the backlog hierarchy remains intact.
          </p>
          <UpdateWorkItemForm item={item} />
        </aside>
      </div>
    </div>
  );
}

function TraceStep({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | null;
  href?: string;
}) {
  return (
    <li>
      <p className="text-xs text-muted-foreground">{label}</p>
      {value && href ? (
        <Link href={href} className="font-medium hover:underline">
          {value}
        </Link>
      ) : (
        <p className="text-muted-foreground">{value || "Not linked yet."}</p>
      )}
    </li>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}
