import { spawn } from "node:child_process";

import { childEnv } from "@/modules/coding/git";
import { SourceControlFailure } from "@/modules/source-control/errors";
import { redactSecrets } from "@/modules/source-control/redact";

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const TOKEN_SHAPE = /^(?:ghp_|gho_|github_pat_|ghs_)[A-Za-z0-9._-]+$/;
/** Present only in the environment of the one Git process that pushes. */
export const PUBLICATION_TOKEN_ENV = "AI_PRODUCT_FACTORY_GIT_TOKEN";
const CREDENTIAL_HELPER =
  '!f() { if [ "$1" != "get" ]; then exit 0; fi; echo "username=x-access-token"; echo "password=$AI_PRODUCT_FACTORY_GIT_TOKEN"; }; f';

export function assertSafeRef(ref: string) {
  if (!SAFE_REF.test(ref) || ref.includes("..") || ref.includes("+") || ref.startsWith("-")) {
    throw new SourceControlFailure("The branch name is not safe to publish.", "REJECTED");
  }
}

/** An empty GitHub repository answers a missing ref with this message and HTTP 409. */
export function emptyRepositoryMessage(body: unknown) {
  if (!body || typeof body !== "object" || !("message" in body)) return false;
  const message = body.message;
  return typeof message === "string" && /^git repository is empty\.?$/i.test(message.trim());
}

/** Classifies a branch-ref lookup. An empty repository has no remote branch. */
export function branchTipFromGitHub(status: number, body: unknown): string | null {
  if (status === 404 || (status === 409 && emptyRepositoryMessage(body))) return null;
  if (status === 401) throw new SourceControlFailure("GitHub authentication failed. Nothing was published.", "AUTH");
  if (status === 403) throw new SourceControlFailure("GitHub denied permission to read the branch. Nothing was published.", "PERMISSION");
  if (status === 409) throw new SourceControlFailure("GitHub rejected the branch lookup. Nothing was published.", "REJECTED");
  if (status >= 500) throw new SourceControlFailure("GitHub is unavailable. Nothing was published.", "UNAVAILABLE");
  if (status < 200 || status >= 300) throw new SourceControlFailure("GitHub is unavailable. Nothing was published.", "UNAVAILABLE");
  const sha = refSha(body);
  if (!sha) throw new SourceControlFailure("GitHub did not return the branch commit. Nothing was published.", "UNAVAILABLE");
  return sha;
}

function refSha(body: unknown) {
  if (!body || typeof body !== "object" || !("object" in body)) return "";
  const record = body.object;
  if (!record || typeof record !== "object" || !("sha" in record) || typeof record.sha !== "string") return "";
  return /^[0-9a-f]{40}$/i.test(record.sha) ? record.sha : "";
}

export function publicationTransportFailure(output: string) {
  const text = sanitizePublicationOutput(output);
  if (/could not read Username|terminal prompts disabled|Authentication failed|Invalid username or token/i.test(text)) {
    return new SourceControlFailure("Git could not authenticate the push. Nothing was published.", "AUTH");
  }
  if (/non-fast-forward|fetch first|updates were rejected/i.test(text)) {
    return new SourceControlFailure(
      "The remote branch has commits that are not in the approved branch. Publishing will not overwrite that history.",
      "DIVERGENCE",
    );
  }
  const detail = text.replace(/\s+/g, " ").trim();
  return new SourceControlFailure(detail ? `Git could not push the branch. ${detail}` : "Git could not push the branch. Nothing was published.", "REJECTED");
}

function sanitizePublicationOutput(value: string) {
  return redactSecrets(value)
    .replace(/authorization:\s*bearer\s+\S+/gi, "authorization: bearer [redacted]")
    .replace(/https:\/\/[^/\s:@]+:[^/\s@]+@github\.com/gi, "https://[redacted]@github.com");
}

/** The only push argument list the factory builds. It cannot express a force push. */
export function buildPublishArguments(input: { remoteUrl: string; localBranch: string; remoteBranch: string }) {
  assertSafeRef(input.localBranch);
  assertSafeRef(input.remoteBranch);
  if (!input.remoteUrl.startsWith("https://github.com/")) {
    throw new SourceControlFailure("Publication only targets the configured GitHub repository.", "REJECTED");
  }
  return ["push", input.remoteUrl, `${input.localBranch}:${input.remoteBranch}`] as const;
}

/** Publishes one existing commit to refs/heads/main. The refspec cannot force the update. */
export function buildBaselinePushArguments(input: { remoteUrl: string; baselineSha: string }) {
  if (!input.remoteUrl.startsWith("https://github.com/") || input.remoteUrl.includes("@")) {
    throw new SourceControlFailure("Publication only targets the configured GitHub repository.", "REJECTED");
  }
  if (!/^[0-9a-f]{40}$/i.test(input.baselineSha)) {
    throw new SourceControlFailure("The baseline commit is not a commit SHA.", "REJECTED");
  }
  return ["push", input.remoteUrl, `${input.baselineSha}:refs/heads/main`] as const;
}

export function installationTokenUsable(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return true;
  const expires = Date.parse(expiresAt);
  return !Number.isNaN(expires) && expires - now > 60_000;
}

/** Arguments and environment for one push. The token is not part of the argument list or the remote URL. */
export function publicationGitInvocation(args: readonly string[], token: string) {
  if (args.some((arg) => arg === "--force" || arg === "--force-with-lease" || arg.startsWith("+"))) {
    throw new SourceControlFailure("Force push is not available.", "REJECTED");
  }
  if (!TOKEN_SHAPE.test(token) || CREDENTIAL_HELPER.includes(token)) {
    throw new SourceControlFailure("GitHub authentication failed. Nothing was published.", "AUTH");
  }
  const argv = ["git", "-c", "credential.helper=", "-c", `credential.helper=${CREDENTIAL_HELPER}`, "--no-pager", ...args];
  if (argv.some((arg) => arg.includes(token) || /https:\/\/[^/\s]*@github\.com/i.test(arg) || /extraheader/i.test(arg))) {
    throw new SourceControlFailure("GitHub authentication failed. Nothing was published.", "AUTH");
  }
  return {
    argv,
    env: {
      ...childEnv(),
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "never",
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: "commit.gpgsign",
      GIT_CONFIG_VALUE_0: "false",
      GIT_CONFIG_KEY_1: "core.fsmonitor",
      GIT_CONFIG_VALUE_1: "false",
      [PUBLICATION_TOKEN_ENV]: token,
    },
  };
}

export async function pushRef(cwd: string, args: readonly string[], token: string) {
  const invocation = publicationGitInvocation(args, token);
  return runGit(cwd, invocation.argv, invocation.env);
}

function runGit(cwd: string, argv: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number; output: string }>((resolve) => {
    const child = spawn(/*turbopackIgnore: true*/ argv[0] ?? "git", argv.slice(1), {
      cwd,
      shell: false,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", () => resolve({ code: 1, output: "Git could not be started." }));
    child.on("close", (code) => resolve({ code: code ?? 1, output: redactSecrets(output).slice(0, 2000) }));
  });
}
