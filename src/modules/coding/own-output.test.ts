import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { completedTaskIn, git } from '@/modules/verification/completed-task.test-support';
import { hashText } from './policy';
import { preflightPreservation } from './preservation';
import { adoptOwnEarlierOutput } from './own-output';

const products: string[] = [], roots: string[] = [];
afterEach(async () => { for (const id of products.splice(0)) await db.product.delete({ where: { id } }); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

async function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apf-own-')); roots.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true }); fs.writeFileSync(path.join(root, 'package.json'), '{}'); fs.writeFileSync(path.join(root, 'src/base.ts'), 'export const base = 1;\n');
  git(root, ['init', '-b', 'main']); git(root, ['config', 'user.email', 't@example.com']); git(root, ['config', 'user.name', 'T']); git(root, ['add', '.']); git(root, ['commit', '-m', 'base']);
  const fixture = await completedTaskIn(root); products.push(fixture.product.id);
  const row = await db.repositoryWorkspace.findFirstOrThrow({ where: { implementationTaskId: fixture.task.id } });
  return { root, id: row.id, workspacePath: root, baseCommit: fixture.sha };
}
const created = (workspaceId: string, file: string, over: { allowed?: boolean } = {}) => db.codingToolEvent.create({ data: { workspaceId, action: 'CREATE_FILE', allowed: over.allowed ?? true, path: file } });
const op = (file: string, action: 'CREATE_FILE' | 'WRITE_FILE' = 'CREATE_FILE') => ({ action, path: file, content: 'export const next = 2;\n' });

describe('a rerun replacing this workspace\'s own earlier output', () => {
  it('treats a create of its own earlier file as a write, and counts the file as read', async () => {
    const w = await workspace(); fs.writeFileSync(path.join(w.root, 'src/mine.ts'), 'export const mine = 1;\n'); await created(w.id, 'src/mine.ts');
    const reads: Record<string, string> = {}, own = new Set<string>();
    const result = await adoptOwnEarlierOutput(w, [op('src/mine.ts')], reads, own);
    expect(result).toEqual([op('src/mine.ts', 'WRITE_FILE')]);
    expect(reads['src/mine.ts']).toBe(hashText('export const mine = 1;\n'));
    // The preservation preflight, which blocked this before, now has nothing to say about it.
    expect([...own]).toEqual(['src/mine.ts']);
    expect(preflightPreservation(w.root, result, reads, own)).toEqual([]);
  });
  it('keeps full protection for any existing file this workspace did not create', async () => {
    const w = await workspace(); fs.writeFileSync(path.join(w.root, 'src/theirs.ts'), 'export const theirs = 1;\n');
    const reads: Record<string, string> = {}, own = new Set<string>();
    const result = await adoptOwnEarlierOutput(w, [op('src/theirs.ts')], reads, own);
    expect(result[0]!.action).toBe('CREATE_FILE');
    expect(preflightPreservation(w.root, result, reads, own).map((issue) => issue.reason).join(' ')).toMatch(/cannot overwrite/);
  });
  it('never adopts a baseline file, even if a creation was somehow logged for it', async () => {
    const w = await workspace(); await created(w.id, 'src/base.ts');
    const reads: Record<string, string> = {};
    expect((await adoptOwnEarlierOutput(w, [op('src/base.ts')], reads, new Set()))[0]!.action).toBe('CREATE_FILE');
    expect(reads).toEqual({});
  });
  it('ignores refused creations and files that are gone, and leaves other actions alone', async () => {
    const w = await workspace(); fs.writeFileSync(path.join(w.root, 'src/refused.ts'), 'x\n'); await created(w.id, 'src/refused.ts', { allowed: false }); await created(w.id, 'src/gone.ts');
    const reads: Record<string, string> = {};
    const input = [op('src/refused.ts'), op('src/gone.ts'), op('src/base.ts', 'WRITE_FILE')];
    expect((await adoptOwnEarlierOutput(w, input, reads, new Set())).map((item) => item.action)).toEqual(['CREATE_FILE', 'CREATE_FILE', 'WRITE_FILE']);
  });
  it('does not follow a path out of the workspace', async () => {
    const w = await workspace(); await created(w.id, '../escape.ts');
    expect((await adoptOwnEarlierOutput(w, [op('../escape.ts')], {}, new Set()))[0]!.action).toBe('CREATE_FILE');
  });
});
