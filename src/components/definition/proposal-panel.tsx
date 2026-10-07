"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import { DEFINITION_SECTIONS, DEFINITION_SECTION_LABEL, type DefinitionSection } from "@/domain/constants";
import { idleState } from "@/lib/action-state";
import type { StoredProposal } from "@/modules/requirements/schema";
import {
  acceptAllProposalAction,
  acceptProposalItemAction,
  commitProposalAction,
  editProposalAction,
  regenerateSectionAction,
  rejectProposalItemAction,
} from "@/server/actions/requirements";

function ItemActions({
  productId,
  proposalId,
  section,
  tempId,
  title,
  body,
}: {
  productId: string;
  proposalId: string;
  section: DefinitionSection;
  tempId: string;
  title: string;
  body: string;
}) {
  const [acceptState, accept] = useActionState(acceptProposalItemAction, idleState);
  const [rejectState, reject] = useActionState(rejectProposalItemAction, idleState);
  const [editState, edit] = useActionState(editProposalAction, idleState);
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={accept}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="proposalId" value={proposalId} />
          <input type="hidden" name="section" value={section} />
          <input type="hidden" name="tempId" value={tempId} />
          <SubmitButton pendingLabel="Accepting…" variant="secondary">
            Accept
          </SubmitButton>
        </form>
        <form action={reject}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="proposalId" value={proposalId} />
          <input type="hidden" name="section" value={section} />
          <input type="hidden" name="tempId" value={tempId} />
          <SubmitButton pendingLabel="Rejecting…" variant="outline">
            Reject
          </SubmitButton>
        </form>
      </div>
      <FormMessage state={acceptState} />
      <FormMessage state={rejectState} />
      <details>
        <summary className="cursor-pointer text-sm font-medium">Edit</summary>
        <form action={edit} className="mt-3 space-y-3">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="proposalId" value={proposalId} />
          <input type="hidden" name="section" value={section} />
          <input type="hidden" name="tempId" value={tempId} />
          <TextField label="Title" name="title" defaultValue={title} />
          <TextAreaField label="Detail" name="body" defaultValue={body} />
          <FormMessage state={editState} />
          <SubmitButton pendingLabel="Saving…" variant="outline">
            Save edit
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}

function heading(item: { tempId: string; reviewStatus: string; edited: boolean }) {
  return `${item.tempId} · ${item.reviewStatus}${item.edited ? " · edited" : ""}`;
}

export function ProposalPanel({
  productId,
  proposalId,
  payload,
  seededDemo,
}: {
  productId: string;
  proposalId: string;
  payload: StoredProposal;
  seededDemo: boolean;
}) {
  const [allState, acceptAll] = useActionState(acceptAllProposalAction, idleState);
  const [commitState, commit] = useActionState(commitProposalAction, idleState);
  const [regenState, regenerate] = useActionState(regenerateSectionAction, idleState);

  const blocks: { section: DefinitionSection; title: string; body: string; tempId: string; reviewStatus: string; edited: boolean }[] = [
    ...payload.outcomes.map((item) => ({
      section: "outcomes" as const,
      tempId: item.tempId,
      title: item.title,
      body: `${item.description} Success: ${item.successMeasure}`,
      reviewStatus: item.reviewStatus,
      edited: item.edited,
    })),
    ...payload.capabilities.map((item) => ({
      section: "capabilities" as const,
      tempId: item.tempId,
      title: item.name,
      body: item.description,
      reviewStatus: item.reviewStatus,
      edited: item.edited,
    })),
    ...payload.epics.map((item) => ({
      section: "epics" as const,
      tempId: item.tempId,
      title: item.title,
      body: item.description,
      reviewStatus: item.reviewStatus,
      edited: item.edited,
    })),
    ...payload.features.map((item) => ({
      section: "features" as const,
      tempId: item.tempId,
      title: item.title,
      body: item.description,
      reviewStatus: item.reviewStatus,
      edited: item.edited,
    })),
    ...payload.stories.map((item) => ({
      section: "stories" as const,
      tempId: item.tempId,
      title: item.title,
      body: item.description,
      reviewStatus: item.reviewStatus,
      edited: item.edited,
    })),
    ...payload.acceptanceCriteria.map((item) => ({
      section: "acceptanceCriteria" as const,
      tempId: item.tempId,
      title: item.description,
      body: "",
      reviewStatus: item.reviewStatus,
      edited: item.edited,
    })),
    ...payload.nfrs.map((item) => ({
      section: "nfrs" as const,
      tempId: item.tempId,
      title: item.title,
      body: item.description,
      reviewStatus: item.reviewStatus,
      edited: item.edited,
    })),
    ...(payload.firstSlice
      ? [
          {
            section: "firstSlice" as const,
            tempId: payload.firstSlice.tempId,
            title: payload.firstSlice.name,
            body: payload.firstSlice.description,
            reviewStatus: payload.firstSlice.reviewStatus,
            edited: payload.firstSlice.edited,
          },
        ]
      : []),
    ...payload.questions.map((item) => ({
      section: "questions" as const,
      tempId: item.tempId,
      title: item.question,
      body: item.reason,
      reviewStatus: item.reviewStatus,
      edited: item.edited,
    })),
    ...payload.assumptions.map((item) => ({
      section: "assumptions" as const,
      tempId: item.tempId,
      title: item.description,
      body: "",
      reviewStatus: item.reviewStatus,
      edited: item.edited,
    })),
  ];

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">AI proposal</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{payload.assistantSummary}</p>
          {seededDemo ? (
            <p className="mt-2 text-sm text-amber-900">Demo proposal. It was not produced by a Requirements Agent run.</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={acceptAll}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="proposalId" value={proposalId} />
          <SubmitButton pendingLabel="Accepting…" variant="secondary">
            Accept all
          </SubmitButton>
        </form>
        <form action={commit}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="proposalId" value={proposalId} />
          <SubmitButton pendingLabel="Committing…">Commit accepted</SubmitButton>
        </form>
      </div>
      <FormMessage state={allState} />
      <FormMessage state={commitState} />
      <form action={regenerate} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="productId" value={productId} />
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Regenerate selected section</span>
          <select name="section" className="h-9 rounded-md border bg-background px-2 text-sm">
            {DEFINITION_SECTIONS.map((section) => (
              <option key={section} value={section}>
                {DEFINITION_SECTION_LABEL[section]}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton pendingLabel="Regenerating…" variant="outline">
          Regenerate section
        </SubmitButton>
      </form>
      <FormMessage state={regenState} />
      <ul className="space-y-3">
        {blocks.map((item) => (
          <li key={`${item.section}-${item.tempId}`} className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">
              {DEFINITION_SECTION_LABEL[item.section]} · {heading(item)}
            </p>
            <p className="mt-1 text-sm font-medium">{item.title}</p>
            {item.body ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p> : null}
            {item.reviewStatus !== "REJECTED" ? (
              <ItemActions
                productId={productId}
                proposalId={proposalId}
                section={item.section}
                tempId={item.tempId}
                title={item.title}
                body={item.body}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
