"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { explainIntelligenceAction } from "@/server/actions/analytics";

export function InsightsPanel({ productId, window }: { productId: string; window: string }) {
  const [state, action, pending] = useActionState(explainIntelligenceAction, null);

  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-base font-semibold">Insights</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        An explanation of the numbers above. It cannot change a metric, a lifecycle record, or an approval.
      </p>
      <form action={action} className="mt-4">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="window" value={window} />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Reading the metrics…" : "Explain these metrics"}
        </Button>
      </form>
      {state && !state.available ? <p className="mt-4 text-sm text-muted-foreground">{state.reason}</p> : null}
      {state?.available ? (
        <div className="mt-4 space-y-4 text-sm">
          <p className="leading-6">{state.summary}</p>
          <InsightList title="Observations" items={state.observations} />
          <InsightList title="Risks" items={state.risks} />
          <InsightList title="Opportunities" items={state.opportunities} />
          {state.questions.length > 0 ? (
            <div>
              <h3 className="font-medium">Questions for leadership</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {state.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function InsightList({
  title,
  items,
}: {
  title: string;
  items: { statement: string; evidence: string[] }[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-2 space-y-3">
        {items.map((item) => (
          <li key={item.statement}>
            <p>{item.statement}</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {item.evidence.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
