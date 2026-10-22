import { SourceControlFailure } from "@/modules/source-control/errors";
import { readStoredGitHubAccess } from "@/modules/source-control/github-credentials";
import { mapCheckStatus, mapConclusion, mapPullRequestState, mapReviewState, rateLimitMessage } from "@/modules/source-control/github-map";
import { branchTipFromGitHub, buildBaselinePushArguments, buildPublishArguments, installationTokenUsable, publicationTransportFailure, pushRef } from "@/modules/source-control/push";
import type { BranchProtection, ProtectionLookup, RemoteCheck, RemoteComment, RemotePullRequest, RemoteReview, SourceControlProvider, WorkflowLookup } from "@/modules/source-control/types";

type Credentials = {
  token: string;
  owner: string;
  repository: string;
  installationId: string;
  mode: "app" | "pat";
  installationCanPush: boolean | null;
};

export type GitHubAppMaterial = { appId: string; installationId: string; privateKey: string };

export type InstallationPermissions = { contents?: string; metadata?: string; pull_requests?: string };

export type GitHubAccess = {
  token: string;
  mode: "app" | "pat";
  app: GitHubAppMaterial | null;
  permissions: InstallationPermissions | null;
};

/** Contents write is the installation grant that allows a branch push. */
export function installationContentsCanPush(permissions: { contents?: string } | null | undefined) {
  return permissions?.contents === "write";
}

export function assertInstallationOperational(installation: { suspended_at?: string | null }) {
  if (installation.suspended_at) throw new SourceControlFailure("The GitHub App installation is suspended.", "PERMISSION");
}

export function credentialPresence() {
  const owner = process.env.GITHUB_OWNER?.trim() ?? "";
  const repository = process.env.GITHUB_REPOSITORY?.trim() ?? "";
  const appReady = githubAppConfigured();
  const patReady = Boolean(process.env.GITHUB_TOKEN?.trim());
  return { owner, repository, appReady, patReady, configured: Boolean(owner && repository && (appReady || patReady)) };
}

export function githubAppConfigured() {
  return Boolean(
    process.env.GITHUB_APP_ID?.trim() &&
      process.env.GITHUB_APP_INSTALLATION_ID?.trim() &&
      process.env.GITHUB_APP_PRIVATE_KEY?.trim(),
  );
}

export async function resolveAppMaterial(): Promise<GitHubAppMaterial | null> {
  if (githubAppConfigured()) {
    return {
      appId: process.env.GITHUB_APP_ID?.trim() ?? "",
      installationId: process.env.GITHUB_APP_INSTALLATION_ID?.trim() ?? "",
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() ?? "",
    };
  }
  const stored = await readStoredGitHubAccess();
  if (stored?.mode === "app") {
    return { appId: stored.appId, installationId: stored.installationId, privateKey: stored.privateKey };
  }
  return null;
}

export async function mintInstallationToken(material: GitHubAppMaterial) {
  const jwt = await createAppJwt(material);
  const installation = await githubFetch(`/app/installations/${material.installationId}`, jwt);
  const installationBody = (await installation.json()) as { suspended_at?: string | null };
  assertInstallationOperational(installationBody);
  const response = await githubFetch(`/app/installations/${material.installationId}/access_tokens`, jwt, "POST");
  const body = (await response.json()) as { token?: string; expires_at?: string; permissions?: InstallationPermissions };
  if (!body.token) throw new SourceControlFailure("GitHub authentication failed.", "AUTH");
  if (!installationTokenUsable(body.expires_at)) {
    throw new SourceControlFailure("The GitHub installation token expired before publication. Nothing was published.", "AUTH");
  }
  return {
    token: body.token,
    installationId: material.installationId,
    permissions: body.permissions ?? {},
  };
}

export async function createAppJwt(material: GitHubAppMaterial) {
  const { createSign } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: material.appId })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(material.privateKey).toString("base64url");
  return `${unsigned}.${signature}`;
}

/** Installation token only. A personal access token is not a fallback. */
export async function resolveInstallationAccess(): Promise<GitHubAccess | null> {
  const material = await resolveAppMaterial();
  if (!material) return null;
  const installed = await mintInstallationToken(material);
  return { token: installed.token, mode: "app", app: material, permissions: installed.permissions };
}

