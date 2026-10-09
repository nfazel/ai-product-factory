"use client";

import { useActionState, type ReactNode } from "react";

import { FormMessage, SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  acceptArchitectureProposalAction,
  answerQuestionAction,
  approveArchitectureAction,
  approvePlanAction,
  captureLocalContextAction,
  chooseDevelopmentContextAction,
  saveContextAction,
  commitArchitectureAction,
  commitPlanAction,
  editComponentAction,
  editSummaryAction,
  editTaskAction,
  editTechnologyAction,
  generateArchitectureAction,
  generatePlanAction,
  markArchitectureReadyAction,
  markPlanReadyAction,
  regenerateArchitectureAction,
  reviewArchitectureAction,
  reviewProposalAction,
} from "@/server/actions/architecture";
import { ARCHITECTURE_SECTIONS, ARCHITECTURE_SECTION_LABEL } from "@/domain/constants";

function ProductForm({
  productId,
  action,
  label,
  pendingLabel,
  variant = "outline",
}: {
  productId: string;
  action: typeof generateArchitectureAction;
  label: string;
  pendingLabel: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <SubmitButton pendingLabel={pendingLabel} variant={variant}>
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function BuildControls({ productId }: { productId: string }) {
  const [regenState, regenAction] = useActionState(regenerateArchitectureAction, idleState);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <ProductForm
          productId={productId}
          action={generateArchitectureAction}
          label="Generate design"
          pendingLabel="Generating architecture…"
        />
        <ProductForm
          productId={productId}
          action={reviewArchitectureAction}
          label="Request AI review"
          pendingLabel="Reviewing…"
          variant="outline"
        />
        <ProductForm
          productId={productId}
          action={generatePlanAction}
          label="Generate delivery plan"
          pendingLabel="Generating plan…"
          variant="secondary"
        />
      </div>
      <form action={regenAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="productId" value={productId} />
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Regenerate a section</span>
          <select name="section" className="h-10 rounded-md border bg-background px-3">
            {ARCHITECTURE_SECTIONS.map((section) => (
              <option key={section} value={section}>
                {ARCHITECTURE_SECTION_LABEL[section]}
              </option>
            ))}
          </select>
        </label>
        <TextField label="Feature, if regenerating tasks" name="featureTitle" />
        <SubmitButton pendingLabel="Regenerating…" variant="outline">
          Regenerate section
        </SubmitButton>
      </form>
      <FormMessage state={regenState} />
    </div>
  );
}

export function DesignApprovalControls({ productId }: { productId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ProductForm
        productId={productId}
        action={markArchitectureReadyAction}
        label="Prepare design for approval"
        pendingLabel="Saving…"
        variant="outline"
      />
      <ProductForm
        productId={productId}
        action={approveArchitectureAction}
        label="Approve Design"
        pendingLabel="Approving…"
      />
    </div>
  );
}

export function PlanApprovalControls({ productId }: { productId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ProductForm
        productId={productId}
        action={markPlanReadyAction}
        label="Prepare delivery plan"
        pendingLabel="Saving…"
        variant="outline"
      />
      <ProductForm
        productId={productId}
        action={approvePlanAction}
        label="Approve Delivery Plan"
        pendingLabel="Approving…"
      />
    </div>
  );
}

export function ProposalActions({
  productId,
  proposalId,
  kind,
}: {
  productId: string;
  proposalId: string;
  kind: "ARCHITECTURE" | "IMPLEMENTATION_PLAN";
}) {
  const [acceptState, acceptAction] = useActionState(acceptArchitectureProposalAction, idleState);
  const [commitState, commitAction] = useActionState(
    kind === "ARCHITECTURE" ? commitArchitectureAction : commitPlanAction,
    idleState,
  );
  return (
    <div className="flex flex-wrap gap-2">
      <form action={acceptAction}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="proposalId" value={proposalId} />
        <SubmitButton pendingLabel="Accepting…" variant="outline">
          Accept proposal
        </SubmitButton>
      </form>
      <form action={commitAction}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="proposalId" value={proposalId} />
        <SubmitButton pendingLabel="Committing…">Commit accepted items</SubmitButton>
      </form>
      <FormMessage state={acceptState} />
      <FormMessage state={commitState} />
    </div>
  );
}

export function ItemReview({
  productId,
  proposalId,
  section,
  tempId,
}: {
  productId: string;
  proposalId: string;
  section: string;
  tempId: string;
}) {
  const [state, action] = useActionState(reviewProposalAction, idleState);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(["ACCEPTED", "REJECTED"] as const).map((status) => (
          <form key={status} action={action}>
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="proposalId" value={proposalId} />
            <input type="hidden" name="section" value={section} />
            <input type="hidden" name="tempId" value={tempId} />
            <input type="hidden" name="status" value={status} />
            <SubmitButton pendingLabel="Saving…" variant={status === "ACCEPTED" ? "outline" : "secondary"}>
              {status === "ACCEPTED" ? "Accept" : "Reject"}
            </SubmitButton>
          </form>
        ))}
      </div>
      <FormMessage state={state} />
    </div>
  );
}

