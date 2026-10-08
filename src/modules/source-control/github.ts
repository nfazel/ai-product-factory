import { SourceControlFailure } from "@/modules/source-control/errors";
import { mapCheckStatus, mapConclusion, mapPullRequestState, mapReviewState, rateLimitMessage } from "@/modules/source-control/github-map";
import { buildPublishArguments, pushRef } from "@/modules/source-control/push";
import type { BranchProtection, RemoteCheck, RemoteComment, RemotePullRequest, RemoteReview, SourceControlProvider } from "@/modules/source-control/types";

type Credentials = { token: string; owner: string; repository: string; installationId: string; mode: "app" | "pat" };

export function credentialPresence() {
  const owner = process.env.GITHUB_OWNER?.trim() ?? "";
  const repository = process.env.GITHUB_REPOSITORY?.trim() ?? "";
  const appReady = Boolean(process.env.GITHUB_APP_ID?.trim() && process.env.GITHUB_APP_INSTALLATION_ID?.trim() && process.env.GITHUB_APP_PRIVATE_KEY?.trim());
  const patReady = Boolean(process.env.GITHUB_TOKEN?.trim());
  return { owner, repository, appReady, patReady, configured: Boolean(owner && repository && (appReady || patReady)) };
}

async function appInstallationToken() {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!appId || !installationId || !privateKey) return null;
  const { createSign } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey).toString("base64url");
  const response = await githubFetch(`/app/installations/${installationId}/access_tokens`, `${unsigned}.${signature}`, "POST");
  const body = (await response.json()) as { token?: string };
  if (!body.token) throw new SourceControlFailure("GitHub authentication failed.", "AUTH");
  return { token: body.token, installationId };
}

export async function loadCredentials(): Promise<Credentials | null> {
  const presence = credentialPresence();
  if (!presence.owner || !presence.repository) return null;
  if (presence.appReady) {
    const installed = await appInstallationToken();
    if (!installed) return null;
    return { token: installed.token, owner: presence.owner, repository: presence.repository, installationId: installed.installationId, mode: "app" };
  }
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return null;
  return { token, owner: presence.owner, repository: presence.repository, installationId: "", mode: "pat" };
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
        canPush: Boolean(body.permissions?.push),
      };
    },
    async getDefaultBranch() {
      return (await this.getRepository()).defaultBranch;
    },
    async getBranchTip(branch) {
      const response = await fetch(`https://api.github.com${base}/git/ref/heads/${encodeURIComponent(branch)}`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${credentials.token}`, "User-Agent": "ai-product-factory" },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new SourceControlFailure("GitHub is unavailable.", "UNAVAILABLE");
      const body = (await response.json()) as { object?: { sha?: string } };
      return body.object?.sha ?? null;
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
      if (pushed.code !== 0) throw new SourceControlFailure(`The remote rejected the push. ${pushed.output}`.trim(), "REJECTED");
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
      const body = (await response.json()) as { id: number; user?: { login?: string }; state: string; body?: string; submitted_at?: string }[];
      return body.map((review) => ({
        id: String(review.id),
        reviewer: review.user?.login ?? "",
        state: mapReviewState(review.state),
        body: review.body ?? "",
        submittedAt: review.submitted_at ?? null,
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
      const response = await githubFetch(`${base}/commits/${sha}/check-runs`, credentials.token);
      const body = (await response.json()) as { check_runs?: GitHubCheck[] };
      return (body.check_runs ?? []).map(mapCheck);
    },
    async getCommitStatus(sha) {
      const response = await githubFetch(`${base}/commits/${sha}/status`, credentials.token);
      const body = (await response.json()) as { state?: string; statuses?: { context: string; state: string }[] };
      return { state: body.state ?? "pending", statuses: body.statuses ?? [] };
    },
    async getBranchProtection(branch) {
      const response = await fetch(`https://api.github.com${base}/branches/${encodeURIComponent(branch)}/protection`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${credentials.token}`, "User-Agent": "ai-product-factory" },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 404) return null;
      if (!response.ok) return null;
      const body = (await response.json()) as {
        required_pull_request_reviews?: { required_approving_review_count?: number };
        required_status_checks?: { contexts?: string[]; checks?: { context: string }[] };
        required_conversation_resolution?: { enabled?: boolean };
        restrictions?: { users?: { login: string }[] } | null;
      };
      const checks = body.required_status_checks?.contexts ?? body.required_status_checks?.checks?.map((item) => item.context) ?? [];
      return {
        requiredApprovals: body.required_pull_request_reviews?.required_approving_review_count ?? 0,
        requiredChecks: checks,
        conversationResolution: Boolean(body.required_conversation_resolution?.enabled),
        restrictions: body.restrictions?.users?.map((user) => user.login).join(", ") ?? "",
      } satisfies BranchProtection;
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
    mergeCommitSha: pull.merge_commit_sha ?? "",
    mergedAt: pull.merged_at ?? null,
    mergedBy: pull.merged_by?.login ?? "",
  };
}

type GitHubCheck = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string | null;
};

function mapCheck(check: GitHubCheck): RemoteCheck {
  return {
    id: String(check.id),
    name: check.name,
    status: mapCheckStatus(check.status),
    conclusion: mapConclusion(check.conclusion),
    startedAt: check.started_at,
    completedAt: check.completed_at,
    detailsUrl: check.html_url ?? "",
  };
}
