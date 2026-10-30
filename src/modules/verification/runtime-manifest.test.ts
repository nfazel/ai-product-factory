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
