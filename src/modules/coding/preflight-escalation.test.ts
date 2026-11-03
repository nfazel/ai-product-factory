import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { completedTaskIn, git } from '@/modules/verification/completed-task.test-support';
import { openEscalationCount, PREFLIGHT_BLOCK_DESCRIPTION, resolveObsoletePreflightBlocks } from './repository';

const products: string[] = [], roots: string[] = [];
afterEach(async () => {
  for (const id of products.splice(0)) await db.product.delete({ where: { id } });
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
async function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apf-preflight-')); roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  git(root, ['init', '-b', 'main']); git(root, ['config', 'user.email', 't@example.com']); git(root, ['config', 'user.name', 'T']); git(root, ['add', '.']); git(root, ['commit', '-m', 'init']);
  const fixture = await completedTaskIn(root); products.push(fixture.product.id);
  return db.repositoryWorkspace.findFirstOrThrow({ where: { implementationTaskId: fixture.task.id } });
}
const escalation = (workspaceId: string, over: Record<string, string> = {}) => db.codingEscalation.create({ data: { workspaceId, type: 'ARCHITECTURE_CONFLICT', description: PREFLIGHT_BLOCK_DESCRIPTION, reason: 'package.json: Existing validation/setup script changed or removed: test:integration.', recommendedAction: 'Request human review.', status: 'OPEN', ...over } });

describe('an obsolete preservation preflight block', () => {
  it('is resolved once a later batch passes the preflight', async () => {
    const w = await workspace(); await escalation(w.id);
    expect(await openEscalationCount(w.id)).toBe(1);
    expect((await resolveObsoletePreflightBlocks(w.id)).count).toBe(1);
    expect(await openEscalationCount(w.id)).toBe(0);
    expect((await db.codingEscalation.findFirstOrThrow({ where: { workspaceId: w.id } })).resolvedAt).not.toBeNull();
  });
  it('leaves every other escalation open, including a real conflict raised by the agent', async () => {
    const w = await workspace();
    await escalation(w.id, { description: 'The agent found a real conflict with the approved architecture.' });
    await escalation(w.id, { type: 'SCOPE_EXPANSION' });
    expect((await resolveObsoletePreflightBlocks(w.id)).count).toBe(0);
    expect(await openEscalationCount(w.id)).toBe(2);
  });
  it('only touches its own workspace', async () => {
    const a = await workspace(), b = await workspace();
    await escalation(a.id); await escalation(b.id);
    await resolveObsoletePreflightBlocks(a.id);
    expect(await openEscalationCount(a.id)).toBe(0);
    expect(await openEscalationCount(b.id)).toBe(1);
  });
});
