import 'server-only';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { inputTar, type InputFile } from './inputs';
import { CONTAINER_IMAGES, JOB_DEADLINE_MS, OUTPUT_BYTES, KERNEL_PROBE, createContainerArgs, containerProfile, assertContainerPolicy, assertKernelLimits, type ContainerRole, type ContainerInspection } from './policy';

export type DockerResource = { kind: 'container' | 'network'; name: string; job: string };
export type DockerAudit = { record(resource: DockerResource): Promise<void>; release(resource: DockerResource): Promise<void> };
export type Captured = { code: number | null; output: string; timedOut: boolean };
const privateTails = new WeakMap<Captured, string>();
export function finalizeTestOutput(result: Captured, secrets: string[]): Captured { const raw = privateTails.get(result) ?? result.output; privateTails.delete(result); return { code: result.code, timedOut: result.timedOut, output: scrubSecrets(raw, secrets).slice(-OUTPUT_BYTES) }; }
export function scrubSecrets(text: string, secrets: string[]) {
  let output = text;
  for (const secret of [...new Set(secrets.flatMap(s => s ? [s, encodeURIComponent(s), Buffer.from(s).toString('base64')] : []))].filter(s => s.length >= 4).sort((a, b) => b.length - a.length)) output = output.split(secret).join('[redacted]');
  return output.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[redacted database URL]');
}
/** No inherited environment, Docker credential config, shell, or public TCP daemon. */
const emptyDockerConfig = path.join(tmpdir(), `apf-docker-empty-${randomUUID()}`);
export type DockerInput = Buffer | string | Iterable<Buffer> | AsyncIterable<Buffer>;
export function dockerCommand(args: string[], input?: DockerInput, timeoutMs = 30_000, secrets: string[] = []): Promise<Captured> {
  const endpoint = `unix://${homedir()}/.docker/run/docker.sock`;
  return new Promise(resolve => {
    const abortInput = new AbortController();
    let output = '', done = false, timedOut = false, truncated = false;
    const overlap = Math.max(16384, ...secrets.map(s => Buffer.byteLength(s) * 4));
    const child = spawn('docker', ['--host', endpoint, ...args], { env: { NODE_ENV: 'production', PATH: process.env.PATH, LANG: 'C.UTF-8', DOCKER_CONFIG: emptyDockerConfig }, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    // Keep raw captured data private and bounded. Redact before returning any
    // output to the runner, evidence system or model context.
    const capture = (part: Buffer) => { const joined = output + part.toString('utf8'); truncated ||= joined.length > OUTPUT_BYTES + overlap; output = joined.slice(-(OUTPUT_BYTES + overlap)); };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    const finish = (code: number | null) => { if (done) return; done = true; clearTimeout(timer); abortInput.abort(); const result = { code, timedOut, output: scrubSecrets(truncated ? output.slice(overlap) : output, secrets).slice(-OUTPUT_BYTES) }; privateTails.set(result, output); resolve(result); };
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); finish(null); }, timeoutMs);
    child.on('error', () => { output = 'The Docker controller could not execute the required operation.'; finish(null); });
    child.on('close', finish); child.stdin.on('error', () => undefined); if (input && typeof input !== 'string' && !Buffer.isBuffer(input)) {
      void pipeline(Readable.from(input), child.stdin, { signal: abortInput.signal }).catch(() => {
        if (!done) { child.kill('SIGKILL'); finish(null); }
      });
    } else child.stdin.end(input);
  });
}
const LAUNCH = `const {spawn}=require('node:child_process');let bytes=0,input='';process.stdin.on('data',d=>{bytes+=d.length;if(bytes>1048576)process.exit(125);input+=d});process.stdin.on('end',()=>{try{const p=JSON.parse(input);const child=spawn(p.argv[0],p.argv.slice(1),{cwd:'/work',env:{PATH:process.env.PATH,HOME:'/work',TMPDIR:'/tmp',LANG:'C.UTF-8',...p.env},shell:false,stdio:['ignore','inherit','inherit']});child.on('error',()=>process.exit(125));child.on('exit',(c,s)=>process.exit(c===null?124:c))}catch{process.exit(125)}});`;
export class DockerJob {
  readonly id = randomUUID();
  readonly expiresAt = Date.now() + JOB_DEADLINE_MS;
  readonly prefix = `apf-vf-${this.id}`;
  readonly secrets: string[] = [];
  private resources: DockerResource[] = [];
  private imageIds = new Map<string, string>();
  private stopped = false;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private cleanupPromise: Promise<void> | null = null;
  private pendingControls = new Set<Promise<unknown>>();
  constructor(private audit: DockerAudit, private command: typeof dockerCommand = dockerCommand, private authorize?: () => Promise<void>) {}
  async checked(args: string[], input?: DockerInput, timeoutMs?: number) {
    if (this.stopped) throw new Error('The isolated verification job has stopped.');
    const pending = this.command(args, input, timeoutMs, this.secrets);
    const mutates = ['create', 'start', 'rm'].includes(args[0]) || args[0] === 'network' && ['create', 'connect', 'rm'].includes(args[1]);
    if (mutates) this.pendingControls.add(pending);
    let result: Captured;
    try { result = await pending; } finally { this.pendingControls.delete(pending); }
    if (result.code !== 0 || result.timedOut) throw new Error(`Isolated verification operation failed: ${result.output || 'Docker unavailable or operation timed out.'}`);
    return result.output;
  }
  async preflight() {
    const info = JSON.parse(await this.checked(['info', '--format', '{{json .}}']));
    if (info.OSType !== 'linux' || info.CgroupVersion !== '2' || !info.MemoryLimit || !info.SwapLimit || !info.CpuCfsQuota || !info.PidsLimit || !info.SecurityOptions?.some((s: string) => s.startsWith('name=seccomp'))) throw new Error('The Docker environment cannot enforce the required isolation and limits.');
    for (const image of Object.values(CONTAINER_IMAGES)) {
      const [config] = JSON.parse(await this.checked(['image', 'inspect', image]));
      if (!config.RepoDigests?.some((d: string) => d.endsWith(image.slice(image.indexOf('@')))) || config.Os !== 'linux' || config.Architecture !== 'amd64') throw new Error('An approved digest-pinned runtime image is unavailable. No native fallback is permitted.');
      this.imageIds.set(image, config.Id);
    }
    await this.controllerLock();
    this.deadline = setTimeout(() => { void this.cleanup().catch(() => { /* Resource records remain for explicit recovery. */ }); }, Math.max(0, this.expiresAt - Date.now()));
  }
  private async controllerLock() {
    const name = 'apf-verification-active-job';
    await this.own({ kind: 'container', name, job: this.id });
    const args = createContainerArgs(name, 'lock', 'none', this.expiresAt);
    const label = args.findIndex(x => x.startsWith('ai-product-factory.verification.job='));
    args[label] = `ai-product-factory.verification.job=${this.id}`;
    await this.checked(args);
    await this.checked(['start', name]);
  }
  private async own(resource: DockerResource) {
    if (this.stopped) throw new Error('The isolated verification job has stopped.');
    const pending = (async () => {
      await this.audit.record(resource);
      if (this.stopped) { await this.audit.release(resource); throw new Error('The isolated verification job stopped during resource registration.'); }
      this.resources.push(resource);
    })();
    this.pendingControls.add(pending);
    try { await pending; } finally { this.pendingControls.delete(pending); }
  }
  async network(suffix: 'dependencies' | 'application' | 'database' | 'tests' | 'test-database') {
    const name = `${this.prefix}-${suffix}`;
    await this.own({ kind: 'network', name, job: this.id });
    await this.checked(['network', 'create', '--internal', '--opt', 'com.docker.network.bridge.gateway_mode_ipv4=isolated', '--label', `ai-product-factory.verification.job=${this.id}`, name]);
    const [net] = JSON.parse(await this.checked(['network', 'inspect', name]));
    if (!net.Internal || net.EnableIPv6 || net.Options?.['com.docker.network.bridge.gateway_mode_ipv4'] !== 'isolated') throw new Error('Verification network isolation could not be confirmed.');
    return name;
  }
  async container(role: ContainerRole, network = 'none') {
    const name = `${this.prefix}-${role}`, p = containerProfile(role);
    await this.own({ kind: 'container', name, job: this.id });
    await this.checked(createContainerArgs(name, role, network, this.expiresAt));
    const inspect = async () => (JSON.parse(await this.checked(['inspect', name])) as ContainerInspection[])[0];
    assertContainerPolicy(await inspect(), role, network, this.imageIds.get(p.image)!, name, this.expiresAt);
    await this.checked(['start', name]);
    assertContainerPolicy(await inspect(), role, network, this.imageIds.get(p.image)!, name, this.expiresAt);
    // Trusted probes run before any generated source or secret is copied.
    const output = await this.checked(['exec', '--user', String(p.workerUid), name, '/bin/sh', '-c', KERNEL_PROBE]);
    assertKernelLimits(output, role);
    await this.checked(['exec', '--user', String(p.workerUid), name, '/bin/sh', '-c', `if grep -Eq '^[^[:space:]]+[[:space:]]+00000000[[:space:]]' /proc/net/route; then exit 1; fi`]);
    const probe = await this.checked(['exec', '--user', String(p.workerUid), name, '/bin/sh', '-c', 'test "$(id -u)" != 0 && ! kill -STOP 1 2>/dev/null && ! touch /forbidden 2>/dev/null && echo WORKER_BOUNDARY_CONFIRMED']);
    if (!probe.includes('WORKER_BOUNDARY_CONFIRMED')) throw new Error('The worker/supervisor security boundary could not be confirmed.');
    return name;
  }
  async run(name: string, argv: string[], env: Record<string, string> = {}, timeoutMs = 120_000): Promise<Captured> {
    if (this.stopped || !this.resources.some(r => r.kind === 'container' && r.name === name)) throw new Error('No validated verification container is available.');
    await this.authorize?.();
    if (this.stopped) throw new Error('The isolated verification job has stopped.');
    const role = name.slice(name.lastIndexOf('-') + 1) as ContainerRole;
    if (role === 'database') throw new Error('Database administrative operations use a separate controlled interface.');
    const result = await this.command(['exec', '-i', '--user', '1000:1000', name, 'node', '-e', LAUNCH], JSON.stringify({ argv, env }), timeoutMs, this.secrets);
    if (result.timedOut) {
      await this.cleanup();
      // The proxy may already be gone. Do not return output containing a
      // session cookie which can no longer be collected for final redaction.
      return { code: null, timedOut: true, output: 'The isolated command exceeded its time limit; the job was stopped and cleanup confirmed.' };
    }
    return result;
  }
  async put(name: string, files: InputFile[]) {
    const role = name.slice(name.lastIndexOf('-') + 1) as ContainerRole;
    if (!this.resources.some(r => r.kind === 'container' && r.name === name)) throw new Error('No validated input destination.');
    await this.checked(['exec', '-i', '--user', String(role === 'app' || role === 'test' || role === 'snapshot' ? 65534 : containerProfile(role).workerUid), name, 'tar', '-xf', '-', '--no-same-owner', '-C', '/work'], inputTar(files), 120_000);
  }
  async attach(name: string, network: string) {
    if (!this.resources.some(r => r.kind === 'container' && r.name === name) || !this.resources.some(r => r.kind === 'network' && r.name === network)) throw new Error('Only job-owned services may be connected.');
    await this.checked(['network', 'connect', network, name]);
    const [inspection] = JSON.parse(await this.checked(['inspect', name]));
    const owned = new Set(this.resources.filter(r => r.kind === 'network').map(r => r.name));
    if (Object.keys(inspection.NetworkSettings.Networks).some(n => !owned.has(n))) throw new Error('An unapproved network was attached to a verification service.');
  }
  async remove(name: string) {
    const resource = this.resources.find(r => r.kind === 'container' && r.name === name);
    if (!resource && this.stopped) return;
    if (!resource) throw new Error('Unknown isolated container.');
    const [data] = JSON.parse(await this.checked(['inspect', name]));
    if (data.Config?.Labels?.['ai-product-factory.verification.job'] !== this.id) throw new Error('Container ownership changed.');
    await this.checked(['rm', '-f', name]); await this.audit.release(resource);
    this.resources = this.resources.filter(r => r.name !== name);
  }
  cleanup(): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise;
    this.stopped = true;
    const pending = this.cleanupResources();
    this.cleanupPromise = pending;
    void pending.catch(() => { if (this.cleanupPromise === pending) this.cleanupPromise = null; });
    return pending;
  }
  private async cleanupResources() {
    if (this.deadline) clearTimeout(this.deadline);
    this.stopped = true;
    await Promise.allSettled([...this.pendingControls]);
    const failures: string[] = [];
    const reversed = [...this.resources].reverse();
    const ordered = [
      ...reversed.filter(r => r.kind === 'container' && r.name !== 'apf-verification-active-job'),
      ...reversed.filter(r => r.kind === 'network'),
      ...reversed.filter(r => r.name === 'apf-verification-active-job'),
    ];
    for (const resource of ordered) {
      if (resource.name === 'apf-verification-active-job' && failures.length) continue;
      try {
      const found = await this.command(resource.kind === 'container' ? ['inspect', resource.name] : ['network', 'inspect', resource.name]);
      if (found.code !== 0) {
        // Absence must be positively confirmed, not inferred from daemon failure.
        const list = await this.command(resource.kind === 'container' ? ['ps', '-a', '--format', '{{.Names}}'] : ['network', 'ls', '--format', '{{.Name}}']);
        if (list.code !== 0 || list.output.split('\n').includes(resource.name)) { failures.push(resource.name); continue; }
      } else {
        const [data] = JSON.parse(found.output);
        const labels = resource.kind === 'container' ? data.Config?.Labels : data.Labels;
        if (labels?.['ai-product-factory.verification.job'] !== this.id) { await this.audit.release(resource); this.resources = this.resources.filter(r => r.name !== resource.name); continue; }
        const removed = await this.command(resource.kind === 'container' ? ['rm', '-f', resource.name] : ['network', 'rm', resource.name]);
        if (removed.code !== 0) { failures.push(resource.name); continue; }
      }
      await this.audit.release(resource);
      this.resources = this.resources.filter(r => r.name !== resource.name);
      } catch { failures.push(resource.name); }
    }
    if (failures.length) throw new Error('Verification cleanup could not be confirmed. Retained resource records require recovery.');
  }
}
