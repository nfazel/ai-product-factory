"use client";

import { useState, type ReactNode } from "react";

/**
 * Tab shell for the Verification Workspace. Panels are rendered on the server and passed in as
 * nodes, so this client component only switches which panel is visible. It carries no verification
 * logic and cannot start or approve anything.
 */
export function ProveTabs({
  tabs,
  panels,
  defaultTab,
}: {
  tabs: { id: string; label: string }[];
  panels: Record<string, ReactNode>;
  defaultTab: string;
}) {
  const [tab, setTab] = useState<string>(defaultTab);
  const content = panels[tab] ?? null;
  return (
    <section id="verification-tabs" className="scroll-mt-20 rounded-2xl border bg-card">
      <div className="border-b px-4 pt-4 sm:px-5">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Verification workspace sections">
          {tabs.map((item) => {
            const selected = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`prove-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`prove-panel-${item.id}`}
                className={`shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
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
      <div
        className="p-4 sm:p-5"
        role="tabpanel"
        id={`prove-panel-${tab}`}
        aria-labelledby={`prove-tab-${tab}`}
      >
        {content}
      </div>
    </section>
  );
}
