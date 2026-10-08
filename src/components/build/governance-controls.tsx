"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import {
  CODING_EXECUTION_MODES,
  CODING_EXECUTION_LABEL,
  CODING_RISK_LEVELS,
  CODING_RISK_LABEL,
  GOVERNANCE_SECTIONS,
  GOVERNANCE_SECTION_LABEL,
} from "@/domain/constants";
import { idleState } from "@/lib/action-state";
import {
  acceptGovernanceAction,
  answerGovernanceQuestionAction,
  approveCodingPolicyAction,
  approveGovernanceAction,
  commentFindingAction,
  commitGovernanceAction,
  generateGovernanceAction,
  markGovernanceReadyAction,
  overrideCodingRiskAction,
  regenerateGovernanceAction,
  updateCodingPolicyAction,
  updateFindingAction,
} from "@/server/actions/governance";

function ProductForm({
  productId,
  action,
  label,
  pendingLabel,
}: {
  productId: string;
  action: typeof generateGovernanceAction;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <SubmitButton pendingLabel={pendingLabel}>{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function GovernanceRunControls({ productId }: { productId: string }) {
  const [state, formAction] = useActionState(regenerateGovernanceAction, idleState);
  return (
    <div className="space-y-3">
      <ProductForm
        productId={productId}
        action={generateGovernanceAction}
        label="Run governance review"
        pendingLabel="Reviewing"
      />
      <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="productId" value={productId} />
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Re-review</span>
          <select name="section" className="h-9 w-full rounded-lg border bg-background px-2 text-sm" defaultValue="security">
            {GOVERNANCE_SECTIONS.map((section) => (
              <option key={section} value={section}>
                {GOVERNANCE_SECTION_LABEL[section]}
              </option>
            ))}
          </select>
        </label>
        <TextField label="Task id" name="taskId" />
        <SubmitButton pendingLabel="Reviewing">Re-review section</SubmitButton>
        <div className="sm:col-span-3">
          <FormMessage state={state} />
        </div>
      </form>
    </div>
  );
}

export function GovernanceProposalActions({
  productId,
  proposalId,
}: {
  productId: string;
  proposalId: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ProposalButton productId={productId} proposalId={proposalId} action={acceptGovernanceAction} label="Accept proposal" />
      <ProposalButton productId={productId} proposalId={proposalId} action={commitGovernanceAction} label="Commit draft review" />
    </div>
  );
}

function ProposalButton({
  productId,
  proposalId,
  action,
  label,
}: {
  productId: string;
  proposalId: string;
  action: typeof acceptGovernanceAction;
  label: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="proposalId" value={proposalId} />
      <SubmitButton pendingLabel="Saving">{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function GovernanceApprovalControls({ productId }: { productId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ProductForm productId={productId} action={markGovernanceReadyAction} label="Mark ready for review" pendingLabel="Saving" />
      <ProductForm productId={productId} action={approveGovernanceAction} label="Approve governance review" pendingLabel="Approving" />
      <ProductForm productId={productId} action={approveCodingPolicyAction} label="Approve coding policy" pendingLabel="Approving" />
    </div>
  );
}

export function FindingActions({
  productId,
  findingId,
  severity,
}: {
  productId: string;
  findingId: string;
  severity: string;
}) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <StatusButton productId={productId} findingId={findingId} status="ACCEPTED" label="Accept finding" />
        <StatusButton productId={productId} findingId={findingId} status="MITIGATED" label="Mark mitigated" />
        <StatusButton productId={productId} findingId={findingId} status="CLOSED" label="Close" />
      </div>
      <RationaleForm
        productId={productId}
        findingId={findingId}
        status="RISK_ACCEPTED"
        label="Accept risk"
        hint={
          severity === "HIGH" || severity === "CRITICAL"
            ? "A rationale is required for a high or critical risk."
            : "Record why this risk is accepted."
        }
      />
      <CommentForm productId={productId} findingId={findingId} />
    </div>
  );
}

function StatusButton({
  productId,
  findingId,
  status,
  label,
}: {
  productId: string;
  findingId: string;
  status: string;
  label: string;
}) {
  const [state, formAction] = useActionState(updateFindingAction, idleState);
  return (
    <form action={formAction}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="findingId" value={findingId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton pendingLabel="Saving">{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

function RationaleForm({
  productId,
  findingId,
  status,
  label,
  hint,
}: {
  productId: string;
  findingId: string;
  status: string;
  label: string;
  hint: string;
}) {
  const [state, formAction] = useActionState(updateFindingAction, idleState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="findingId" value={findingId} />
      <input type="hidden" name="status" value={status} />
      <TextAreaField label="Rationale" name="rationale" hint={hint} />
      <SubmitButton pendingLabel="Saving">{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

function CommentForm({ productId, findingId }: { productId: string; findingId: string }) {
  const [state, formAction] = useActionState(commentFindingAction, idleState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="findingId" value={findingId} />
      <TextAreaField label="Comment" name="rationale" />
      <SubmitButton pendingLabel="Saving">Add comment</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function CodingRiskOverrideForm({
  productId,
  assessmentId,
}: {
  productId: string;
  assessmentId: string;
}) {
  const [state, formAction] = useActionState(overrideCodingRiskAction, idleState);
  return (
    <form action={formAction} className="mt-3 grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">Override risk</span>
        <select name="riskLevel" className="h-9 w-full rounded-lg border bg-background px-2 text-sm" defaultValue="MEDIUM">
          {CODING_RISK_LEVELS.map((level) => (
            <option key={level} value={level}>
              {CODING_RISK_LABEL[level]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">Override mode</span>
        <select name="executionMode" className="h-9 w-full rounded-lg border bg-background px-2 text-sm" defaultValue="SUPERVISED">
          {CODING_EXECUTION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {CODING_EXECUTION_LABEL[mode]}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-2">
        <TextAreaField label="Why this override" name="rationale" hint="A rationale is required." />
      </div>
      <SubmitButton pendingLabel="Saving">Save human override</SubmitButton>
      <div className="sm:col-span-2">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function QuestionAnswerForm({
  productId,
  questionId,
}: {
  productId: string;
  questionId: string;
}) {
  const [state, formAction] = useActionState(answerGovernanceQuestionAction, idleState);
  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="questionId" value={questionId} />
      <TextAreaField label="Answer" name="answer" />
      <SubmitButton pendingLabel="Saving">Answer question</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function CodingPolicyEditor({
  productId,
  policyId,
  allowedPaths,
  restrictedPaths,
  prohibitedActions,
  requiredChecks,
  maxFilesPerTask,
  requireTests,
  requireHumanReview,
}: {
  productId: string;
  policyId: string;
  allowedPaths: string;
  restrictedPaths: string;
  prohibitedActions: string;
  requiredChecks: string;
  maxFilesPerTask: string;
  requireTests: boolean;
  requireHumanReview: boolean;
}) {
  const [state, formAction] = useActionState(updateCodingPolicyAction, idleState);
  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="policyId" value={policyId} />
      <TextAreaField label="Allowed paths" name="allowedPaths" defaultValue={allowedPaths} hint="One path per line." />
      <TextAreaField label="Restricted paths" name="restrictedPaths" defaultValue={restrictedPaths} hint="One path per line." />
      <TextAreaField label="Prohibited actions" name="prohibitedActions" defaultValue={prohibitedActions} hint="One action per line." />
      <TextAreaField label="Required checks" name="requiredChecks" defaultValue={requiredChecks} hint="One check per line." />
      <TextField label="Maximum files per task" name="maxFilesPerTask" defaultValue={maxFilesPerTask} hint="Leave empty for no limit." />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requireTests" defaultChecked={requireTests} />
        Tests required
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requireHumanReview" defaultChecked={requireHumanReview} />
        Human review required
      </label>
      <SubmitButton pendingLabel="Saving">Save coding policy</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
