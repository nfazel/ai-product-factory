"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  acceptRiskAction,
  achieveOutcomeAction,
  answerQuestionAction,
  approveNotesAction,
  approvePlanAction,
  approveReleaseAction,
  assumptionAction,
  checkAction,
  confirmProposalAction,
  createReleaseAction,
  deploymentAction,
  draftNotesAction,
  issueAction,
  learningAction,
  notesAction,
  observationAction,
  questionAction,
  rateAreaAction,
  rejectReleaseAction,
  resolveIssueAction,
  reviewReleaseAction,
  rollbackAction,
  savePlanAction,
} from "@/server/actions/release";

function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

export function CreateReleaseForm({ productId, suggestedVersion }: { productId: string; suggestedVersion: string }) {
  const [state, action] = useActionState(createReleaseAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <Hidden name="productId" value={productId} />
      <TextField label="Release version" name="version" defaultValue={suggestedVersion} hint="Confirm the version. The suggestion is not an organisational rule." />
      <SubmitButton pendingLabel="Creating">Create Release Candidate</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ReviewReleaseButton({ productId, candidateId }: { productId: string; candidateId: string }) {
  const [state, action] = useActionState(reviewReleaseAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="candidateId" value={candidateId} />
      <SubmitButton pendingLabel="Reviewing">Review Release Candidate</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function QuestionForm({ productId, candidateId }: { productId: string; candidateId: string }) {
  const [state, action] = useActionState(questionAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="candidateId" value={candidateId} />
      <TextField label="Request more evidence" name="question" />
      <SubmitButton pendingLabel="Saving">Request More Evidence</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AnswerQuestionForm({ productId, questionId }: { productId: string; questionId: string }) {
  const [state, action] = useActionState(answerQuestionAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="questionId" value={questionId} />
      <TextField label="Answer" name="answer" />
      <SubmitButton pendingLabel="Saving">Answer</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AcceptRiskForm({ productId, factorId }: { productId: string; factorId: string }) {
  const [state, action] = useActionState(acceptRiskAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="factorId" value={factorId} />
      <TextAreaField label="Why this risk is accepted" name="rationale" />
      <SubmitButton pendingLabel="Saving">Accept Risk</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DeploymentPlanForm({ productId, candidateId }: { productId: string; candidateId: string }) {
  const [state, action] = useActionState(savePlanAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <Hidden name="productId" value={productId} />
      <Hidden name="candidateId" value={candidateId} />
      <TextField label="Environment" name="environment" placeholder="production" />
      <label className="space-y-1 text-sm">
        <span className="font-medium">Strategy</span>
        <select name="strategy" defaultValue="MANUAL" className="h-9 w-full rounded-lg border bg-background px-3">
          <option value="MANUAL">Manual</option>
          <option value="ROLLING">Rolling</option>
          <option value="BLUE_GREEN">Blue-green</option>
          <option value="CANARY">Canary</option>
          <option value="FEATURE_FLAG">Feature flag</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <TextAreaField label="Summary" name="summary" hint="Any strategy other than manual needs a written justification." />
      <TextAreaField label="Deployment steps" name="steps" hint="One step per line. A person performs them." />
      <TextAreaField label="Pre-deployment checks" name="preChecks" hint="One check per line." />
      <TextAreaField label="Post-deployment checks" name="postChecks" hint="One required check per line." />
      <TextField label="Rollback trigger" name="rollbackTrigger" />
      <TextAreaField label="Rollback steps" name="rollbackSteps" />
      <TextField label="Data implications" name="rollbackDataImplications" />
      <TextField label="Responsible role" name="rollbackRole" />
      <TextAreaField label="Verification after rollback" name="rollbackVerification" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="rollbackUnavailable" />
        Rollback is not possible
      </label>
      <TextAreaField label="Acknowledgement if rollback is impossible" name="rollbackAcknowledgement" />
      <TextField label="Planned window" name="plannedWindow" />
      <SubmitButton pendingLabel="Saving">Save Deployment Plan</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ApprovePlanButton({ productId, candidateId }: { productId: string; candidateId: string }) {
  const [state, action] = useActionState(approvePlanAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="candidateId" value={candidateId} />
      <SubmitButton pendingLabel="Approving">Approve Deployment Plan</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function CheckForm({ productId, checkId }: { productId: string; checkId: string }) {
  const [state, action] = useActionState(checkAction, idleState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="checkId" value={checkId} />
      <label className="text-sm">
        <span className="sr-only">Result</span>
        <select name="status" defaultValue="PASSED" className="h-9 rounded-lg border bg-background px-2">
          <option value="PASSED">Passed</option>
          <option value="FAILED">Failed</option>
          <option value="WAIVED">Waived</option>
          <option value="NOT_APPLICABLE">Not applicable</option>
        </select>
      </label>
      <input name="rationale" placeholder="Rationale if waived" className="h-9 min-w-40 flex-1 rounded-lg border bg-background px-3 text-sm" />
      <SubmitButton pendingLabel="Saving">Record check</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ApproveReleaseButton({ productId, candidateId }: { productId: string; candidateId: string }) {
  const [state, action] = useActionState(approveReleaseAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="candidateId" value={candidateId} />
      <SubmitButton pendingLabel="Approving">Approve Release</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function RejectReleaseForm({ productId, candidateId }: { productId: string; candidateId: string }) {
  const [state, action] = useActionState(rejectReleaseAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="candidateId" value={candidateId} />
      <TextField label="Why the release is rejected" name="reason" />
      <SubmitButton pendingLabel="Rejecting">Reject Release</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DeploymentForm({ productId, candidateId, version }: { productId: string; candidateId: string; version: string }) {
  const [state, action] = useActionState(deploymentAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <Hidden name="productId" value={productId} />
      <Hidden name="candidateId" value={candidateId} />
      <TextField label="Environment" name="environment" />
      <label className="space-y-1 text-sm">
        <span className="font-medium">Result a person observed</span>
        <select name="status" defaultValue="SUCCEEDED" className="h-9 w-full rounded-lg border bg-background px-3">
          <option value="STARTED">Started</option>
          <option value="SUCCEEDED">Succeeded</option>
          <option value="FAILED">Failed</option>
        </select>
      </label>
      <TextField label="Deployed version" name="deployedVersion" defaultValue={version} />
      <TextField label="Deployed commit SHA" name="deployedCommitSha" hint="Leave blank if you record another reference. The factory does not infer it." />
      <TextField label="External reference" name="externalReference" />
      <TextAreaField label="Notes" name="notes" />
      <SubmitButton pendingLabel="Recording">Record Deployment</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function RollbackForm({ productId, candidateId }: { productId: string; candidateId: string }) {
  const [state, action] = useActionState(rollbackAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="candidateId" value={candidateId} />
      <TextAreaField label="Rollback reason" name="reason" />
      <SubmitButton pendingLabel="Recording">Record Rollback</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function IssueForm({ productId, candidateId }: { productId: string; candidateId: string }) {
  const [state, action] = useActionState(issueAction, idleState);
  return (
    <form action={action} className="grid gap-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="candidateId" value={candidateId} />
      <label className="text-sm">
        Severity
        <select name="severity" defaultValue="HIGH" className="mt-1 h-9 w-full rounded-lg border bg-background px-3">
          <option>LOW</option>
          <option>MEDIUM</option>
          <option>HIGH</option>
          <option>CRITICAL</option>
        </select>
      </label>
      <label className="text-sm">
        Category
        <select name="category" defaultValue="FUNCTIONAL" className="mt-1 h-9 w-full rounded-lg border bg-background px-3">
          <option>FUNCTIONAL</option>
          <option>PERFORMANCE</option>
          <option>SECURITY</option>
          <option>DATA</option>
          <option>INTEGRATION</option>
          <option>OPERABILITY</option>
          <option>OTHER</option>
        </select>
      </label>
      <TextAreaField label="What happened" name="description" />
      <SubmitButton pendingLabel="Saving">Record issue</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ResolveIssueForm({ productId, issueId }: { productId: string; issueId: string }) {
  const [state, action] = useActionState(resolveIssueAction, idleState);
  return (
    <form action={action} className="flex items-end gap-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="issueId" value={issueId} />
      <select name="status" defaultValue="RESOLVED" className="h-9 rounded-lg border bg-background px-2 text-sm">
        <option value="RESOLVED">Resolved</option>
        <option value="MITIGATED">Mitigated</option>
        <option value="ACCEPTED">Accepted</option>
      </select>
      <SubmitButton pendingLabel="Saving">Update</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function NotesForm({ productId, candidateId, notes }: { productId: string; candidateId: string; notes: string }) {
  const [saveState, save] = useActionState(notesAction, idleState);
  const [draftState, draft] = useActionState(draftNotesAction, idleState);
  const [approveState, approve] = useActionState(approveNotesAction, idleState);
  return (
    <div className="space-y-3">
      <form action={draft}>
        <Hidden name="productId" value={productId} />
        <Hidden name="candidateId" value={candidateId} />
        <SubmitButton pendingLabel="Drafting">Draft release notes</SubmitButton>
        <FormMessage state={draftState} />
      </form>
      <form action={save} className="space-y-2">
        <Hidden name="productId" value={productId} />
        <Hidden name="candidateId" value={candidateId} />
        <TextAreaField label="Release notes" name="notes" defaultValue={notes} />
        <SubmitButton pendingLabel="Saving">Save notes</SubmitButton>
        <FormMessage state={saveState} />
      </form>
      <form action={approve}>
        <Hidden name="productId" value={productId} />
        <Hidden name="candidateId" value={candidateId} />
        <SubmitButton pendingLabel="Approving">Approve notes</SubmitButton>
        <FormMessage state={approveState} />
      </form>
    </div>
  );
}

export function AreaForm({ productId, areaId, rating, relevant }: { productId: string; areaId: string; rating: string; relevant: boolean }) {
  const [state, action] = useActionState(rateAreaAction, idleState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="areaId" value={areaId} />
      <select name="rating" defaultValue={rating} className="h-9 rounded-lg border bg-background px-2 text-sm">
        <option value="LOW">Low</option>
        <option value="MEDIUM">Medium</option>
        <option value="HIGH">High</option>
      </select>
      <input name="notes" placeholder="What is understood" className="h-9 min-w-36 flex-1 rounded-lg border bg-background px-3 text-sm" />
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" name="relevant" defaultChecked={relevant} />
        Relevant
      </label>
      <SubmitButton pendingLabel="Saving">Rate</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ObservationForm({ productId, outcomeId }: { productId: string; outcomeId: string }) {
  const [state, action] = useActionState(observationAction, idleState);
  return (
    <form action={action} className="grid gap-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="outcomeId" value={outcomeId} />
      <TextField label="Measure" name="measure" />
      <TextField label="Value" name="value" hint="Enter only a value you observed. Use DEMO / SAMPLE for sample data." />
      <TextField label="Unit" name="unit" />
      <TextField label="Source" name="source" defaultValue="HUMAN" />
      <TextAreaField label="Notes" name="notes" />
      <SubmitButton pendingLabel="Saving">Record observation</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AchieveForm({ productId, outcomeId }: { productId: string; outcomeId: string }) {
  const [state, action] = useActionState(achieveOutcomeAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="outcomeId" value={outcomeId} />
      <TextAreaField label="Why this outcome is achieved" name="rationale" />
      <SubmitButton pendingLabel="Saving">Mark outcome achieved</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AssumptionForm({ productId, assumptionId, scope }: { productId: string; assumptionId: string; scope: string }) {
  const [state, action] = useActionState(assumptionAction, idleState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="assumptionId" value={assumptionId} />
      <Hidden name="scope" value={scope} />
      <select name="status" defaultValue="VALIDATED" className="h-9 rounded-lg border bg-background px-2 text-sm">
        <option value="VALIDATED">Validated</option>
        <option value="INVALIDATED">Invalidated</option>
      </select>
      <input name="evidence" placeholder="Evidence" className="h-9 min-w-40 flex-1 rounded-lg border bg-background px-3 text-sm" />
      <SubmitButton pendingLabel="Saving">Update assumption</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function LearningForm({ productId, outcomeId }: { productId: string; outcomeId?: string }) {
  const [state, action] = useActionState(learningAction, idleState);
  return (
    <form action={action} className="grid gap-2">
      <Hidden name="productId" value={productId} />
      {outcomeId ? <Hidden name="outcomeId" value={outcomeId} /> : null}
      <TextAreaField label="What we observed" name="observation" />
      <TextAreaField label="What it means" name="interpretation" />
      <label className="text-sm">
        Decision
        <select name="decision" defaultValue="INVESTIGATE" className="mt-1 h-9 w-full rounded-lg border bg-background px-3">
          <option>CONTINUE</option>
          <option>ITERATE</option>
          <option>PIVOT</option>
          <option>STOP</option>
          <option>SCALE</option>
          <option>INVESTIGATE</option>
        </select>
      </label>
      <label className="text-sm">
        Proposed next step
        <select name="proposalKind" defaultValue="" className="mt-1 h-9 w-full rounded-lg border bg-background px-3">
          <option value="">None</option>
          <option value="DISCOVERY_QUESTION">Discovery question</option>
          <option value="REQUIREMENT">Requirement</option>
          <option value="PRODUCT_SLICE">Product slice</option>
          <option value="DEFECT">Defect</option>
          <option value="IMPROVEMENT">Improvement</option>
        </select>
      </label>
      <TextField label="Proposal title" name="proposalTitle" />
      <TextAreaField label="Proposal description" name="proposalDescription" />
      <SubmitButton pendingLabel="Saving">Record learning</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ConfirmProposalButton({ productId, proposalId }: { productId: string; proposalId: string }) {
  const [state, action] = useActionState(confirmProposalAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <Hidden name="productId" value={productId} />
      <Hidden name="proposalId" value={proposalId} />
      <SubmitButton pendingLabel="Confirming">Confirm next step</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
