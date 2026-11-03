import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { canonicalJson } from '@/modules/coding/external-manifest';
import { runtimeCommands, validateRuntimeMetadata, runtimeManifestDigest, signRuntimeReview, validRuntimeReview, type RuntimeManifest, type RuntimeAttestation } from './runtime-manifest';
const key='synthetic-runtime-review-key-at-least-32-bytes';
function fixture() {
  const manifest: RuntimeManifest={kind:'VERIFICATION_RUNTIME_MANIFEST',version:1,productId:'p',taskId:'t',workspaceId:'w',commitSha:'a'.repeat(40),tree:'b'.repeat(40),files:[{path:'package-lock.json',hash:'lock',mode:0o644}],codeApproval:{id:'code',approvalId:'approval',headCommit:'a'.repeat(40),diffHash:'diff',approvedBy:'Human',resolvedAt:'2026-10-30T00:00:00.000Z'},plan:{id:'plan',version:1,approvedBy:'Human',approvedAt:'2026-10-30T00:00:00.000Z',validationPlan:'{}',content:{}},criteria:[{id:'c',description:'Persist a claim'}],contractHash:'contract',runtime:{digest:'runtime',files:{'policy.ts':'policy'}}};
  const review:RuntimeAttestation={kind:'VERIFICATION_RUNTIME_REVIEW',version:1,approvalId:'runtime-approval',digest:runtimeManifestDigest(manifest),manifest,actor:{id:'human',name:'Human'},approvedAt:'2026-10-30T00:00:00.000Z',reason:'Reviewed this exact runtime and behavioural plan.'};
  return {manifest,review,signature:signRuntimeReview(review,key)};
}
describe('signed exact runtime/behaviour binding',()=>{
 it('accepts only the exact manifest and configured operator key',()=>{const f=fixture();expect(validRuntimeReview(f.review,f.signature,key,f.manifest)).toBe(true);for(const bad of [undefined,'short','another-review-key-of-at-least-32-bytes'])expect(validRuntimeReview(f.review,f.signature,bad,f.manifest)).toBe(false)});
 it.each(['productId','taskId','workspaceId','commitSha','tree','files','codeApproval','plan','criteria','contractHash','runtime'] as const)('rejects changed %s and replay',field=>{const f=fixture();const changed=structuredClone(f.manifest);(changed as unknown as Record<string,unknown>)[field]=typeof changed[field]==='string'?'changed':{changed:true};expect(validRuntimeReview(f.review,f.signature,key,changed)).toBe(false)});
 it('domain separates runtime authority from preservation review signatures',()=>{const f=fixture();const externalStyle=createHmac('sha256',key).update(canonicalJson(f.review)).digest('hex');expect(validRuntimeReview(f.review,externalStyle,key,f.manifest)).toBe(false)});
 it('rejects malformed, agent-attributed and modified attestations',()=>{const f=fixture();for(const patch of [{kind:'EXTERNAL_CHANGE_REVIEW'},{actor:{id:'agent',name:'Verification Agent'}},{reason:'short'},{approvedAt:'invalid'},{approvalId:''}]){const review={...f.review,...patch} as RuntimeAttestation;expect(validRuntimeReview(review,signRuntimeReview(review,key),key,f.manifest)).toBe(false)}});
});
const runtime={kind:'MANAGED_HTTP_DATABASE',baseUrlEnv:'TEST_BASE_URL',databaseUrlEnv:'TEST_DATABASE_URL'};
const behavior={id:'persist',criterionId:'c',description:'A created claim persists',minimumValueAssertions:2,read:true,write:true,concurrent:false};
const plan=(commands:unknown=[{command:'npm test',runtime}],behaviors:unknown=[behavior])=>JSON.stringify({verificationRuntime:{commands,behaviors}});
describe('runtime and behavioural metadata authority',()=>{
 it('accepts explicit commands and task-owned criteria',()=>{expect(()=>validateRuntimeMetadata(plan(),[{id:'c'}],['npm test'])).not.toThrow();expect(runtimeCommands(plan()).get('npm test')).toEqual(runtime)});
 it('rejects unapproved commands, cross-task criteria and duplicate behaviours',()=>{expect(()=>validateRuntimeMetadata(plan(),[{id:'c'}],[])).toThrow(/outside/);expect(()=>validateRuntimeMetadata(plan(),[{id:'other'}],['npm test'])).toThrow(/outside/);expect(()=>validateRuntimeMetadata(plan(undefined,[behavior,behavior]),[{id:'c'}],['npm test'])).toThrow(/duplicate/)});
 it.each(['{"verificationRuntime":',plan([{command:'npm test',runtime},{command:'npm test',runtime}]),plan([{command:'npm test',runtime:{...runtime,databaseUrlEnv:'DATABASE_URL'}}]),JSON.stringify({verificationRuntime:{commands:[],unsafe:true}})])('rejects malformed or unsafe metadata',value=>{expect(()=>validateRuntimeMetadata(value,[{id:'c'}],['npm test'])).toThrow()});
});

