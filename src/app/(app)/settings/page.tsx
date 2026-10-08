import { Suspense } from "react";
import Link from "next/link";

import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { ValidateConnectionButton } from "@/components/source-control/source-control-controls";
import { describeAIConfiguration } from "@/modules/ai/config";
import { repositoryRootConfigured } from "@/modules/coding/config";
import { getConnectionSummary } from "@/modules/source-control/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Settings" };

const modules = [
  "Explore",
  "Define",
  "Build",
  "Prove",
  "Ship",
  "Learn",
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
  const connection = await getConnectionSummary();
  const ai = describeAIConfiguration();
  const repositoryConfigured = repositoryRootConfigured();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="AI Product Builder helps teams take a product idea through discovery, definition, engineering, independent verification, release and learning, while keeping material decisions under human control."
      />
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">AI Configuration</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Provider</dt>
              <dd className="mt-1 font-medium">{ai.providerLabel ?? "Not selected"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Model</dt>
              <dd className="mt-1 font-medium">{ai.model ?? "Not selected"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="mt-1 font-medium">{ai.status}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm leading-6">{ai.setup}</p>
          <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            <p>OpenAI: set AI_PROVIDER=openai, AI_MODEL to an OpenAI model, and OPENAI_API_KEY on the server.</p>
            <p>Anthropic: set AI_PROVIDER=anthropic, AI_MODEL to an Anthropic model, and ANTHROPIC_API_KEY on the server.</p>
            <p>Credentials stay in the server environment. This page cannot show an API key.</p>
          </div>
        </article>
        <article className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">Local repository</h2>
          <p className="mt-3 text-sm leading-6">
            {repositoryConfigured ? "A local Git repository is configured for coding and independent checks." : "No local repository is configured. Coding and independent checks stay closed until PRODUCT_REPOSITORY_ROOT points at a separate Git repository."}
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
          <h2 className="text-base font-semibold">Product stages</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            <Link className="text-primary hover:underline" href="/agents">System view of agent runs</Link>
          </p>
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
