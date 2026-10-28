import Link from "next/link";

import { StatusPill } from "@/components/build/status-pill";
import type { BuildOverviewSummary } from "@/modules/build/task-status";

export function BuildOverview({
  productId,
  summary,
  readinessLabel,
  repositoryReady,
}: {
  productId: string;
  summary: BuildOverviewSummary;
  readinessLabel: string;
  repositoryReady: boolean;
}) {
  return (
    <section id="code" tabIndex={-1} className="scroll-mt-20 space-y-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
      <div id="execution-plan" tabIndex={-1} className="scroll-mt-20 rounded-2xl border bg-card p-4 sm:p-5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
        <div id="coding-progress" tabIndex={-1} className="scroll-mt-20 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Build · Code</p>
            <h2 className="mt-1 text-lg font-semibold">Implementation tasks</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              One row per task. Open a task for plan, coding, validation, and approval detail. Coding logs stay on the task page.
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Coding readiness · {readinessLabel}</p>
            <p>{repositoryReady ? "Repository ready" : "Repository not configured"}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total tasks" value={summary.total} />
          <SummaryCard label="Completed" value={summary.completed} />
          <SummaryCard label="In progress" value={summary.inProgress} />
          <SummaryCard label="Needs attention" value={summary.attention} emphasis={summary.attention > 0} />
        </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        {summary.rows.length === 0 ? (
          <p className="p-5 text-sm leading-6 text-muted-foreground">
            No implementation tasks yet. Approve the design and delivery plan first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-stone-50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Coding</th>
                  <th className="px-4 py-3 font-medium">Validation</th>
                  <th className="px-4 py-3 font-medium">Verification</th>
                  <th className="px-4 py-3 font-medium">Next action</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/products/${productId}/build/tasks/${row.id}`}
                        className="font-medium text-stone-900 hover:underline"
                      >
                        {row.title}
                      </Link>
                      {row.attention ? (
                        <p className="mt-1 text-xs text-amber-900">Needs attention</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusPill
                        label={row.taskStatusLabel}
                        tone={row.completed ? "success" : row.attention ? "attention" : row.inProgress ? "progress" : "neutral"}
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusPill label={row.codingStatus} tone={row.codingTone} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusPill label={row.validationStatus} tone={row.validationTone} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusPill label={row.verificationStatus} tone={row.verificationTone} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/products/${productId}/build/tasks/${row.id}`}
                        className="text-sm font-medium text-indigo-800 hover:underline"
                      >
                        {row.nextAction}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${emphasis ? "border-amber-300 bg-amber-50" : "bg-stone-50"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
