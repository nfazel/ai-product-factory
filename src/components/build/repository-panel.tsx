"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage, SubmitButton, TextField } from "@/components/forms/fields";
import { idleState } from "@/lib/action-state";
import {
  assignProductRepositoryAction,
  connectRepositoryAction,
  createRemoteRepositoryAction,
  initializeRepositoryAction,
  refreshInstallationRepositoriesAction,
} from "@/server/actions/repository";

type RepositoryView = {
  developmentContext: string | null;
  typeLabel: string;
  localLabel: string;
  gitLabel: string;
  remoteLabel: string;
  defaultBranch: string;
  suggestedName: string;
  githubAppReady: boolean;
  githubOwner: string;
  githubAccountConnected: boolean;
  mappedOwner: string;
  mappedRepository: string;
  mappedUrl: string;
  mappingStatus: string;
  mappingMessage: string;
  localPath: string;
  localReady: boolean;
  remoteConnected: boolean;
};

type InstallationRepositories = {
  method: "APP" | "TOKEN" | "NONE";
  repositories: Array<{ owner: string; name: string; canPush: boolean }>;
  error: string;
};

export function RepositoryPanel({
  productId,
  repository,
  installationRepositories,
}: {
  productId: string;
  repository: RepositoryView;
  installationRepositories: InstallationRepositories;
}) {
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5">
      <div>
        <p className="text-xs font-medium tracking-wide text-indigo-700">REPOSITORY</p>
        <h2 className="text-lg font-semibold">Repository</h2>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        Coding uses this product&apos;s local repository. Creating a GitHub repository is a separate confirmation and does not publish generated code. Publishing stays in Prove.
      </p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Type</dt>
          <dd className="mt-1 font-medium">{repository.typeLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Local repository</dt>
          <dd className="mt-1 font-medium">{repository.localLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Git status</dt>
          <dd className="mt-1 font-medium">{repository.gitLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Remote repository</dt>
          <dd className="mt-1 font-medium">{repository.remoteLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Default branch</dt>
          <dd className="mt-1 font-medium">{repository.defaultBranch}</dd>
        </div>
      </dl>
      {repository.developmentContext === "GREENFIELD" && !repository.localReady ? <InitializeForm productId={productId} /> : null}
      {repository.developmentContext === "EXISTING_SYSTEM" && !repository.localReady ? <ConnectForm productId={productId} /> : null}
      {repository.developmentContext !== "GREENFIELD" && repository.developmentContext !== "EXISTING_SYSTEM" ? (
        <p className="text-sm leading-6">Choose whether this is a new application or an existing application before setting up a repository.</p>
      ) : null}
      {repository.localReady && !repository.remoteConnected ? (
        <RemoteForm productId={productId} repository={repository} installationRepositories={installationRepositories} />
      ) : null}
      {repository.localPath ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Advanced</summary>
          <p className="mt-2 break-all text-muted-foreground">{repository.localPath}</p>
        </details>
      ) : null}
    </div>
  );
}

function InitializeForm({ productId }: { productId: string }) {
  const [state, action] = useActionState(initializeRepositoryAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <SubmitButton pendingLabel="Setting up">Set Up Repository</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

function ConnectForm({ productId }: { productId: string }) {
  const [state, action] = useActionState(connectRepositoryAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <TextField
        label="Local Git repository"
        name="localPath"
        placeholder="/absolute/path/to/repository"
        hint="Absolute path on this machine. The AI Product Builder source tree is rejected."
        error={state.fieldErrors?.localPath}
      />
      <SubmitButton pendingLabel="Connecting">Connect Existing Repository</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

function RemoteForm({
  productId,
  repository,
  installationRepositories,
}: {
  productId: string;
  repository: RepositoryView;
  installationRepositories: InstallationRepositories;
}) {
  return (
    <div className="space-y-4">
      <MappingSummary repository={repository} />
      <MappingForm productId={productId} repository={repository} installationRepositories={installationRepositories} />
      {repository.githubAppReady && repository.githubOwner ? (
        <CreateForm productId={productId} repository={repository} />
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          Creating a new repository needs a confirmed GitHub App connection under Settings. Associating an existing repository does not create one and does not publish code.
        </p>
      )}
    </div>
  );
}

function MappingSummary({ repository }: { repository: RepositoryView }) {
  const mapping = repository.mappedOwner && repository.mappedRepository ? `${repository.mappedOwner}/${repository.mappedRepository}` : "Not configured";
  return (
    <div className="space-y-2 text-sm leading-6">
      <p>
        <span className="text-muted-foreground">Product repository: </span>
        <span className="font-medium">{mapping}</span>
      </p>
      <p>
        <span className="text-muted-foreground">Repository status: </span>
        <span className="font-medium">{repository.mappingStatus}</span>
      </p>
      <p className="text-muted-foreground">{repository.mappingMessage}</p>
      {repository.mappedUrl ? <p className="break-all text-muted-foreground">{repository.mappedUrl}</p> : null}
    </div>
  );
}

function MappingForm({
  productId,
  repository,
  installationRepositories,
}: {
  productId: string;
  repository: RepositoryView;
  installationRepositories: InstallationRepositories;
}) {
  const [state, action] = useActionState(assignProductRepositoryAction, idleState);
  const [refreshState, refreshAction] = useActionState(refreshInstallationRepositoriesAction, idleState);
  if (!repository.githubAccountConnected) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Repository not configured. <Link className="font-medium text-indigo-800" href="/settings#github">Connect GitHub in Settings</Link>, then choose this product&apos;s repository. Nothing is created automatically.
      </p>
    );
  }
  if (installationRepositories.method !== "APP") {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Save the GitHub App under <Link className="font-medium text-indigo-800" href="/settings#github">Settings</Link>. Repository discovery uses that installation and lists only the repositories it can access.
        {installationRepositories.method === "TOKEN" ? " The saved credential is a personal access token." : ""}
      </p>
    );
  }
  const current = repository.mappedOwner && repository.mappedRepository ? `${repository.mappedOwner}/${repository.mappedRepository}` : "";
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p className="text-sm font-medium">GitHub App repositories</p>
      <p className="text-sm leading-6 text-muted-foreground">
        This list is read from the GitHub App installation each time the page loads. Refresh it after changing repository access in GitHub. Associating a repository does not create, push, or merge.
      </p>
      {installationRepositories.error ? <p className="text-sm leading-6 text-destructive">{installationRepositories.error}</p> : null}
      <form action={refreshAction}>
        <input type="hidden" name="productId" value={productId} />
        <SubmitButton pendingLabel="Refreshing">Refresh repositories</SubmitButton>
        <FormMessage state={refreshState} />
      </form>
      {installationRepositories.repositories.length === 0 && !installationRepositories.error ? (
        <p className="text-sm leading-6 text-muted-foreground">
          The GitHub App installation has no accessible repositories. Grant it access to the repository in GitHub, then refresh.
        </p>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="productId" value={productId} />
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Repository</span>
            <select name="repository" defaultValue={current} className="mt-1 h-9 w-full rounded-md border bg-background px-2" required>
              <option value="">Choose a repository</option>
              {installationRepositories.repositories.map((item) => {
                const value = `${item.owner}/${item.name}`;
                return (
                  <option key={value} value={value}>
                    {value}
                    {item.canPush ? "" : " (cannot push)"}
                  </option>
                );
              })}
            </select>
          </label>
          <SubmitButton pendingLabel="Checking">Associate repository</SubmitButton>
          <FormMessage state={state} />
        </form>
      )}
    </div>
  );
}

function CreateForm({ productId, repository }: { productId: string; repository: RepositoryView }) {
  const [state, action] = useActionState(createRemoteRepositoryAction, idleState);
  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <input type="hidden" name="productId" value={productId} />
      <p className="text-sm font-medium">Create GitHub repository</p>
      <p className="text-sm leading-6 text-muted-foreground">
        Account: {repository.githubOwner}. This creates an empty repository with a README baseline. It does not push generated application code.
      </p>
      <TextField label="Repository" name="name" defaultValue={repository.suggestedName} error={state.fieldErrors?.name} />
      <label className="block text-sm">
        <span className="text-xs text-muted-foreground">Visibility</span>
        <select name="visibility" defaultValue="private" className="mt-1 h-9 w-full rounded-md border bg-background px-2">
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-xs text-muted-foreground">Default branch</span>
        <select name="defaultBranch" defaultValue="main" className="mt-1 h-9 w-full rounded-md border bg-background px-2">
          <option value="main">main</option>
        </select>
      </label>
      <label className="flex items-start gap-2 text-sm leading-6">
        <input type="checkbox" name="confirmed" value="yes" className="mt-1" />
        <span>Create this GitHub repository. I understand generated code is not published by this action.</span>
      </label>
      <SubmitButton pendingLabel="Creating">Create Repository</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