import { reviewerRuntimeFor, withReviewerRuntime, manifestRuntimes, REVIEWER_RUNTIME } from './runtime-manifest';
describe('reviewer-chosen runtime declarations', () => {
  const base = { plan: { validationPlan: 'Required:\nnpm run build' } } as unknown as RuntimeManifest;
  it('grants the fixed managed app and database declaration to repository test commands only', () => {
    expect(reviewerRuntimeFor(['npm run test:integration'])).toEqual([{ command: 'npm run test:integration', runtime: REVIEWER_RUNTIME }]);
    for (const bad of ['npm run build', 'npm run test:integration && rm -rf x', 'node --test tests/a.test.mjs', 'npm run test:', 'npx prisma validate']) expect(() => reviewerRuntimeFor([bad])).toThrow();
    expect(() => reviewerRuntimeFor(['npm run test:a', 'npm run test:a'])).toThrow();
  });
  it('adds nothing to the manifest when none are chosen, so earlier digests are unchanged', () => {
    expect(withReviewerRuntime(base, [])).toEqual(base);
    expect('reviewerRuntime' in withReviewerRuntime(base, [])).toBe(false);
  });
  it("changes the manifest digest when a command is chosen, and refuses one the plan already declares", () => {
    const chosen = withReviewerRuntime(base, ['npm run test:integration']);
    expect(runtimeManifestDigest(chosen)).not.toBe(runtimeManifestDigest(base));
    expect([...manifestRuntimes(chosen).keys()]).toEqual(['npm run test:integration']);
    const declared = { plan: { validationPlan: JSON.stringify({ verificationRuntime: { commands: [{ command: 'npm run test:integration', runtime: REVIEWER_RUNTIME }] } }) } } as unknown as RuntimeManifest;
    expect(() => manifestRuntimes(withReviewerRuntime(declared, ['npm run test:integration']))).toThrow(/Duplicate/);
  });
  it('rejects a forged declaration smuggled into a manifest', () => {
    expect(() => manifestRuntimes({ ...base, reviewerRuntime: [{ command: 'npm run build', runtime: REVIEWER_RUNTIME }] } as RuntimeManifest)).toThrow();
  });
});

import { reviewerCoverageFor } from './runtime-manifest';
describe('reviewer-signed links between tests and criteria', () => {
  const manifest = { plan: { validationPlan: 'Required:\nnpm run build' }, criteria: [{ id: 'c1', description: 'View and choose' }], reviewerRuntime: reviewerRuntimeFor(['npm run test:integration']) } as unknown as RuntimeManifest;
  it('accepts a link between a test that runs against the app and a criterion of this task', () => {
    expect(reviewerCoverageFor(manifest, [{ command: 'npm run test:integration', criterionId: 'c1' }])).toEqual([{ command: 'npm run test:integration', criterionId: 'c1' }]);
  });
  it.each([
    ['a test that does not run against the app', { command: 'npm run build', criterionId: 'c1' }],
    ['a criterion from another task', { command: 'npm run test:integration', criterionId: 'other' }],
  ])('rejects %s', (_label, link) => { expect(() => reviewerCoverageFor(manifest, [link])).toThrow(); });
  it('rejects duplicates, and changes the digest only when a link is chosen', () => {
    const link = { command: 'npm run test:integration', criterionId: 'c1' };
    expect(() => reviewerCoverageFor(manifest, [link, link])).toThrow();
    const base = withReviewerRuntime(manifest, ['npm run test:integration']), linked = withReviewerRuntime(manifest, ['npm run test:integration'], [link]);
    expect(runtimeManifestDigest(linked)).not.toBe(runtimeManifestDigest(base));
    expect('reviewerCoverage' in base).toBe(false);
  });
});
