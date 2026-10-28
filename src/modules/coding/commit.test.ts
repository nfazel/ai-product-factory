import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { commitApprovedSnapshot } from "@/modules/coding/git";
import { approveCodeChanges, createCodingCommit } from "@/modules/coding/service";

const products: string[] = [];
const roots: string[] = [];

function git(dir: string, args: string[]) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
}

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "apf-commit-repo-"));
  roots.push(repo);
  fs.writeFileSync(path.join(repo, "README.md"), "# product\n");
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "baseline"]);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "apf-commit-work-"));
  roots.push(work);
  git(repo, ["worktree", "add", "-b", "ai-factory/task-test", work, "HEAD"]);
  return { repo, work, base: git(repo, ["rev-parse", "HEAD"]).trim() };
}

const approvedPaths = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "prisma/schema.prisma",
  "src/lib/db.ts",
  "src/app/layout.tsx",
  "src/app/page.tsx",
];

function writeApproved(work: string) {
  const files: Record<string, string> = {
    "package.json": "{\"name\":\"betmyfriend\"}\n",
    "package-lock.json": "{\"name\":\"betmyfriend\",\"lockfileVersion\":3}\n",
    "tsconfig.json": "{\"compilerOptions\":{}}\n",
    "prisma/schema.prisma": "model User {\n  id String @id\n}\n",
    "src/lib/db.ts": "export const db = {}\n",
    "src/app/layout.tsx": "export default function Layout() { return null }\n",
    "src/app/page.tsx": "export default function Page() { return null }\n",
  };
  for (const [file, content] of Object.entries(files)) {
    const absolute = path.join(work, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
}

function writeGenerated(work: string) {
  fs.mkdirSync(path.join(work, ".next"), { recursive: true });
  fs.writeFileSync(path.join(work, ".next/cache.js"), "compiled\n");
  fs.writeFileSync(path.join(work, "next-env.d.ts"), "/// <reference types=\"next\" />\n");
  fs.mkdirSync(path.join(work, "node_modules/left-pad"), { recursive: true });
  fs.writeFileSync(path.join(work, "node_modules/left-pad/index.js"), "module.exports = 1\n");
}

function committedPaths(work: string, base: string) {
  return git(work, ["diff", "--name-only", base, "HEAD"]).trim().split("\n").filter(Boolean).sort();
}

afterEach(async () => {
  while (products.length > 0) {
    const id = products.pop();
    if (id) await db.product.delete({ where: { id } }).catch(() => undefined);
  }
  while (roots.length > 0) {
    const root = roots.pop();
    if (!root) continue;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("approved snapshot commit", () => {
  it("commits the seven approved files and leaves generated files untracked", async () => {
    const { work, base } = makeRepo();
    writeApproved(work);
    writeGenerated(work);
    const sha = await commitApprovedSnapshot(
      work,
      approvedPaths.map((file) => ({ path: file, status: "added" })),
      "feat: approved snapshot\n\nAI Product Factory Task: task",
    );
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(committedPaths(work, base)).toEqual([...approvedPaths].sort());
    const tree = git(work, ["ls-tree", "-r", "--name-only", "HEAD"]);
    expect(tree).not.toContain(".next/");
    expect(tree).not.toContain("next-env.d.ts");
    expect(tree).not.toContain("node_modules/");
    expect(fs.existsSync(path.join(work, ".next/cache.js"))).toBe(true);
    expect(fs.existsSync(path.join(work, "next-env.d.ts"))).toBe(true);
    expect(fs.existsSync(path.join(work, "node_modules/left-pad/index.js"))).toBe(true);
    expect(git(work, ["status", "--porcelain"])).toContain("?? .next/");
    expect(git(work, ["status", "--porcelain"])).toContain("?? next-env.d.ts");
    expect(git(work, ["status", "--porcelain"])).toContain("?? node_modules/");
  });

  it("refuses to stage a generated path", async () => {
    const { work } = makeRepo();
    fs.writeFileSync(path.join(work, "next-env.d.ts"), "generated\n");
    await expect(commitApprovedSnapshot(work, [{ path: "next-env.d.ts", status: "added" }], "nope")).rejects.toThrow(/cannot be committed/);
    expect(git(work, ["diff", "--cached", "--name-only"]).trim()).toBe("");
  });
});

describe("createCodingCommit", () => {
  async function approvedWorkspace() {
    const { repo, work, base } = makeRepo();
    writeApproved(work);
    writeGenerated(work);
    const product = await db.product.create({
      data: {
        name: `Commit ${crypto.randomUUID()}`,
        description: "Temporary",
        vision: "Friends can match.",
        problemStatement: "Discovery is manual.",
        targetUsers: "Friends",
        status: "ACTIVE",
        currentStage: "BUILD",
      },
    });
    products.push(product.id);
    const architecture = await db.solutionArchitecture.create({
      data: { productId: product.id, version: 1, status: "APPROVED", summary: "A small app." },
    });
    const plan = await db.implementationPlan.create({
      data: { productId: product.id, solutionArchitectureId: architecture.id, version: 1, status: "APPROVED" },
    });
    const task = await db.implementationTask.create({
      data: { implementationPlanId: plan.id, title: "Initialize the app", status: "CODE_REVIEW" },
    });
    const repository = await db.repository.create({
      data: { productId: product.id, name: "betmyfriend", localPath: repo, defaultBranch: "main", status: "CONFIGURED" },
    });
    const workspace = await db.repositoryWorkspace.create({
      data: {
        repositoryId: repository.id,
        productId: product.id,
        implementationTaskId: task.id,
        workspacePath: work,
        branchName: "ai-factory/task-test",
        baseCommit: base,
        headCommit: base,
        status: "READY_FOR_REVIEW",
      },
    });
    await db.codingExecutionContract.create({
      data: {
        implementationTaskId: task.id,
        workspaceId: workspace.id,
        objective: "Initialize the app.",
        requiredChecks: ["npm test"],
        executionMode: "SUPERVISED",
        riskLevel: "LOW",
      },
    });
    await db.codingExecutionPlan.create({
      data: {
        workspaceId: workspace.id,
        summary: "Execution plan v4",
        version: 4,
        status: "COMPLETED",
        filesExpectedToChange: approvedPaths.filter((file) => file !== "package-lock.json"),
        steps: ["Create the application files"],
        setupCommands: ["npm install"],
        validationCommands: [{ command: "npm test", kind: "VALIDATION", applicability: "REQUIRED", reason: "The plan requires a test." }],
        approvedBy: "Local user",
        approvedAt: new Date("2026-10-14T13:12:17.272Z"),
      },
    });
    await db.codingEvidence.create({
      data: {
        workspaceId: workspace.id,
        implementationTaskId: task.id,
        type: "TEST_RESULT",
        source: "COMMAND_RUNNER",
        description: "npm test",
        command: "npm test",
        result: "PASS",
        exitCode: 0,
        completedAt: new Date(Date.now() + 60_000),
      },
    });
    await approveCodeChanges(product.id, workspace.id, { actorName: "Local user" });
    return { product, workspace, repo, work, base, task };
  }

  it("commits only the approved snapshot when generated files are present", async () => {
    const setup = await approvedWorkspace();
    const before = await db.codeChangeApproval.findFirstOrThrow({ where: { workspaceId: setup.workspace.id } });
    const committed = await createCodingCommit(setup.product.id, setup.workspace.id);
    expect(committedPaths(setup.work, setup.base)).toEqual([...approvedPaths].sort());
    expect(git(setup.work, ["ls-tree", "-r", "--name-only", "HEAD"])).not.toContain("node_modules/");
    expect(git(setup.work, ["ls-tree", "-r", "--name-only", "HEAD"])).not.toContain(".next/");
    expect(git(setup.work, ["ls-tree", "-r", "--name-only", "HEAD"])).not.toContain("next-env.d.ts");
    expect(git(setup.repo, ["rev-parse", "main"]).trim()).toBe(setup.base);
    expect(committed.workspace?.headCommit).toBe(committed.sha);
    expect(committed.workspace?.status).toBe("COMPLETED");
    const approval = await db.codeChangeApproval.findUniqueOrThrow({ where: { id: before.id } });
    expect(approval.headCommit).toBe(committed.sha);
    expect(approval.diffHash).toBe(before.diffHash);
    expect(approval.stale).toBe(false);
    const task = await db.implementationTask.findUniqueOrThrow({ where: { id: setup.task.id } });
    expect(task.status).toBe("COMPLETED");
    const evidence = await db.codingEvidence.findFirst({ where: { workspaceId: setup.workspace.id, result: "COMMITTED" } });
    expect(evidence?.description).toContain(committed.sha);
    expect(evidence?.description).toContain(before.diffHash);
    expect(evidence?.description).toContain("v4");
    expect(evidence?.description).toContain(before.id);
  });

  it("blocks the commit when an unapproved source file appears", async () => {
    const setup = await approvedWorkspace();
    fs.mkdirSync(path.join(setup.work, "src"), { recursive: true });
    fs.writeFileSync(path.join(setup.work, "src/extra.ts"), "export const extra = 1\n");
    await expect(createCodingCommit(setup.product.id, setup.workspace.id)).rejects.toThrow(/outside the approved Execution Plan/);
    expect(git(setup.work, ["rev-parse", "HEAD"]).trim()).toBe(setup.base);
    expect(git(setup.work, ["diff", "--cached", "--name-only"]).trim()).toBe("");
    const approval = await db.codeChangeApproval.findFirstOrThrow({ where: { workspaceId: setup.workspace.id } });
    expect(approval.stale).toBe(true);
    const task = await db.implementationTask.findUniqueOrThrow({ where: { id: setup.task.id } });
    expect(task.status).toBe("CODE_REVIEW");
  });

  it("blocks the commit when an approved file changes after approval", async () => {
    const setup = await approvedWorkspace();
    fs.writeFileSync(path.join(setup.work, "src/app/page.tsx"), "export default function Page() { return \"changed\" }\n");
    await expect(createCodingCommit(setup.product.id, setup.workspace.id)).rejects.toThrow(/no longer matches the source/);
    expect(git(setup.work, ["rev-parse", "HEAD"]).trim()).toBe(setup.base);
    const approval = await db.codeChangeApproval.findFirstOrThrow({ where: { workspaceId: setup.workspace.id } });
    expect(approval.stale).toBe(true);
  });

  it("reuses an already-committed validated HEAD instead of creating a duplicate commit", async () => {
    const { repo, work, base } = makeRepo();
    writeApproved(work);
    git(work, ["add", ...approvedPaths]);
    git(work, ["commit", "-m", "implementation"]);
    const validated = git(work, ["rev-parse", "HEAD"]).trim();
    expect(git(work, ["status", "--porcelain"]).trim()).toBe("");

    const product = await db.product.create({
      data: {
        name: `Commit reuse ${crypto.randomUUID()}`,
        description: "Temporary",
        vision: "Friends can match.",
        problemStatement: "Discovery is manual.",
        targetUsers: "Friends",
        status: "ACTIVE",
        currentStage: "BUILD",
      },
    });
    products.push(product.id);
    const architecture = await db.solutionArchitecture.create({
      data: { productId: product.id, version: 1, status: "APPROVED", summary: "A small app." },
    });
    const plan = await db.implementationPlan.create({
      data: { productId: product.id, solutionArchitectureId: architecture.id, version: 1, status: "APPROVED" },
    });
    const task = await db.implementationTask.create({
      data: { implementationPlanId: plan.id, title: "Initialize the app", status: "CODE_REVIEW" },
    });
    const repository = await db.repository.create({
      data: { productId: product.id, name: "betmyfriend", localPath: repo, defaultBranch: "main", status: "CONFIGURED" },
    });
    const workspace = await db.repositoryWorkspace.create({
      data: {
        repositoryId: repository.id,
        productId: product.id,
        implementationTaskId: task.id,
        workspacePath: work,
        branchName: "ai-factory/task-test",
        baseCommit: base,
        headCommit: validated,
        status: "READY_FOR_REVIEW",
      },
    });
    await db.codingExecutionContract.create({
      data: {
        implementationTaskId: task.id,
        workspaceId: workspace.id,
        objective: "Initialize the app.",
        requiredChecks: ["npm test"],
        executionMode: "SUPERVISED",
        riskLevel: "LOW",
      },
    });
    await db.codingExecutionPlan.create({
      data: {
        workspaceId: workspace.id,
        summary: "Execution plan v4",
        version: 4,
        status: "COMPLETED",
        filesExpectedToChange: approvedPaths.filter((file) => file !== "package-lock.json"),
        steps: ["Create the application files"],
        setupCommands: ["npm install"],
        validationCommands: [{ command: "npm test", kind: "VALIDATION", applicability: "REQUIRED", reason: "The plan requires a test." }],
        approvedBy: "Local user",
        approvedAt: new Date("2026-10-14T13:12:17.272Z"),
      },
    });
    await db.codingEvidence.create({
      data: {
        workspaceId: workspace.id,
        implementationTaskId: task.id,
        type: "TEST_RESULT",
        source: "COMMAND_RUNNER",
        description: "npm test",
        command: "npm test",
        result: "PASS",
        exitCode: 0,
        completedAt: new Date(Date.now() + 60_000),
      },
    });
    await approveCodeChanges(product.id, workspace.id, { actorName: "Local user" });
    const before = git(work, ["rev-parse", "HEAD"]).trim();
    const committed = await createCodingCommit(product.id, workspace.id);
    expect(committed.sha).toBe(validated);
    expect(committed.reusedExistingCommit).toBe(true);
    expect(git(work, ["rev-parse", "HEAD"]).trim()).toBe(before);
    expect(git(repo, ["rev-parse", "main"]).trim()).toBe(base);
    const evidence = await db.codingEvidence.findFirst({ where: { workspaceId: workspace.id, result: "COMMITTED" } });
    expect(evidence?.description).toContain("No duplicate commit was created");
    expect(evidence?.description).toContain(validated);
  });
});
