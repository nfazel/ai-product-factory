"use client";

import { useActionState, useState } from "react";

import { FormMessage, SubmitButton } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { idleState } from "@/lib/action-state";
import {
  removeProviderCredentialAction,
  saveAIConfigurationAction,
  saveProviderCredentialAction,
  testProviderConnectionAction,
} from "@/server/actions/ai-configuration";

const controlClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const STATIC_MASK = "••••••••••••";

export type CloudCredentialStatus = {
  provider: "GOOGLE_GEMINI" | "OPENAI";
  configured: boolean;
  source: "application" | "environment" | "none" | "unreadable";
  sourceLabel: string;
  connectionLabel: string;
};

export function AIConfigurationForm({
  provider,
  model,
  installedModels,
  credentials,
  ollamaEndpoint,
  ollamaStatus,
}: {
  provider: string;
  model: string;
  installedModels: string[];
  credentials: CloudCredentialStatus[];
  ollamaEndpoint: string;
  ollamaStatus: string;
}) {
  const [selected, setSelected] = useState(provider);
  const [replacing, setReplacing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [state, action] = useActionState(saveAIConfigurationAction, idleState);
  const ollamaChoices = selected === "OLLAMA" ? installedModels : [];
  const cloud = credentials.find((item) => item.provider === selected);
  const providerLabel =
    selected === "GOOGLE_GEMINI" ? "Google Gemini" : selected === "OPENAI" ? "OpenAI" : selected === "OLLAMA" ? "Ollama" : "";
  const showEntry = Boolean(cloud && (cloud.source !== "application" || replacing));
  const canTest = Boolean(
    cloud &&
      selected === provider &&
      model &&
      (cloud.source === "application" || cloud.source === "environment"),
  );

  return (
    <div className="mt-4 space-y-4">
      <form action={action} className="space-y-3">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Active provider</span>
          <select
            className={controlClass}
            name="provider"
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setReplacing(false);
              setRemoving(false);
            }}
          >
            <option value="">Select a provider</option>
            <option value="GOOGLE_GEMINI">Google Gemini</option>
            <option value="OLLAMA">Ollama</option>
            <option value="OPENAI">OpenAI</option>
          </select>
        </label>
        {providerLabel ? <p className="text-sm font-medium">{providerLabel}</p> : null}
        {selected === "OLLAMA" ? (
          <div className="space-y-3">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Endpoint</dt>
                <dd className="mt-1 font-medium">{ollamaEndpoint}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Availability</dt>
                <dd className="mt-1 font-medium">{ollamaStatus}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">No API key is required for normal local Ollama use.</p>
          </div>
        ) : null}
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Model</span>
          {ollamaChoices.length > 0 ? (
            <select key={selected} className={controlClass} name="model" defaultValue={ollamaChoices.includes(model) ? model : ollamaChoices[0]}>
              {ollamaChoices.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={selected}
              className={controlClass}
              name="model"
              defaultValue={selected === provider ? model : ""}
              placeholder={selected === "OLLAMA" ? "No installed model to select" : "Model identifier"}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </label>
        {cloud ? (
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="mt-1 text-sm font-medium">{cloud.configured ? "Configured" : "Not configured"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{cloud.connectionLabel}</p>
          </div>
        ) : null}
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Saving…">Save AI configuration</SubmitButton>
      </form>
      {cloud ? (
        <div className="space-y-3 rounded-xl border px-3 py-3">
          <div>
            <p className="text-xs text-muted-foreground">API Key</p>
            <p className="mt-1 text-sm font-medium">
              {cloud.source === "application" || cloud.source === "environment" ? "Configured" : "Not configured"}
            </p>
            {cloud.source === "application" && !replacing ? (
              <p className="mt-1 font-mono text-sm tracking-widest text-muted-foreground">{STATIC_MASK}</p>
            ) : null}
          </div>
          {cloud.source !== "none" ? (
            <div>
              <p className="text-xs text-muted-foreground">Credential source</p>
              <p className="mt-1 text-sm font-medium">{cloud.sourceLabel}</p>
            </div>
          ) : null}
          {cloud.source === "unreadable" ? (
            <p className="text-sm text-muted-foreground">
              The stored credential could not be read. Check the server encryption key and save the key again. Nothing was sent.
            </p>
          ) : null}
          {showEntry ? (
            <KeyForm
              provider={cloud.provider}
              replacing={replacing && cloud.source === "application"}
              onCancel={() => setReplacing(false)}
            />
          ) : null}
          {removing ? (
            <RemoveForm provider={cloud.provider} onCancel={() => setRemoving(false)} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {canTest ? <TestConnectionForm provider={cloud.provider} /> : null}
              {cloud.source === "application" && !replacing ? (
                <Button type="button" variant="outline" size="lg" onClick={() => setReplacing(true)}>
                  Replace API Key
                </Button>
              ) : null}
              {cloud.source === "application" && !replacing ? (
                <Button type="button" variant="outline" size="lg" onClick={() => setRemoving(true)}>
                  Remove configured key
                </Button>
              ) : null}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Saving a key does not contact the provider. Test Connection is a separate action.</p>
        </div>
      ) : null}
    </div>
  );
}

function KeyForm({ provider, replacing, onCancel }: { provider: string; replacing: boolean; onCancel: () => void }) {
  const [state, action] = useActionState(saveProviderCredentialAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="provider" value={provider} />
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">{replacing ? "New API key" : "API Key"}</span>
        <input
          className={controlClass}
          type="password"
          name="apiKey"
          autoComplete="off"
          spellCheck={false}
          placeholder="Enter API key"
        />
      </label>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{replacing ? "Replace API Key" : "Save API Key"}</SubmitButton>
        {replacing ? (
          <Button type="button" variant="outline" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function RemoveForm({ provider, onCancel }: { provider: string; onCancel: () => void }) {
  const [state, action] = useActionState(removeProviderCredentialAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="confirm" value="remove" />
      <p className="text-sm">Remove the application-configured key? A server environment key, if one exists, stays in place.</p>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Removing…" variant="destructive">
          Remove configured key
        </SubmitButton>
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TestConnectionForm({ provider }: { provider: string }) {
  const [state, action] = useActionState(testProviderConnectionAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="provider" value={provider} />
      <SubmitButton pendingLabel="Testing…" variant="outline">
        Test Connection
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
