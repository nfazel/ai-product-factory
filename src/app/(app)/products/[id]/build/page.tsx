import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AnswerEditor,
  BuildControls,
  CodebaseForm,
  ComponentEditor,
  ItemReview,
  LocalContextButton,
  ProposalActions,
  SummaryEditor,
  TaskEditor,
  TechnologyEditor,
} from "@/components/build/controls";
import { PageSkeleton } from "@/components/feedback/states";
import {
  ADR_STATUS_LABEL,
  ARCHITECTURE_STATUS_LABEL,
  COMPONENT_TYPE_LABEL,
  RELATIONSHIP_TYPE_LABEL,
  SECURITY_AREA_LABEL,
  SECURITY_CLASSIFICATION_LABEL,
  SIGNAL_LEVEL_LABEL,
  SYSTEM_KIND_LABEL,
  type SignalLevel,
} from "@/domain/constants";
import { storedArchitectureSchema } from "@/modules/architecture/schema";
import { getBuildWorkspace } from "@/modules/architecture/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Build" };
export const maxDuration = 60;

const LEVEL_TONE: Record<SignalLevel, string> = {
  LOW: "bg-stone-100 text-stone-700",
  MEDIUM: "bg-amber-50 text-amber-900",
  HIGH: "bg-emerald-50 text-emerald-800",
};

