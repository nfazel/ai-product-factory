"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/forms/fields";
import { STAGE_META, type ProductStage } from "@/domain/constants";
import { idleState } from "@/lib/action-state";
import { formatRelative } from "@/lib/format";
import type { BlockerView, EvidenceItem, ProductGuidance, StageMark } from "@/modules/guidance/types";
import { moveStageAction } from "@/server/actions/products";

const MOVE_TARGET: Record<string, ProductStage> = {
  "move-define": "DEFINE",
  "move-build": "BUILD",
  "move-prove": "PROVE",
  "move-ship": "SHIP",
  "move-learn": "LEARN",
};

export function ProgressStrip({ stages }: { stages: StageMark[] }) {
  return (
    <ol aria-label="Product progress" className="flex gap-2 overflow-x-auto pb-1">
      {stages.map((stage) => (
        <li key={stage.stage} className="min-w-28 flex-1 rounded-xl border bg-card px-3 py-2">
          <p className="text-xs text-muted-foreground">{STAGE_META[stage.stage].label}</p>
          <p className="mt-1 text-sm font-medium">{stage.label}</p>
        </li>
      ))}
    </ol>
  );
}

export function BlockerCard({ blocker }: { blocker: BlockerView }) {
  const rows = [
    ["What is blocked", blocker.what],
    ["Why", blocker.why],
    ["What needs to happen", blocker.required],
    ["Who needs to act", blocker.who],
    ["What happens next", blocker.next],
  ];
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950" aria-label="Current blocker">
      <h2 className="text-sm font-semibold">Blocked</h2>
      <dl className="mt-3 space-y-2">
        {rows.map(([term, value]) => (
          <div key={term}>
            <dt className="text-xs font-medium uppercase tracking-wide">{term}</dt>
            <dd className="text-sm leading-6">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function NextActionPanel({ guidance }: { guidance: ProductGuidance }) {
  if (guidance.blocker) return <BlockerCard blocker={guidance.blocker} />;
  if (!guidance.action) {
    return (
      <section className="rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Next action</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Nothing is waiting on a person right now.</p>
      </section>
    );
  }
  const action = guidance.action;
  const moveTo = MOVE_TARGET[action.key];
  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950" aria-label="Next action">
      <p className="text-xs font-medium uppercase tracking-wide">Next action</p>
      <h2 className="mt-1 text-lg font-semibold">{action.label}</h2>
      <p className="mt-2 text-sm leading-6">{action.why}</p>
      <p className="mt-2 text-xs">{action.role}{action.waitingSince ? ` · waiting since ${formatRelative(action.waitingSince)}` : ""}</p>
      <div className="mt-3">
        {moveTo ? <MoveButton productId={guidance.productId} stage={moveTo} label={action.label} /> : (
          <Link href={action.href} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            {action.label}
          </Link>
        )}
      </div>
    </section>
  );
}

function MoveButton({ productId, stage, label }: { productId: string; stage: ProductStage; label: string }) {
  const [state, formAction] = useActionState(moveStageAction, idleState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="stage" value={stage} />
      <SubmitButton pendingLabel="Moving…">{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function EvidenceSummary({ items, summary, ready }: { items: EvidenceItem[]; summary: string; ready: boolean }) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="text-sm font-semibold">{ready ? "Why this is ready" : "Why this is not ready"}</h2>
      <p className="mt-2 text-sm leading-6">{summary}</p>
      <ul className="mt-3 space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.label}>
            <span className="font-medium">{item.label}.</span>{" "}
            <span className="text-muted-foreground">{item.state === "ready" ? "Ready." : item.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EvidencePanel({ children, title = "Evidence" }: { children: React.ReactNode; title?: string }) {
  return (
    <details className="rounded-2xl border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

export function TraceSummary({
  outcome,
  slice,
  story,
  task,
  full,
}: {
  outcome?: string;
  slice?: string;
  story?: string;
  task?: string;
  full?: React.ReactNode;
}) {
  const short = [outcome, slice, story, task].filter(Boolean);
  return (
    <div className="text-sm">
      <p className="text-muted-foreground">{short.length > 0 ? short.join(" → ") : "Not linked yet."}</p>
      {full ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium">Full trace</summary>
          <div className="mt-2 text-xs leading-5 text-muted-foreground">{full}</div>
        </details>
      ) : null}
    </div>
  );
}
