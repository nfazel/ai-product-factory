import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createWorktree, pruneMissingWorktrees } from "@/modules/coding/git";

const cleanups: string[] = [];

function git(dir: string, args: string[]) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
}

afterEach(() => {
  for (const dir of cleanups.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("verification worktree recovery", () => {
  it("recreates a worktree from the commit after its directory disappears", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "apf-verify-git-"));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "apf-verify-linked-"));
    cleanups.push(repo, root);
    fs.writeFileSync(path.join(repo, "README.md"), "kept\n");
    git(repo, ["init", "-b", "main"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test"]);
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "init"]);
    const sha = git(repo, ["rev-parse", "HEAD"]).trim();
    const live = path.join(root, "live");
    const missing = path.join(root, "missing");
    await createWorktree({ repositoryPath: repo, workspacePath: live, branchName: "ai-factory/live", baseCommit: sha });
    await createWorktree({ repositoryPath: repo, workspacePath: missing, branchName: "ai-factory/missing", baseCommit: sha });
    fs.rmSync(missing, { recursive: true, force: true });
    await pruneMissingWorktrees(repo);
    expect(fs.existsSync(live)).toBe(true);
    expect(git(live, ["rev-parse", "HEAD"]).trim()).toBe(sha);
    expect(git(repo, ["rev-parse", "HEAD"]).trim()).toBe(sha);
    const recovered = await createWorktree({
      repositoryPath: repo,
      workspacePath: missing,
      branchName: "ai-factory/missing",
      baseCommit: sha,
    });
    expect(fs.existsSync(missing)).toBe(true);
    expect(git(missing, ["rev-parse", "HEAD"]).trim()).toBe(sha);
    expect(git(repo, ["rev-parse", "main"]).trim()).toBe(sha);
    expect(recovered.branchName).not.toBe("main");
    expect(fs.readFileSync(path.join(repo, "README.md"), "utf8")).toBe("kept\n");
  });
});
