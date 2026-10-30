import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { completedTaskIn, git } from "@/modules/verification/completed-task.test-support";
import { prepareExternalReview, approveExternalReview, importExternalCommit, unapprovedPreservationIssues } from "@/modules/coding/external-review";
import { manifestDigest } from "@/modules/coding/external-manifest";
import { validateExistingImplementation, approveCodeChanges, createCodingCommit } from "@/modules/coding/service";
import { verificationEntryBlockers } from "@/modules/verification/gates";

const products: string[] = [], directories: string[] = [];
const priorKey = process.env.EXTERNAL_REVIEW_APPROVAL_KEY, priorRoot = process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT;
afterEach(async () => {
  for (const id of products.splice(0)) await db.product.delete({ where: { id } });
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  if (priorKey === undefined) delete process.env.EXTERNAL_REVIEW_APPROVAL_KEY; else process.env.EXTERNAL_REVIEW_APPROVAL_KEY = priorKey;
  if (priorRoot === undefined) delete process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT; else process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = priorRoot;
});
async function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "external-review-test-")); directories.push(dir);
  const repo = path.join(dir, "repo"), original = path.join(dir, "original"); fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "review-fixture", type: "module", scripts: { test: "node --test behavior.test.mjs" } }));
  fs.writeFileSync(path.join(repo, "src/security.js"), "export function getSession() { return 'legacy'; }\n");
  fs.writeFileSync(path.join(repo, "behavior.test.mjs"), "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {getSession} from './src/security.js'; test('reviewed session implementation',()=>assert.equal(getSession(),'signed'));\n");
  git(repo, ["init", "-b", "main"]); git(repo, ["config", "user.name", "Test"]); git(repo, ["config", "user.email", "test@example.invalid"]); git(repo, ["add", "."]); git(repo, ["commit", "-qm", "baseline"]);
  const setup = await completedTaskIn(repo, { approval: false, checks: false }); products.push(setup.product.id);
  const workspace = await db.repositoryWorkspace.findFirstOrThrow({ where: { productId: setup.product.id } });
  git(repo, ["worktree", "add", "-b", "original", original, setup.sha]);
  fs.writeFileSync(path.join(original, "notes.txt"), "Unrelated existing human work must survive.\n");
  fs.writeFileSync(path.join(repo, "src/security.js"), "export function getSession() { return 'signed'; }\n"); git(repo, ["add", "src/security.js"]);git(repo, ["commit", "-qm", "external implementation"]);
  const sourceCommit = git(repo, ["rev-parse", "HEAD"]).trim();
  await db.repositoryWorkspace.update({ where: { id: workspace.id }, data: { status: "FAILED", workspacePath: original, branchName: "original" } });
  await db.implementationTask.update({ where: { id: setup.task.id }, data: { status: "IN_PROGRESS" } });
  await db.codingExecutionContract.update({ where: { workspaceId: workspace.id }, data: { allowedPaths: ["src/"], restrictedPaths: [], maxFiles: 8, status: "APPROVED" } });
  await db.codingExecutionPlan.update({ where: { workspaceId: workspace.id }, data: { status: "APPROVED", filesExpectedToChange: ["src/security.js"], steps: ["Update src/security.js."], setupCommands: [], validationCommands: [{ command: "npm test", kind: "VALIDATION", applicability: "REQUIRED", reason: "Behavioral regression." }] } });
  const key = randomUUID() + randomUUID(); process.env.EXTERNAL_REVIEW_APPROVAL_KEY = key; process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT = path.join(dir, "imports");
  const manifest = await prepareExternalReview(setup.product.id, workspace.id, sourceCommit);
  const input = { productId: setup.product.id, workspaceId: workspace.id, sourceCommit, digest: manifestDigest(manifest), credential: key, actor: { id: "operator", name: "Human reviewer" }, reason: "I reviewed this exact session change and its regression.", reviewedIssues: manifest.files.flatMap(file => file.issues.map(reason => ({ path: file.path, reason }))) };
  return { ...setup, repo, workspace, original, manifest, input, key, sourceCommit };
}
describe("external review/import lifecycle", () => {
  it("preserves dirty original work, validates the exact commit and still requires independent runtime approval", async () => {
    const f = await fixture();
    const originalHead = git(f.original, ["rev-parse", "HEAD"]), originalStatus = git(f.original, ["status", "--porcelain"]);
    await expect(approveExternalReview({ ...f.input, credential: "incorrect" })).rejects.toThrow(/authorization/);
    await expect(importExternalCommit(f.input)).rejects.toThrow(/signed human/);
    const authorization = await approveExternalReview(f.input);
    expect((await unapprovedPreservationIssues(f.workspace.id, f.repo, f.sha)).length).toBeGreaterThan(0);
    const imported = await importExternalCommit(f.input);
    expect(imported.workspacePath).not.toBe(f.original);
    expect(git(f.original, ["rev-parse", "HEAD"])).toBe(originalHead);
    expect(git(f.original, ["status", "--porcelain"])).toBe(originalStatus);
    expect(fs.readFileSync(path.join(f.original, "notes.txt"), "utf8")).toContain("must survive");
    expect(await unapprovedPreservationIssues(f.workspace.id, imported.workspacePath, f.sha)).toEqual([]);
    const validated = await validateExistingImplementation(f.product.id, f.workspace.id);
    expect(validated?.status).toBe("READY_FOR_REVIEW");
    expect(validated?.evidence.some(item => item.command === "npm test" && item.result === "PASS" && item.exitCode === 0)).toBe(true);
    await approveCodeChanges(f.product.id, f.workspace.id, { actorName: "Human reviewer" });
    const recorded = await createCodingCommit(f.product.id, f.workspace.id);
    expect(recorded.sha).toBe(f.sourceCommit); expect(recorded.reusedExistingCommit).toBe(true);
    const remaining=await verificationEntryBlockers(f.product.id,f.task.id);expect(remaining).toHaveLength(1);expect(remaining[0]).toContain("runtime/behaviour");
    expect((await db.approval.findUniqueOrThrow({ where: { id: authorization.approvalId } })).status).toBe("APPROVED");
    expect((await db.repositoryWorkspace.findUniqueOrThrow({ where: { id: f.workspace.id } })).baseCommit).toBe(f.sha);
    // A later change invalidates dependent approvals and permits an audited
    // fresh import without overwriting either existing checkout.
    fs.writeFileSync(path.join(imported.workspacePath, "src/security.js"), "export function getSession() { return 'changed again'; }\n");
    expect((await unapprovedPreservationIssues(f.workspace.id, imported.workspacePath, f.sha)).length).toBeGreaterThan(0);
    expect((await db.repositoryWorkspace.findUniqueOrThrow({ where: { id: f.workspace.id } })).status).toBe("FAILED");
    expect((await db.codeChangeApproval.findFirstOrThrow({ where: { workspaceId: f.workspace.id } })).stale).toBe(true);
    await approveExternalReview(f.input);
    const reimported = await importExternalCommit(f.input);
    expect(reimported.workspacePath).not.toBe(imported.workspacePath);
    expect(fs.readFileSync(path.join(imported.workspacePath, "src/security.js"), "utf8")).toContain("changed again");
    expect(await unapprovedPreservationIssues(f.workspace.id, reimported.workspacePath, f.sha)).toEqual([]);
  });
  it("invalidates on source changes and does not resurrect approval after reverting", async () => {
    const f = await fixture(); const authorization = await approveExternalReview(f.input); const imported = await importExternalCommit(f.input);
    fs.writeFileSync(path.join(imported.workspacePath, "src/security.js"), "export function getSession() { return 'unsigned'; }\n");
    expect((await unapprovedPreservationIssues(f.workspace.id, imported.workspacePath, f.sha)).length).toBeGreaterThan(0);
    fs.writeFileSync(path.join(imported.workspacePath, "src/security.js"), "export function getSession() { return 'signed'; }\n");
    expect((await unapprovedPreservationIssues(f.workspace.id, imported.workspacePath, f.sha)).length).toBeGreaterThan(0);
    expect((await db.approval.findUniqueOrThrow({ where: { id: authorization.approvalId } })).status).toBe("APPROVED");
    expect(await db.codingEvidence.count({ where: { workspaceId: f.workspace.id, result: "INVALIDATED" } })).toBe(1);
  });
  it("rejects changed scope, forged attestations, and revoked decisions", async () => {
    const f = await fixture();
    await expect(approveExternalReview({ ...f.input, digest: "0".repeat(64) })).rejects.toThrow(/manifest/);
    await expect(approveExternalReview({ ...f.input, reviewedIssues: [] })).rejects.toThrow(/explicitly/);
    const approval = await approveExternalReview(f.input);
    await db.approval.update({ where: { id: approval.approvalId }, data: { status: "REJECTED" } });
    await expect(importExternalCommit(f.input)).rejects.toThrow(/signed human/);
    await db.codingExecutionPlan.update({ where: { workspaceId: f.workspace.id }, data: { summary: "Changed approved scope" } });
    await expect(approveExternalReview(f.input)).rejects.toThrow(/manifest/);
  });
});
