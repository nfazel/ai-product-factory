"use client";

import { useState } from "react";
import { useActionState } from "react";

import { FormMessage, SubmitButton, TextAreaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { idleState } from "@/lib/action-state";
import { answerDisplay, answerMateriality, type ClarificationKindName } from "@/modules/clarification/materiality";
import { saveClarificationAnswerAction } from "@/server/actions/clarification";

export type ClarificationRevision = {
  answer: string;
  changedBy: string;
  createdAt: string;
};

function when(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ClarificationAnswer({
  productId,
  kind,
  questionId,
  question,
  answer,
  answeredAt,
  revisions = [],
  impacts = [],
  editable = true,
  showQuestion = true,
}: {
  productId: string;
  kind: ClarificationKindName;
  questionId: string;
  question: string;
  answer: string;
  answeredAt: string | null;
  revisions?: ClarificationRevision[];
  impacts?: string[];
  editable?: boolean;
  showQuestion?: boolean;
}) {
  const display = answerDisplay({ answer, revisions: Math.max(revisions.length, answer.trim() ? 1 : 0) });
  const [mode, setMode] = useState<"view" | "editing" | "confirming">("view");
  const [draft, setDraft] = useState(answer);
  const [state, action] = useActionState(saveClarificationAnswerAction, idleState);
  const latest = revisions.at(-1);
  const previous = revisions.length > 1 ? revisions.slice(0, -1) : [];
  const stamp = when(latest?.createdAt ?? answeredAt);
  const material = answerMateriality(answer, draft) === "POTENTIALLY_MATERIAL" && impacts.length > 0;

  if (!answer.trim() && !editable) return null;

  if (editable && (!answer.trim() || mode !== "view")) {
    return (
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="questionId" value={questionId} />
        {showQuestion ? <p className="text-sm font-medium">{question}</p> : null}
        <TextAreaField label="Answer" name="answer" value={draft} onChange={(event) => setDraft(event.target.value)} error={state.fieldErrors?.answer} />
        {mode === "confirming" ? (
          <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            <p>Changing this answer may affect:</p>
            <ul className="mt-2 list-disc pl-5">
              {impacts.map((impact) => (
                <li key={impact}>{impact}</li>
              ))}
            </ul>
            <p className="mt-2">These artefacts will not be silently changed.</p>
          </div>
        ) : null}
        <FormMessage state={state} />
        <div className="flex flex-wrap gap-2">
          {answer.trim() ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (mode === "confirming") {
                  setMode("editing");
                  return;
                }
                setDraft(answer);
                setMode("view");
              }}
            >
              Cancel
            </Button>
          ) : null}
          {material && mode !== "confirming" ? (
            <Button type="button" onClick={() => setMode("confirming")}>
              Save Changes
            </Button>
          ) : (
            <SubmitButton pendingLabel="Saving…">{mode === "confirming" ? "Save Answer" : answer.trim() ? "Save Changes" : "Save answer"}</SubmitButton>
          )}
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {showQuestion ? <p className="text-sm font-medium">{question}</p> : null}
      <p className="text-sm leading-6">{answer}</p>
      <p className="text-xs text-muted-foreground">
        {display === "ANSWER_UPDATED" ? "Updated" : "Answered"}
        {stamp ? ` ${stamp}` : ""}
      </p>
      {previous.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Previous answer available in History</summary>
          <ul className="mt-2 space-y-2">
            {previous.map((revision) => (
              <li key={`${revision.createdAt}-${revision.answer}`} className="rounded-lg border px-3 py-2">
                <p>{revision.answer}</p>
                <p className="text-xs text-muted-foreground">
                  {revision.changedBy || "A person"} · {when(revision.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {editable ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft(answer);
            setMode("editing");
          }}
        >
          Edit Answer
        </Button>
      ) : null}
      <FormMessage state={state} />
    </div>
  );
}