export async function resolveGitHubAccessToken(): Promise<GitHubAccess | null> {
  const material = await resolveAppMaterial();
  if (material) {
    const installed = await mintInstallationToken(material);
    return { token: installed.token, mode: "app", app: material, permissions: installed.permissions };
  }
  const stored = await readStoredGitHubAccess();
  if (stored?.mode === "pat") return { token: stored.token, mode: "pat", app: null, permissions: null };
  const envToken = process.env.GITHUB_TOKEN?.trim();
  if (envToken) return { token: envToken, mode: "pat", app: null, permissions: null };
  return null;
}

export async function loadCredentials(target?: { owner: string; repository: string }): Promise<Credentials | null> {
  const presence = credentialPresence();
  const owner = target?.owner?.trim() || presence.owner;
  const repository = target?.repository?.trim() || presence.repository;
  if (!owner || !repository) return null;
  const access = await resolveGitHubAccessToken();
  if (!access) return null;
  return {
    token: access.token,
    owner,
    repository,
    installationId: access.app?.installationId ?? "",
    mode: access.mode,
    installationCanPush: access.mode === "app" ? installationContentsCanPush(access.permissions) : null,
  };
}

export async function githubRequest(path: string, token: string, method = "GET", body?: unknown) {
  return githubFetch(path, token, method, body);
}

async function githubFetch(path: string, token: string, method = "GET", body?: unknown) {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ai-product-factory",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SourceControlFailure("GitHub is unavailable.", "UNAVAILABLE");
  }
  if (response.status === 401) throw new SourceControlFailure("GitHub authentication failed.", "AUTH");
  const limited = rateLimitMessage(response.headers);
  if ((response.status === 403 || response.status === 429) && limited) {
    throw new SourceControlFailure(limited, "RATE_LIMIT");
  }
  if (response.status === 403) throw new SourceControlFailure("GitHub denied access to the repository.", "PERMISSION");
  if (response.status === 404) throw new SourceControlFailure("The configured repository was not found.", "NOT_FOUND");
  if (response.status === 422) throw new SourceControlFailure("GitHub rejected the request.", "REJECTED");
  if (!response.ok) throw new SourceControlFailure("GitHub is unavailable.", "UNAVAILABLE");
  return response;
}

export async function createInstallationRepository(input: { owner: string; name: string; isPrivate: boolean }) {
  const material = await resolveAppMaterial();
  if (!material) throw new SourceControlFailure("The GitHub App is not configured.", "AUTH");
  const installed = await mintInstallationToken(material);
  const body = { name: input.name, private: input.isPrivate, auto_init: true };
  let response: Response;
  try {
    response = await githubFetch(`/orgs/${encodeURIComponent(input.owner)}/repos`, installed.token, "POST", body);
  } catch (error) {
    if (!(error instanceof SourceControlFailure) || error.kind !== "NOT_FOUND") throw error;
    response = await githubFetch("/user/repos", installed.token, "POST", body);
  }
  const payload = (await response.json()) as { full_name?: string; html_url?: string; default_branch?: string };
  if (!payload.full_name || !payload.html_url) {
    throw new SourceControlFailure("GitHub did not return the new repository.", "REJECTED");
  }
  return {
    fullName: payload.full_name,
    url: payload.html_url,
    defaultBranch: payload.default_branch || "main",
  };
}

