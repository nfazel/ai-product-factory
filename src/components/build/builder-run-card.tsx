"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { OperatorCredentialField } from "@/components/build/operator-confirmation";
import { StatusPill } from "@/components/build/status-pill";
import { FormMessage, SubmitButton } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import type { RunView } from "@/modules/run-authority/view";
import { continueBuildingAction, startBuildingAction, stopBuildingAction } from "@/server/actions/run-authority";

const TASK_STATE: Record<string, { label: string; tone: "neutral" | "progress" | "success" | "attention" }> = {
  DONE: { label: "Built and verified", tone: "success" },
  WORKING: { label: "Working", tone: "progress" },
  NEEDS_YOU: { label: "Needs you", tone: "attention" },
  WAITING: { label: "Waiting", tone: "neutral" },
};

function expiry(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * One place to hand a plan to the Builder, watch it work, stop it, and see which task needs the person and why. The Builder acts
 * under a grant the person signed here; it never accepts a feature or ships, and it hands back anything it should not decide.
 */
export function BuilderRunCard({ productId, view }: { productId: string; view: RunView }) {
  const router = useRouter();
  const running = Boolean(view.authority?.running);

  // Follow the run while it works; the page reads the real state again each time.
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [running, router]);

  if (!view.planId) return null;
  const { authority } = view;
  const live = authority?.status === "ACTIVE";

  return (
    <section aria-label="The Builder" className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">{authority ? "The Builder" : "Let the Builder build this plan"}</h2>
        {authority ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{view.headline}</p> : null}
      </div>

      {!authority ? <StartForm productId={productId} planId={view.planId} view={view} /> : null}

      {authority ? (
        <>
          <ul className="divide-y rounded-xl border" aria-label="Tasks">
            {view.tasks.map((task) => (
              <li key={task.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{task.title}</p>
                  {task.state === "NEEDS_YOU" ? (
                    <p className="mt-1 text-sm leading-6 text-amber-950">
                      {task.reason}{" "}
                      <Link href={`/products/${productId}/build/tasks/${task.id}`} className="font-medium text-indigo-800 hover:underline">Open the task</Link>
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 self-start"><StatusPill label={TASK_STATE[task.state].label} tone={TASK_STATE[task.state].tone} /></span>
              </li>
            ))}
          </ul>

          {live ? (
            <p className="text-xs text-muted-foreground">
              Acting under the authority {authority.operatorName} granted. It covers LOW risk tasks only, allows {authority.maxRetries} retries per step, and runs out on {expiry(authority.expiresAt)}.
              It never accepts a feature or ships, and it hands back anything it should not decide.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {live && !running ? <ActionForm productId={productId} authorityId={authority.id} action={continueBuildingAction} label="Continue" pending="Starting…" variant="default" /> : null}
            {live ? <ActionForm productId={productId} authorityId={authority.id} action={stopBuildingAction} label="Stop the Builder" pending="Stopping…" variant="outline" /> : null}
          </div>

          {!live ? <StartForm productId={productId} planId={view.planId} view={view} again /> : null}
        </>
      ) : null}
    </section>
  );
}

function ActionForm({ productId, authorityId, action, label, pending, variant }: { productId: string; authorityId: string; action: typeof stopBuildingAction; label: string; pending: string; variant: "default" | "outline" }) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="authorityId" value={authorityId} />
      <SubmitButton pendingLabel={pending} variant={variant}>{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

function StartForm({ productId, planId, view, again = false }: { productId: string; planId: string; view: RunView; again?: boolean }) {
  const [state, formAction] = useActionState(startBuildingAction, idleState);
  if (!view.grant.available) {
    return view.grant.reasons.length > 0 ? <p className="text-sm text-muted-foreground">{view.grant.reasons.join(" ")}</p> : null;
  }
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="planId" value={planId} />
      {again ? null : (
        <p className="text-sm leading-6 text-muted-foreground">
          The Builder approves each task, drafts and approves its plan, writes and approves the code, records the snapshot and runs
          independent verification, one task after another, without you pressing anything. It only acts on LOW risk tasks, and hands
          back anything bigger, risky or that fails. It never accepts a feature or ships; those stay yours. You can stop it at any time.
        </p>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="understood" value="yes" className="mt-1" />
        <span>I understand. Give the Builder authority for 7 days, with 2 retries per step.</span>
      </label>
      <OperatorCredentialField />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Starting the Builder…">{again ? "Start the Builder again" : "Start building"}</SubmitButton>
    </form>
  );
}
