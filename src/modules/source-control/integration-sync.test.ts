import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SourceControlFailure } from "@/modules/source-control/errors";
import {
  createIntegrationSyncGit,
  decideIntegrationSync,
  observeIntegrationBranch,
  readLocalSha,
  synchroniseIntegrationBranch,
  type IntegrationSyncObservation,
} from "@/modules/source-control/integration-sync";

const dirs: string[] = [];
const TOKEN = "ghs_testdummyvaluefortestsonly0001";

function tempDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, args: string[]) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();
}

function makeRepo() {
  const dir = tempDir("apf-sync-repo-");
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(dir, "README.md"), "baseline\n");
  git(dir, ["add", "README.md"]);
  git(dir, ["commit", "-m", "baseline"]);
  return dir;
}

function makeBareRemote(from: string) {
  const bare = tempDir("apf-sync-bare-");
  execFileSync("git", ["-c", "commit.gpgsign=false", "clone", "--bare", from, bare], { encoding: "utf8" });
  return bare;
}

function observation(partial: Partial<IntegrationSyncObservation>): IntegrationSyncObservation {
  return {
    integrationBranch: "main",
    headBranch: "main",
    localSha: "a".repeat(40),
    remoteSha: "a".repeat(40),
    workingTreeClean: true,
    localIsAncestorOfRemote: true,
    remoteIsAncestorOfLocal: true,
    githubConfigured: true,
    authenticated: true,
    remoteAvailable: true,
    ...partial,
  };
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("decideIntegrationSync", () => {
  it("keeps a matching local and remote tip unchanged", () => {
    const sha = "b".repeat(40);
    const decision = decideIntegrationSync(observation({ localSha: sha, remoteSha: sha }));
    expect(decision).toMatchObject({ status: "current", action: "none", baseCommit: sha });
    expect(decision.message).toMatch(/already matches GitHub/);
  });

  it("requests a fast-forward when local is a clean ancestor of remote", () => {
    const local = "a".repeat(40);
    const remote = "c".repeat(40);
    const decision = decideIntegrationSync(
      observation({
        localSha: local,
        remoteSha: remote,
        localIsAncestorOfRemote: true,
        remoteIsAncestorOfLocal: false,
      }),
    );
    expect(decision).toMatchObject({ status: "fast-forward", action: "fast-forward", baseCommit: remote });
  });

  it("stops when a fast-forward is needed but the working tree is dirty", () => {
    const decision = decideIntegrationSync(
      observation({
        localSha: "a".repeat(40),
        remoteSha: "c".repeat(40),
        localIsAncestorOfRemote: true,
        remoteIsAncestorOfLocal: false,
        workingTreeClean: false,
      }),
    );
    expect(decision.status).toBe("dirty");
    expect(decision.action).toBe("stop");
    expect(decision.message).toMatch(/Commit or stash/);
    expect(decision.message).toMatch(/Nothing was changed locally/);
  });

  it("stops when local is ahead of GitHub", () => {
    const decision = decideIntegrationSync(
      observation({
        localSha: "c".repeat(40),
        remoteSha: "a".repeat(40),
        localIsAncestorOfRemote: false,
        remoteIsAncestorOfLocal: true,
      }),
    );
    expect(decision.status).toBe("ahead");
    expect(decision.action).toBe("stop");
    expect(decision.message).toMatch(/ahead of GitHub/);
  });

  it("stops when histories have diverged", () => {
    const decision = decideIntegrationSync(
      observation({
        localSha: "a".repeat(40),
        remoteSha: "b".repeat(40),
        localIsAncestorOfRemote: false,
        remoteIsAncestorOfLocal: false,
      }),
    );
    expect(decision.status).toBe("diverged");
    expect(decision.action).toBe("stop");
    expect(decision.message).toMatch(/diverged/);
  });

  it("stops when authentication failed", () => {
    const decision = decideIntegrationSync(observation({ authenticated: false, remoteSha: "", remoteAvailable: false }));
    expect(decision.status).toBe("auth-failed");
    expect(decision.action).toBe("stop");
    expect(decision.message).toMatch(/authentication failed/i);
  });

  it("stops when the remote branch is unavailable", () => {
    const decision = decideIntegrationSync(
      observation({ remoteSha: "", remoteAvailable: false, authenticated: true }),
    );
    expect(decision.status).toBe("missing-remote");
    expect(decision.action).toBe("stop");
    expect(decision.message).toMatch(/does not have integration branch/);
  });

  it("uses the local integration branch tip when GitHub is not configured", () => {
    const sha = "d".repeat(40);
    const decision = decideIntegrationSync(
      observation({ githubConfigured: false, localSha: sha, remoteSha: "", remoteAvailable: false, authenticated: false }),
    );
    expect(decision).toMatchObject({ status: "local-only", action: "none", baseCommit: sha });
  });
});

describe("synchroniseIntegrationBranch", () => {
  it("fast-forwards a clean local main that is behind the remote tip", async () => {
    const repo = makeRepo();
    const baseline = git(repo, ["rev-parse", "HEAD"]);
    const bare = makeBareRemote(repo);
    fs.writeFileSync(path.join(repo, "README.md"), "task-1\n");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "task-1"]);
    const advanced = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["push", bare, "main"]);
    git(repo, ["update-ref", "refs/heads/main", baseline]);
    git(repo, ["reset", "--hard", baseline]);
    expect(git(repo, ["rev-parse", "main"])).toBe(baseline);

    const result = await synchroniseIntegrationBranch({
      cwd: repo,
      integrationBranch: "main",
      owner: "nfazel",
      repository: "betmyfriend",
      token: TOKEN,
      remoteSha: advanced,
      git: {
        ...createIntegrationSyncGit(),
        async fetch(cwd, args) {
          const refspec = args[args.length - 1];
          if (typeof refspec !== "string" || !refspec.includes(":")) {
            return { code: 1, output: "missing refspec" };
          }
          const [, destination] = refspec.split(":");
          return {
            code: 0,
            output: git(cwd, ["fetch", bare, `refs/heads/main:${destination}`]),
          };
        },
      },
    });

    expect(result.synchronised).toBe(true);
    expect(result.baseCommit).toBe(advanced);
    expect(git(repo, ["rev-parse", "main"])).toBe(advanced);
    expect(fs.readFileSync(path.join(repo, "README.md"), "utf8")).toBe("task-1\n");
  });

  it("leaves an already current branch unchanged", async () => {
    const repo = makeRepo();
    const tip = git(repo, ["rev-parse", "HEAD"]);
    const result = await synchroniseIntegrationBranch({
      cwd: repo,
      integrationBranch: "main",
      owner: "nfazel",
      repository: "betmyfriend",
      token: TOKEN,
      remoteSha: tip,
      git: {
        ...createIntegrationSyncGit(),
        async fetch() {
          throw new Error("fetch should not run when already current");
        },
      },
    });
    expect(result.synchronised).toBe(false);
    expect(result.status).toBe("current");
    expect(git(repo, ["rev-parse", "main"])).toBe(tip);
  });

  it("refuses when local is ahead", async () => {
    const repo = makeRepo();
    const remoteTip = git(repo, ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(repo, "README.md"), "local-only\n");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "local ahead"]);
    await expect(
      synchroniseIntegrationBranch({
        cwd: repo,
        integrationBranch: "main",
        owner: "nfazel",
        repository: "betmyfriend",
        token: TOKEN,
        remoteSha: remoteTip,
      }),
    ).rejects.toThrow(/ahead of GitHub/);
    expect(git(repo, ["rev-parse", "main"])).not.toBe(remoteTip);
  });

  it("refuses diverged history without rewriting", async () => {
    const repo = makeRepo();
    const baseline = git(repo, ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(repo, "README.md"), "remote\n");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "remote line"]);
    const remoteTip = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["update-ref", "refs/heads/main", baseline]);
    git(repo, ["reset", "--hard", baseline]);
    fs.writeFileSync(path.join(repo, "README.md"), "local\n");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "local line"]);
    const localTip = git(repo, ["rev-parse", "HEAD"]);
    await expect(
      synchroniseIntegrationBranch({
        cwd: repo,
        integrationBranch: "main",
        owner: "nfazel",
        repository: "betmyfriend",
        token: TOKEN,
        remoteSha: remoteTip,
      }),
    ).rejects.toThrow(/diverged/);
    expect(git(repo, ["rev-parse", "main"])).toBe(localTip);
  });

  it("refuses a dirty working tree before fast-forward", async () => {
    const repo = makeRepo();
    const baseline = git(repo, ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(repo, "README.md"), "task-1\n");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "task-1"]);
    const advanced = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["update-ref", "refs/heads/main", baseline]);
    git(repo, ["reset", "--hard", baseline]);
    fs.writeFileSync(path.join(repo, "README.md"), "dirty\n");
    await expect(
      synchroniseIntegrationBranch({
        cwd: repo,
        integrationBranch: "main",
        owner: "nfazel",
        repository: "betmyfriend",
        token: TOKEN,
        remoteSha: advanced,
      }),
    ).rejects.toThrow(/Commit or stash/);
    expect(git(repo, ["rev-parse", "main"])).toBe(baseline);
  });

  it("advances main while HEAD is on another branch", async () => {
    const repo = makeRepo();
    const baseline = git(repo, ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(repo, "README.md"), "merged\n");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "merged"]);
    const advanced = git(repo, ["rev-parse", "HEAD"]);
    const bare = makeBareRemote(repo);
    git(repo, ["push", bare, "main"]);
    git(repo, ["reset", "--hard", baseline]);
    git(repo, ["checkout", "-b", "ai-factory/task-other"]);
    expect(git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("ai-factory/task-other");
    expect(git(repo, ["rev-parse", "main"])).toBe(baseline);
    expect(git(repo, ["status", "--porcelain"])).toBe("");

    const result = await synchroniseIntegrationBranch({
      cwd: repo,
      integrationBranch: "main",
      owner: "nfazel",
      repository: "betmyfriend",
      token: TOKEN,
      remoteSha: advanced,
      git: {
        ...createIntegrationSyncGit(),
        async fetch(cwd, args) {
          const refspec = args[args.length - 1];
          const [, destination] = String(refspec).split(":");
          return { code: 0, output: git(cwd, ["fetch", bare, `refs/heads/main:${destination}`]) };
        },
      },
    });

    expect(result.synchronised).toBe(true);
    expect(result.headWasOnIntegrationBranch).toBe(false);
    expect(git(repo, ["rev-parse", "main"])).toBe(advanced);
    expect(git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("ai-factory/task-other");
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(baseline);
  });

  it("fetches a missing remote tip before deciding, so behind is not reported as diverged", async () => {
    const upstream = makeRepo();
    const baseline = git(upstream, ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(upstream, "README.md"), "task-2\n");
    git(upstream, ["add", "README.md"]);
    git(upstream, ["commit", "-m", "task-2"]);
    const remoteTip = git(upstream, ["rev-parse", "HEAD"]);
    const bare = makeBareRemote(upstream);

    const local = tempDir("apf-sync-behind-");
    execFileSync("git", ["-c", "commit.gpgsign=false", "clone", bare, local], { encoding: "utf8" });
    git(local, ["config", "user.email", "test@example.com"]);
    git(local, ["config", "user.name", "Test"]);
    git(local, ["reset", "--hard", baseline]);
    // Drop remote-tracking refs and unreachable objects so the tip is absent until fetch.
    git(local, ["remote", "remove", "origin"]);
    git(local, ["reflog", "expire", "--expire=now", "--all"]);
    git(local, ["gc", "--prune=now"]);
    expect(git(local, ["rev-parse", "main"])).toBe(baseline);
    expect(() => execFileSync("git", ["cat-file", "-e", `${remoteTip}^{commit}`], { cwd: local, encoding: "utf8" })).toThrow();

    const result = await synchroniseIntegrationBranch({
      cwd: local,
      integrationBranch: "main",
      owner: "nfazel",
      repository: "betmyfriend",
      token: TOKEN,
      remoteSha: remoteTip,
      git: {
        ...createIntegrationSyncGit(),
        async fetch(cwd, args) {
          const refspec = args[args.length - 1];
          const [, destination] = String(refspec).split(":");
          return { code: 0, output: git(cwd, ["fetch", bare, `refs/heads/main:${destination}`]) };
        },
      },
    });

    expect(result.status).toBe("fast-forward");
    expect(result.baseCommit).toBe(remoteTip);
    expect(git(local, ["rev-parse", "main"])).toBe(remoteTip);
  });

  it("simulates Task 2 after Task 1 merged: local baseline fast-forwards to the merge tip", async () => {
    const repo = makeRepo();
    const baseline = git(repo, ["rev-parse", "HEAD"]);
    fs.mkdirSync(path.join(repo, "prisma"), { recursive: true });
    fs.writeFileSync(path.join(repo, "prisma/schema.prisma"), "model User { id String @id }\n");
    fs.mkdirSync(path.join(repo, "src/app"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src/app/page.tsx"), "export default function Page(){return null}\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "task-1"]);
    const task1 = git(repo, ["rev-parse", "HEAD"]);
    const bare = makeBareRemote(repo);
    git(repo, ["push", bare, "main"]);
    git(repo, ["update-ref", "refs/heads/main", baseline]);
    git(repo, ["reset", "--hard", baseline]);
    expect(fs.existsSync(path.join(repo, "prisma/schema.prisma"))).toBe(false);

    const result = await synchroniseIntegrationBranch({
      cwd: repo,
      integrationBranch: "main",
      owner: "nfazel",
      repository: "betmyfriend",
      token: TOKEN,
      remoteSha: task1,
      git: {
        ...createIntegrationSyncGit(),
        async fetch(cwd, args) {
          const refspec = args[args.length - 1];
          const [, destination] = String(refspec).split(":");
          return { code: 0, output: git(cwd, ["fetch", bare, `refs/heads/main:${destination}`]) };
        },
      },
    });

    expect(result.baseCommit).toBe(task1);
    expect(git(repo, ["rev-parse", "main"])).toBe(task1);
    expect(fs.existsSync(path.join(repo, "prisma/schema.prisma"))).toBe(true);
    expect(fs.existsSync(path.join(repo, "src/app/page.tsx"))).toBe(true);
  });

  it("preserves existing task branches while advancing main", async () => {
    const repo = makeRepo();
    const baseline = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["branch", "ai-factory/task-one", baseline]);
    fs.writeFileSync(path.join(repo, "README.md"), "newer\n");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "newer"]);
    const newer = git(repo, ["rev-parse", "HEAD"]);
    const bare = makeBareRemote(repo);
    git(repo, ["push", bare, "main"]);
    git(repo, ["update-ref", "refs/heads/main", baseline]);
    git(repo, ["reset", "--hard", baseline]);

    await synchroniseIntegrationBranch({
      cwd: repo,
      integrationBranch: "main",
      owner: "nfazel",
      repository: "betmyfriend",
      token: TOKEN,
      remoteSha: newer,
      git: {
        ...createIntegrationSyncGit(),
        async fetch(cwd, args) {
          const refspec = args[args.length - 1];
          const [, destination] = String(refspec).split(":");
          return { code: 0, output: git(cwd, ["fetch", bare, `refs/heads/main:${destination}`]) };
        },
      },
    });

    expect(git(repo, ["rev-parse", "ai-factory/task-one"])).toBe(baseline);
    expect(git(repo, ["rev-parse", "main"])).toBe(newer);
  });
});

