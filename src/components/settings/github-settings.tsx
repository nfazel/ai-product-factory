"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  removeGitHubCredentialAction,
  saveGitHubCredentialAction,
  validateGitHubIdentityAction,
} from "@/server/actions/github-settings";

type GitHubConnectionView = {
  stateLabel: string;
  nextAction: string;
  login: string;
  authMode: "NONE" | "TOKEN" | "APP";
  maskedCredential: string;
  encryptionAvailable: boolean;
  message: string;
  envAppConfigured: boolean;
  serverRepository: string;
};

export function GitHubSettings({ connection }: { connection: GitHubConnectionView }) {
  return (
    <div className="space-y-5">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Connection</dt>
          <dd className="mt-1 font-medium">{connection.stateLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Authenticated identity</dt>
          <dd className="mt-1 font-medium">{connection.login || "Not validated"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Credential</dt>
          <dd className="mt-1 font-medium">{connection.maskedCredential}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Method</dt>
          <dd className="mt-1 font-medium">
            {connection.authMode === "APP" ? "GitHub App" : connection.authMode === "TOKEN" ? "Personal access token" : "Not saved"}
          </dd>
        </div>
      </dl>
      <p className="text-sm leading-6">{connection.message}</p>
      <p className="text-sm leading-6 text-muted-foreground">Next: {connection.nextAction}</p>
      <p className="text-sm leading-6 text-muted-foreground">
        Product repository discovery uses the GitHub App installation and lists only the repositories that installation can access.
        {connection.authMode === "TOKEN" ? " The saved credential is a personal access token. Save the GitHub App id, installation id, and private key to choose a product repository." : ""}
      </p>
      {!connection.encryptionAvailable ? (
        <p className="text-sm leading-6 text-destructive">
          Set AI_CREDENTIAL_ENCRYPTION_KEY on the server before saving a credential. Nothing can be stored until that key is present.
        </p>
      ) : null}
      <CredentialForm method={connection.authMode} key={`${connection.authMode}-${connection.maskedCredential}-${connection.stateLabel}`} />
      <div className="flex flex-wrap gap-3">
        <ValidateForm />
        {connection.maskedCredential !== "Not saved" ? <RemoveForm /> : null}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        This connection belongs to AI Product Builder. Each product chooses its own repository on its Build page. Saving, validating, or removing a credential does not create a repository, push, or merge.
      </p>
    </div>
  );
}

function CredentialForm({ method }: { method: "NONE" | "TOKEN" | "APP" }) {
  const [state, action] = useActionState(saveGitHubCredentialAction, idleState);
  const tokenSelected = method === "TOKEN";
  return (
    <form action={action} className="space-y-3 rounded-xl border p-4" autoComplete="off">
      <p className="text-sm font-medium">Configure authentication</p>
      <fieldset className="space-y-2 text-sm">
        <legend className="text-xs text-muted-foreground">Method</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="APP" defaultChecked={!tokenSelected} />
          GitHub App
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="TOKEN" defaultChecked={tokenSelected} />
          Fine-grained personal access token
        </label>
      </fieldset>
      <TextField
        label="Personal access token"
        name="token"
        type="password"
        autoComplete="off"
        placeholder="github_pat_…"
        hint="Contents read and write on the repositories you will publish. The token is not shown again."
        error={state.fieldErrors?.token}
      />
      <TextField label="GitHub App id" name="appId" autoComplete="off" error={state.fieldErrors?.appId} />
      <TextField label="Installation id" name="installationId" autoComplete="off" error={state.fieldErrors?.installationId} />
      <TextAreaField
        label="GitHub App private key"
        name="privateKey"
        autoComplete="off"
        hint="Used only when GitHub App is selected. It is encrypted and is not shown again."
        error={state.fieldErrors?.privateKey}
      />
      <p className="text-xs text-muted-foreground">Saving replaces the stored credential. The previous credential is no longer used.</p>
      <SubmitButton pendingLabel="Saving">Save GitHub credential</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

function ValidateForm() {
  const [state, action] = useActionState(validateGitHubIdentityAction, idleState);
  return (
    <form action={action}>
      <SubmitButton pendingLabel="Validating">Validate connection</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

function RemoveForm() {
  const [state, action] = useActionState(removeGitHubCredentialAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <label className="flex items-start gap-2 text-sm leading-6">
        <input type="checkbox" name="confirm" value="remove" className="mt-1" />
        <span>Remove the stored GitHub credential. Product repository mappings stay in place and are not published.</span>
      </label>
      <SubmitButton pendingLabel="Removing">Disconnect GitHub</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
