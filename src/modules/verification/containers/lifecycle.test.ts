import { describe, it, expect, vi, afterEach } from 'vitest';
import { DockerJob, type Captured, type DockerResource } from './docker';
import { CONTAINER_IMAGES, containerProfile, KERNEL_PROBE, JOB_DEADLINE_MS } from './policy';

const ok = (output = ''): Captured => ({ code: 0, timedOut: false, output });
function harness(authorize?:()=>Promise<void>) {
  const resources = new Map<string, Record<string, unknown>>();
  const audit = new Set<string>();
  const removed: string[] = [];
  const failRemove = new Set<string>();
  let onRun: (() => Promise<Captured>) | undefined;
  let beforeCreate: (() => Promise<void>) | undefined;
  const command = vi.fn(async (args: string[]): Promise<Captured> => {
    const last = args.at(-1)!;
    if (args[0] === 'info') return ok(JSON.stringify({ OSType: 'linux', CgroupVersion: '2', MemoryLimit: true, SwapLimit: true, CpuCfsQuota: true, PidsLimit: true, SecurityOptions: ['name=seccomp,profile=builtin'] }));
    if (args[0] === 'image') return ok(JSON.stringify([{ Id: args[2], RepoDigests: [args[2]], Os: 'linux', Architecture: 'amd64' }]));
    if (args[0] === 'create') {
      await beforeCreate?.();
      const value = (flag: string) => args[args.indexOf(flag) + 1];
      const name = value('--name');
      const image = args.find(a => Object.values(CONTAINER_IMAGES).includes(a as typeof CONTAINER_IMAGES.node))!;
      const labels = Object.fromEntries(args.flatMap((a, i) => a === '--label' ? [args[i + 1].split('=')] : []));
      resources.set(name, { Image: image, Config: { Image: image, User: value('--user'), Entrypoint: [value('--entrypoint')], Cmd: args.slice(args.indexOf(image) + 1), Labels: labels },
        HostConfig: { Privileged: false, ReadonlyRootfs: true, Memory: Number(value('--memory')), MemorySwap: Number(value('--memory-swap')), NanoCpus: Number(value('--cpus')) * 1e9, PidsLimit: Number(value('--pids-limit')), CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges:true'], Binds: null, Devices: null, NetworkMode: value('--network'), PidMode: '', IpcMode: 'private', CgroupnsMode: 'private', PortBindings: null, Tmpfs: Object.fromEntries(args.flatMap((a, i) => a === '--tmpfs' ? [[args[i + 1].split(':')[0], args[i + 1].slice(args[i + 1].indexOf(':') + 1)]] : [])), Dns: ['127.0.0.1'], LogConfig: { Type: 'none' } }, Mounts: [], NetworkSettings: { Networks: {}, Ports: null } });
      return ok(name);
    }
    if (args[0] === 'network' && args[1] === 'create') {
      const label = args[args.indexOf('--label') + 1].split('=');
      resources.set(last, { Internal: true, EnableIPv6: false, Options: { 'com.docker.network.bridge.gateway_mode_ipv4': 'isolated' }, Labels: { [label[0]]: label[1] } }); return ok(last);
    }
    if (args[0] === 'inspect' || args[0] === 'network' && args[1] === 'inspect') return resources.has(last) ? ok(JSON.stringify([resources.get(last)])) : { ...ok(), code: 1 };
    if (args[0] === 'rm' || args[0] === 'network' && args[1] === 'rm') {
      if (failRemove.has(last)) return { ...ok(), code: 1 };
      resources.delete(last); removed.push(last); return ok();
    }
    if (args[0] === 'ps' || args[0] === 'network' && args[1] === 'ls') return ok([...resources.keys()].join('\n'));
    if (args[0] === 'exec' && last === KERNEL_PROBE) {
      const name = args.find(a => resources.has(a))!;
      const role = name.split('-').at(-1)! as Parameters<typeof containerProfile>[0];
      const p = containerProfile(role);
      return ok(`cpu=${p.cpu / 1e9 * 100000} 100000\nmemory=${p.memory}\npids=${p.pids}\ncaps=0000000000000000\nnnp=1\nseccomp=2`);
    }
    if (args[0] === 'exec' && last.includes('WORKER_BOUNDARY_CONFIRMED')) return ok('WORKER_BOUNDARY_CONFIRMED');
    if (args[0] === 'exec' && args.includes('node') && last.includes('process.stdin.on')) return onRun ? onRun() : ok('executed');
    return ok();
  });
  const job = new DockerJob({ async record(r: DockerResource) { audit.add(r.name); }, async release(r: DockerResource) { audit.delete(r.name); } }, command, authorize);
  return { job, command, resources, audit, removed, failRemove, run: (fn: () => Promise<Captured>) => { onRun = fn; }, create: (fn: () => Promise<void>) => { beforeCreate = fn; } };
}
afterEach(() => vi.useRealTimers());
describe('container lifecycle integration', () => {
  it('requires current authority before code execution and does not launch on rejection',async()=>{const authorize=vi.fn(async()=>{throw new Error('approval revoked')});const h=harness(authorize);await h.job.preflight();const name=await h.job.container('test');await expect(h.job.run(name,['node','--test','verification/case.test.mjs'])).rejects.toThrow(/revoked/);expect(h.command.mock.calls.some(([args])=>args.includes('node')&&args.at(-1)?.includes('process.stdin.on'))).toBe(false);await h.job.cleanup()});
  it('confirms timeout cleanup and does not expose an unsanitizable output tail', async () => {
    const h = harness(); await h.job.preflight(); const name = await h.job.container('test');
    h.run(async () => ({ code: null, timedOut: true, output: 'PRIVATE_SESSION_TOKEN' }));
    const result = await h.job.run(name, ['node', '--test', 'verification/example.test.mjs']);
    expect(result.timedOut).toBe(true); expect(result.output).not.toContain('PRIVATE_SESSION_TOKEN');
    expect(h.resources.size).toBe(0); expect(h.audit.size).toBe(0);
    await expect(h.job.remove(name)).resolves.toBeUndefined();
  });
  it('performs concurrent/repeated shutdown only once', async () => {
    const h = harness(); await h.job.preflight(); await h.job.network('application');
    await Promise.all([h.job.cleanup(), h.job.cleanup(), h.job.cleanup()]);
    expect(h.removed).toHaveLength(2); expect(h.audit.size).toBe(0);
  });
  it('retains failed resource and lock records and permits an explicit cleanup retry', async () => {
    const h = harness(); await h.job.preflight(); const network = await h.job.network('application'); h.failRemove.add(network);
    await expect(h.job.cleanup()).rejects.toThrow(/cleanup could not be confirmed/);
    expect(h.resources.has('apf-verification-active-job')).toBe(true); expect(h.audit.has(network)).toBe(true);
    h.failRemove.clear(); await h.job.cleanup(); expect(h.audit.size).toBe(0);
  });
  it('removes workers before networks created and attached later', async () => {
    const h = harness(); await h.job.preflight(); const initialNetwork = await h.job.network('tests');
    const worker = await h.job.container('test', initialNetwork);
    const network = await h.job.network('test-database'); await h.job.attach(worker, network);
    await h.job.cleanup(); expect(h.removed).toEqual([worker, network, initialNetwork, 'apf-verification-active-job']);
  });
  it('waits for an in-flight resource creation before confirming absence', async () => {
    const h = harness(); await h.job.preflight();
    let release!: () => void; let entered!: () => void;
    const enteredPromise = new Promise<void>(r => { entered = r; });
    h.create(async () => { entered(); await new Promise<void>(r => { release = r; }); });
    const creating = h.job.container('test'); const creationResult = creating.catch(() => undefined);
    await enteredPromise; const closing = h.job.cleanup(); release();
    await Promise.all([creationResult, closing]); expect(h.resources.size).toBe(0); expect(h.audit.size).toBe(0);
  });
  it('applies the absolute job deadline and removes remaining resources', async () => {
    vi.useFakeTimers(); const h = harness(); await h.job.preflight(); await h.job.network('application');
    await vi.advanceTimersByTimeAsync(JOB_DEADLINE_MS);
    expect(h.resources.size).toBe(0); expect(h.audit.size).toBe(0);
    await expect(h.job.network('tests')).rejects.toThrow(/stopped/);
  });
  it('rejects an unavailable daemon before creating or executing anything', async () => {
    const audit = { record: vi.fn(), release: vi.fn() };
    const command = vi.fn(async () => ({ code: 1, timedOut: false, output: 'unavailable' }));
    const job = new DockerJob(audit, command);
    await expect(job.preflight()).rejects.toThrow(/operation failed/);
    await job.cleanup(); expect(audit.record).not.toHaveBeenCalled(); expect(command).toHaveBeenCalledTimes(1);
  });
});
