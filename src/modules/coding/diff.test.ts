import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  persistenceEvidenceOutput,
  persistenceUserMessage,
  repairResultNeedsRecording,
  sanitizeStoredPatch,
} from "@/modules/coding/diff";
import { storeWorkspaceResult } from "@/modules/coding/diff-store";
import { captureWorkspaceDiff, restoreBaselineFile } from "@/modules/coding/git";
import { hashText } from "@/modules/coding/policy";
import { repairsForCurrentImplementation } from "@/modules/coding/implementation";

const products: string[] = [];

afterAll(async () => {
  if (products.length > 0) await db.product.deleteMany({ where: { id: { in: products } } });
});

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-diff-"));
  const git = (args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", ...args], { cwd: dir });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(dir, "README.md"), "hello\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "init"]);
  return dir;
}

describe("workspace diff persistence", () => {
  it("omits binary untracked files so the stored patch has no null bytes", async () => {
    const dir = gitRepo();
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".next"), { recursive: true });
    fs.writeFileSync(path.join(dir, "assets", "pack"), Buffer.from([0x68, 0x00, 0x69]));
    fs.writeFileSync(path.join(dir, ".next", "cache.js"), "compiled\n");
    fs.writeFileSync(path.join(dir, "src.txt"), "model User {}\n");
    const diff = await captureWorkspaceDiff(dir);
    expect(diff.patch).not.toContain("\u0000");
    expect(diff.fullPatch).not.toContain("\u0000");
    expect(diff.patch).toContain("Binary file omitted from the stored patch.");
    expect(diff.patch).toContain("model User");
    expect(diff.patch).not.toContain(".next/cache.js");
    expect(diff.files.map((file) => file.path)).toEqual(expect.arrayContaining(["assets/pack", "src.txt"]));
    expect(diff.files.map((file) => file.path)).not.toContain(".next/cache.js");
  });

  it("restores one out-of-scope file and changes the source snapshot", async () => {
    const dir = gitRepo();
    fs.mkdirSync(path.join(dir, "src/app"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src/app/page.tsx"), "export default function Page() { return null }\n");
    const git = (args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: dir });
    git(["add", "src/app/page.tsx"]);
    git(["commit", "-m", "page"]);
    const base = git(["rev-parse", "HEAD"]).toString().trim();
    fs.rmSync(path.join(dir, "README.md"));
    fs.writeFileSync(path.join(dir, "src/app/page.tsx"), "export default function Page() { return \"changed\" }\n");
    fs.writeFileSync(path.join(dir, "notes.txt"), "extra\n");
    const before = await captureWorkspaceDiff(dir);
    const beforeHash = hashText(before.fullPatch);
    await restoreBaselineFile(dir, base, "README.md", "deleted");
    const after = await captureWorkspaceDiff(dir);
    expect(fs.readFileSync(path.join(dir, "README.md"), "utf8")).toBe("hello\n");
    expect(fs.readFileSync(path.join(dir, "src/app/page.tsx"), "utf8")).toContain("changed");
    expect(fs.readFileSync(path.join(dir, "notes.txt"), "utf8")).toBe("extra\n");
    expect(after.files.map((file) => file.path).sort()).toEqual(["notes.txt", "src/app/page.tsx"]);
    expect(hashText(after.fullPatch)).not.toBe(beforeHash);
    await restoreBaselineFile(dir, base, "notes.txt", "added");
    expect(fs.existsSync(path.join(dir, "notes.txt"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "src/app/page.tsx"))).toBe(true);
  });

  it("does not replace a saved diff when the worktree git link is missing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-not-git-"));
    fs.writeFileSync(path.join(dir, "prisma-schema.txt"), "model User {}\n");
    await expect(captureWorkspaceDiff(dir)).rejects.toThrow(/not a git repository/i);
  });

  it("strips a null byte that reaches the stored patch", () => {
    const stored = sanitizeStoredPatch("alpha\u0000beta");
    expect(stored.omittedNullBytes).toBe(true);
    expect(stored.patch).toBe("alphabeta");
    expect(stored.patch).not.toContain("\u0000");
  });

  it("keeps the user message free of the Prisma invocation", () => {
    const error = Object.assign(new Error("Invalid `db.codingDiff.upsert()` invocation in .next/dev/server/chunks/ssr/finish.js\nDatabase error. Code: `22021`."), { code: "P2039" });
    expect(persistenceUserMessage("repair")).toBe("Repair execution could not be fully recorded. No further repair has been started. Review the saved workspace state before retrying.");
    expect(persistenceUserMessage("repair")).not.toContain("codingDiff");
    expect(persistenceUserMessage("repair")).not.toContain("TURBOPACK");
    expect(persistenceEvidenceOutput(error)).toContain("P2039");
    expect(persistenceEvidenceOutput(error)).toContain("22021");
    expect(persistenceEvidenceOutput(error)).not.toContain(".next/dev");
  });

  it("records a passed repair whose diff was not saved without using another repair attempt", () => {
    const runs = [
      { createdAt: new Date("2026-10-14T13:12:22.000Z"), input: { phase: "implement", workspaceId: "ws", planVersion: 4 }, output: { outcome: "FAILED" } },
      { createdAt: new Date("2026-10-14T11:21:30.000Z"), input: { phase: "repair", workspaceId: "ws", planVersion: 2, attempt: 1 }, output: { outcome: "FAILED" } },
      { createdAt: new Date("2026-10-14T17:13:34.000Z"), input: { phase: "repair", workspaceId: "ws", planVersion: 4, attempt: 1 }, output: { error: "Invalid db.codingDiff.upsert()" } },
    ];
    expect(repairsForCurrentImplementation(runs, "ws", 4)).toHaveLength(1);
    expect(repairResultNeedsRecording({
      runs,
      workspaceId: "ws",
      planVersion: 4,
      diffUpdatedAt: new Date("2026-10-14T13:12:40.000Z"),
      commands: [
        { command: "npx prisma generate", result: "FAIL", createdAt: new Date("2026-10-14T13:12:38.000Z") },
        { command: "npx prisma generate", result: "PASS", createdAt: new Date("2026-10-14T17:13:41.000Z") },
        { command: "npx prisma validate", result: "PASS", createdAt: new Date("2026-10-14T17:13:42.000Z") },
        { command: "npm run build", result: "PASS", createdAt: new Date("2026-10-14T17:13:59.000Z") },
      ],
      requiredCommands: ["npx prisma validate", "npm run build"],
      gaps: 0,
    })).toBe(true);
    expect(repairsForCurrentImplementation(runs, "ws", 4)).toHaveLength(1);
  });

  it("does not offer recording when validation has not passed", () => {
    expect(repairResultNeedsRecording({
      runs: [{ createdAt: new Date("2026-10-14T17:13:34.000Z"), input: { phase: "repair", workspaceId: "ws", planVersion: 4 }, output: {} }],
      workspaceId: "ws",
      planVersion: 4,
      diffUpdatedAt: null,
      commands: [{ command: "npm run build", result: "FAIL", createdAt: new Date("2026-10-14T17:13:59.000Z") }],
      requiredCommands: ["npm run build"],
      gaps: 0,
    })).toBe(false);
  });

  it("updates one CodingDiff per workspace and keeps that row when a null-byte write is rejected", async () => {
    const product = await db.product.create({
      data: {
        name: `Diff ${crypto.randomUUID()}`,
        description: "Temporary",
        vision: "Temporary",
        problemStatement: "Temporary",
        targetUsers: "Temporary",
        status: "ACTIVE",
        currentStage: "BUILD",
      },
    });
    products.push(product.id);
    const architecture = await db.solutionArchitecture.create({
      data: { productId: product.id, version: 1, status: "APPROVED", summary: "Temporary" },
    });
    const plan = await db.implementationPlan.create({
      data: { productId: product.id, solutionArchitectureId: architecture.id, version: 1, status: "APPROVED" },
    });
    const task = await db.implementationTask.create({
      data: { implementationPlanId: plan.id, title: "Temporary", status: "IN_PROGRESS" },
    });
    const repository = await db.repository.create({
      data: { productId: product.id, name: "temporary", localPath: os.tmpdir(), status: "CONFIGURED" },
    });
    const workspace = await db.repositoryWorkspace.create({
      data: {
        repositoryId: repository.id,
        productId: product.id,
        implementationTaskId: task.id,
        workspacePath: os.tmpdir(),
        branchName: "temporary",
        status: "FAILED",
      },
    });
    await db.codingExecutionContract.create({
      data: {
        implementationTaskId: task.id,
        workspaceId: workspace.id,
        executionMode: "SUPERVISED",
        riskLevel: "MEDIUM",
        status: "APPROVED",
      },
    });
    await db.codingExecutionPlan.create({
      data: {
        workspaceId: workspace.id,
        version: 4,
        status: "APPROVED",
        approvedAt: new Date("2026-10-14T13:12:17.000Z"),
        steps: ["Create prisma/schema.prisma"],
      },
    });
    const initial = {
      files: [{ path: "prisma/schema.prisma", status: "modified", additions: 4, deletions: 0 }],
      additions: 4,
      deletions: 0,
      patch: "generator client",
      fullPatch: "generator client",
      truncated: false,
    };
    await storeWorkspaceResult({
      workspaceId: workspace.id,
      implementationTaskId: task.id,
      hasPlan: true,
      approvedPlan: true,
      outcome: "FAILED",
      diff: initial,
    });
    const created = await db.codingDiff.findUniqueOrThrow({ where: { workspaceId: workspace.id } });
    await expect(db.codingDiff.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, patch: "bad\u0000bytes" },
      update: { patch: "bad\u0000bytes" },
    })).rejects.toMatchObject({ code: "P2039" });
    const preserved = await db.codingDiff.findUniqueOrThrow({ where: { workspaceId: workspace.id } });
    expect(preserved.id).toBe(created.id);
    expect(preserved.patch).toBe("generator client");
    await storeWorkspaceResult({
      workspaceId: workspace.id,
      implementationTaskId: task.id,
      hasPlan: true,
      approvedPlan: true,
      outcome: "COMPLETED",
      diff: { ...initial, patch: "model User {\n  id String @id\n}\n", fullPatch: "model User {\n  id String @id\n}\n" },
    });
    await storeWorkspaceResult({
      workspaceId: workspace.id,
      implementationTaskId: task.id,
      hasPlan: true,
      approvedPlan: true,
      outcome: "COMPLETED",
      diff: { ...initial, patch: "model User {\n  id String @id\n}\n", fullPatch: "model User {\n  id String @id\n}\n" },
    });
    const rows = await db.codingDiff.findMany({ where: { workspaceId: workspace.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(created.id);
    expect(rows[0]?.patch).toContain("model User");
    expect(rows[0]?.patch).not.toContain("\u0000");
    const savedPlan = await db.codingExecutionPlan.findUniqueOrThrow({ where: { workspaceId: workspace.id } });
    expect(savedPlan.version).toBe(4);
    expect(savedPlan.approvedAt?.toISOString()).toBe("2026-10-14T13:12:17.000Z");
    expect(savedPlan.status).toBe("COMPLETED");
    const indexes = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'CodingDiff' AND indexdef LIKE '%workspaceId%'
    `;
    expect(indexes.map((item) => item.indexname)).toContain("CodingDiff_workspaceId_key");
  });
});
