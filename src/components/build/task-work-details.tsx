"use client";

import { useState, type ReactNode } from "react";

const TABS = [
  { id: "plan", label: "Execution plan" },
  { id: "coding", label: "Coding" },
  { id: "validation", label: "Validation & approval" },
  { id: "history", label: "History" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function TaskWorkDetails({
  plan,
  coding,
  validation,
  history,
  defaultTab = "plan",
}: {
  plan: ReactNode;
  coding: ReactNode;
  validation: ReactNode;
  history: ReactNode;
  defaultTab?: TabId;
}) {
  const [tab, setTab] = useState<TabId>(defaultTab);
  const content = { plan, coding, validation, history }[tab];

  return (
    <section className="rounded-2xl border bg-card">
      <div className="border-b px-4 pt-4 sm:px-5">
        <h2 className="text-base font-semibold">Work details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Historical activity stays here. Current status is above.
        </p>
        <div className="mt-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Task work details">
          {TABS.map((item) => {
            const selected = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium ${
                  selected
                    ? "border border-b-0 border-stone-200 bg-white text-stone-900"
                    : "text-muted-foreground hover:text-stone-900"
                }`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-4 sm:p-5" role="tabpanel">
        {content}
      </div>
    </section>
  );
}
