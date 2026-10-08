"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  acknowledgeChangeAction,
  addressFindingAction,
  analyseRequirementsAction,
  answerQuestionAction,
  confirmRequirementAction,
  dispositionAction,
  draftBriefAction,
  pasteRequirementsAction,
  prepareBriefAction,
  traceAction,
  uploadRequirementsAction,
} from "@/server/actions/intake";

export function PasteRequirementsForm({ productId }: { productId: string }) {
  const [state, action] = useActionState(pasteRequirementsAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <TextField label="Title" name="title" placeholder="Business requirements" />
      <TextAreaField label="Requirements" name="text" required hint="Paste plain text or Markdown. This text is stored as the source." />
      <SubmitButton pendingLabel="Storing…">Store pasted requirements</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function UploadRequirementsForm({ productId }: { productId: string }) {
  const [state, action] = useActionState(uploadRequirementsAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <label className="block text-sm font-medium" htmlFor="requirements-file">Upload a document</label>
      <input id="requirements-file" name="file" type="file" accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,application/pdf" required className="block w-full text-sm" />
      <p className="text-xs text-muted-foreground">.txt, .md, .docx, or a PDF that contains text. Limit 2 MB. Scanned PDFs are not read.</p>
      <SubmitButton pendingLabel="Uploading…">Upload requirements</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AnalyseButton({ productId }: { productId: string }) {
  const [state, action] = useActionState(analyseRequirementsAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <SubmitButton pendingLabel="Analysing…">Analyse requirements</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DraftBriefButton({ productId }: { productId: string }) {
  const [state, action] = useActionState(draftBriefAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <SubmitButton pendingLabel="Drafting…" variant="outline">Draft Product Brief from requirements</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function PrepareBriefButton({ productId }: { productId: string }) {
  const [state, action] = useActionState(prepareBriefAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <SubmitButton pendingLabel="Saving…" variant="outline">Prepare brief for approval</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ConfirmRequirementForm({
  productId,
  requirementId,
  interpretation,
}: {
  productId: string;
  requirementId: string;
  interpretation: string;
}) {
  const [state, action] = useActionState(confirmRequirementAction, idleState);
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="requirementId" value={requirementId} />
      <TextAreaField label="Interpretation" name="interpretation" defaultValue={interpretation} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="confirmation" value="CONFIRMED" pendingLabel="Saving…">Confirm</SubmitButton>
        <SubmitButton name="confirmation" value="NEEDS_CHANGE" pendingLabel="Saving…" variant="outline">Needs change</SubmitButton>
        <SubmitButton name="confirmation" value="REJECTED" pendingLabel="Saving…" variant="outline">Reject</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function AnswerForm({ productId, questionId }: { productId: string; questionId: string }) {
  const [state, action] = useActionState(answerQuestionAction, idleState);
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="questionId" value={questionId} />
      <TextAreaField label="Answer" name="answer" />
      <SubmitButton pendingLabel="Saving…" variant="outline">Save answer</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DispositionForm({ productId, requirementId }: { productId: string; requirementId: string }) {
  const [state, action] = useActionState(dispositionAction, idleState);
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="requirementId" value={requirementId} />
      <label className="block text-sm font-medium" htmlFor={`disposition-${requirementId}`}>Disposition</label>
      <select id={`disposition-${requirementId}`} name="disposition" className="h-9 w-full rounded-lg border bg-background px-3 text-sm" defaultValue="IN_SCOPE">
        <option value="IN_SCOPE">In scope</option>
        <option value="OUT_OF_SCOPE">Out of scope</option>
        <option value="DEFERRED">Deferred</option>
        <option value="DUPLICATE">Duplicate</option>
        <option value="SUPERSEDED">Superseded</option>
        <option value="NOT_A_REQUIREMENT">Not a requirement</option>
      </select>
      <TextField label="Reason, required unless in scope" name="reason" />
      <SubmitButton pendingLabel="Saving…" variant="outline">Save disposition</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AddressFindingForm({ productId, findingId }: { productId: string; findingId: string }) {
  const [state, action] = useActionState(addressFindingAction, idleState);
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="findingId" value={findingId} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="status" value="ADDRESSED" pendingLabel="Saving…" variant="outline">Mark addressed</SubmitButton>
        <SubmitButton name="status" value="DISMISSED" pendingLabel="Saving…" variant="outline">Dismiss</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function AcknowledgeChangeForm({ productId }: { productId: string }) {
  const [state, action] = useActionState(acknowledgeChangeAction, idleState);
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <SubmitButton pendingLabel="Saving…" variant="outline">I have reviewed the change</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function TraceForm({
  productId,
  requirementId,
  targets,
}: {
  productId: string;
  requirementId: string;
  targets: { value: string; label: string }[];
}) {
  const [state, action] = useActionState(traceAction, idleState);
  if (targets.length === 0) return null;
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="requirementId" value={requirementId} />
      <label className="block text-sm font-medium" htmlFor={`trace-${requirementId}`}>Link to the definition</label>
      <select id={`trace-${requirementId}`} name="target" className="h-9 w-full rounded-lg border bg-background px-3 text-sm" defaultValue={targets[0]?.value}>
        {targets.map((target) => (
          <option key={target.value} value={target.value}>{target.label}</option>
        ))}
      </select>
      <SubmitButton pendingLabel="Saving…" variant="outline">Confirm link</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
