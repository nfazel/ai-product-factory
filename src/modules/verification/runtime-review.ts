import {AuthorityUnavailableError,type AuthorityStatus} from './authority-status';
import {unapprovedPreservationIssues} from '@/modules/coding/external-review';
import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db } from '@/lib/db';
import { childEnv } from '@/modules/coding/git';
import { canonicalJson, contentHash, requireReviewCredential } from '@/modules/coding/external-manifest';
import { parsePlannedCommands } from '@/modules/coding/commands';
import { snapshotFiles } from './containers/inputs';
import { currentRuntimeIdentity } from './runtime-identity';
import { runtimeManifestDigest, validateRuntimeMetadata, validRuntimeReview, signRuntimeReview, bindingFromState, type RuntimeManifest, type RuntimeAttestation, type RuntimeBinding } from './runtime-manifest';
import { DomainError } from '@/modules/shared/errors';
const exec = promisify(execFile);
const KEY = 'EXTERNAL_REVIEW_APPROVAL_KEY';
function rejectCredentialDisclosure(value:unknown) {
  const key=process.env[KEY]; if(!key||Buffer.byteLength(key)<32)return;
  const text=canonicalJson(value);
  if([key,encodeURIComponent(key),Buffer.from(key).toString('base64'),JSON.stringify(key).slice(1,-1)].some(secret=>text.includes(secret)))throw new DomainError('Private operator authorization material cannot be included in review metadata.');
}
const invalidReason = 'Runtime/behaviour approval is missing, revoked or no longer matches this task, implementation and trusted runtime. Fresh human review is required.';
async function git(root: string, args: string[]) {
  return (await exec('git', ['--no-replace-objects','-c','core.fsmonitor=false',...args], { cwd: root, env: childEnv(), encoding: 'utf8', timeout: 30000, maxBuffer: 100_000_000 })).stdout.trim();
}
/** Read-only: no actor-supplied source path, configuration or task identity is trusted. */
export async function prepareRuntimeReview(productId: string, workspaceId: string): Promise<RuntimeManifest> {
  const workspace = await db.repositoryWorkspace.findFirst({ where: { id: workspaceId, productId }, include: { plan: true, contract: true, task: { include: { plan: true, workItem: { include: { acceptanceCriteria: true } } } }, codeApprovals: { include: { approval: true }, orderBy: { createdAt: 'desc' } } } });
  const p = workspace?.plan, c = workspace?.contract;
  if (!workspace || !p || !c || workspace.task.plan.productId !== productId || workspace.task.id !== workspace.implementationTaskId || workspace.status !== 'COMPLETED' || workspace.task.status !== 'COMPLETED' || c.implementationTaskId !== workspace.implementationTaskId || workspace.executionContractStale || c.stale || !p.approvedAt || !p.approvedBy || !['APPROVED','COMPLETED'].includes(p.status) || ['DRAFT','ESCALATED'].includes(c.status)) throw new DomainError(invalidReason);
  const code = workspace.codeApprovals.find(a => !a.stale && a.productId === productId && a.implementationTaskId === workspace.implementationTaskId && a.workspaceId === workspaceId && a.baseCommit === workspace.baseCommit && a.headCommit === workspace.headCommit && a.approval.productId === productId && a.approval.status === 'APPROVED' && a.approval.approvalType === 'CODE_CHANGE' && a.approval.approvedBy && !/^(codex|coding agent|verification agent|testing agent)$/i.test(a.approval.approvedBy.trim()) && a.approval.approvedBy && a.approval.resolvedAt);
  if (!code || !/^[a-f0-9]{40}$/.test(workspace.headCommit) || await git(workspace.workspacePath, ['rev-parse','HEAD']) !== workspace.headCommit || await git(workspace.workspacePath,['status','--porcelain','--untracked-files=all'])) throw new DomainError(invalidReason);
  if ((await unapprovedPreservationIssues(workspace.id,workspace.workspacePath,workspace.baseCommit,true)).length) throw new DomainError('Existing preservation/security approval is not current.');
  const criteria = (workspace.task.workItem?.acceptanceCriteria ?? []).map(({id,description}) => ({id,description})).sort((a,b) => a.id.localeCompare(b.id));
  validateRuntimeMetadata(p.validationPlan, criteria, parsePlannedCommands(p.validationCommands).filter(command => command.applicability !== 'NOT_APPLICABLE').map(command => command.command));
  const files = (await snapshotFiles(workspace.workspacePath, workspace.headCommit)).map(file => ({ path: file.path, hash: contentHash(file.bytes), mode: file.mode ?? 0o644 }));
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...contract } = c;
  void _createdAt; void _updatedAt;
  const manifest:RuntimeManifest = { kind: 'VERIFICATION_RUNTIME_MANIFEST', version: 1, productId, taskId: workspace.implementationTaskId, workspaceId, commitSha: workspace.headCommit, tree: await git(workspace.workspacePath,['rev-parse',`${workspace.headCommit}^{tree}`]), files,
    codeApproval: { id: code.id, approvalId: code.approvalId, headCommit: code.headCommit, diffHash: code.diffHash, approvedBy: code.approval.approvedBy!, resolvedAt: code.approval.resolvedAt!.toISOString() },
    plan: { id: p.id, version: p.version, approvedBy: p.approvedBy, approvedAt: p.approvedAt.toISOString(), validationPlan: p.validationPlan, content: { summary: p.summary, filesExpectedToChange: p.filesExpectedToChange, steps: p.steps, risks: p.risks, setupCommands: p.setupCommands, validationCommands: p.validationCommands } }, criteria, contractHash: contentHash(canonicalJson(contract)), runtime: currentRuntimeIdentity() };
  rejectCredentialDisclosure(manifest); return manifest;
}
/** Local operator only. Never expose through agent tools or a public server action. */
export async function approveRuntimeReview(input: { productId: string; workspaceId: string; digest: string; credential: string; actor: { id: string; name: string }; reason: string }) {
  requireReviewCredential(input.credential, process.env[KEY]);
  if (!input.actor.id.trim() || !input.actor.name.trim() || /^(codex|coding agent|verification agent|testing agent)$/i.test(input.actor.name.trim()) || input.reason.trim().length < 12) throw new DomainError('Explicit human attribution and a substantive runtime review reason are required.');
  rejectCredentialDisclosure({actor:input.actor,reason:input.reason});
  const manifest = await prepareRuntimeReview(input.productId,input.workspaceId), digest = runtimeManifestDigest(manifest);
  if (input.digest !== digest) throw new DomainError('The reviewed runtime manifest changed. Review it again before approving.');
  return db.$transaction(async tx => {
    const approvedAt = new Date();
    const approval = await tx.approval.create({ data: { productId: input.productId, approvalType: 'VERIFICATION_RUNTIME', status: 'APPROVED', approvedBy: input.actor.name, requestedAt: approvedAt, resolvedAt: approvedAt, comments: `Runtime/behaviour review only. Manifest ${digest}. ${input.reason}` } });
    const attestation: RuntimeAttestation = { kind: 'VERIFICATION_RUNTIME_REVIEW', version: 1, approvalId: approval.id, digest, manifest, actor: input.actor, reason: input.reason, approvedAt: approvedAt.toISOString() };
    const evidence = await tx.codingEvidence.create({ data: { workspaceId: manifest.workspaceId, implementationTaskId: manifest.taskId, type: 'HUMAN_CONFIRMATION', source: 'HUMAN', result: 'APPROVED', description: `Human runtime/behaviour review ${digest}`, output: JSON.stringify({attestation,signature:signRuntimeReview(attestation,process.env[KEY]!)}) } });
    return { approvalId: approval.id, evidenceId: evidence.id, digest };
  });
}
async function effectiveReview(manifest: RuntimeManifest): Promise<RuntimeBinding | null> {
  const records = await db.codingEvidence.findMany({ where: { workspaceId: manifest.workspaceId, implementationTaskId: manifest.taskId, type: 'HUMAN_CONFIRMATION' }, orderBy: { createdAt: 'desc' } });
  const invalid = new Set<string>();
  for (const record of records) { try { const value=JSON.parse(record.output); if(record.result==='INVALIDATED' && value.kind==='RUNTIME_REVIEW_INVALIDATED') invalid.add(value.approvalId); } catch {} }
  for (const record of records) {
    if (record.source !== 'HUMAN' || record.result !== 'APPROVED') continue;
    let attestation:RuntimeAttestation;
    try {
      const parsed=JSON.parse(record.output) as {attestation:RuntimeAttestation;signature:string};attestation=parsed.attestation;
      if(!attestation||invalid.has(attestation.approvalId)||!validRuntimeReview(attestation,parsed.signature,process.env[KEY],manifest))continue;
    }catch{continue} // Malformed or untrusted payloads grant no authority.
    // Database observation failures must propagate as unavailable, not revoked.
    const approval=await db.approval.findUnique({where:{id:attestation.approvalId}});
    if(approval?.status!=='APPROVED'||approval.approvalType!=='VERIFICATION_RUNTIME'||approval.productId!==manifest.productId||approval.approvedBy!==attestation.actor.name||approval.resolvedAt?.toISOString()!==attestation.approvedAt||!approval.comments.startsWith(`Runtime/behaviour review only. Manifest ${attestation.digest}.`))continue;
    return {kind:'VERIFICATION_RUNTIME_BINDING',version:1,approvalId:approval.id,evidenceId:record.id,digest:attestation.digest,manifest};
  }
  return null;
}
export async function requireRuntimeReview(productId:string,workspaceId:string) {
  if(!process.env[KEY]||Buffer.byteLength(process.env[KEY]!)<32)throw new AuthorityUnavailableError();
  const manifest=await prepareRuntimeReview(productId,workspaceId), binding=await effectiveReview(manifest);
  if(!binding)throw new DomainError(invalidReason);
  return binding;
}
export async function assertSessionRuntimeBinding(sessionId: string) {
  const session=await db.verificationSession.findUnique({where:{id:sessionId},include:{workspace:true}});
  const bound=bindingFromState(session?.runState);
  try {
    if(!session || session.stale || !bound || session.repositoryWorkspaceId!==bound.manifest.workspaceId || session.productId!==bound.manifest.productId || session.implementationTaskId!==bound.manifest.taskId || session.commitSha!==bound.manifest.commitSha || session.workspace?.baseCommit!==session.commitSha)throw new DomainError(invalidReason);
    const current=await requireRuntimeReview(session.productId,session.repositoryWorkspaceId!);
    if(canonicalJson(current)!==canonicalJson(bound))throw new DomainError(invalidReason);
    return bound;
  } catch(error) {
    if(!(error instanceof DomainError))throw new AuthorityUnavailableError();
    if(session && bound && session.repositoryWorkspaceId===bound.manifest.workspaceId && session.productId===bound.manifest.productId && session.implementationTaskId===bound.manifest.taskId) await invalidateRuntimeBinding(session.id,bound);
    throw new DomainError(invalidReason);
  }
}
async function invalidateRuntimeBinding(sessionId:string,binding:RuntimeBinding) {
  const record=await db.codingEvidence.findFirst({where:{id:binding.evidenceId,workspaceId:binding.manifest.workspaceId,implementationTaskId:binding.manifest.taskId,type:'HUMAN_CONFIRMATION',source:'HUMAN',result:'APPROVED'}});
  let authentic=false;
  try{const value=JSON.parse(record?.output??'');authentic=value.attestation?.approvalId===binding.approvalId&&value.attestation?.digest===binding.digest&&validRuntimeReview(value.attestation,value.signature,process.env[KEY],binding.manifest)}catch{}
  await db.$transaction(async tx=>{
    const now=new Date();
    const previous=await tx.codingEvidence.findMany({where:{workspaceId:binding.manifest.workspaceId,result:'INVALIDATED'},select:{output:true}});
    if(authentic && !previous.some(item=>{try{const value=JSON.parse(item.output);return value.kind==='RUNTIME_REVIEW_INVALIDATED'&&value.approvalId===binding.approvalId}catch{return false}}))await tx.codingEvidence.create({data:{workspaceId:binding.manifest.workspaceId,implementationTaskId:binding.manifest.taskId,type:'HUMAN_CONFIRMATION',source:'REPOSITORY',result:'INVALIDATED',description:invalidReason,output:JSON.stringify({kind:'RUNTIME_REVIEW_INVALIDATED',approvalId:binding.approvalId,digest:binding.digest})}});
    await tx.verificationSession.update({where:{id:sessionId},data:{stale:true,staleReason:invalidReason,staleFlaggedAt:now}});
    await tx.verificationContract.updateMany({where:{sessionId},data:{stale:true}});
    await tx.verificationApproval.updateMany({where:{sessionId,stale:false},data:{stale:true,staleReason:invalidReason,staleFlaggedAt:now}});
  });
}

export async function runtimeReviewIsCurrent(sessionId:string) {
 try { await assertSessionRuntimeBinding(sessionId); return true; } catch { return false; }
}

/** Read-only authority probe for review/release eligibility; outages never revoke history. */
export async function inspectSessionRuntimeBinding(sessionId:string):Promise<AuthorityStatus>{
 try{
  if(!process.env[KEY]||Buffer.byteLength(process.env[KEY]!)<32)return 'UNAVAILABLE';
  const session=await db.verificationSession.findUnique({where:{id:sessionId},include:{workspace:true}}),bound=bindingFromState(session?.runState);
  if(!session||!bound||session.stale||session.productId!==bound.manifest.productId||session.implementationTaskId!==bound.manifest.taskId||session.repositoryWorkspaceId!==bound.manifest.workspaceId||session.commitSha!==bound.manifest.commitSha||session.workspace?.baseCommit!==session.commitSha)return 'CHANGED';
  const current=await requireRuntimeReview(session.productId,session.repositoryWorkspaceId!);
  return canonicalJson(current)===canonicalJson(bound)?'CURRENT':'CHANGED';
 }catch(error){return error instanceof DomainError?'CHANGED':'UNAVAILABLE'}
}
