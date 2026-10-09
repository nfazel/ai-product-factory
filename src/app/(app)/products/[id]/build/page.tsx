import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AnswerEditor,
  BuildControls,
  CodebaseForm,
  DesignApprovalControls,
  DevelopmentContextPanel,
  ComponentEditor,
  ItemReview,
  LocalContextButton,
  PlanApprovalControls,
  ProposalActions,
  SummaryEditor,
  TaskEditor,
  TechnologyEditor,
} from "@/components/build/controls";
import { CodingPanel } from "@/components/build/coding-panel";
import { BuildReadiness, GovernancePanel } from "@/components/build/governance-panel";
import { CODING_EXECUTION_LABEL, CODING_RISK_LABEL } from "@/domain/constants";
import { PageSkeleton } from "@/components/feedback/states";
import {
  ADR_STATUS_LABEL,
  ARCHITECTURE_STATUS_LABEL,
  COMPONENT_TYPE_LABEL,
  type ArchitectureStatusName,
  RELATIONSHIP_TYPE_LABEL,
  SECURITY_AREA_LABEL,
  SECURITY_CLASSIFICATION_LABEL,
  SIGNAL_LEVEL_LABEL,
  SYSTEM_KIND_LABEL,
  type SignalLevel,
} from "@/domain/constants";
import { storedArchitectureSchema } from "@/modules/architecture/schema";
import { NextActionPanel } from "@/components/guidance/guidance-ui";
import { getProductGuidance } from "@/modules/guidance/service";
import { getBuildWorkspace } from "@/modules/architecture/service";
import { getProveView } from "@/modules/verification/service";
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
  const [workspace, prove, guidance] = await Promise.all([getBuildWorkspace(id), getProveView(id), getProductGuidance(id)]);
  if (!workspace || !guidance) notFound();

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
            label="Delivery plan"
            value={workspace.plan ? ARCHITECTURE_STATUS_LABEL[workspace.plan.status] : "Not started"}
          />
          <Status label="Coding readiness" value={workspace.coding.label} />
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {workspace.readiness.summary} Coding stays closed until a person has approved the brief,
          the definition, the first slice, the design, the delivery plan, the engineering review,
          and the coding rules, and no blocking finding remains.
        </p>
        {architecture?.reviewRequired ? (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            Design needs attention. {architecture.reviewReason}
          </p>
        ) : null}
        {workspace.plan?.reviewRequired ? (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            Delivery plan needs attention. {workspace.plan.reviewReason}
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
      {guidance.stage === "BUILD" || guidance.action?.stage === "BUILD" ? <NextActionPanel guidance={guidance} /> : null}

      <BuildReadiness coding={workspace.coding} />

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

      <DevelopmentContextPanel productId={id} developmentContext={workspace.developmentContext}>
        {context ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {SYSTEM_KIND_LABEL[context.systemKind]} · source {context.source}
          </p>
        ) : null}
        <LocalContextButton productId={id} />
        <CodebaseForm
          productId={id}
          repositoryName={context?.repositoryName ?? ""}
          repositoryUrl={context?.repositoryUrl ?? ""}
          defaultBranch={context?.defaultBranch ?? ""}
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
      </DevelopmentContextPanel>

      <section
        id="design"
        tabIndex={-1}
        className="scroll-mt-20 space-y-6 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
      <DesignReviewHeader
        productId={id}
        proposalOpen={Boolean(proposal?.success && workspace.proposal)}
        status={architecture?.status ?? null}
        reviewRequired={Boolean(architecture?.reviewRequired)}
        reviewReason={architecture?.reviewReason ?? ""}
        greenfield={workspace.developmentContext === "GREENFIELD"}
      />

      {proposal?.success && workspace.proposal ? (
        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Architecture proposal</h2>
          <p className="mt-2 text-sm leading-6">{proposal.data.assistantSummary}</p>
          <dl className="mt-4 space-y-3 text-sm leading-6">
            <div>
              <dt className="font-medium">Solution overview</dt>
              <dd>{proposal.data.architectureStyle}. {proposal.data.architectureSummary}</dd>
            </div>
            <div>
              <dt className="font-medium">Rationale</dt>
              <dd>{proposal.data.rationale}</dd>
            </div>
            <Approach label="Frontend" value={proposal.data.frontendApproach} />
            <Approach label="Backend" value={proposal.data.backendApproach} />
            <Approach label="Data and storage" value={proposal.data.dataApproach} />
            <Approach label="Interfaces" value={proposal.data.integrationApproach} />
            <Approach label="Security" value={proposal.data.securityApproach} />
            <Approach label="Deployment" value={proposal.data.deploymentApproach} />
            <Approach label="Observability" value={proposal.data.observabilityApproach} />
          </dl>
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
          <ProposalItems
            title="Components"
            productId={id}
            proposalId={workspace.proposal.id}
            section="components"
            items={proposal.data.components.map((item) => ({
              tempId: item.tempId,
              label: item.name,
              detail: item.description,
              notes: filled(
                `${COMPONENT_TYPE_LABEL[item.type]}. ${item.responsibilities}`,
                item.technology ? `Technology: ${item.technology}` : "",
                `Why it exists: ${item.rationale}`,
              ),
              reviewStatus: item.reviewStatus,
            }))}
          />
          <ProposalItems
            title="Relationships"
            productId={id}
            proposalId={workspace.proposal.id}
            section="relationships"
            items={proposal.data.relationships.map((item) => ({
              tempId: item.tempId,
              label: `${item.sourceTempId} ${RELATIONSHIP_TYPE_LABEL[item.relationshipType]} ${item.targetTempId}`,
              detail: item.description,
              reviewStatus: item.reviewStatus,
            }))}
          />
          <ProposalItems
            title="Technology choices"
            productId={id}
            proposalId={workspace.proposal.id}
            section="technologyDecisions"
            items={proposal.data.technologyDecisions.map((item) => ({
              tempId: item.tempId,
              label: item.choice,
              detail: item.reason,
              notes: filled(
                `Alternatives: ${item.alternatives}`,
                `Trade-offs: ${item.tradeoffs}`,
                item.relevantConstraint ? `Constraint: ${item.relevantConstraint}` : "",
              ),
              reviewStatus: item.reviewStatus,
            }))}
          />
          <ProposalItems
            title="Architecture decisions"
            productId={id}
            proposalId={workspace.proposal.id}
            section="adrs"
            items={proposal.data.adrs.map((item) => ({
              tempId: item.tempId,
              label: item.title,
              detail: item.decision,
              notes: filled(
                item.context,
                `Rationale: ${item.rationale}`,
                `Alternatives: ${item.alternatives}`,
                `Consequences: ${item.consequences}`,
              ),
              reviewStatus: item.reviewStatus,
            }))}
          />
          <ProposalItems
            title="Data design"
            productId={id}
            proposalId={workspace.proposal.id}
            section="dataDesign"
            items={proposal.data.dataDesign.map((item) => ({
              tempId: item.tempId,
              label: item.name,
              detail: item.description,
              notes: filled(
                `${item.classification}. Owner: ${item.owner || "Unassigned"}. Retention: ${item.retention || "Not confirmed"}.`,
                item.relationships ? `Relationships: ${item.relationships}` : "",
                item.externalSource ? `External source: ${item.externalSource}` : "",
              ),
              reviewStatus: item.reviewStatus,
            }))}
          />
          <ProposalItems
            title="Integrations"
            productId={id}
            proposalId={workspace.proposal.id}
            section="integrations"
            items={proposal.data.integrations.map((item) => ({
              tempId: item.tempId,
              label: item.name,
              detail: item.purpose,
              notes: filled(
                `${item.direction}. ${item.protocol}`.trim(),
                item.authenticationAssumption ? `Authentication: ${item.authenticationAssumption}` : "",
                item.dataExchanged ? `Data exchanged: ${item.dataExchanged}` : "",
                item.failureConsiderations ? `Failure: ${item.failureConsiderations}` : "",
              ),
              reviewStatus: item.reviewStatus,
            }))}
          />
          <ProposalItems
            title="Initial security assessment"
            productId={id}
            proposalId={workspace.proposal.id}
            section="securityAssessment"
            items={proposal.data.securityAssessment.map((item) => ({
              tempId: item.tempId,
              label: item.title,
              detail: item.description,
              notes: [`${SECURITY_AREA_LABEL[item.area]}. ${SECURITY_CLASSIFICATION_LABEL[item.classification]}`],
              reviewStatus: item.reviewStatus,
            }))}
          />
          <ProposalItems
            title="Non-functional requirement coverage"
            productId={id}
            proposalId={workspace.proposal.id}
            section="nfrCoverage"
            items={proposal.data.nfrCoverage.map((item) => ({
              tempId: item.tempId,
              label: item.mechanism,
              detail: item.nfrId,
              notes: filled(
                item.componentTempId ? `Component: ${item.componentTempId}` : "",
                item.adrTempId ? `Decision: ${item.adrTempId}` : "",
              ),
              reviewStatus: item.reviewStatus,
            }))}
          />
          <ProposalItems
            title="Open questions"
            productId={id}
            proposalId={workspace.proposal.id}
            section="architectureQuestions"
            items={proposal.data.architectureQuestions.map((item) => ({
              tempId: item.tempId,
              label: item.question,
              detail: item.reason,
              notes: [`Impact: ${item.impact}`],
              reviewStatus: item.reviewStatus,
            }))}
          />
          <ProposalItems
            title="Implementation tasks"
            productId={id}
            proposalId={workspace.proposal.id}
            section="tasks"
            items={proposal.data.implementationPlanProposal.tasks.map((item) => ({
              tempId: item.tempId,
              label: item.title,
              detail: item.objective,
              notes: filled(
                item.risks ? `Risks: ${item.risks}` : "",
                item.dependsOn.length > 0 ? `Depends on: ${item.dependsOn.join(", ")}` : "",
                `Validation: ${item.validation}`,
                item.guidance ? `Implementation: ${item.guidance}` : "",
              ),
              reviewStatus: item.reviewStatus,
            }))}
          />
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
          This is an initial assessment recorded with the design. The engineering review is the
          independent check of security and engineering risk. This is not a penetration test.
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
      </section>

      <section
        id="plan"
        tabIndex={-1}
        className="scroll-mt-20 space-y-6 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Delivery plan</h2>
        <p className="mt-2 text-sm font-medium">
          {workspace.plan?.reviewRequired
            ? "Changes required"
            : workspace.plan
              ? ARCHITECTURE_STATUS_LABEL[workspace.plan.status]
              : planProposal?.success
                ? "Draft"
                : "Not generated"}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {workspace.plan?.reviewRequired
            ? workspace.plan.reviewReason
            : workspace.plan
              ? "The committed delivery plan stays separate from approval. Prepare it, then approve it. Approval does not start coding."
              : planProposal?.success
                ? "This delivery plan is a draft. Accept and commit it before approval. Opening this review does not approve it."
                : "A delivery plan has not been generated yet."}
        </p>
        {workspace.plan && workspace.plan.status !== "APPROVED" ? (
          <div className="mt-4">
            <PlanApprovalControls productId={id} />
          </div>
        ) : null}
      </div>

      {planProposal?.success && workspace.planProposal ? (
        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Delivery plan proposal</h2>
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
        <h2 className="text-base font-semibold">Committed plan</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {workspace.plan?.summary || "No delivery plan has been committed."}
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
                    <TaskCodingRisk
                      risk={workspace.governance.review?.codingRisks.find(
                        (item) => item.implementationTaskId === task.id,
                      )}
                    />
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
      </section>

      <GovernancePanel productId={id} governance={workspace.governance} />
      <section id="code" tabIndex={-1} className="scroll-mt-20 space-y-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
        <h2 className="text-lg font-semibold">Code</h2>
        <p className="text-sm text-muted-foreground">One approved task at a time. The coding assistant cannot approve its own change.</p>
        {workspace.codingExecution ? (
          <CodingPanel productId={id} coding={workspace.codingExecution} />
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Coding has not started. Approve the design, the delivery plan, the engineering review, and a coding task first.
          </p>
        )}
      </section>
      <section className="rounded-2xl border bg-card p-5">
        <p className="text-xs font-medium tracking-wide text-indigo-700">VERIFICATION</p>
        <h2 className="text-lg font-semibold">Task verification</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {prove?.readiness.label ?? "NOT VERIFIED"}
          {prove?.readiness.reasons[0] ? `. ${prove.readiness.reasons[0]}` : ""}
        </p>
        <Link href={`/products/${id}/testing`} className="mt-3 inline-block text-sm font-medium text-indigo-800">
          Open Prove
        </Link>
      </section>
    </div>
  );
}

function filled(...parts: Array<string | false | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.trim()));
}

function Approach({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DesignReviewHeader({
  productId,
  proposalOpen,
  status,
  reviewRequired,
  reviewReason,
  greenfield,
}: {
  productId: string;
  proposalOpen: boolean;
  status: ArchitectureStatusName | null;
  reviewRequired: boolean;
  reviewReason: string;
  greenfield: boolean;
}) {
  const label = reviewRequired
    ? "Changes required"
    : status
      ? ARCHITECTURE_STATUS_LABEL[status]
      : proposalOpen
        ? "Draft"
        : "Not generated";
  const detail = reviewRequired
    ? reviewReason || "The design changed after it was approved."
    : status === "APPROVED"
      ? "A person approved this design. The product stage was not changed."
      : status === "READY_FOR_REVIEW"
        ? "The design is ready for a person's approval. Approve Design records that decision and does not move the product to Prove."
        : status
          ? "The committed design is still a draft. Prepare it for approval, then use Approve Design. Preparing it does not approve it."
          : proposalOpen
            ? "This generated design is a draft. Review the sections below, accept or reject each item, and edit where you need to. Commit the items you accept before approval. Opening this review does not approve the design."
            : "Design has not been generated yet.";
  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5">
      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Design review</p>
      <h2 className="mt-1 text-lg font-semibold">Design</h2>
      <p className="mt-2 text-sm font-medium">{label}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      {greenfield ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This is a new application. Review and approval do not need an existing codebase.
        </p>
      ) : null}
      {status && status !== "APPROVED" ? (
        <div className="mt-4">
          <DesignApprovalControls productId={productId} />
        </div>
      ) : null}
      {!status ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Design approval is available after accepted items are committed and the design is prepared for approval.
        </p>
      ) : null}
    </div>
  );
}