describe("observeIntegrationBranch", () => {
  it("reports authentication failure distinctly from a missing remote tip", async () => {
    const repo = makeRepo();
    const auth = await observeIntegrationBranch({
      cwd: repo,
      integrationBranch: "main",
      owner: "nfazel",
      repository: "betmyfriend",
      githubConfigured: true,
      token: null,
      remoteSha: null,
      remoteError: "auth",
    });
    expect(decideIntegrationSync(auth).status).toBe("auth-failed");

    const missing = await observeIntegrationBranch({
      cwd: repo,
      integrationBranch: "main",
      owner: "nfazel",
      repository: "betmyfriend",
      githubConfigured: true,
      token: TOKEN,
      remoteSha: null,
      remoteError: "missing",
    });
    expect(decideIntegrationSync(missing).status).toBe("missing-remote");
  });

  it("reads the integration branch tip even when HEAD is elsewhere", async () => {
    const repo = makeRepo();
    const main = git(repo, ["rev-parse", "main"]);
    git(repo, ["checkout", "-b", "feature"]);
    const observed = await observeIntegrationBranch({
      cwd: repo,
      integrationBranch: "main",
      owner: "nfazel",
      repository: "betmyfriend",
      githubConfigured: false,
      token: null,
      remoteSha: null,
    });
    expect(observed.headBranch).toBe("feature");
    expect(observed.localSha).toBe(main);
    expect(await readLocalSha(createIntegrationSyncGit(), repo, "HEAD")).not.toBe("");
  });
});

describe("sync safety", () => {
  it("rejects force and non-fast-forward merge arguments", async () => {
    const git = createIntegrationSyncGit();
    const repo = makeRepo();
    await expect(git.run(repo, ["reset", "--hard", "HEAD"])).rejects.toBeInstanceOf(SourceControlFailure);
    await expect(git.run(repo, ["merge", "HEAD"])).rejects.toThrow(/fast-forward/);
    await expect(git.fetch(repo, ["fetch", "https://github.com/nfazel/betmyfriend.git", "+refs/heads/main:refs/heads/main"], TOKEN)).rejects.toThrow(
      /Force update/,
    );
  });
});
