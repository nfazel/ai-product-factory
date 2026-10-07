import { PageHeader } from "@/components/layout/page-header";
import { getCurrentActor } from "@/modules/identity/actor";

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
  const actor = getCurrentActor();

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
