"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  acceptArchitectureProposalAction,
  answerQuestionAction,
  approveArchitectureAction,
  approvePlanAction,
  captureLocalContextAction,
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
  variant = "default",
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
          label="Generate architecture"
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
          label="Generate implementation plan"
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
      <div className="flex flex-wrap gap-2">
        <ProductForm
          productId={productId}
          action={markArchitectureReadyAction}
          label="Mark architecture ready"
          pendingLabel="Saving…"
          variant="outline"
        />
        <ProductForm
          productId={productId}
          action={approveArchitectureAction}
          label="Approve architecture"
          pendingLabel="Approving…"
        />
        <ProductForm
          productId={productId}
          action={markPlanReadyAction}
          label="Mark plan ready"
          pendingLabel="Saving…"
          variant="outline"
        />
        <ProductForm
          productId={productId}
          action={approvePlanAction}
          label="Approve implementation plan"
          pendingLabel="Approving…"
        />
      </div>
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
  systemKind,
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
  systemKind: string;
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
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">System kind</span>
        <select name="systemKind" defaultValue={systemKind} className="h-10 w-full rounded-md border bg-background px-3">
          <option value="GREENFIELD">Greenfield</option>
          <option value="EXISTING_SYSTEM">Existing system</option>
        </select>
      </label>
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
