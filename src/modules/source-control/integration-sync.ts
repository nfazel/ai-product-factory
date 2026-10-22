import { spawn } from "node:child_process";

import { childEnv } from "@/modules/coding/git";
import { SourceControlFailure } from "@/modules/source-control/errors";
import { assertSafeRef, pushRef } from "@/modules/source-control/push";
import { redactSecrets } from "@/modules/source-control/redact";

const SHA = /^[0-9a-f]{40}$/i;
const TRACKING_REMOTE = "github";

export type IntegrationSyncStatus =
  | "current"
  | "fast-forward"
  | "ahead"
  | "diverged"
  | "dirty"
  | "missing-local"
  | "missing-remote"
  | "auth-failed"
  | "local-only";

export type IntegrationSyncObservation = {
  integrationBranch: string;
  headBranch: string;
  localSha: string;
  remoteSha: string;
  workingTreeClean: boolean;
  localIsAncestorOfRemote: boolean;
  remoteIsAncestorOfLocal: boolean;
  githubConfigured: boolean;
  authenticated: boolean;
  remoteAvailable: boolean;
};

export type IntegrationSyncDecision = {
  status: IntegrationSyncStatus;
  action: "none" | "fast-forward" | "stop";
  message: string;
  baseCommit: string;
};

export type IntegrationSyncResult = {
  status: IntegrationSyncStatus;
  message: string;
  integrationBranch: string;
  baseCommit: string;
  remoteCommit: string;
  synchronised: boolean;
  headWasOnIntegrationBranch: boolean;
};

export type IntegrationSyncGit = {
  run: (cwd: string, args: readonly string[]) => Promise<{ code: number; output: string }>;
  fetch: (cwd: string, args: readonly string[], token: string) => Promise<{ code: number; output: string }>;
};

export type IntegrationRemoteTip = {
  read: (input: { owner: string; repository: string; branch: string; token: string }) => Promise<string | null>;
};

/** Pure decision. Never mutates a repository. */
export function decideIntegrationSync(observation: IntegrationSyncObservation): IntegrationSyncDecision {
  const branch = observation.integrationBranch || "main";
  if (!observation.githubConfigured) {
    if (!SHA.test(observation.localSha)) {
      return {
        status: "missing-local",
        action: "stop",
        message: `The local integration branch ${branch} does not exist. Coding cannot start until that branch has a commit.`,
        baseCommit: "",
      };
    }
    return {
      status: "local-only",
      action: "none",
      message: `This product repository is not connected to GitHub. Coding will use local ${branch} at ${observation.localSha}.`,
      baseCommit: observation.localSha.toLowerCase(),
    };
  }
  if (!observation.authenticated) {
    return {
      status: "auth-failed",
      action: "stop",
      message:
        "GitHub authentication failed while reading the product integration branch. Validate the GitHub App installation, then try again. Nothing was changed locally.",
      baseCommit: "",
    };
  }
  if (!observation.remoteAvailable || !SHA.test(observation.remoteSha)) {
    return {
      status: "missing-remote",
      action: "stop",
      message: `GitHub does not have integration branch ${branch} for this product repository. Publish or restore that branch before coding. Nothing was changed locally.`,
      baseCommit: "",
    };
  }
  if (!SHA.test(observation.localSha)) {
    return {
      status: "missing-local",
      action: "stop",
      message: `The local integration branch ${branch} does not exist. Create it from the GitHub tip before coding. Nothing was changed locally.`,
      baseCommit: "",
    };
  }
  const local = observation.localSha.toLowerCase();
  const remote = observation.remoteSha.toLowerCase();
  if (local === remote) {
    return {
      status: "current",
      action: "none",
      message: `Local ${branch} already matches GitHub at ${remote}.`,
      baseCommit: remote,
    };
  }
  if (observation.localIsAncestorOfRemote && !observation.remoteIsAncestorOfLocal) {
    if (!observation.workingTreeClean) {
      return {
        status: "dirty",
        action: "stop",
        message: `Local ${branch} is behind GitHub (${remote}). Commit or stash local working-tree changes, then start coding again so the branch can fast-forward. Nothing was changed locally.`,
        baseCommit: "",
      };
    }
    return {
      status: "fast-forward",
      action: "fast-forward",
      message: `Local ${branch} will fast-forward from ${local} to GitHub ${remote}.`,
      baseCommit: remote,
    };
  }
  if (observation.remoteIsAncestorOfLocal && !observation.localIsAncestorOfRemote) {
    return {
      status: "ahead",
      action: "stop",
      message: `Local ${branch} (${local}) is ahead of GitHub (${remote}). Publish or reconcile that history before coding. Nothing was changed locally.`,
      baseCommit: "",
    };
  }
  return {
    status: "diverged",
    action: "stop",
    message: `Local ${branch} (${local}) and GitHub (${remote}) have diverged. Reconcile the histories outside AI Product Builder before coding. Nothing was changed locally.`,
    baseCommit: "",
  };
}