export function SummaryEditor({
  productId,
  proposalId,
  architectureStyle,
  summary,
  rationale,
}: {
  productId: string;
  proposalId?: string;
  architectureStyle: string;
  summary: string;
  rationale: string;
}) {
  const [state, action] = useActionState(editSummaryAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      {proposalId ? <input type="hidden" name="proposalId" value={proposalId} /> : null}
      <TextField label="Architecture style" name="architectureStyle" defaultValue={architectureStyle} />
      <TextAreaField label="Summary" name="summary" defaultValue={summary} />
      <TextAreaField label="Rationale" name="rationale" defaultValue={rationale} />
      <SubmitButton pendingLabel="Saving…" variant="outline">
        Save summary
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ComponentEditor({
  productId,
  componentId,
  name,
  responsibilities,
  technology,
}: {
  productId: string;
  componentId: string;
  name: string;
  responsibilities: string;
  technology: string;
}) {
  const [state, action] = useActionState(editComponentAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="recordId" value={componentId} />
      <TextField label="Name" name="title" defaultValue={name} />
      <TextField label="Technology" name="technology" defaultValue={technology} />
      <TextAreaField label="Responsibilities" name="body" defaultValue={responsibilities} />
      <SubmitButton pendingLabel="Saving…" variant="outline">
        Save component
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function TechnologyEditor({
  productId,
  choiceId,
  choice,
  reason,
  alternatives,
}: {
  productId: string;
  choiceId: string;
  choice: string;
  reason: string;
  alternatives: string;
}) {
  const [state, action] = useActionState(editTechnologyAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="recordId" value={choiceId} />
      <TextField label="Choice" name="title" defaultValue={choice} />
      <TextAreaField label="Reason" name="body" defaultValue={reason} />
      <TextAreaField label="Alternatives" name="alternatives" defaultValue={alternatives} />
      <SubmitButton pendingLabel="Saving…" variant="outline">
        Save technology choice
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function TaskEditor({
  productId,
  taskId,
  title,
  objective,
  validation,
  guidance,
}: {
  productId: string;
  taskId: string;
  title: string;
  objective: string;
  validation: string;
  guidance: string;
}) {
  const [state, action] = useActionState(editTaskAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="recordId" value={taskId} />
      <TextField label="Task" name="title" defaultValue={title} />
      <TextAreaField label="Objective" name="body" defaultValue={objective} />
      <TextAreaField label="Validation expectations" name="validation" defaultValue={validation} />
      <TextAreaField label="Implementation guidance" name="guidance" defaultValue={guidance} />
      <SubmitButton pendingLabel="Saving…" variant="outline">
        Save task
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AnswerEditor({
  productId,
  questionId,
}: {
  productId: string;
  questionId: string;
}) {
  const [state, action] = useActionState(answerQuestionAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="questionId" value={questionId} />
      <TextAreaField label="Answer" name="answer" />
      <SubmitButton pendingLabel="Saving…" variant="outline">
        Save answer
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function CodebaseForm({
  productId,
  repositoryName,
  repositoryUrl,
  defaultBranch,
  languages,
  frameworks,
  databaseTechnologies,
  infrastructure,
  deploymentPlatform,
  architectureSummary,
  keyDirectories,
  keyComponents,
  knownIntegrations,
  constraints,
  observations,
}: {
  productId: string;
  repositoryName: string;
  repositoryUrl: string;
  defaultBranch: string;
  languages: string;
  frameworks: string;
  databaseTechnologies: string;
  infrastructure: string;
  deploymentPlatform: string;
  architectureSummary: string;
  keyDirectories: string;
  keyComponents: string;
  knownIntegrations: string;
  constraints: string;
  observations: string;
}) {
  const [state, action] = useActionState(saveContextAction, idleState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="productId" value={productId} />
      <TextField label="Repository name" name="repositoryName" defaultValue={repositoryName} />
      <TextField label="Repository URL" name="repositoryUrl" defaultValue={repositoryUrl} />
      <TextField label="Default branch" name="defaultBranch" defaultValue={defaultBranch} />
      <input type="hidden" name="systemKind" value="EXISTING_SYSTEM" />
      <TextField label="Languages" name="languages" defaultValue={languages} />
      <TextField label="Frameworks" name="frameworks" defaultValue={frameworks} />
      <TextField label="Databases" name="databaseTechnologies" defaultValue={databaseTechnologies} />
      <TextField label="Deployment platform" name="deploymentPlatform" defaultValue={deploymentPlatform} />
      <TextAreaField label="Infrastructure" name="infrastructure" defaultValue={infrastructure} />
      <TextAreaField label="Architecture summary" name="architectureSummary" defaultValue={architectureSummary} />
      <TextField label="Key directories" name="keyDirectories" defaultValue={keyDirectories} />
      <TextField label="Key components" name="keyComponents" defaultValue={keyComponents} />
      <TextField label="Known integrations" name="knownIntegrations" defaultValue={knownIntegrations} />
      <TextAreaField label="Constraints" name="constraints" defaultValue={constraints} />
      <TextAreaField label="Observations" name="observations" defaultValue={observations} />
      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Saving…" variant="outline">
          Save codebase context
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function ContextChoice({
  productId,
  value,
  label,
  detail,
  pendingLabel,
}: {
  productId: string;
  value: "GREENFIELD" | "EXISTING_SYSTEM";
  label: string;
  detail: string;
  pendingLabel: string;
}) {
  const [state, action] = useActionState(chooseDevelopmentContextAction, idleState);
  return (
    <form action={action} className="rounded-xl border p-4">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="developmentContext" value={value} />
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
      <div className="mt-3">
        <SubmitButton pendingLabel={pendingLabel}>{label}</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function DevelopmentContextPanel({
  productId,
  developmentContext,
  children,
}: {
  productId: string;
  developmentContext: "GREENFIELD" | "EXISTING_SYSTEM" | null;
  children: ReactNode;
}) {
  return (
    <section id="context" tabIndex={-1} className="scroll-mt-20 space-y-4 rounded-2xl border bg-card p-4 focus:outline-none target:ring-2 target:ring-indigo-500 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">What are we building?</h2>
        {developmentContext === "GREENFIELD" ? (
          <p className="mt-2 text-sm leading-6">
            New application. No existing codebase required. The initial technical foundation will be created from the approved product definition and architecture.
          </p>
        ) : developmentContext === "EXISTING_SYSTEM" ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Existing application. Add the repository that already exists. Reading it does not publish a branch or open a pull request.
          </p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Choose whether this product starts from a new codebase or builds on one that already exists.
          </p>
        )}
      </div>
      {developmentContext === null ? (
        <div className="grid gap-3 md:grid-cols-2">
          <ContextChoice
            productId={productId}
            value="GREENFIELD"
            label="New application"
            detail="Start from a new codebase."
            pendingLabel="Saving…"
          />
          <ContextChoice
            productId={productId}
            value="EXISTING_SYSTEM"
            label="Existing application"
            detail="Build on an existing codebase."
            pendingLabel="Saving…"
          />
        </div>
      ) : null}
      {developmentContext === "GREENFIELD" ? (
        <ContextChoice
          productId={productId}
          value="EXISTING_SYSTEM"
          label="Switch to an existing application"
          detail="Saved repository details stay available if you switch back."
          pendingLabel="Saving…"
        />
      ) : null}
      {developmentContext === "EXISTING_SYSTEM" ? (
        <>
          <ContextChoice
            productId={productId}
            value="GREENFIELD"
            label="Switch to a new application"
            detail="Saved repository details are kept, and a codebase is no longer required."
            pendingLabel="Saving…"
          />
          {children}
        </>
      ) : null}
    </section>
  );
}

export function LocalContextButton({ productId }: { productId: string }) {
  const [state, action] = useActionState(captureLocalContextAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <SubmitButton pendingLabel="Reading…" variant="outline">
        Read configured project
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
