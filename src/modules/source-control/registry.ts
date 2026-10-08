import { SourceControlFailure } from "@/modules/source-control/errors";
import { createGitHubProvider, loadCredentials } from "@/modules/source-control/github";
import type { SourceControlProvider } from "@/modules/source-control/types";

let override: SourceControlProvider | null = null;

export function setSourceControlProviderForTests(provider: SourceControlProvider | null) {
  override = provider;
}

export async function getSourceControlProvider() {
  if (override) return override;
  const credentials = await loadCredentials();
  if (!credentials) {
    throw new SourceControlFailure("GitHub credentials are not configured.", "AUTH");
  }
  return createGitHubProvider(credentials);
}
