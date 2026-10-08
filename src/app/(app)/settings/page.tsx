import { Suspense } from "react";
import Link from "next/link";

import { AIConfigurationForm } from "@/components/ai/configuration-form";
import { PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { ValidateConnectionButton } from "@/components/source-control/source-control-controls";
import { loadAIConfiguration } from "@/modules/ai/surface";
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
  const ai = await loadAIConfiguration();
  const repositoryConfigured = repositoryRootConfigured();
  const active = ai.active;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="AI Product Builder helps teams take a product idea through discovery, definition, engineering, independent verification, release and learning, while keeping material decisions under human control."
      />
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border bg-card p-5 lg:col-span-2">
          <h2 className="text-base font-semibold">AI Configuration</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            One active provider and model is used by every AI Product Builder capability. Changing it is an administrator action. The model cannot choose a provider.
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Active provider</dt>
              <dd className="mt-1 font-medium">{active.providerLabel ?? "Not selected"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Model</dt>
              <dd className="mt-1 font-medium">{active.model ?? "Not selected"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="mt-1 font-medium">{active.status}</dd>
            </div>
          </dl>
          {active.description ? <p className="mt-3 text-sm leading-6">{active.description}</p> : null}
          {active.privacy ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{active.privacy}</p> : null}
          <p className="mt-3 text-sm leading-6">{active.setup}</p>
          {!ai.encryptionAvailable ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Set AI_CREDENTIAL_ENCRYPTION_KEY before saving an API key on this page. Generate 32 bytes with openssl rand -base64 32, add that value to the server environment, and restart. Do not commit it. Server environment credentials still work without it.
            </p>
          ) : null}
          <AIConfigurationForm
            provider={active.providerId ?? ""}
            model={active.model ?? ""}
            installedModels={ai.installedModels}
            credentials={ai.credentials}
            ollamaEndpoint={ai.ollamaEndpoint}
            ollamaStatus={ai.cards.find((card) => card.id === "OLLAMA")?.status ?? "Not configured"}
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {ai.cards.map((card) => (
              <div key={card.id} className="rounded-xl border px-3 py-3 text-sm">
                <p className="font-medium">{card.label}</p>
                <p className="mt-1 text-muted-foreground">{card.description}</p>
                <p className="mt-2 font-medium">{card.status}</p>
                {card.credentialSource ? <p className="mt-1 text-muted-foreground">{card.credentialSource}</p> : null}
                {card.connectionLabel ? <p className="mt-1 text-muted-foreground">{card.connectionLabel}</p> : null}
                {card.endpoint ? <p className="mt-1 text-muted-foreground">{card.endpoint}</p> : null}
                <p className="mt-1 text-muted-foreground">{card.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
            <p>Google Gemini is a cloud AI provider. Save a Gemini API key here, or set GOOGLE_GEMINI_API_KEY in the server environment. A key saved here is encrypted and is not shown again. An application key is used before the environment variable. A current recommendation is gemini-flash-latest. That is a starting point, not a platform requirement. Data is sent to the configured cloud AI provider.</p>
            <p>Ollama runs supported models locally. No API key is required for normal local use. Install Ollama, start it, install a compatible model outside AI Product Builder, return here, and select the installed model. AI Product Builder does not download models. The server address is OLLAMA_BASE_URL. A loopback address is a local endpoint. Requests are sent to that configured endpoint.</p>
            <p>OpenAI is a cloud AI provider. Save an OpenAI API key here, or set OPENAI_API_KEY in the server environment. A key saved here is encrypted and is not shown again. An application key is used before the environment variable. A current recommendation is gpt-4.1-mini. That is a starting point, not a platform requirement. A ChatGPT subscription does not by itself provide this API credential. Data is sent to the configured cloud AI provider.</p>
            <p>Opening this page does not call a model. Saving a key does not call a model. Test Connection is the check that contacts the selected cloud provider. The stored key is never sent back to the browser.</p>
          </div>
          {ai.changes.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Configuration history</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {ai.changes.map((change) => (
                  <li key={change.id}>
                    {change.description}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
