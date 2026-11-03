import {AuthorityUnavailableError} from './authority-status';
import {DomainError} from '@/modules/shared/errors';
import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson, contentHash } from '@/modules/coding/external-manifest';
import { DEVELOPMENT_RUNTIME_DIGEST } from './runtime-manifest';
import { containerProfile, CONTAINER_IMAGES, JOB_DEADLINE_MS, OUTPUT_BYTES, SOURCE_BYTES, ARTIFACT_BYTES, WORK_BYTES } from './containers/policy';

// The approved local runtime must retain its source checkout. Missing packaged
// source fails closed; this does not invent a new deployment artifact mechanism.
function identity() {
  const root = process.cwd(), files: Record<string, string> = {};
  const read = (relative: string) => {
    const absolute = path.join(root, relative), stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error('Runtime identity cannot follow links.');
    if (stat.isDirectory()) for (const entry of fs.readdirSync(absolute).sort()) read(`${relative}/${entry}`);
    else if ((relative.endsWith('.ts') && !/\.(?:test|test-support)\.ts$/.test(relative)) || relative === 'package.json' || relative === 'package-lock.json') files[relative] = contentHash(fs.readFileSync(absolute));
  };
  read('package.json'); read('package-lock.json');
  for (const directory of ['verification','coding','identity','source-control','release','guidance']) read(`src/modules/${directory}`);
  read('src/lib'); read('scripts/runtime-review.ts');
  const profiles = ['build','app','test','database','artifacts','schema','proxy','lock','snapshot'].map(role => containerProfile(role as Parameters<typeof containerProfile>[0]));
  return { digest: contentHash(canonicalJson({ files, profiles, CONTAINER_IMAGES, JOB_DEADLINE_MS, OUTPUT_BYTES, SOURCE_BYTES, ARTIFACT_BYTES, WORK_BYTES })), files };
}
let loaded: ReturnType<typeof identity> | null = null;
try { loaded = identity(); } catch { /* Availability is checked at the boundary, not while displaying history. */ }
/**
 * Local development switch: with APF_RUNTIME_IDENTITY=off a review is not tied to the version of the framework's own
 * code, so editing the framework does not void earlier approvals. Reviews still bind the commit, plan, code approval and
 * the reviewer's signature. Unset (the default) enforces the framework fingerprint.
 */
export const runtimeIdentityEnforced = () => process.env.APF_RUNTIME_IDENTITY !== 'off';
export function currentRuntimeIdentity() {
  if (!runtimeIdentityEnforced()) return { digest: DEVELOPMENT_RUNTIME_DIGEST, files: {} as Record<string, string> };
  if(!loaded)throw new AuthorityUnavailableError();
  let current:ReturnType<typeof identity>;try{current=identity()}catch{throw new AuthorityUnavailableError()}
  if(canonicalJson(current)!==canonicalJson(loaded))throw new DomainError('The trusted runtime identity changed. Restart from the reviewed checkout before fresh approval.');
  return loaded;
}
