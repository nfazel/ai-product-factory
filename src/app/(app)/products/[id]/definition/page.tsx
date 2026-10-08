import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DefinitionControls } from "@/components/definition/controls";
import { RequirementsPanel } from "@/components/intake/requirements-panel";
import { AnswerForm, EntityAction } from "@/components/definition/entity-actions";
import { ProposalPanel } from "@/components/definition/proposal-panel";
import { PageSkeleton } from "@/components/feedback/states";
import {
  CAPABILITY_STATUS_LABEL,
  DEFINITION_STATUS_LABEL,
  NFR_CATEGORY_LABEL,
  OUTCOME_STATUS_LABEL,
  PROVENANCE_LABEL,
  QUESTION_STATUS_LABEL,
  REQUIREMENT_ITEM_STATUS_LABEL,
  REQUIREMENT_ORIGIN_LABEL,
  SIGNAL_LEVEL_LABEL,
  SLICE_STATUS_LABEL,
  type SignalLevel,
} from "@/domain/constants";
import { NextActionPanel } from "@/components/guidance/guidance-ui";
import { getProductGuidance } from "@/modules/guidance/service";
import { getDefinitionWorkspace } from "@/modules/requirements/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Define" };
export const maxDuration = 60;

const LEVEL_TONE: Record<SignalLevel, string> = {
  LOW: "bg-stone-100 text-stone-700",
  MEDIUM: "bg-amber-50 text-amber-900",
  HIGH: "bg-emerald-50 text-emerald-800",
};

export default function DefinitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Definition params={params} />
    </Suspense>
  );
}