export function integrationTrackingRef(branch: string) {
  assertSafeRef(branch);
  return `refs/remotes/${TRACKING_REMOTE}/${branch}`;
}

export function createIntegrationSyncGit(): IntegrationSyncGit {
  return {
    async run(cwd, args) {
      assertLocalSyncArgs(args);
      return runProcess(cwd, ["git", "--no-pager", ...args]);
    },
    async fetch(cwd, args, token) {
      assertLocalSyncArgs(args);
      return pushRef(cwd, args, token);
    },
  };
}

function assertLocalSyncArgs(args: readonly string[]) {
  if (args.some((arg) => arg === "--force" || arg === "--force-with-lease" || arg.startsWith("+"))) {
    throw new SourceControlFailure("Force update is not available for product repository synchronisation.", "REJECTED");
  }
  if (args.includes("reset") || args.includes("rebase") || args.includes("pull") || args.includes("clean")) {
    throw new SourceControlFailure("That git operation is not permitted during product repository synchronisation.", "REJECTED");
  }
  if (args.includes("merge") && !args.includes("--ff-only")) {
    throw new SourceControlFailure("Only a fast-forward merge is permitted during product repository synchronisation.", "REJECTED");
  }
}

function runProcess(cwd: string, argv: string[]) {
  return new Promise<{ code: number; output: string }>((resolve) => {
    const child = spawn(argv[0] ?? "git", argv.slice(1), {
      cwd,
      shell: false,
      env: {
        ...childEnv(),
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
        GIT_CONFIG_COUNT: "2",
        GIT_CONFIG_KEY_0: "commit.gpgsign",
        GIT_CONFIG_VALUE_0: "false",
        GIT_CONFIG_KEY_1: "core.fsmonitor",
        GIT_CONFIG_VALUE_1: "false",
      },
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

export async function readLocalSha(git: IntegrationSyncGit, cwd: string, ref: string) {
  const result = await git.run(cwd, ["rev-parse", "--verify", "--quiet", ref]);
  const sha = result.output.trim();
  return result.code === 0 && SHA.test(sha) ? sha.toLowerCase() : "";
}

export async function readHeadBranch(git: IntegrationSyncGit, cwd: string) {
  const symbolic = await git.run(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (symbolic.code === 0 && symbolic.output.trim()) return symbolic.output.trim();
  return "HEAD";
}

export async function workingTreeIsClean(git: IntegrationSyncGit, cwd: string) {
  const status = await git.run(cwd, ["status", "--porcelain"]);
  return status.code === 0 && status.output.trim() === "";
}

export async function isAncestor(git: IntegrationSyncGit, cwd: string, ancestor: string, descendant: string) {
  if (!SHA.test(ancestor) || !SHA.test(descendant)) return false;
  if (ancestor.toLowerCase() === descendant.toLowerCase()) return true;
  const result = await git.run(cwd, ["merge-base", "--is-ancestor", ancestor, descendant]);
  return result.code === 0;
}

export async function commitObjectExists(git: IntegrationSyncGit, cwd: string, sha: string) {
  if (!SHA.test(sha)) return false;
  const result = await git.run(cwd, ["cat-file", "-e", `${sha}^{commit}`]);
  return result.code === 0;
}

export async function githubRemoteUrl(owner: string, repository: string) {
  if (!owner.trim() || !repository.trim() || owner.includes("/") || repository.includes("/")) {
    throw new SourceControlFailure("The configured GitHub repository is invalid.", "REJECTED");
  }
  return `https://github.com/${owner.trim()}/${repository.trim()}.git`;
}

/**
 * Fetches the GitHub integration branch and fast-forwards the local branch when safe.
 * Never force-updates, merges non-FF, or resets.
 */
export async function synchroniseIntegrationBranch(input: {
  cwd: string;
  integrationBranch: string;
  owner: string;
  repository: string;
  token: string;
  remoteSha: string;
  git?: IntegrationSyncGit;
}): Promise<IntegrationSyncResult> {
  const git = input.git ?? createIntegrationSyncGit();
  const branch = input.integrationBranch || "main";
  assertSafeRef(branch);
  if (!SHA.test(input.remoteSha)) {
    throw new SourceControlFailure(`GitHub does not have integration branch ${branch} for this product repository. Nothing was changed locally.`, "NOT_FOUND");
  }
  const remoteSha = input.remoteSha.toLowerCase();
  const localSha = await readLocalSha(git, input.cwd, `refs/heads/${branch}`);
  const headBranch = await readHeadBranch(git, input.cwd);
  const clean = await workingTreeIsClean(git, input.cwd);
  let localIsAncestorOfRemote = await isAncestor(git, input.cwd, localSha, remoteSha);
  let remoteIsAncestorOfLocal = await isAncestor(git, input.cwd, remoteSha, localSha);

  const remoteUrl = await githubRemoteUrl(input.owner, input.repository);
  const tracking = integrationTrackingRef(branch);
  // When the remote tip is absent from the local object store, both ancestry checks
  // fail and look like divergence. Fetch only in that case, then re-evaluate.
  if (
    localSha !== remoteSha &&
    !localIsAncestorOfRemote &&
    !remoteIsAncestorOfLocal &&
    !(await commitObjectExists(git, input.cwd, remoteSha))
  ) {
    const fetched = await git.fetch(input.cwd, ["fetch", remoteUrl, `refs/heads/${branch}:${tracking}`], input.token);
    if (fetched.code !== 0) {
      throw new SourceControlFailure(
        redactSecrets(`Git could not fetch ${branch} from GitHub. ${fetched.output.replace(/\s+/g, " ").trim() || "Nothing was changed locally."}`),
        "UNAVAILABLE",
      );
    }
    const trackingSha = await readLocalSha(git, input.cwd, tracking);
    if (trackingSha !== remoteSha) {
      throw new SourceControlFailure(
        `The fetched ${branch} tip ${trackingSha || "was missing"} does not match GitHub ${remoteSha}. Nothing was changed locally.`,
        "REJECTED",
      );
    }
    localIsAncestorOfRemote = await isAncestor(git, input.cwd, localSha, remoteSha);
    remoteIsAncestorOfLocal = await isAncestor(git, input.cwd, remoteSha, localSha);
  }

  const decision = decideIntegrationSync({
    integrationBranch: branch,
    headBranch,
    localSha,
    remoteSha,
    workingTreeClean: clean,
    localIsAncestorOfRemote,
    remoteIsAncestorOfLocal,
    githubConfigured: true,
    authenticated: true,
    remoteAvailable: true,
  });
  if (decision.action === "stop") {
    throw new SourceControlFailure(decision.message, decision.status === "auth-failed" ? "AUTH" : "REJECTED");
  }
  if (decision.action === "none") {
    const tip = await readLocalSha(git, input.cwd, `refs/heads/${branch}`);
    if (tip !== remoteSha) {
      throw new SourceControlFailure(`Local ${branch} does not match GitHub ${remoteSha}. Nothing was changed locally.`, "REJECTED");
    }
    return {
      status: decision.status,
      message: decision.message,
      integrationBranch: branch,
      baseCommit: remoteSha,
      remoteCommit: remoteSha,
      synchronised: false,
      headWasOnIntegrationBranch: headBranch === branch,
    };
  }

  if ((await readLocalSha(git, input.cwd, tracking)) !== remoteSha) {
    const fetched = await git.fetch(input.cwd, ["fetch", remoteUrl, `refs/heads/${branch}:${tracking}`], input.token);
    if (fetched.code !== 0) {
      throw new SourceControlFailure(
        redactSecrets(`Git could not fetch ${branch} from GitHub. ${fetched.output.replace(/\s+/g, " ").trim() || "Nothing was changed locally."}`),
        "UNAVAILABLE",
      );
    }
    const trackingSha = await readLocalSha(git, input.cwd, tracking);
    if (trackingSha !== remoteSha) {
      throw new SourceControlFailure(
        `The fetched ${branch} tip ${trackingSha || "was missing"} does not match GitHub ${remoteSha}. Nothing was changed locally.`,
        "REJECTED",
      );
    }
  }
  if (!(await isAncestor(git, input.cwd, localSha, remoteSha))) {
    throw new SourceControlFailure(
      `Local ${branch} can no longer fast-forward to GitHub ${remoteSha}. Nothing was changed locally.`,
      "DIVERGENCE",
    );
  }

  if (headBranch === branch) {
    if (!(await workingTreeIsClean(git, input.cwd))) {
      throw new SourceControlFailure(
        `Local ${branch} is behind GitHub (${remoteSha}). Commit or stash local working-tree changes, then start coding again so the branch can fast-forward. Nothing was changed locally.`,
        "REJECTED",
      );
    }
    const merged = await git.run(input.cwd, ["merge", "--ff-only", remoteSha]);
    if (merged.code !== 0) {
      throw new SourceControlFailure(
        redactSecrets(`Local ${branch} could not fast-forward to GitHub ${remoteSha}. ${merged.output.replace(/\s+/g, " ").trim() || "Nothing was changed locally."}`),
        "DIVERGENCE",
      );
    }
  } else {
    const updated = await git.run(input.cwd, ["update-ref", `refs/heads/${branch}`, remoteSha, localSha]);
    if (updated.code !== 0) {
      throw new SourceControlFailure(
        redactSecrets(`Local ${branch} could not be advanced to GitHub ${remoteSha}. ${updated.output.replace(/\s+/g, " ").trim() || "Nothing was changed locally."}`),
        "REJECTED",
      );
    }
  }

  const finalSha = await readLocalSha(git, input.cwd, `refs/heads/${branch}`);
  if (finalSha !== remoteSha) {
    throw new SourceControlFailure(
      `After synchronisation, local ${branch} is ${finalSha || "missing"} instead of GitHub ${remoteSha}.`,
      "REJECTED",
    );
  }
  return {
    status: "fast-forward",
    message: `Local ${branch} fast-forwarded to GitHub ${remoteSha}.`,
    integrationBranch: branch,
    baseCommit: remoteSha,
    remoteCommit: remoteSha,
    synchronised: true,
    headWasOnIntegrationBranch: headBranch === branch,
  };
}

export async function observeIntegrationBranch(input: {
  cwd: string;
  integrationBranch: string;
  owner: string;
  repository: string;
  githubConfigured: boolean;
  token: string | null;
  remoteSha: string | null;
  remoteError?: "auth" | "missing" | "unavailable" | null;
  git?: IntegrationSyncGit;
}): Promise<IntegrationSyncObservation> {
  const git = input.git ?? createIntegrationSyncGit();
  const branch = input.integrationBranch || "main";
  assertSafeRef(branch);
  const localSha = await readLocalSha(git, input.cwd, `refs/heads/${branch}`);
  const headBranch = await readHeadBranch(git, input.cwd);
  const clean = await workingTreeIsClean(git, input.cwd);
  const remoteSha = input.remoteSha && SHA.test(input.remoteSha) ? input.remoteSha.toLowerCase() : "";
  let localIsAncestorOfRemote = remoteSha ? await isAncestor(git, input.cwd, localSha, remoteSha) : false;
  let remoteIsAncestorOfLocal = remoteSha ? await isAncestor(git, input.cwd, remoteSha, localSha) : false;
  const canFetch =
    input.githubConfigured &&
    Boolean(input.token) &&
    input.remoteError !== "auth" &&
    input.remoteError !== "missing" &&
    input.remoteError !== "unavailable" &&
    Boolean(remoteSha) &&
    localSha !== remoteSha &&
    !localIsAncestorOfRemote &&
    !remoteIsAncestorOfLocal &&
    !(await commitObjectExists(git, input.cwd, remoteSha));
  if (canFetch && input.token) {
    // Bring the remote tip into the local object store before ancestry checks so a
    // behind branch is reported as fast-forward instead of a false divergence.
    const remoteUrl = await githubRemoteUrl(input.owner, input.repository);
    const tracking = integrationTrackingRef(branch);
    await git.fetch(input.cwd, ["fetch", remoteUrl, `refs/heads/${branch}:${tracking}`], input.token);
    localIsAncestorOfRemote = await isAncestor(git, input.cwd, localSha, remoteSha);
    remoteIsAncestorOfLocal = await isAncestor(git, input.cwd, remoteSha, localSha);
  }
  return {
    integrationBranch: branch,
    headBranch,
    localSha,
    remoteSha,
    workingTreeClean: clean,
    localIsAncestorOfRemote,
    remoteIsAncestorOfLocal,
    githubConfigured: input.githubConfigured,
    authenticated: Boolean(input.token) && input.remoteError !== "auth",
    remoteAvailable: Boolean(remoteSha) && input.remoteError !== "missing" && input.remoteError !== "unavailable",
  };
}
