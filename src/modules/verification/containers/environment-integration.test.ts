import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./transfer', () => ({ transferArtifacts: vi.fn(async () => undefined) }));
import { ManagedEnvironment } from './environment';
import { transferArtifacts } from './transfer';

function environment() {
  const env = new ManagedEnvironment('/fixture', 'a'.repeat(40), { record: vi.fn(), release: vi.fn() });
  env.source = { files: [{ path: 'src/claim.mjs', bytes: Buffer.from('export const claim = 1;') }] } as never;
  env.app = 'approved-app';
  vi.spyOn(env.job, 'container').mockResolvedValue('worker');
  vi.spyOn(env.job, 'put').mockResolvedValue();
  vi.spyOn(env.job, 'checked').mockResolvedValue('');
  vi.spyOn(env.job, 'run').mockResolvedValue({ code: 0, timedOut: false, output: 'ok' });
  return env;
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
describe('managed adapter integration', () => {
  it('runs module tests with approved source and dependencies, no network or runtime credentials', async () => {
    const env = environment(), argv = ['node', '--test', 'verification/claim.test.mjs'];
    const test = { path: argv[2], bytes: Buffer.from('// independent test') };
    await env.moduleTest(argv, [test]);
    expect(env.job.container).toHaveBeenCalledWith('test', 'none');
    expect(env.job.put).toHaveBeenCalledWith('worker', [...env.source.files, { ...test, mode: 0o644 }]);
    expect(transferArtifacts).toHaveBeenCalledWith(env.job, 'approved-app', 'worker', ['node_modules']);
    expect(env.job.checked).toHaveBeenCalledWith(['exec', '--user', '65534:65534', 'worker', 'chmod', '-R', 'a-w', '/work']);
    expect(env.job.run).toHaveBeenCalledWith('worker', argv, { NPM_CONFIG_CACHE: '/tmp/.npm' });
  });
  it.each([204, 205, 304])('accepts a bodyless HTTP %s fixture response', async status => {
    const env = environment();
    vi.mocked(env.job.run).mockResolvedValue({ code: 0, timedOut: false, output: JSON.stringify({ status, headers: {}, body: '' }) });
    const response = await env.request('http://127.0.0.1:3000/fixture');
    expect(response.status).toBe(status); expect(response.body).toBeNull();
  });
  it('preserves a timeout after cleanup without querying the removed observation proxy', async () => {
    const env = environment(), observations = vi.spyOn(env, 'observations').mockRejectedValue(new Error('proxy removed'));
    const timeout = { code: null, timedOut: true, output: 'Cleanup confirmed.' };
    vi.mocked(env.job.run).mockResolvedValue(timeout);
    expect(await env.independent(['node', '--test', 'verification/claim.test.mjs'], [])).toEqual(timeout);
    expect(observations).not.toHaveBeenCalled();
  });
  it('rejects contradictory isolated/database configuration before creating a worker', async () => {
    const env = environment(); await expect(env.freshTest(true, true)).rejects.toThrow(/database network/);
    expect(env.job.container).not.toHaveBeenCalled();
  });
});