export function createGitHubProvider(credentials: Credentials): SourceControlProvider {
  const base = `/repos/${credentials.owner}/${credentials.repository}`;
  return {
    evidenceSource: "GITHUB",
    async getRepository() {
      const response = await githubFetch(base, credentials.token);
      const body = (await response.json()) as {
        name: string;
        html_url: string;
        default_branch: string;
        permissions?: { push?: boolean };
      };
      return {
        owner: credentials.owner,
        name: body.name,
        url: body.html_url,
        defaultBranch: body.default_branch,
        canPush: credentials.mode === "app" ? credentials.installationCanPush === true : Boolean(body.permissions?.push),
      };
    },
    async getDefaultBranch() {
      return (await this.getRepository()).defaultBranch;
    },
    async getBranchTip(branch) {
      let response: Response;
      try {
        response = await fetch(`https://api.github.com${base}/git/ref/heads/${encodeURIComponent(branch)}`, {
          headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${credentials.token}`, "User-Agent": "ai-product-factory" },
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new SourceControlFailure("GitHub could not be reached. Nothing was published.", "UNAVAILABLE");
      }
      const body = await response.json().catch(() => null);
      return branchTipFromGitHub(response.status, body);
    },
    async publishBranch(input) {
      const args = buildPublishArguments({
        remoteUrl: `https://github.com/${credentials.owner}/${credentials.repository}.git`,
        localBranch: input.branch,
        remoteBranch: input.branch,
      });
      if (args.join(" ") !== input.args.join(" ")) {
        throw new SourceControlFailure("Publication only uses the safe push arguments.", "REJECTED");
      }
      const pushed = await pushRef(input.cwd, args, credentials.token);
      if (pushed.code !== 0) throw publicationTransportFailure(pushed.output);
      return { remoteSha: input.sha };
    },
    async publishCommit(input) {
      if (input.remoteBranch !== "main") throw new SourceControlFailure("Only the main branch can be initialized.", "REJECTED");
      const args = buildBaselinePushArguments({
        remoteUrl: `https://github.com/${credentials.owner}/${credentials.repository}.git`,
        baselineSha: input.sha,
      });
      const pushed = await pushRef(input.cwd, args, credentials.token);
      if (pushed.code !== 0) throw publicationTransportFailure(pushed.output);
      return { remoteSha: input.sha };
    },
    async createPullRequest(input) {
      const response = await githubFetch(`${base}/pulls`, credentials.token, "POST", {
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
        draft: false,
      });
      return mapPull((await response.json()) as GitHubPull);
    },
    async getPullRequest(number) {
      const response = await githubFetch(`${base}/pulls/${number}`, credentials.token);
      return mapPull((await response.json()) as GitHubPull);
    },
    async getPullRequestFiles(number) {
      const response = await githubFetch(`${base}/pulls/${number}/files`, credentials.token);
      const body = (await response.json()) as { filename: string }[];
      return body.map((file) => ({ path: file.filename }));
    },
    async getPullRequestReviews(number) {
      const response = await githubFetch(`${base}/pulls/${number}/reviews`, credentials.token);
      const body = (await response.json()) as { id: number; user?: { login?: string }; state: string; body?: string; submitted_at?: string; commit_id?: string }[];
      return body.map((review) => ({
        id: String(review.id),
        reviewer: review.user?.login ?? "",
        state: mapReviewState(review.state),
        body: review.body ?? "",
        submittedAt: review.submitted_at ?? null,
        commitSha: "commit_id" in review && typeof review.commit_id === "string" ? review.commit_id : "",
      })) satisfies RemoteReview[];
    },
    async getPullRequestComments(number) {
      const response = await githubFetch(`${base}/pulls/${number}/comments`, credentials.token);
      const body = (await response.json()) as { id: number; user?: { login?: string }; body?: string; path?: string; line?: number | null; created_at: string; updated_at: string }[];
      return body.map((comment) => ({
        id: String(comment.id),
        author: comment.user?.login ?? "",
        body: comment.body ?? "",
        path: comment.path ?? "",
        line: comment.line ?? null,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
      })) satisfies RemoteComment[];
    },
    async getCheckRuns(sha) {
      const runs = await readAllCheckRuns(base, sha, credentials.token);
      const workflows = await readWorkflowPaths(base, sha, credentials.token);
      return runs.map((check) => {
        const mapped = mapCheck(check);
        const suite = check.check_suite?.id ? String(check.check_suite.id) : "";
        return { ...mapped, workflow: workflows.get(suite) ?? "" };
      });
    },
    async getCommitStatus(sha) {
      const response = await githubFetch(`${base}/commits/${sha}/status`, credentials.token);
      const body = (await response.json()) as {
        state?: string;
        statuses?: { context: string; state: string; created_at?: string | null; updated_at?: string | null; sha?: string }[];
      };
      return {
        state: body.state ?? "pending",
        statuses: (body.statuses ?? []).map((status) => ({
          context: status.context,
          state: status.state,
          createdAt: status.created_at ?? null,
          updatedAt: status.updated_at ?? null,
          headSha: status.sha ?? "",
        })),
      };
    },
    async getBranchProtection(branch) {
      return readProtection(base, branch, credentials.token);
    },
    async getWorkflowCount() {
      return readWorkflowCount(base, credentials.token);
    },
  };
}

type GitHubPull = {
  id: number;
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  state: string;
  draft?: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string | null;
  base: { ref: string };
  head: { ref: string; sha: string };
  user?: { login?: string };
  merge_commit_sha?: string | null;
  merged_at?: string | null;
  merged_by?: { login?: string } | null;
};

function mapPull(pull: GitHubPull): RemotePullRequest {
  return {
    id: String(pull.id),
    number: pull.number,
    url: pull.html_url,
    title: pull.title,
    body: pull.body ?? "",
    state: pull.draft ? "DRAFT" : mapPullRequestState(pull.state, Boolean(pull.merged)),
    baseBranch: pull.base.ref,
    headBranch: pull.head.ref,
    headSha: pull.head.sha,
    author: pull.user?.login ?? "",
    merged: Boolean(pull.merged),
    mergeable: typeof pull.mergeable === "boolean" ? pull.mergeable : null,
    mergeableState: pull.mergeable_state ?? "",
    mergeCommitSha: pull.merge_commit_sha ?? "",
    mergedAt: pull.merged_at ?? null,
    mergedBy: pull.merged_by?.login ?? "",
  };
}

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "User-Agent": "ai-product-factory",
});

