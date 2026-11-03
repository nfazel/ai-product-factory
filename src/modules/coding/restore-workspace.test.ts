import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { completedTaskIn, git } from '@/modules/verification/completed-task.test-support';
import { restoreCodingWorkspace, workingCopyMissing } from './restore-workspace';

const products: string[] = [], roots: string[] = [];
beforeEach(() => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apf-restore-root-')); roots.push(root); vi.stubEnv('PRODUCT_REPOSITORY_WORKTREE_ROOT', root); });
afterEach(async () => { vi.unstubAllEnvs(); for (const id of products.splice(0)) await db.product.delete({ where: { id } }); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

/** A completed task whose working copy is a real Git worktree under the managed folder, then removed as a cleanup would. */
async function vanished() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'apf-restore-repo-')); roots.push(repo);
  fs.writeFileSync(path.join(repo, 'package.json'), '{}'); fs.writeFileSync(path.join(repo, 'a.txt'), 'approved\n');
  git(repo, ['init', '-b', 'main']); git(repo, ['config', 'user.email', 't@example.com']); git(repo, ['config', 'user.name', 'T']); git(repo, ['add', '.']); git(repo, ['commit', '-m', 'approved']);
  const fixture = await completedTaskIn(repo); products.push(fixture.product.id);
  const workspace = await db.repositoryWorkspace.findFirstOrThrow({ where: { implementationTaskId: fixture.task.id } });
  const target = path.join(process.env.PRODUCT_REPOSITORY_WORKTREE_ROOT!, workspace.id);
  git(repo, ['worktree', 'add', '--detach', target, fixture.sha]);
  await db.repositoryWorkspace.update({ where: { id: workspace.id }, data: { workspacePath: target } });
  fs.rmSync(target, { recursive: true, force: true });
  return { ...fixture, repo, workspace: { ...workspace, workspacePath: target }, target };
}

describe('restoring a finished task\'s working copy from its approved commit', () => {
  it('rebuilds the folder exactly at the approved commit with nothing else in it', async () => {
    const f = await vanished();
    expect(workingCopyMissing(f.workspace)).toBe(true);
    const result = await restoreCodingWorkspace(f.product.id, f.workspace.id);
    expect(result.commit).toBe(f.sha);
    expect(git(f.target, ['rev-parse', 'HEAD']).trim()).toBe(f.sha);
    expect(git(f.target, ['status', '--porcelain', '--untracked-files=all']).trim()).toBe('');
    expect(fs.readFileSync(path.join(f.target, 'a.txt'), 'utf8')).toBe('approved\n');
    expect(workingCopyMissing(f.workspace)).toBe(false);
    expect(git(f.repo, ['rev-parse', 'HEAD']).trim()).toBe(f.sha);
  });
  it('never overwrites a folder that already exists', async () => {
    const f = await vanished(); fs.mkdirSync(f.target, { recursive: true }); fs.writeFileSync(path.join(f.target, 'keep.txt'), 'mine');
    await expect(restoreCodingWorkspace(f.product.id, f.workspace.id)).rejects.toThrow(/already exists/);
    expect(fs.readFileSync(path.join(f.target, 'keep.txt'), 'utf8')).toBe('mine');
  });
  it('refuses without a current human code approval for that exact commit', async () => {
    const f = await vanished();
    await db.codeChangeApproval.updateMany({ where: { workspaceId: f.workspace.id }, data: { stale: true } });
    await expect(restoreCodingWorkspace(f.product.id, f.workspace.id)).rejects.toThrow(/code approval/);
    expect(workingCopyMissing(f.workspace)).toBe(true);
  });
  it('refuses a workspace that is not completed, has no commit, or is outside the managed folder', async () => {
    const f = await vanished();
    await db.repositoryWorkspace.update({ where: { id: f.workspace.id }, data: { status: 'ACTIVE' } });
    await expect(restoreCodingWorkspace(f.product.id, f.workspace.id)).rejects.toThrow(/completed task/);
    await db.repositoryWorkspace.update({ where: { id: f.workspace.id }, data: { status: 'COMPLETED', headCommit: '' } });
    await expect(restoreCodingWorkspace(f.product.id, f.workspace.id)).rejects.toThrow(/no recorded commit/);
    await db.repositoryWorkspace.update({ where: { id: f.workspace.id }, data: { headCommit: f.sha, workspacePath: path.join(os.tmpdir(), 'elsewhere-' + f.workspace.id) } });
    await expect(restoreCodingWorkspace(f.product.id, f.workspace.id)).rejects.toThrow(/outside the folder/);
  });
  it('refuses a workspace of another product', async () => {
    const f = await vanished();
    await expect(restoreCodingWorkspace('some-other-product', f.workspace.id)).rejects.toThrow(/not found/);
  });
});
