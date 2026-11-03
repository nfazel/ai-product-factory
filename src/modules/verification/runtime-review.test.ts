import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db} from '@/lib/db';
import {completedTaskIn,git} from './completed-task.test-support';
import {prepareRuntimeReview,approveRuntimeReview,requireRuntimeReview,assertSessionRuntimeBinding,inspectSessionRuntimeBinding} from './runtime-review';
import {runtimeManifestDigest} from './runtime-manifest';
import {verificationEntryBlockers} from './gates';
const key='synthetic-only-runtime-operator-key-32-bytes';
const products:string[]=[],roots:string[]=[];
beforeEach(()=>{vi.stubEnv('EXTERNAL_REVIEW_APPROVAL_KEY',key)});
afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllEnvs();for(const id of products.splice(0))await db.product.delete({where:{id}});for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true})});
async function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'apf-runtime-binding-'));roots.push(root);fs.writeFileSync(path.join(root,'package.json'),'{}');fs.writeFileSync(path.join(root,'package-lock.json'),'{}');
 git(root,['init','-b','main']);git(root,['config','user.email','test@example.com']);git(root,['config','user.name','Test']);git(root,['add','.']);git(root,['commit','-m','synthetic approved source']);
 const fixture=await completedTaskIn(root);products.push(fixture.product.id);
 const workspace=await db.repositoryWorkspace.findFirstOrThrow({where:{implementationTaskId:fixture.task.id}});
 const code=await db.codeChangeApproval.findFirstOrThrow({where:{workspaceId:workspace.id}});
 await db.approval.update({where:{id:code.approvalId},data:{resolvedAt:new Date(),approvedBy:'Test human'}});
 const metadata=JSON.stringify({verificationRuntime:{commands:[],behaviors:[{id:'persist',criterionId:fixture.criterion.id,description:'Return the approved claim reference',minimumValueAssertions:1,read:false,write:false,concurrent:false}]}});
 await db.codingExecutionPlan.update({where:{workspaceId:workspace.id},data:{validationPlan:metadata}});
 return {...fixture,workspace,code,metadata,root};
}
async function approve(f:Awaited<ReturnType<typeof setup>>){const manifest=await prepareRuntimeReview(f.product.id,f.workspace.id);await approveRuntimeReview({productId:f.product.id,workspaceId:f.workspace.id,digest:runtimeManifestDigest(manifest),credential:key,actor:{id:'test-human',name:'Test human'},reason:'Explicitly reviewed this synthetic implementation, runtime and behaviour.'});return requireRuntimeReview(f.product.id,f.workspace.id)}
describe('runtime review lifecycle with real Git and framework test records',()=>{
 it('records the reviewer\'s signed statement that a test proves a criterion, and refuses anything else',async()=>{
  const f=await setup(),base=await prepareRuntimeReview(f.product.id,f.workspace.id),input={productId:f.product.id,workspaceId:f.workspace.id,digest:runtimeManifestDigest(base),credential:key,actor:{id:'h',name:'Test human'},reason:'Explicitly reviewed this synthetic implementation.',runAgainstApp:['npm run test:integration']};
  await expect(approveRuntimeReview({...input,coverage:[{command:'npm run test:integration',criterionId:'not-a-criterion'}]})).rejects.toThrow(/criterion link/);
  await expect(approveRuntimeReview({...input,runAgainstApp:[],coverage:[{command:'npm run test:integration',criterionId:f.criterion.id}]})).rejects.toThrow(/criterion link/);
  expect(await db.approval.count({where:{productId:f.product.id,approvalType:'VERIFICATION_RUNTIME'}})).toBe(0);
  await approveRuntimeReview({...input,coverage:[{command:'npm run test:integration',criterionId:f.criterion.id}]});
  const bound=await requireRuntimeReview(f.product.id,f.workspace.id);
  expect(bound.manifest.reviewerCoverage).toEqual([{command:'npm run test:integration',criterionId:f.criterion.id}]);
  // Changing the stored link breaks the signature, so the review grants nothing.
  const record=await db.codingEvidence.findUniqueOrThrow({where:{id:bound.evidenceId}}),stored=JSON.parse(record.output);
  stored.attestation.manifest.reviewerCoverage=[];
  await db.codingEvidence.update({where:{id:record.id},data:{output:JSON.stringify(stored)}});
  await expect(requireRuntimeReview(f.product.id,f.workspace.id)).rejects.toThrow(/review/);
 });
 it('records the reviewer\'s choice to run a test against the app and database inside the signed review',async()=>{
  const f=await setup(),base=await prepareRuntimeReview(f.product.id,f.workspace.id);
  await expect(approveRuntimeReview({productId:f.product.id,workspaceId:f.workspace.id,digest:runtimeManifestDigest(base),credential:key,actor:{id:'h',name:'Test human'},reason:'Explicitly reviewed this synthetic implementation.',runAgainstApp:['npm run build']})).rejects.toThrow(/repository test commands/);
  expect(await db.approval.count({where:{productId:f.product.id,approvalType:'VERIFICATION_RUNTIME'}})).toBe(0);
  await approveRuntimeReview({productId:f.product.id,workspaceId:f.workspace.id,digest:runtimeManifestDigest(base),credential:key,actor:{id:'h',name:'Test human'},reason:'Explicitly reviewed this synthetic implementation.',runAgainstApp:['npm run test:integration']});
  const bound=await requireRuntimeReview(f.product.id,f.workspace.id);
  expect(bound.manifest.reviewerRuntime).toEqual([{command:'npm run test:integration',runtime:{kind:'MANAGED_HTTP_DATABASE',baseUrlEnv:'TEST_BASE_URL',databaseUrlEnv:'TEST_DATABASE_URL'}}]);
  expect(bound.digest).not.toBe(runtimeManifestDigest(base));
  // Tampering with the stored declaration breaks the signature, so the review grants nothing.
  const record=await db.codingEvidence.findUniqueOrThrow({where:{id:bound.evidenceId}}),stored=JSON.parse(record.output);
  stored.attestation.manifest.reviewerRuntime.push({command:'npm run test:other',runtime:stored.attestation.manifest.reviewerRuntime[0].runtime});
  await db.codingEvidence.update({where:{id:record.id},data:{output:JSON.stringify(stored)}});
  await expect(requireRuntimeReview(f.product.id,f.workspace.id)).rejects.toThrow(/review/);
 });
 it('uses the signed binding in the normal verification entry gate',async()=>{const f=await setup();vi.stubEnv('PRODUCT_REPOSITORY_ROOT',f.root);const before=await verificationEntryBlockers(f.product.id,f.task.id);expect(before.some(reason=>reason.includes('runtime/behaviour'))).toBe(true);await approve(f);expect(await verificationEntryBlockers(f.product.id,f.task.id)).toEqual([])});
 it('requires explicit credential/digest approval and preserves preceding records',async()=>{const f=await setup();const before=await db.approval.count({where:{productId:f.product.id}});await expect(requireRuntimeReview(f.product.id,f.workspace.id)).rejects.toThrow(/review/);await expect(approveRuntimeReview({productId:f.product.id,workspaceId:f.workspace.id,digest:'wrong',credential:key,actor:{id:'h',name:'Human'},reason:`Do not persist ${key}`})).rejects.toThrow(/Private operator/);await expect(approveRuntimeReview({productId:f.product.id,workspaceId:f.workspace.id,digest:'wrong',credential:key,actor:{id:'h',name:'Human'},reason:'Review this exact approved scope.'})).rejects.toThrow(/manifest changed/);const bound=await approve(f);expect(bound.manifest.taskId).toBe(f.task.id);expect(await db.approval.count({where:{productId:f.product.id}})).toBe(before+1);expect((await db.approval.findUniqueOrThrow({where:{id:f.code.approvalId}})).status).toBe('APPROVED')});
 it.each(['behaviour','plan','criterion','source','code-revocation','runtime-revocation'] as const)('invalidates approval after %s changes',async mutation=>{
  const f=await setup(),bound=await approve(f);
  if(mutation==='behaviour')await db.codingExecutionPlan.update({where:{workspaceId:f.workspace.id},data:{validationPlan:f.metadata.replace('minimumValueAssertions":1','minimumValueAssertions":2')}});
  if(mutation==='plan')await db.codingExecutionPlan.update({where:{workspaceId:f.workspace.id},data:{version:{increment:1}}});
  if(mutation==='criterion')await db.acceptanceCriterion.update({where:{id:f.criterion.id},data:{description:'Changed approved behaviour'}});
  if(mutation==='source'){fs.writeFileSync(path.join(f.root,'package-lock.json'),'changed');git(f.root,['add','.']);git(f.root,['commit','-m','unapproved changed dependency snapshot']);}
  if(mutation==='code-revocation')await db.approval.update({where:{id:f.code.approvalId},data:{status:'REJECTED'}});
  if(mutation==='runtime-revocation')await db.approval.update({where:{id:bound.approvalId},data:{status:'REJECTED'}});
  await expect(requireRuntimeReview(f.product.id,f.workspace.id)).rejects.toThrow(/review/);
 });
 it('read-only feature authority distinguishes current, temporary database failure and confirmed revocation',async()=>{
  const f=await setup(),bound=await approve(f);const session=await db.verificationSession.create({data:{productId:f.product.id,implementationTaskId:f.task.id,repositoryWorkspaceId:f.workspace.id,commitSha:f.sha,runState:JSON.parse(JSON.stringify({runtimeBinding:bound}))}});
  await db.verificationWorkspace.create({data:{sessionId:session.id,repositoryId:f.workspace.repositoryId,baseCommit:f.sha,branchName:'synthetic-feature-review',status:'ACTIVE'}});
  expect(await inspectSessionRuntimeBinding(session.id)).toBe('CURRENT');
  vi.stubEnv('EXTERNAL_REVIEW_APPROVAL_KEY','');expect(await inspectSessionRuntimeBinding(session.id)).toBe('UNAVAILABLE');vi.stubEnv('EXTERNAL_REVIEW_APPROVAL_KEY',key);
  // Prisma exposes lazy proxy methods; avoid spy restoration poisoning later cases.
  const delegate=db.approval,originalLookup=delegate.findUnique;let failNext=true;
  Object.defineProperty(delegate,'findUnique',{configurable:true,writable:true,value:(...args:Parameters<typeof originalLookup>)=>{if(failNext){failNext=false;return Promise.reject(new Error('Temporary observation failure'))}return originalLookup(...args)}});
  try{
   expect(await inspectSessionRuntimeBinding(session.id)).toBe('UNAVAILABLE');
   failNext=true;await expect(assertSessionRuntimeBinding(session.id)).rejects.toThrow(/temporarily unavailable/);
  }finally{Object.defineProperty(delegate,'findUnique',{value:originalLookup,writable:true,configurable:true})}
  expect((await db.verificationSession.findUniqueOrThrow({where:{id:session.id}})).stale).toBe(false);expect(await db.codingEvidence.count({where:{workspaceId:f.workspace.id,result:'INVALIDATED'}})).toBe(0);expect(await inspectSessionRuntimeBinding(session.id)).toBe('CURRENT');
  await db.approval.update({where:{id:bound.approvalId},data:{status:'REJECTED'}});expect(await inspectSessionRuntimeBinding(session.id)).toBe('CHANGED');expect((await db.verificationSession.findUniqueOrThrow({where:{id:session.id}})).stale).toBe(false);
 });
 it('freezes session metadata and appends invalidation without replacing human approval history',async()=>{
  const f=await setup(),bound=await approve(f);
  const session=await db.verificationSession.create({data:{productId:f.product.id,implementationTaskId:f.task.id,repositoryWorkspaceId:f.workspace.id,commitSha:f.sha,runState:JSON.parse(JSON.stringify({runtimeBinding:bound})),status:'PLANNING'}});
  await db.verificationWorkspace.create({data:{sessionId:session.id,repositoryId:f.workspace.repositoryId,baseCommit:f.sha,branchName:'synthetic-review',status:'ACTIVE'}});
  expect((await assertSessionRuntimeBinding(session.id)).manifest.plan.validationPlan).toBe(f.metadata);
  await db.codingExecutionPlan.update({where:{workspaceId:f.workspace.id},data:{validationPlan:'{}'}});
  await expect(assertSessionRuntimeBinding(session.id)).rejects.toThrow(/review/);
  const stored=await db.verificationSession.findUniqueOrThrow({where:{id:session.id}});expect(stored.stale).toBe(true);expect(stored.runState).toEqual({runtimeBinding:bound});
  expect((await db.approval.findUniqueOrThrow({where:{id:bound.approvalId}})).status).toBe('APPROVED');
  expect(await db.codingEvidence.count({where:{workspaceId:f.workspace.id,result:'INVALIDATED'}})).toBe(1);
  await db.codingExecutionPlan.update({where:{workspaceId:f.workspace.id},data:{validationPlan:f.metadata}});await expect(requireRuntimeReview(f.product.id,f.workspace.id)).rejects.toThrow(/review/);
 });
 it('refuses malformed evidence, forged signatures and cross-task session replay',async()=>{
  const f=await setup(),bound=await approve(f);
  await db.codingEvidence.update({where:{id:bound.evidenceId},data:{output:'{"attestation":{},"signature":"forged"}'}});await expect(requireRuntimeReview(f.product.id,f.workspace.id)).rejects.toThrow(/review/);
  const other=await setup();const session=await db.verificationSession.create({data:{productId:other.product.id,implementationTaskId:other.task.id,repositoryWorkspaceId:other.workspace.id,commitSha:other.sha,runState:JSON.parse(JSON.stringify({runtimeBinding:bound}))}});await expect(assertSessionRuntimeBinding(session.id)).rejects.toThrow(/review/);
 });
});