async function readProtection(base: string, branch: string, token: string): Promise<ProtectionLookup> {
  try {
    const response = await fetch(`https://api.github.com${base}/branches/${encodeURIComponent(branch)}/protection`, {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 404) return { access: "readable", protection: null };
    if (response.status === 401 || response.status === 403) return { access: "forbidden" };
    if (!response.ok) return { access: "unavailable" };
    const body = (await response.json()) as {
      required_pull_request_reviews?: { required_approving_review_count?: number };
      required_status_checks?: { contexts?: string[]; checks?: { context: string }[] };
      required_conversation_resolution?: { enabled?: boolean };
      restrictions?: { users?: { login: string }[] } | null;
    };
    const checks = body.required_status_checks?.contexts ?? body.required_status_checks?.checks?.map((item) => item.context) ?? [];
    return {
      access: "readable",
      protection: {
        requiredApprovals: body.required_pull_request_reviews?.required_approving_review_count ?? 0,
        requiredChecks: checks,
        conversationResolution: Boolean(body.required_conversation_resolution?.enabled),
        restrictions: body.restrictions?.users?.map((user) => user.login).join(", ") ?? "",
      } satisfies BranchProtection,
    };
  } catch {
    return { access: "unavailable" };
  }
}

async function readWorkflowCount(base: string, token: string): Promise<WorkflowLookup> {
  try {
    const response = await fetch(`https://api.github.com${base}/actions/workflows`, {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 404) return { access: "readable", count: 0 };
    if (response.status === 401 || response.status === 403) return { access: "forbidden" };
    if (!response.ok) return { access: "unavailable" };
    const body = (await response.json()) as { total_count?: number };
    return { access: "readable", count: body.total_count ?? 0 };
  } catch {
    return { access: "unavailable" };
  }
}

type GitHubCheck = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string | null;
  head_sha?: string | null;
  app?: { slug?: string | null; id?: number } | null;
  check_suite?: { id?: number } | null;
};

/**
 * `filter=latest` keeps the latest run inside each check suite. A new workflow
 * run creates a new suite, so the failed attempt and the later success are both
 * returned. Callers select the current attempt from the full list.
 */
async function readAllCheckRuns(base: string, sha: string, token: string) {
  const collected: GitHubCheck[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await githubFetch(
      `${base}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100&page=${page}&filter=all`,
      token,
    );
    const body = (await response.json()) as { check_runs?: GitHubCheck[]; total_count?: number };
    const runs = body.check_runs ?? [];
    collected.push(...runs);
    if (runs.length === 0 || collected.length >= (body.total_count ?? collected.length)) break;
  }
  return collected;
}

async function readWorkflowPaths(base: string, sha: string, token: string) {
  const paths = new Map<string, string>();
  try {
    const response = await fetch(`https://api.github.com${base}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=100`, {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return paths;
    const body = (await response.json()) as { workflow_runs?: { check_suite_id?: number; path?: string; name?: string }[] };
    for (const run of body.workflow_runs ?? []) {
      if (!run.check_suite_id) continue;
      paths.set(String(run.check_suite_id), run.path || run.name || "");
    }
  } catch {
    return paths;
  }
  return paths;
}

function mapCheck(check: GitHubCheck): RemoteCheck {
  return {
    id: String(check.id),
    name: check.name,
    status: mapCheckStatus(check.status),
    conclusion: mapConclusion(check.conclusion),
    startedAt: check.started_at,
    completedAt: check.completed_at,
    detailsUrl: check.html_url ?? "",
    headSha: check.head_sha ?? "",
    app: check.app?.slug || (check.app?.id ? String(check.app.id) : ""),
    workflow: "",
  };
}