export default function BuildPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ component?: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Build params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Build({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ component?: string }>;
}) {
  await markDynamic();
  const { id } = await params;
  const query = await searchParams;
  const workspace = await getBuildWorkspace(id);
  if (!workspace) notFound();

  const architecture = workspace.architecture;
  const selected =
    architecture?.components.find((component) => component.id === query.component) ??
    architecture?.components[0] ??
    null;
  const proposal = workspace.proposal
    ? storedArchitectureSchema.safeParse(workspace.proposal.payload)
    : null;
  const planProposal = workspace.planProposal
    ? storedArchitectureSchema.safeParse(workspace.planProposal.payload)
    : null;
  const tasks = workspace.plan?.tasks ?? [];
  const slices = groupBy(tasks, (task) => task.verticalSlice || "Unassigned");
  const context = workspace.context;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border bg-card p-4 sm:p-5">
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Build
        </p>
        <div className="mt-2 grid gap-4 lg:grid-cols-3">
          <Status
            label="Architecture status"
            value={
              architecture
                ? ARCHITECTURE_STATUS_LABEL[architecture.status]
                : "Not started"
            }
          />
          <Status
            label="Implementation plan status"
            value={workspace.plan ? ARCHITECTURE_STATUS_LABEL[workspace.plan.status] : "Not started"}
          />
          <Status label="Coding readiness" value={workspace.coding.label} />
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {workspace.readiness.summary} Coding stays closed until a person has approved both the
          solution architecture and the implementation plan. The Coding Agent is not available yet.
        </p>
        {architecture?.reviewRequired ? (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            Architecture review required. {architecture.reviewReason}
          </p>
        ) : null}
        {workspace.plan?.reviewRequired ? (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            Implementation Plan review required. {workspace.plan.reviewReason}
          </p>
        ) : null}
        {architecture?.seededDemo || workspace.plan?.seededDemo ? (
          <p className="mt-3 text-sm leading-6 text-amber-900">
            Demo data. This architecture and implementation plan were prepared for the sample
            product. They were not produced by an Architecture Agent run.
          </p>
        ) : null}
        {workspace.entryReasons.length > 0 ? (
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            {workspace.entryReasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </div>
        ) : null}
        <div className="mt-4">
          <BuildControls productId={id} />
        </div>
      </header>

      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Technical readiness</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {workspace.readiness.areas.map((area) => (
            <li key={area.key} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{area.label}</p>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${LEVEL_TONE[area.level]}`}>
                  {SIGNAL_LEVEL_LABEL[area.level]}
                </span>
              </div>
              {area.level !== "HIGH" ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{area.explanation}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Codebase context</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {context
            ? `${SYSTEM_KIND_LABEL[context.systemKind]} · source ${context.source}`
            : "No codebase context yet. Enter it manually, or read a configured project directory. GitHub and repository cloning are not connected."}
        </p>
        <div className="mt-4 space-y-4">
          <LocalContextButton productId={id} />
          <CodebaseForm
            productId={id}
            repositoryName={context?.repositoryName ?? ""}
            repositoryUrl={context?.repositoryUrl ?? ""}
            defaultBranch={context?.defaultBranch ?? ""}
            systemKind={context?.systemKind ?? "GREENFIELD"}
            languages={asList(context?.languages)}
            frameworks={asList(context?.frameworks)}
            databaseTechnologies={asList(context?.databaseTechnologies)}
            infrastructure={context?.infrastructure ?? ""}
            deploymentPlatform={context?.deploymentPlatform ?? ""}
            architectureSummary={context?.architectureSummary ?? ""}
            keyDirectories={asList(context?.keyDirectories)}
            keyComponents={asList(context?.keyComponents)}
            knownIntegrations={asList(context?.knownIntegrations)}
            constraints={context?.constraints ?? ""}
            observations={context?.observations ?? ""}
          />
        </div>
      </section>

      {proposal?.success && workspace.proposal ? (
        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Architecture proposal</h2>
          <p className="mt-2 text-sm leading-6">{proposal.data.assistantSummary}</p>
          <div className="mt-4">
            <ProposalActions productId={id} proposalId={workspace.proposal.id} kind="ARCHITECTURE" />
          </div>
          <div className="mt-4">
            <SummaryEditor
              productId={id}
              proposalId={workspace.proposal.id}
              architectureStyle={proposal.data.architectureStyle}
              summary={proposal.data.architectureSummary}
              rationale={proposal.data.rationale}
            />
          </div>
          <ul className="mt-4 space-y-3">
            {proposal.data.components.map((component) => (
              <li key={component.tempId} className="rounded-xl border p-3">
                <p className="font-medium">{component.name}</p>
                <p className="text-sm text-muted-foreground">{component.reviewStatus}</p>
                <ItemReview
                  productId={id}
                  proposalId={workspace.proposal!.id}
                  section="components"
                  tempId={component.tempId}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Architecture</h2>
        {architecture ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="space-y-3">
              <p className="text-sm leading-6">{architecture.summary}</p>
              <p className="text-sm leading-6 text-muted-foreground">{architecture.rationale}</p>
              <SummaryEditor
                productId={id}
                architectureStyle={architecture.architectureStyle}
                summary={architecture.summary}
                rationale={architecture.rationale}
              />
              <ul className="space-y-2">
                {architecture.components.map((component) => (
                  <li key={component.id}>
                    <Link
                      href={`/products/${id}/build?component=${component.id}`}
                      className={`block rounded-xl border p-3 text-sm ${
                        selected?.id === component.id ? "border-indigo-400 bg-indigo-50" : ""
                      }`}
                    >
                      <span className="font-medium">{component.name}</span>
                      <span className="mt-1 block text-muted-foreground">
                        {COMPONENT_TYPE_LABEL[component.type]}
                        {component.technology ? ` · ${component.technology}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div>
                <h3 className="text-sm font-medium">Relationships</h3>
                <ul className="mt-2 space-y-2 text-sm leading-6">
                  {architecture.relationships.map((relationship) => (
                    <li key={relationship.id}>
                      {relationship.sourceComponent.name}{" "}
                      {RELATIONSHIP_TYPE_LABEL[relationship.relationshipType]}{" "}
                      {relationship.targetComponent.name}
                      {relationship.description ? `. ${relationship.description}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="space-y-4">
              {selected ? (
                <div className="rounded-xl border p-4">
                  <h3 className="font-medium">{selected.name}</h3>
                  <p className="mt-2 text-sm leading-6">{selected.description}</p>
                  <p className="mt-2 text-sm leading-6">
                    <span className="font-medium">Responsibilities. </span>
                    {selected.responsibilities}
                  </p>
                  <p className="mt-2 text-sm leading-6">
                    <span className="font-medium">Technology. </span>
                    {selected.technology || "Not chosen"}
                  </p>
                  <p className="mt-2 text-sm leading-6">
                    <span className="font-medium">Why it exists. </span>
                    {selected.rationale}
                  </p>
                  <TraceList
                    title="Supported capabilities"
                    items={selected.traces.flatMap((trace) =>
                      trace.capability ? [trace.capability.name] : [],
                    )}
                  />
                  <TraceList
                    title="Related requirements"
                    items={selected.traces.flatMap((trace) =>
                      trace.workItem ? [`${trace.workItem.type}: ${trace.workItem.title}`] : [],
                    )}
                  />
                  <TraceList
                    title="Related non-functional requirements"
                    items={selected.traces.flatMap((trace) => (trace.nfr ? [trace.nfr.title] : []))}
                  />
                  <TraceList
                    title="Related decisions"
                    items={selected.traces.flatMap((trace) => (trace.adr ? [trace.adr.title] : []))}
                  />
                  <div className="mt-4">
                    <ComponentEditor
                      productId={id}
                      componentId={selected.id}
                      name={selected.name}
                      responsibilities={selected.responsibilities}
                      technology={selected.technology}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No components yet.</p>
              )}
              <pre className="overflow-x-auto rounded-xl bg-stone-950 p-4 text-xs leading-5 text-stone-100">
                {workspace.diagram}
              </pre>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Commit an accepted architecture proposal to see components and relationships.
          </p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Technology choices</h2>
          <ul className="mt-3 space-y-4">
            {(architecture?.technologies ?? []).map((choice) => (
              <li key={choice.id} className="rounded-xl border p-3 text-sm leading-6">
                <p className="font-medium">{choice.choice}</p>
                <p>{choice.reason}</p>
                <p className="text-muted-foreground">Alternatives: {choice.alternatives}</p>
                <p className="text-muted-foreground">Trade-offs: {choice.tradeoffs}</p>
                {choice.relevantConstraint ? (
                  <p className="text-muted-foreground">Constraint: {choice.relevantConstraint}</p>
                ) : null}
                <TechnologyEditor
                  productId={id}
                  choiceId={choice.id}
                  choice={choice.choice}
                  reason={choice.reason}
                  alternatives={choice.alternatives}
                />
              </li>
            ))}
            {(architecture?.technologies.length ?? 0) === 0 ? (
              <li className="text-sm text-muted-foreground">No technology choices yet.</li>
            ) : null}
          </ul>
        </article>
        <article className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Architecture decisions</h2>
          <ul className="mt-3 space-y-3">
            {(architecture?.decisions ?? []).map((decision) => (
              <li key={decision.id} className="rounded-xl border p-3 text-sm leading-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{decision.title}</p>
                  <span className="text-xs">{ADR_STATUS_LABEL[decision.status]}</span>
                </div>
                <p>{decision.decision}</p>
                <p className="text-muted-foreground">{decision.rationale}</p>
                <p className="text-muted-foreground">Alternatives: {decision.alternatives}</p>
              </li>
            ))}
            {(architecture?.decisions.length ?? 0) === 0 ? (
              <li className="text-sm text-muted-foreground">No architecture decisions yet.</li>
            ) : null}
          </ul>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Data design</h2>
          <ul className="mt-3 space-y-3 text-sm leading-6">
            {(architecture?.dataEntities ?? []).map((entity) => (
              <li key={entity.id}>
                <p className="font-medium">
                  {entity.name} · {entity.classification}
                </p>
                <p>{entity.description}</p>
                <p className="text-muted-foreground">
                  Owner: {entity.owner || "Unassigned"}. Retention: {entity.retention || "Not confirmed"}.
                </p>
              </li>
            ))}
            {(architecture?.dataEntities.length ?? 0) === 0 ? (
              <li className="text-muted-foreground">No logical data entities yet.</li>
            ) : null}
          </ul>
        </article>
        <article className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Integrations</h2>
          <ul className="mt-3 space-y-3 text-sm leading-6">
            {(architecture?.integrations ?? []).map((integration) => (
              <li key={integration.id}>
                <p className="font-medium">
                  {integration.name} · {integration.direction}
                </p>
                <p>{integration.purpose}</p>
                <p className="text-muted-foreground">
                  {integration.protocol}. Failure: {integration.failureConsiderations}
                </p>
              </li>
            ))}
            {(architecture?.integrations.length ?? 0) === 0 ? (
              <li className="text-muted-foreground">No integrations proposed.</li>
            ) : null}
          </ul>
        </article>
      </section>

      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Initial Architecture Security Assessment</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This is an initial assessment recorded with the architecture. It is not a full security
          review. A Security Agent will be introduced later.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {(architecture?.findings ?? []).map((finding) => (
            <li key={finding.id} className="rounded-xl border p-3 text-sm leading-6">
              <p className="font-medium">{SECURITY_AREA_LABEL[finding.area]}</p>
              <p>{finding.title}</p>
              <p className="text-muted-foreground">{finding.description}</p>
              <p className="text-xs font-medium">{SECURITY_CLASSIFICATION_LABEL[finding.classification]}</p>
            </li>
          ))}
          {(architecture?.findings.length ?? 0) === 0 ? (
            <li className="text-sm text-muted-foreground">No security findings yet.</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Non-functional requirement coverage</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6">
          {(architecture?.nfrCoverages ?? []).map((coverage) => (
            <li key={coverage.id}>
              {coverage.nfr.title} → {coverage.mechanism}
              {coverage.component ? ` (${coverage.component.name})` : ""}
              {coverage.adr ? ` · ${coverage.adr.title}` : ""}
            </li>
          ))}
          {(architecture?.nfrCoverages.length ?? 0) === 0 ? (
            <li className="text-muted-foreground">No coverage links yet.</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Open questions</h2>
        <ul className="mt-3 space-y-4">
          {(architecture?.questions ?? []).map((question) => (
            <li key={question.id} className="rounded-xl border p-3 text-sm leading-6">
              <p className="font-medium">{question.question}</p>
              <p className="text-muted-foreground">{question.reason}</p>
              <p>
                {question.status} · {question.impact}
                {question.answer ? ` · ${question.answer}` : ""}
              </p>
              {question.status === "OPEN" ? (
                <AnswerEditor productId={id} questionId={question.id} />
              ) : null}
            </li>
          ))}
          {(architecture?.questions.length ?? 0) === 0 ? (
            <li className="text-sm text-muted-foreground">No architecture questions.</li>
          ) : null}
        </ul>
      </section>

      {planProposal?.success && workspace.planProposal ? (
        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Implementation plan proposal</h2>
          <p className="mt-2 text-sm leading-6">{planProposal.data.implementationPlanProposal.summary}</p>
          <div className="mt-4">
            <ProposalActions
              productId={id}
              proposalId={workspace.planProposal.id}
              kind="IMPLEMENTATION_PLAN"
            />
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Implementation plan</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {workspace.plan?.summary || "No implementation plan has been committed."}
        </p>
        <div className="mt-4 space-y-6">
          {[...slices.entries()].map(([slice, sliceTasks]) => (
            <div key={slice}>
              <h3 className="text-sm font-semibold">Vertical slice: {slice}</h3>
              <ol className="mt-3 space-y-3">
                {sliceTasks.map((task) => (
                  <li key={task.id} className="rounded-xl border p-3 text-sm leading-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {task.sequence}. {task.title}
                      </p>
                      <p className="text-xs">
                        {task.status} · {task.complexity}
                        {task.parallelisable ? " · PARALLEL" : ""}
                      </p>
                    </div>
                    <p>{task.objective}</p>
                    {task.workItem ? (
                      <p className="text-muted-foreground">
                        Supports {task.workItem.type.toLowerCase()}: {task.workItem.title}
                        {task.workItem.parent ? ` · ${task.workItem.parent.title}` : ""}
                      </p>
                    ) : null}
                    {task.workItem?.acceptanceCriteria.length ? (
                      <p className="text-muted-foreground">
                        Acceptance criteria:{" "}
                        {task.workItem.acceptanceCriteria.map((item) => item.description).join(" ")}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">
                      Components:{" "}
                      {task.components.map((link) => link.component.name).join(", ") || "Not linked"}
                    </p>
                    <p className="text-muted-foreground">Validation: {task.validation}</p>
                    {task.dependencies.length > 0 ? (
                      <p className="font-medium text-amber-900">
                        BLOCKED BY {task.dependencies.map((item) => item.dependsOn.title).join(", ")}
                      </p>
                    ) : null}
                    {task.dependents.length > 0 ? (
                      <p className="text-muted-foreground">
                        ENABLES {task.dependents.map((item) => item.task.title).join(", ")}
                      </p>
                    ) : null}
                    <TaskEditor
                      productId={id}
                      taskId={task.id}
                      title={task.title}
                      objective={task.objective}
                      validation={task.validation}
                      guidance={task.guidance}
                    />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function TraceList({ title, items }: { title: string; items: string[] }) {
  const unique = [...new Set(items)];
  return (
    <div className="mt-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm leading-6 text-muted-foreground">
        {unique.length > 0 ? unique.join(", ") : "None linked"}
      </p>
    </div>
  );
}

function asList(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.filter((item): item is string => typeof item === "string").join(", ");
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = key(item);
    groups.set(name, [...(groups.get(name) ?? []), item]);
  }
  return groups;
}
