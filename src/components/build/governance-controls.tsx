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
      <ProductForm productId={productId} action={markGovernanceReadyAction} label="Prepare engineering review for approval" pendingLabel="Saving" />
      <ProductForm productId={productId} action={approveGovernanceAction} label="Approve Engineering Review" pendingLabel="Approving" />
      <ProductForm productId={productId} action={approveCodingPolicyAction} label="Approve Coding Rules" pendingLabel="Approving" />
    </div>
  );
}

export function FindingActions({
  productId,
  findingId,
  open,
  blocks,
  acceptRisk,
}: {
  productId: string;
  findingId: string;
  open: boolean;
  blocks: boolean;
  acceptRisk: {
    title: string;
    severity: string;
    impact: string;
    recommendation: string;
  };
}) {
  if (!open) {
    return (
      <div className="mt-3">
        <StatusButton productId={productId} findingId={findingId} status="OPEN" label="Reopen finding" />
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-3">
      <ResolveForm productId={productId} findingId={findingId} />
      <AcceptRiskForm productId={productId} findingId={findingId} blocks={blocks} {...acceptRisk} />
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

function ResolveForm({ productId, findingId }: { productId: string; findingId: string }) {
  const [state, formAction] = useActionState(updateFindingAction, idleState);
  return (
    <details className="rounded-xl border p-3">
      <summary className="cursor-pointer text-sm font-medium">Mark resolved</summary>
      <form action={formAction} className="mt-3 space-y-2">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="findingId" value={findingId} />
        <input type="hidden" name="status" value="MITIGATED" />
        <p className="text-sm leading-6 text-muted-foreground">
          Use this when the underlying issue has been addressed. Resolved is different from accepting the residual risk.
        </p>
        <TextAreaField
          label="What was addressed"
          name="rationale"
          hint="A short note is required, for example the control that was added."
          required
          minLength={12}
        />
        <SubmitButton pendingLabel="Saving">Record resolution</SubmitButton>
        <FormMessage state={state} />
      </form>
    </details>
  );
}

function AcceptRiskForm({
  productId,
  findingId,
  blocks,
  title,
  severity,
  impact,
  recommendation,
}: {
  productId: string;
  findingId: string;
  blocks: boolean;
  title: string;
  severity: string;
  impact: string;
  recommendation: string;
}) {
  const [state, formAction] = useActionState(updateFindingAction, idleState);
  return (
    <details className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <summary className="cursor-pointer text-sm font-medium">Accept risk</summary>
      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="findingId" value={findingId} />
        <input type="hidden" name="status" value="RISK_ACCEPTED" />
        <p className="text-sm leading-6">
          You are accepting the residual risk. This does not mark the issue as fixed.
          {blocks
            ? " Under the current rules, a recorded acceptance means this finding no longer blocks coding."
            : " This finding does not block coding."}
        </p>
        <dl className="space-y-2 text-sm leading-6">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Finding</dt>
            <dd>{title}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Severity</dt>
            <dd>{severity}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Potential impact</dt>
            <dd>{impact}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Recommended mitigation</dt>
            <dd>{recommendation}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Residual risk being accepted</dt>
            <dd>The issue remains: {title}. Acceptance leaves it distinguishable from a resolved finding.</dd>
          </div>
        </dl>
        <TextAreaField
          label="Why this risk is accepted"
          name="rationale"
          hint="Required. For example: accepted for the pilot because this capability is not exposed outside the pilot and will be addressed before public launch."
          required
          minLength={12}
        />
        <SubmitButton pendingLabel="Saving" variant="outline">Record risk acceptance</SubmitButton>
        <FormMessage state={state} />
      </form>
    </details>
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
      <SubmitButton pendingLabel="Saving">Save coding rules</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
