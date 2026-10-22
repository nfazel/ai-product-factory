import { SourceControlFailure } from "@/modules/source-control/errors";
import type {
  BranchProtection,
  RemoteCheck,
  RemoteComment,
  RemotePullRequest,
  RemoteReview,
  SourceControlProvider,
} from "@/modules/source-control/types";

export type FakeFailure = "auth" | "permission" | "missing" | "rate" | "unavailable" | "rejected" | null;

export type FakeState = {
  owner: string;
  repo: string;
  defaultBranch: string;
  canPush: boolean;
  branches: Record<string, string>;
  deletedBranches: string[];
  pulls: RemotePullRequest[];
  files: Record<number, { path: string }[]>;
  reviews: Record<number, RemoteReview[]>;
  comments: Record<number, RemoteComment[]>;
  checks: Record<string, RemoteCheck[]>;
  statuses: Record<string, { context: string; state: string }[]>;
  protection: BranchProtection | null;
  protectionKnown: boolean;
  protectionAccess: "readable" | "forbidden" | "unavailable";
  workflowCount: number;
  workflowKnown: boolean;
  failure: FakeFailure;
  pushes: { branch: string; sha: string; args: readonly string[] }[];
  /** When set, the next main initialization finds this commit already created and does not replace it. */
  raceWinner: string;
  failCommitAuth: boolean;
  nextNumber: number;
};

export function createFakeSourceControl(partial?: Partial<FakeState>): SourceControlProvider & { state: FakeState } {
  const state: FakeState = {
    owner: "acme",
    repo: "claims",
    defaultBranch: "main",
    canPush: true,
    branches: {},
    deletedBranches: [],
    pulls: [],
    files: {},
    reviews: {},
    comments: {},
    checks: {},
    statuses: {},
    protection: { requiredApprovals: 1, requiredChecks: ["build"], conversationResolution: false, restrictions: "" },
    protectionKnown: true,
    protectionAccess: "readable",
    workflowCount: 0,
    workflowKnown: true,
    failure: null,
    pushes: [],
    raceWinner: "",
    failCommitAuth: false,
    nextNumber: 1,
    ...partial,
  };

  function guard() {
    if (state.failure === "auth") throw new SourceControlFailure("GitHub authentication failed.", "AUTH");
    if (state.failure === "permission") throw new SourceControlFailure("GitHub denied access to the repository.", "PERMISSION");
    if (state.failure === "missing") throw new SourceControlFailure("The configured repository was not found.", "NOT_FOUND");
    if (state.failure === "rate") throw new SourceControlFailure("GitHub rate limit reached. Retry after later.", "RATE_LIMIT");
    if (state.failure === "unavailable") throw new SourceControlFailure("GitHub is unavailable.", "UNAVAILABLE");
  }

  const provider: SourceControlProvider & { state: FakeState } = {
    evidenceSource: "GITHUB",
    state,
    async getRepository() {
      guard();
      return {
        owner: state.owner,
        name: state.repo,
        url: `https://github.com/${state.owner}/${state.repo}`,
        defaultBranch: state.defaultBranch,
        canPush: state.canPush,
      };
    },
    async getDefaultBranch() {
      const repository = await this.getRepository();
      if (!repository.defaultBranch) throw new SourceControlFailure("The default branch was not found.", "NOT_FOUND");
      return repository.defaultBranch;
    },
    async getBranchTip(branch) {
      guard();
      if (state.deletedBranches.includes(branch)) return null;
      return state.branches[branch] ?? null;
    },
    async publishBranch(input) {
      guard();
      if (state.failure === "rejected") throw new SourceControlFailure("The remote rejected the push.", "REJECTED");
      if (input.args.some((arg) => arg === "--force" || arg === "--force-with-lease" || arg.startsWith("+"))) {
        throw new SourceControlFailure("Force push is not available.", "REJECTED");
      }
      state.branches[input.branch] = input.sha;
      state.deletedBranches = state.deletedBranches.filter((item) => item !== input.branch);
      state.pushes.push({ branch: input.branch, sha: input.sha, args: input.args });
      return { remoteSha: input.sha };
    },
    async publishCommit(input) {
      guard();
      if (state.failCommitAuth) throw new SourceControlFailure("GitHub authentication failed.", "AUTH");
      if (input.remoteBranch !== "main") throw new SourceControlFailure("Only the main branch can be initialized.", "REJECTED");
      if (state.branches.main) throw new SourceControlFailure("updates were rejected", "REJECTED");
      if (state.raceWinner) {
        state.branches.main = state.raceWinner;
        throw new SourceControlFailure("updates were rejected", "REJECTED");
      }
      state.branches.main = input.sha;
      state.pushes.push({ branch: "main", sha: input.sha, args: ["push", "https://github.com/acme/claims.git", `${input.sha}:refs/heads/main`] });
      return { remoteSha: input.sha };
    },
    async createPullRequest(input) {
      guard();
      const number = state.nextNumber++;
      const pull: RemotePullRequest = {
        id: `pr-${number}`,
        number,
        url: `https://github.com/${state.owner}/${state.repo}/pull/${number}`,
        title: input.title,
        body: input.body,
        state: "OPEN",
        baseBranch: input.base,
        headBranch: input.head,
        headSha: input.sha,
        author: "local-user",
        merged: false,
        mergeable: true,
        mergeableState: "clean",
        mergeCommitSha: "",
        mergedAt: null,
        mergedBy: "",
      };
      state.pulls.push(pull);
      return pull;
    },
    async getPullRequest(number) {
      guard();
      const pull = state.pulls.find((item) => item.number === number);
      if (!pull) throw new SourceControlFailure("The pull request was not found.", "NOT_FOUND");
      return pull;
    },
    async getPullRequestFiles(number) {
      guard();
      return state.files[number] ?? [];
    },
    async getPullRequestReviews(number) {
      guard();
      return state.reviews[number] ?? [];
    },
    async getPullRequestComments(number) {
      guard();
      return state.comments[number] ?? [];
    },
    async getCheckRuns(sha) {
      guard();
      return state.checks[sha] ?? [];
    },
    async getCommitStatus(sha) {
      guard();
      return { state: "success", statuses: state.statuses[sha] ?? [] };
    },
    async getBranchProtection() {
      guard();
      if (state.protectionAccess === "forbidden") return { access: "forbidden" };
      if (state.protectionAccess === "unavailable" || !state.protectionKnown) return { access: "unavailable" };
      return { access: "readable", protection: state.protection };
    },
    async getWorkflowCount() {
      guard();
      if (!state.workflowKnown) return { access: "unavailable" };
      return { access: "readable", count: state.workflowCount };
    },
  };
  return provider;
}
