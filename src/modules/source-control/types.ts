export type RemoteRepository = {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  canPush: boolean;
};

export type RemotePullRequest = {
  id: string;
  number: number;
  url: string;
  title: string;
  body: string;
  state: "DRAFT" | "OPEN" | "CLOSED" | "MERGED";
  baseBranch: string;
  headBranch: string;
  headSha: string;
  author: string;
  mergeCommitSha: string;
  mergedAt: string | null;
  mergedBy: string;
};

export type CheckConclusion =
  | "SUCCESS"
  | "FAILURE"
  | "NEUTRAL"
  | "CANCELLED"
  | "SKIPPED"
  | "TIMED_OUT"
  | "ACTION_REQUIRED"
  | "UNKNOWN";

export type RemoteCheck = {
  id: string;
  name: string;
  status: "QUEUED" | "IN_PROGRESS" | "COMPLETED";
  conclusion: CheckConclusion;
  startedAt: string | null;
  completedAt: string | null;
  detailsUrl: string;
};

export type RemoteReview = {
  id: string;
  reviewer: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "UNKNOWN";
  body: string;
  submittedAt: string | null;
};

export type RemoteComment = {
  id: string;
  author: string;
  body: string;
  path: string;
  line: number | null;
  createdAt: string;
  updatedAt: string;
};

export type BranchProtection = {
  requiredApprovals: number;
  requiredChecks: string[];
  conversationResolution: boolean;
  restrictions: string;
};

/**
 * Source control operations the factory may perform.
 * Merge is intentionally absent. A person merges in GitHub.
 */
export type SourceControlProvider = {
  readonly evidenceSource: "GITHUB";
  getRepository(): Promise<RemoteRepository>;
  getDefaultBranch(): Promise<string>;
  getBranchTip(branch: string): Promise<string | null>;
  publishBranch(input: { branch: string; sha: string; args: readonly string[]; cwd: string }): Promise<{ remoteSha: string }>;
  createPullRequest(input: { title: string; body: string; head: string; base: string; sha: string }): Promise<RemotePullRequest>;
  getPullRequest(number: number): Promise<RemotePullRequest>;
  getPullRequestFiles(number: number): Promise<{ path: string }[]>;
  getPullRequestReviews(number: number): Promise<RemoteReview[]>;
  getPullRequestComments(number: number): Promise<RemoteComment[]>;
  getCheckRuns(sha: string): Promise<RemoteCheck[]>;
  getCommitStatus(sha: string): Promise<{ state: string; statuses: { context: string; state: string }[] }>;
  getBranchProtection(branch: string): Promise<BranchProtection | null>;
};
