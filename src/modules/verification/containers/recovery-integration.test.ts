import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./docker', () => ({ dockerCommand: vi.fn() }));
import { dockerCommand } from './docker';
import { releaseRecordedResources } from '../recovery';
import { parseTrackedResources, type TrackedResource } from '../resources';
const command = vi.mocked(dockerCommand);
const job = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const owned = (kind: 'container' | 'network', suffix: string): Extract<TrackedResource, { kind: 'container' | 'network' }> => ({ kind, id: suffix, job, name: suffix === 'lock' ? 'apf-verification-active-job' : `apf-vf-${job}-${suffix}` });
const good = (output = '') => ({ code: 0, output, timedOut: false });
beforeEach(() => { command.mockReset(); });
describe('tracked container recovery', () => {
  it('removes containers before attached networks and releases the lock last regardless of stored order', async () => {
    command.mockImplementation(async args => args.includes('inspect') ? good(JSON.stringify([{ Config: { Labels: { 'ai-product-factory.verification.job': job } }, Labels: { 'ai-product-factory.verification.job': job } }])) : good());
    const resources = [owned('container', 'app'), owned('container', 'lock'), owned('network', 'application')];
    const result = await releaseRecordedResources(resources);
    expect(result.kept).toEqual([]);
    const removed = command.mock.calls.filter(([a]) => a[0] === 'rm' || a[0] === 'network' && a[1] === 'rm').map(([a]) => a.at(-1));
    expect(removed).toEqual([resources[0].name, resources[2].name, resources[1].name]);
  });
  it('retains uncertain resources and their job lock when the daemon cannot confirm absence', async () => {
    command.mockResolvedValue({ code: 1, output: 'unavailable', timedOut: false });
    const resources = [owned('container', 'lock'), owned('container', 'app')];
    const result = await releaseRecordedResources(resources);
    expect(result.kept).toHaveLength(2); expect(command.mock.calls.some(([a]) => a[0] === 'rm')).toBe(false);
  });
  it('never deletes a foreign resource even when its name looks correct', async () => {
    command.mockResolvedValue(good(JSON.stringify([{ Config: { Labels: { 'ai-product-factory.verification.job': 'foreign' } } }])));
    const result = await releaseRecordedResources([owned('container', 'app')]);
    expect(result.kept).toHaveLength(1); expect(command).toHaveBeenCalledTimes(1);
  });
  it('refuses forged or malformed resource names before contacting Docker', async () => {
    const bad: TrackedResource = { kind: 'container', id: 'foreign', name: 'important-user-container', job };
    expect(parseTrackedResources([bad])).toEqual([]);
    expect(parseTrackedResources([{ ...owned('network', 'application'), name: 'apf-verification-active-job' }])).toEqual([]);
    const result = await releaseRecordedResources([bad]); expect(result.kept).toEqual([bad]); expect(command).not.toHaveBeenCalled();
  });
  it('continues cleanup after malformed inspection instead of abandoning other resources', async () => {
    const bad = owned('container', 'test'), other = owned('container', 'app');
    command.mockImplementation(async args => args.includes('inspect') ? args.at(-1) === bad.name ? good('not json') : good(JSON.stringify([{ Config: { Labels: { 'ai-product-factory.verification.job': job } } }])) : good());
    const result = await releaseRecordedResources([other, bad]); expect(result.kept).toEqual([bad]); expect(result.released).toEqual([other]);
  });
});
