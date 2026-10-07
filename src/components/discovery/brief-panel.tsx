"use client";

import { useActionState, useState } from "react";

import {
  FormMessage,
  SubmitButton,
  TextAreaField,
} from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import {
  ASSUMPTION_STATUSES,
  ASSUMPTION_STATUS_LABEL,
  BRIEF_ORIGIN_LABEL,
  BRIEF_SECTION_LABEL,
  LIST_BRIEF_SECTIONS,
  PRIORITY_LABEL,
  PRODUCT_BRIEF_STATUS_LABEL,
  SIGNAL_LEVEL_LABEL,
  type ListBriefSection,
} from "@/domain/constants";
import { idleState } from "@/lib/action-state";
import type { ProductBriefRecord } from "@/modules/discovery/types";
import {
  assumptionStatusAction,
  editBriefAction,
} from "@/server/actions/discovery";

function OriginPill({ origin }: { origin: keyof typeof BRIEF_ORIGIN_LABEL }) {
  const tone = {
    AI_PROPOSAL: "bg-indigo-50 text-indigo-800",
    HUMAN_CONFIRMED: "bg-emerald-50 text-emerald-800",
    UNRESOLVED: "bg-stone-100 text-stone-600",
  }[origin];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {BRIEF_ORIGIN_LABEL[origin]}
    </span>
  );
}

function SectionEditor({
  productId,
  section,
  label,
  initial,
}: {
  productId: string;
  section: string;
  label: string;
  initial: string;
}) {
  const [state, action] = useActionState(editBriefAction, idleState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="section" value={section} />
      <TextAreaField
        label={label}
        name="value"
        id={`${section}-value`}
        defaultValue={initial}
        hint="Saving confirms this section. The agent can question it later, but it will not overwrite it."
      />
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">Save confirmation</SubmitButton>
        <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AssumptionRow({
  productId,
  assumption,
}: {
  productId: string;
  assumption: ProductBriefRecord["assumptions"][number];
}) {
  const [state, action] = useActionState(assumptionStatusAction, idleState);
  const highlighted =
    assumption.impact === "HIGH" && assumption.status === "UNVALIDATED";

  return (
    <form
      action={action}
      className={
        highlighted
          ? "space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3"
          : "space-y-3 rounded-xl border bg-background p-3"
      }
    >
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="assumptionId" value={assumption.id} />
      <div className="flex flex-wrap items-center gap-2">
        <OriginPill origin={assumption.origin} />
        <span className="text-xs text-muted-foreground">
          Impact {PRIORITY_LABEL[assumption.impact]}
        </span>
        <span className="text-xs text-muted-foreground">
          Confidence {SIGNAL_LEVEL_LABEL[assumption.confidence]}
        </span>
        {highlighted ? (
          <span className="text-xs font-medium text-amber-900">
            High impact, still unvalidated
          </span>
        ) : null}
      </div>
      <p className="text-sm leading-6">{assumption.description}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Status
          <select
            name="status"
            defaultValue={assumption.status}
            className="mt-1 block h-9 rounded-lg border bg-background px-3 text-sm text-foreground"
          >
            {ASSUMPTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ASSUMPTION_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton pendingLabel="Saving…" variant="outline">
          Update status
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

const PROSE = ["problemStatement", "productVision", "valueProposition"] as const;

export function BriefPanel({
  productId,
  brief,
  editable,
}: {
  productId: string;
  brief: ProductBriefRecord;
  editable: boolean;
}) {
  const prose = PROSE.map((key) => ({
    key,
    label: BRIEF_SECTION_LABEL[key],
    value: brief[key],
    origin: brief.fieldOrigins[key],
  }));

  return (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Live product brief
            </p>
            <h2 className="mt-1 text-lg font-semibold">Version {brief.version}</h2>
          </div>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium">
            {PRODUCT_BRIEF_STATUS_LABEL[brief.status]}
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Proposed means the agent suggested it. Confirmed means a person saved it.
          Unresolved means it is still open. Proposed text is not treated as fact.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <OriginPill origin="AI_PROPOSAL" />
          <OriginPill origin="HUMAN_CONFIRMED" />
          <OriginPill origin="UNRESOLVED" />
        </div>
      </div>

      {prose.map((section) => (
        <section key={section.key} className="rounded-2xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold">{section.label}</h3>
            <OriginPill origin={section.origin} />
          </div>
          <p className="mt-2 text-sm leading-6 whitespace-pre-wrap">
            {section.value || "Not yet captured."}
          </p>
          {editable ? (
            <SectionEditor
              key={`${section.key}:${section.value}`}
              productId={productId}
              section={section.key}
              label={section.label}
              initial={section.value}
            />
          ) : null}
        </section>
      ))}

      {LIST_BRIEF_SECTIONS.map((section) => (
        <ListSection
          key={section}
          productId={productId}
          section={section}
          items={brief[section]}
          editable={editable}
        />
      ))}

      <section className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Assumptions</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          High-impact assumptions stay visible until someone validates or invalidates them.
          A confirmed status is not overwritten by the agent.
        </p>
        <div className="mt-3 space-y-3">
          {brief.assumptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assumptions captured yet.</p>
          ) : (
            brief.assumptions.map((assumption) => (
              <AssumptionRow
                key={assumption.id}
                productId={productId}
                assumption={assumption}
              />
            ))
          )}
        </div>
      </section>
    </aside>
  );
}

function ListSection({
  productId,
  section,
  items,
  editable,
}: {
  productId: string;
  section: ListBriefSection;
  items: ProductBriefRecord[ListBriefSection];
  editable: boolean;
}) {
  const label = BRIEF_SECTION_LABEL[section];
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-semibold">{label}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Not yet captured.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 text-sm leading-6">
              <span>{item.text}</span>
              <OriginPill origin={item.origin} />
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <SectionEditor
          key={`${section}:${items.map((item) => item.text).join("|")}`}
          productId={productId}
          section={section}
          label={label}
          initial={items.map((item) => item.text).join("\n")}
        />
      ) : null}
    </section>
  );
}
