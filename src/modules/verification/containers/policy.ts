import { RELAY_SUPERVISOR } from './services';
/** Trusted controller policy. None of these controls are supplied by generated code. */
export const CONTAINER_IMAGES = {
  node: 'docker.io/library/node@sha256:8544b46b91d1a8c8bf8fc0d53ae9f276ed07d0ffa9098dc4a9c2f627363a13a0',
  postgres: 'docker.io/library/postgres@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d',
} as const;
export const JOB_DEADLINE_MS = 30 * 60_000;
export const OUTPUT_BYTES = 64_000;
export const SOURCE_BYTES = 100 * 1024 * 1024;
export const ARTIFACT_BYTES = 512 * 1024 * 1024;
export const WORK_BYTES = 2 * 1024 * 1024 * 1024;
export type ContainerRole = 'build' | 'app' | 'test' | 'database' | 'artifacts' | 'schema' | 'proxy' | 'lock' | 'snapshot';
export type Profile = ReturnType<typeof containerProfile>;
export function containerProfile(role: ContainerRole) {
  const postgres = role === 'database';
  const inputOwner = role === 'app' || role === 'test' || role === 'snapshot' ? 65534 : postgres ? 999 : 1000;
  return {
    image: postgres ? CONTAINER_IMAGES.postgres : CONTAINER_IMAGES.node,
    workerUid: postgres ? 999 : 1000,
    memory: role === 'build' ? 4 * 1024 ** 3 : 1024 ** 3,
    cpu: role === 'build' ? 2_000_000_000 : 1_000_000_000,
    pids: role === 'build' ? 256 : 128,
    tmpfs: {
      '/work': `rw,exec,nosuid,nodev,size=${role === 'artifacts' ? ARTIFACT_BYTES : WORK_BYTES},uid=${inputOwner},gid=${inputOwner},mode=${inputOwner === 65534 ? '0755' : '0700'}`,
      '/tmp': 'rw,noexec,nosuid,nodev,size=67108864,mode=1777',
      ...(postgres ? {
        '/var/lib/postgresql/data': 'rw,noexec,nosuid,nodev,size=536870912,uid=999,gid=999,mode=0700',
        '/var/run/postgresql': 'rw,noexec,nosuid,nodev,size=1048576,uid=999,gid=999,mode=0700',
      } : {}),
    } as Record<string, string>,
  };
}
export const WATCHDOG = 'remaining=$(($1 - $(/bin/date +%s))); test "$remaining" -gt 0 || exit 124; exec /bin/sleep "$remaining"';
export function supervisor(role: ContainerRole, name: string, expiresAt = JOB_DEADLINE_MS) {
  return role === 'test' ? { entrypoint: '/usr/local/bin/node', args: ['-e', RELAY_SUPERVISOR, `http://${name.slice(0, -5)}-proxy:8080`, String(expiresAt)] } : { entrypoint: '/bin/sh', args: ['-c', WATCHDOG, 'watchdog', String(Math.floor(expiresAt / 1000))] };
}
export function createContainerArgs(name: string, role: ContainerRole, network = 'none', expiresAt = JOB_DEADLINE_MS) {
  if (!(role === 'lock' && name === 'apf-verification-active-job') && !/^apf-vf-[a-f0-9-]+-(?:build|app|test|database|artifacts|schema|proxy|snapshot)$/.test(name)) throw new Error('Invalid verification resource name.');
  if (network !== 'none' && !/^apf-vf-[a-f0-9-]+-(?:dependencies|application|database|tests|test-database)$/.test(network)) throw new Error('Invalid verification network.');
  const p = containerProfile(role);
  return ['create', '--name', name, '--label', 'ai-product-factory.verification=container-v1', '--label', `ai-product-factory.verification.job=${name.slice(7, name.lastIndexOf('-'))}`, '--read-only',
    // The supervisor has a different unprivileged uid from generated workers.
    // Workers cannot stop its hard deadline with a same-user signal.
    '--user', '65534:65534', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
    '--cpus', String(p.cpu / 1e9), '--memory', String(p.memory), '--memory-swap', String(p.memory),
    '--pids-limit', String(p.pids), '--ulimit', 'core=0:0', '--ulimit', 'nofile=1024:1024', '--log-driver', 'none',
    '--cgroupns', 'private', '--ipc', 'private', '--dns', '127.0.0.1', '--network', network,
    ...Object.entries(p.tmpfs).flatMap(([target, options]) => ['--tmpfs', `${target}:${options}`]),
    '--entrypoint', supervisor(role, name, expiresAt).entrypoint, p.image, ...supervisor(role, name, expiresAt).args];
}
export type ContainerInspection = {
  Image: string;
  Config: { Image: string; User: string; Entrypoint: string[]; Cmd: string[]; Labels?: Record<string, string> };
  HostConfig: { Privileged: boolean; ReadonlyRootfs: boolean; Memory: number; MemorySwap: number; NanoCpus: number; PidsLimit: number; CapDrop: string[]; CapAdd: string[] | null; SecurityOpt: string[]; Binds: unknown; Devices: unknown[] | null; NetworkMode: string; PidMode: string; IpcMode: string; CgroupnsMode: string; PortBindings: unknown; Tmpfs: Record<string, string>; Dns: string[]; LogConfig: { Type: string } };
  Mounts: { Type: string; Destination: string }[];
  NetworkSettings: { Networks: Record<string, unknown>; Ports: unknown };
};
function empty(value: unknown) { return value === null || value === undefined || (typeof value === 'object' && Object.keys(value).length === 0); }
export function assertContainerPolicy(c: ContainerInspection, role: ContainerRole, network: string, imageId: string, name = '', expiresAt = JOB_DEADLINE_MS) {
  const p = containerProfile(role), h = c.HostConfig, init = supervisor(role, name, expiresAt);
  if (c.Image !== imageId || c.Config.Image !== p.image || c.Config.User !== '65534:65534' || c.Config.Entrypoint?.join() !== init.entrypoint || JSON.stringify(c.Config.Cmd) !== JSON.stringify(init.args)
    || h.Privileged || !h.ReadonlyRootfs || h.Memory !== p.memory || h.MemorySwap !== p.memory || h.NanoCpus !== p.cpu || h.PidsLimit !== p.pids
    || h.CapDrop?.join() !== 'ALL' || !empty(h.CapAdd) || h.SecurityOpt?.join() !== 'no-new-privileges:true' || !empty(h.Binds) || !empty(h.Devices)
    || h.NetworkMode !== network || h.PidMode !== '' || h.IpcMode !== 'private' || h.CgroupnsMode !== 'private' || !empty(h.PortBindings)
    || h.Dns?.join() !== '127.0.0.1' || h.LogConfig?.Type !== 'none'
    || JSON.stringify(Object.entries(h.Tmpfs ?? {}).sort()) !== JSON.stringify(Object.entries(p.tmpfs).sort())
    || c.Mounts.some(m => m.Type !== 'tmpfs' || !(m.Destination in p.tmpfs))) throw new Error('Container configuration does not enforce the approved verification boundary.');
}
export function assertKernelLimits(output: string, role: ContainerRole) {
  const p = containerProfile(role), fields = Object.fromEntries(output.trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  const [quota, period] = (fields.cpu ?? '').split(' ').map(Number);
  if (!Number.isFinite(quota) || quota / period !== p.cpu / 1e9 || Number(fields.memory) !== p.memory || Number(fields.pids) !== p.pids || fields.caps !== '0000000000000000' || fields.nnp !== '1' || fields.seccomp !== '2') throw new Error('Kernel isolation or resource limits could not be confirmed.');
}
export const KERNEL_PROBE = `printf 'cpu='; cat /sys/fs/cgroup/cpu.max; printf 'memory='; cat /sys/fs/cgroup/memory.max; printf 'pids='; cat /sys/fs/cgroup/pids.max; awk '/^CapEff:/{print "caps=" $2} /^NoNewPrivs:/{print "nnp=" $2} /^Seccomp:/{print "seccomp=" $2}' /proc/self/status`;
export type RuntimeDeclaration = { kind: 'MANAGED_HTTP_DATABASE'; baseUrlEnv: string; databaseUrlEnv: string };
export function parseRuntimeDeclaration(value: unknown): RuntimeDeclaration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('An explicitly approved managed runtime declaration is required.');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join() !== 'baseUrlEnv,databaseUrlEnv,kind' || v.kind !== 'MANAGED_HTTP_DATABASE' || typeof v.baseUrlEnv !== 'string' || typeof v.databaseUrlEnv !== 'string'
    || !/^(?:TEST|VERIFICATION)_[A-Z][A-Z0-9_]{0,63}$/.test(v.baseUrlEnv) || !/^(?:TEST|VERIFICATION)_[A-Z][A-Z0-9_]{0,63}$/.test(v.databaseUrlEnv) || v.baseUrlEnv === v.databaseUrlEnv) throw new Error('Unsafe managed-runtime environment declaration.');
  return { kind: v.kind, baseUrlEnv: v.baseUrlEnv, databaseUrlEnv: v.databaseUrlEnv };
}