function ProposalItems({
  title,
  productId,
  proposalId,
  section,
  items,
}: {
  title: string;
  productId: string;
  proposalId: string;
  section: string;
  items: { tempId: string; label: string; detail: string; notes?: string[]; reviewStatus: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-2 space-y-3">
        {items.map((item) => (
          <li key={item.tempId} className="rounded-xl border p-3">
            <p className="font-medium">{item.label}</p>
            {item.detail ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p> : null}
            {item.notes?.map((note) => (
              <p key={note} className="mt-1 text-sm leading-6 text-muted-foreground">{note}</p>
            ))}
            <p className="text-sm text-muted-foreground">{item.reviewStatus}</p>
            <ItemReview productId={productId} proposalId={proposalId} section={section} tempId={item.tempId} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskCodingRisk({
  risk,
}: {
  risk:
    | {
        riskLevel: keyof typeof CODING_RISK_LABEL;
        recommendedExecutionMode: keyof typeof CODING_EXECUTION_LABEL;
        reason: string;
        overrideRiskLevel: keyof typeof CODING_RISK_LABEL | null;
        overrideExecutionMode: keyof typeof CODING_EXECUTION_LABEL | null;
        overrideReason: string;
        overriddenBy: string;
        implementationTaskId: string;
      }
    | undefined;
}) {
  if (!risk) return null;
  const level = risk.overrideRiskLevel ?? risk.riskLevel;
  const mode = risk.overrideExecutionMode ?? risk.recommendedExecutionMode;
  return (
    <p className="text-muted-foreground">
      AI coding risk {CODING_RISK_LABEL[level]}. Recommended mode {CODING_EXECUTION_LABEL[mode]}. {risk.reason}
      {risk.overriddenBy ? ` Human override by ${risk.overriddenBy}: ${risk.overrideReason}` : ""}
    </p>
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
