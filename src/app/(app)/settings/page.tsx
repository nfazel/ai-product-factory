import { Suspense } from "react";

import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { ValidateConnectionButton } from "@/components/source-control/source-control-controls";
import { getCurrentActor } from "@/modules/identity/actor";
import { getConnectionSummary } from "@/modules/source-control/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Settings" };

const modules = [
  "Product",
  "Work item",
  "Acceptance criteria",
  "Decision",
  "Approval",
  "Activity",
  "Agent",
  "Identity",
];

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await markDynamic();
  const actor = getCurrentActor();
  const connection = await getConnectionSummary();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="The foundation is ready for authentication and agents. Neither is switched on."
      />
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">Authentication</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Current actor</dt>
              <dd className="mt-1 font-medium">{actor.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="mt-1">Not configured</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            The application runs without a login. When authentication is added,
            replace getCurrentActor and the request proxy. Domain services
            already receive an actor name for the audit log.
          </p>
        </article>
        <article className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">Approval gates</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Stage movement, requirements, architecture, security, and release
            stay with people. Future agents may draft work and request
            approval. They will not approve their own output.
          </p>
        </article>
        <article className="rounded-2xl border bg-card p-5 lg:col-span-2">
          <h2 className="text-base font-semibold">Source control</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Provider</dt>
              <dd className="mt-1 font-medium">{connection.provider}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Connection</dt>
              <dd className="mt-1 font-medium">{connection.status === "CONNECTED" ? "CONNECTED" : "NOT CONNECTED"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Owner</dt>
              <dd className="mt-1 font-medium">{connection.owner || "Not configured"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Repository</dt>
              <dd className="mt-1 font-medium">{connection.repositoryName || "Not configured"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Default branch</dt>
              <dd className="mt-1 font-medium">{connection.defaultBranch || "Not validated"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Status detail</dt>
              <dd className="mt-1 font-medium">{connection.status}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{connection.message}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Credentials stay in server environment variables. This page cannot show or edit a token.
          </p>
          <div className="mt-4">
            <ValidateConnectionButton />
          </div>
        </article>
        <article className="rounded-2xl border bg-card p-5 lg:col-span-2">
          <h2 className="text-base font-semibold">Modules</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((name) => (
              <li
                key={name}
                className="rounded-xl border px-3 py-2 text-sm"
              >
                {name}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