async function Definition({ params }: { params: Promise<{ id: string }> }) {
  await markDynamic();
  const { id } = await params;
  const [workspace, guidance] = await Promise.all([getDefinitionWorkspace(id), getProductGuidance(id)]);
  if (!workspace || !workspace.definition || !guidance) notFound();

  const approved = workspace.definition.status === "APPROVED";
  const showReview =
    workspace.definition.status === "READY_FOR_REVIEW" || workspace.sufficientlyDeveloped;
  const epics = workspace.workItems.filter((item) => item.type === "EPIC");
  const features = workspace.workItems.filter((item) => item.type === "FEATURE");
  const stories = workspace.workItems.filter((item) => item.type === "STORY");

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border bg-card p-4 sm:p-5">
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Define
        </p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Product definition</h1>
            <p className="text-sm text-muted-foreground">
              Status: {DEFINITION_STATUS_LABEL[workspace.definition.status]}
            </p>
            <p className="text-sm font-medium">{workspace.readiness.summary}</p>
            {workspace.definition.seededDemo ? (
              <p className="text-sm leading-6 text-amber-900">
                Demo data. These outcomes, capabilities, and backlog links were prepared for the sample product. They were not produced by a Requirements Agent run.
              </p>
            ) : null}
            {workspace.entryReasons.length > 0 ? (
              <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                {workspace.entryReasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
              </div>
            ) : null}
            {!workspace.configured ? (
              <p className="text-sm leading-6 text-muted-foreground">
                The Requirements Agent is not configured. Add OPENAI_API_KEY on the server. No definition will be invented.
              </p>
            ) : null}
            {workspace.definition.reviewSummary ? (
              <p className="text-sm leading-6">{workspace.definition.reviewSummary}</p>
            ) : null}
            {workspace.buildBlockers.length > 0 ? (
              <div>
                <p className="text-sm font-medium">Build is blocked until:</p>
                <ul className="mt-1 list-disc pl-5 text-sm leading-6 text-muted-foreground">
                  {workspace.buildBlockers.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-emerald-800">
                Approved brief, approved definition, and an approved first slice are in place.
              </p>
            )}
          </div>
          <DefinitionControls
            productId={workspace.product.id}
            showReview={showReview}
            approved={approved}
          />
        </div>
      </header>
      {guidance.stage === "DEFINE" || guidance.action?.stage === "DEFINE" ? <NextActionPanel guidance={guidance} /> : null}

      {workspace.product.startMode === "EXISTING_REQUIREMENTS" ? (
        <RequirementsPanel
          productId={workspace.product.id}
          targets={[
            ...workspace.outcomes.map((item) => ({ value: `PRODUCT_OUTCOME|${item.id}`, label: `Outcome · ${item.title}` })),
            ...workspace.capabilities.map((item) => ({ value: `PRODUCT_CAPABILITY|${item.id}`, label: `Capability · ${item.name}` })),
            ...workspace.workItems.filter((item) => item.type === "STORY").map((item) => ({ value: `WORK_ITEM|${item.id}`, label: `Story · ${item.title}` })),
            ...workspace.criteria.map((item) => ({ value: `ACCEPTANCE_CRITERION|${item.id}`, label: `Acceptance criterion · ${item.description}` })),
            ...workspace.nfrs.map((item) => ({ value: `NFR|${item.id}`, label: `NFR · ${item.title}` })),
          ]}
        />
      ) : null}

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Requirements readiness</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {workspace.readiness.areas.map((area) => (
            <li key={area.key} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{area.label}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_TONE[area.level]}`}>
                  {SIGNAL_LEVEL_LABEL[area.level]}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{area.reason}</p>
            </li>
          ))}
        </ul>
      </section>

      {workspace.proposal ? (
        <ProposalPanel
          productId={workspace.product.id}
          proposalId={workspace.proposal.id}
          payload={workspace.proposal.payload}
          seededDemo={workspace.proposal.seededDemo}
        />
      ) : null}

      <section id="outcomes" className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Product outcomes</h2>
          <p className="text-sm text-muted-foreground">Why are we building this?</p>
        </div>
        {workspace.outcomes.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">No outcome yet. An outcome says why this product is worth building. Draft the Product Definition to propose one.</p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {workspace.outcomes.map((outcome) => (
              <li key={outcome.id} id={`outcome-${outcome.id}`} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{outcome.title}</h3>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">
                    {OUTCOME_STATUS_LABEL[outcome.status]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {REQUIREMENT_ORIGIN_LABEL[outcome.origin]}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6">{outcome.description}</p>
                <p className="mt-2 text-sm text-muted-foreground">Success: {outcome.successMeasure}</p>
                {outcome.targetValue ? (
                  <p className="text-sm text-muted-foreground">Target: {outcome.targetValue}</p>
                ) : null}
                {outcome.status === "PROPOSED" ? (
                  <div className="mt-3">
                    <EntityAction productId={workspace.product.id} entityId={outcome.id} kind="outcome" label="Confirm" />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="capabilities" className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Capabilities</h2>
          <p className="text-sm text-muted-foreground">What must the product enable?</p>
        </div>
        <ul className="grid gap-3 lg:grid-cols-2">
          {workspace.capabilities.map((capability) => (
            <li key={capability.id} id={`capability-${capability.id}`} className="rounded-2xl border bg-card p-4">
              <h3 className="text-sm font-semibold">{capability.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {CAPABILITY_STATUS_LABEL[capability.status]} · supports{" "}
                <a href={`#outcome-${capability.outcome.id}`} className="text-primary hover:underline">
                  {capability.outcome.title}
                </a>
              </p>
              <p className="mt-2 text-sm leading-6">{capability.description}</p>
              {capability.status === "PROPOSED" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <EntityAction productId={workspace.product.id} entityId={capability.id} kind="capability" label="Confirm" />
                  <EntityAction productId={workspace.product.id} entityId={capability.id} kind="reject-capability" label="Reject" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">First product slice</h2>
          <p className="text-sm text-muted-foreground">What should we prove first?</p>
        </div>
        {workspace.slices.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">No First Slice yet. The First Slice is the smallest valuable part of the product you are committing to build first. Next, review the Product Definition.</p>
        ) : (
          workspace.slices.map((slice) => (
            <article key={slice.id} className="rounded-2xl border bg-card p-4">
              <h3 className="text-sm font-semibold">{slice.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{SLICE_STATUS_LABEL[slice.status]}</p>
              <p className="mt-2 text-sm leading-6">{slice.description}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{slice.rationale}</p>
              {slice.status === "PROPOSED" ? (
                <div className="mt-3">
                  <EntityAction productId={workspace.product.id} entityId={slice.id} kind="slice" label="Confirm First Slice" />
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Backlog for this product</h2>
          <p className="text-sm text-muted-foreground">
            Epics, features, and stories live here during Define.{" "}
            <Link href={`/products/${workspace.product.id}/backlog`} className="text-primary hover:underline">
              Open the full backlog
            </Link>
            .
          </p>
        </div>
        <ul className="space-y-4">
          {epics.map((epic) => (
            <li key={epic.id} className="rounded-2xl border bg-card p-4">
              <WorkLink item={epic} />
              <ul className="mt-3 space-y-3 border-l pl-4">
                {features
                  .filter((feature) => feature.parentId === epic.id)
                  .map((feature) => (
                    <li key={feature.id}>
                      <WorkLink item={feature} />
                      <ul className="mt-2 space-y-2 pl-4">
                        {stories
                          .filter((story) => story.parentId === feature.id)
                          .map((story) => {
                            const report = workspace.storyReports.find((item) => item.id === story.id);
                            return (
                              <li key={story.id} className="rounded-xl border p-3">
                                <WorkLink item={story} />
                                {report ? (
                                  <p className="mt-2 text-sm">
                                    <span className={report.readiness.ready ? "text-emerald-800" : "text-amber-900"}>
                                      {report.readiness.ready ? "READY" : "NOT READY"}
                                    </span>
                                    {report.readiness.reasons.length > 0 ? (
                                      <span className="text-muted-foreground">
                                        {" "}
                                        — {report.readiness.reasons.join(" ")}
                                      </span>
                                    ) : null}
                                  </p>
                                ) : null}
                              </li>
                            );
                          })}
                      </ul>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Non-functional requirements</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {workspace.nfrs.map((item) => (
            <li key={item.id} className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">{NFR_CATEGORY_LABEL[item.category]}</p>
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6">{item.description}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {REQUIREMENT_ITEM_STATUS_LABEL[item.status]}
                {item.measure ? ` · ${item.measure}` : ""}
              </p>
              {item.status === "PROPOSED" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <EntityAction productId={workspace.product.id} entityId={item.id} kind="nfr" label="Confirm" />
                  <EntityAction productId={workspace.product.id} entityId={item.id} kind="reject-nfr" label="Reject" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4">
          <h2 className="text-lg font-semibold">Open questions</h2>
          <ul className="mt-3 space-y-3">
            {workspace.questions.map((question) => (
              <li key={question.id} className="rounded-xl border p-3">
                <p className="text-sm font-medium">{question.question}</p>
                <p className="mt-1 text-sm text-muted-foreground">{question.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {QUESTION_STATUS_LABEL[question.status]} · {question.impact} impact
                </p>
                {question.answer ? <p className="mt-2 text-sm">{question.answer}</p> : null}
                {question.status === "OPEN" ? (
                  <AnswerForm productId={workspace.product.id} entityId={question.id} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <h2 className="text-lg font-semibold">Assumptions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Assumptions stay assumptions. They are not requirements.
          </p>
          <ul className="mt-3 space-y-3">
            {workspace.briefAssumptions.map((item) => (
              <li key={item.id} className="text-sm leading-6">
                {item.description}
                <span className="text-muted-foreground">
                  {" "}
                  · brief · {item.impact} · {item.status}
                </span>
              </li>
            ))}
            {workspace.assumptions.map((item) => (
              <li key={item.id} className="text-sm leading-6">
                {item.description}
                <span className="text-muted-foreground">
                  {" "}
                  · definition · {item.impact} · {item.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Traceability</h2>
          <p className="text-sm text-muted-foreground">
            Start from an outcome and follow what it requires. Open a story to walk back the same chain.
          </p>
        </div>
        <ul className="space-y-4">
          {workspace.outcomes.map((outcome) => (
            <li key={outcome.id} className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Product outcome</p>
              <p className="font-medium">{outcome.title}</p>
              <ul className="mt-3 space-y-3 border-l pl-4">
                {workspace.capabilities
                  .filter((capability) => capability.outcomeId === outcome.id)
                  .map((capability) => (
                    <li key={capability.id}>
                      <p className="text-xs text-muted-foreground">Capability</p>
                      <p className="text-sm font-medium">{capability.name}</p>
                      <ul className="mt-2 space-y-2 pl-3">
                        {epics
                          .filter((epic) => epic.capabilityId === capability.id)
                          .map((epic) => (
                            <li key={epic.id}>
                              <p className="text-xs text-muted-foreground">Epic</p>
                              <WorkLink item={epic} />
                              {features
                                .filter((feature) => feature.parentId === epic.id)
                                .map((feature) => (
                                  <div key={feature.id} className="mt-2 pl-3">
                                    <p className="text-xs text-muted-foreground">Feature</p>
                                    <WorkLink item={feature} />
                                    {stories
                                      .filter((story) => story.parentId === feature.id)
                                      .map((story) => (
                                        <div key={story.id} className="mt-2 pl-3">
                                          <p className="text-xs text-muted-foreground">Story</p>
                                          <WorkLink item={story} />
                                          <ul className="mt-1 space-y-1 pl-3">
                                            {workspace.criteria
                                              .filter((criterion) => criterion.workItemId === story.id)
                                              .map((criterion) => (
                                                <li key={criterion.id} className="text-sm text-muted-foreground">
                                                  {criterion.description}
                                                </li>
                                              ))}
                                          </ul>
                                        </div>
                                      ))}
                                  </div>
                                ))}
                            </li>
                          ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function WorkLink({
  item,
}: {
  item: {
    id: string;
    title: string;
    type: string;
    provenance: keyof typeof PROVENANCE_LABEL;
  };
}) {
  return (
    <p className="text-sm">
      <Link href={`/work-items/${item.id}`} className="font-medium hover:underline">
        {item.title}
      </Link>
      <span className="text-muted-foreground">
        {" "}
        · {item.type.toLowerCase()} · {PROVENANCE_LABEL[item.provenance]}
      </span>
    </p>
  );
}
