import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import type {Prisma,Approval} from '@/generated/prisma/client';
import {canonicalJson,contentHash} from '@/modules/coding/external-manifest';
import {confirmLocalOperator,rejectOperatorSecret} from '@/modules/feature-review/authorization';
import {confirmedFeedbackSource} from '@/modules/feature-feedback/service';
import {getAIProvider,isAIConfigured,prepareAI} from '@/modules/ai/provider';
import {DomainError} from '@/modules/shared/errors';
import {scopeContentSchema,type ScopeContent} from './schema';
import {SCOPE_SYSTEM_PROMPT} from './prompt';
import {signScopeDecision,validScopeDecision} from './proof';

type Reader=Prisma.TransactionClient;
type Source=Awaited<ReturnType<typeof confirmedFeedbackSource>>;
export type ScopeManifest={kind:'DEVELOPMENT_SCOPE_MANIFEST';formatVersion:1;scopeId:string;version:number;productId:string;featureId:string;feedbackId:string;source:Source['binding'];baseline:Source['context'];content:ScopeContent;origin:{kind:'HUMAN'|'AI';requestedBy:string;instructions:string;provider?:string;model?:string}};
export type ScopeLocation={productId:string;featureId:string;scopeId:string};
type OperatorRequest={credential:string;idempotencyKey:string};
type Edit={content?:ScopeContent;instructions?:string};
type HeadRequest=ScopeLocation&OperatorRequest&{expectedVersion:number;reviewedDigest:string};
const hash=(value:unknown)=>contentHash(canonicalJson(value));
const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value));
function key(value:string){if(!/^[A-Za-z0-9:_-]{8,128}$/.test(value))throw new DomainError('A unique scope request key is required.');rejectOperatorSecret(value)}
function edit(input:Edit){if(input.content&&input.instructions!==undefined)throw new DomainError('Provide final scope content or regeneration instructions, not both.');if(input.instructions!==undefined&&(typeof input.instructions!=='string'||!input.instructions.trim()||input.instructions.length>20000))throw new DomainError('Revision instructions must contain 1–20000 characters.');rejectOperatorSecret({content:input.content??null,instructions:input.instructions??null});if(canonicalJson(input.content??{}).length>200000)throw new DomainError('Scope content exceeds its size limit.');return {content:input.content?scopeContentSchema.parse(input.content):undefined,instructions:input.instructions??''}}
async function locked<T>(id:string,work:(tx:Reader)=>Promise<T>):Promise<T>{
 for(let attempt=0;attempt<3;attempt++)try{return await db.$transaction(async tx=>{await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`development-scope:${id}`},0))`;return work(tx)},{isolationLevel:'Serializable',maxWait:10000,timeout:60000})}catch(error){if(!['P2034','P2002'].includes((error as {code?:string}).code??'')||attempt===2)throw error}
 throw new DomainError('Concurrent scope request could not be resolved.','CONFLICT');
}
async function read(reader:Reader,input:ScopeLocation){
 const value=await reader.developmentScope.findFirst({where:{id:input.scopeId,productId:input.productId,featureId:input.featureId},include:{revisions:{orderBy:{version:'asc'}},events:{include:{approval:true},orderBy:{createdAt:'asc'}}}});
 if(!value||!await reader.workItem.findFirst({where:{id:input.featureId,productId:input.productId,type:'FEATURE'},select:{id:true}}))throw new DomainError('Development scope was not found in this product and feature.','NOT_FOUND');
 return value;
}
type Loaded=Awaited<ReturnType<typeof read>>;
function head(value:Loaded,input:HeadRequest){const current=value.revisions.at(-1);if(!current||current.version!==input.expectedVersion||current.digest!==input.reviewedDigest)throw new DomainError('Scope revision changed; review the latest version.','CONFLICT');return current}
function receipt(value:{id:string;version:number;digest:string}){return{scopeRevisionId:value.id,version:value.version,digest:value.digest}}
async function sourceFor(value:{productId:string;featureId:string;feedbackId:string;confirmationEventId:string},reader:Reader=db){const source=await confirmedFeedbackSource(value,reader);if(source.binding.confirmationEventId!==value.confirmationEventId)throw new DomainError('Confirmed proposal changed.','CONFLICT');return source}
function matches(source:Source,manifest:ScopeManifest){if(hash(source.binding)!==hash(manifest.source)||hash(source.context)!==hash(manifest.baseline))throw new DomainError('Scope proposal or baseline changed; prepare a fresh scope.','CONFLICT')}
function validateContent(content:ScopeContent,source:Source){
 const ids=new Set(source.context.requirements.map(r=>r.id));
 if(content.affectedRequirementIds.some(id=>!ids.has(id)))throw new DomainError('Scope referenced requirements outside this feature.');
 if(source.analysis.scope==='SEPARATE_BACKLOG_FEATURE'&&!content.separateFeature)throw new DomainError('The confirmed separate-feature boundary must be preserved.');
 rejectOperatorSecret(content);
}
function approvalBlockers(manifest:ScopeManifest){
 const blockers:string[]=[];const base=manifest.baseline;
 if(!base.requirementsApproved)blockers.push('Current approved requirements are required.');
 if(!base.build.available||!base.build.clean||!/^[a-f0-9]{40}$/.test(base.build.commitSha)||!/^[a-f0-9]{40}$/.test(base.build.tree))blockers.push('An exact clean application commit and tree are required.');
 if(manifest.content.unresolvedQuestions.length)blockers.push('Resolve scope questions in a new revision before approval.');
 return blockers;
}
async function draft(source:Source,input:ReturnType<typeof edit>,actorId:string,previous?:ScopeContent){
 if(input.content){validateContent(input.content,source);return{content:input.content,origin:{kind:'HUMAN' as const,requestedBy:actorId,instructions:input.instructions}}}
 const data={confirmedProposal:source.analysis,baseline:source.context,previousScope:previous??null,instructions:input.instructions};rejectOperatorSecret(data);
 if(canonicalJson(data).length>200000)throw new DomainError('Scope drafting context exceeds its size limit.');
 await prepareAI();if(!isAIConfigured())throw new DomainError('AI is not configured. No scope was changed.');
 const result=await(await getAIProvider()).generate({systemPrompt:SCOPE_SYSTEM_PROMPT,messages:[{role:'user',content:canonicalJson(data)}],responseSchema:scopeContentSchema,schemaName:'development_scope',purpose:'development-scope'});
 const parsed=scopeContentSchema.safeParse(result.data);if(!parsed.success)throw new DomainError('AI scope did not match the required schema.');
 if(canonicalJson(parsed.data).length>200000)throw new DomainError('AI scope exceeds its size limit.');
 validateContent(parsed.data,source);const origin={kind:'AI' as const,requestedBy:actorId,instructions:input.instructions,provider:result.provider??'configured',model:result.model};rejectOperatorSecret(origin);return{content:parsed.data,origin};
}
async function appendRevision(tx:Reader,value:{id:string;productId:string;featureId:string;feedbackId:string},version:number,source:Source,prepared:Awaited<ReturnType<typeof draft>>,request:OperatorRequest,requestDigest:string){
 const actor=confirmLocalOperator(request.credential);
 const manifest:ScopeManifest={kind:'DEVELOPMENT_SCOPE_MANIFEST',formatVersion:1,scopeId:value.id,version,productId:value.productId,featureId:value.featureId,feedbackId:value.feedbackId,source:source.binding,baseline:source.context,...prepared};rejectOperatorSecret(manifest);
 const revision=await tx.developmentScopeRevision.create({data:{scopeId:value.id,version,manifest:json(manifest),digest:hash(manifest),actorKind:prepared.origin.kind==='AI'?'AI':actor.kind,actorId:prepared.origin.kind==='AI'?'configured-ai-provider':actor.id,actorName:prepared.origin.kind==='AI'?'Configured AI provider':actor.name,idempotencyKey:request.idempotencyKey,requestDigest}});
 await tx.activity.create({data:{productId:value.productId,workItemId:value.featureId,type:'WORK_ITEM_UPDATED',actor:actor.name,description:`Development scope revision ${version} prepared. No work, requirements, plan, coding or acceptance state changed.`}});
 return receipt(revision);
}
/** Detached intent only. No WorkItem, implementation plan or workspace writes. */
export async function prepareDevelopmentScope(input:{productId:string;featureId:string;feedbackId:string;confirmationEventId:string;proposalDigest:string}&OperatorRequest&Edit){
 const actor=confirmLocalOperator(input.credential);key(input.idempotencyKey);const change=edit(input);
 const requestDigest=hash({operation:'PREPARE',productId:input.productId,featureId:input.featureId,feedbackId:input.feedbackId,confirmationEventId:input.confirmationEventId,proposalDigest:input.proposalDigest,change,actor});
 const previous=await db.developmentScope.findUnique({where:{productId_featureId_idempotencyKey:{productId:input.productId,featureId:input.featureId,idempotencyKey:input.idempotencyKey}},include:{revisions:{orderBy:{version:'asc'},take:1}}});
 if(previous){if(previous.requestDigest!==requestDigest)throw new DomainError('Request key belongs to different scope content.','CONFLICT');await sourceFor(previous);return{scopeId:previous.id,...receipt(previous.revisions[0])}}
 const source=await sourceFor(input);if(source.binding.proposalDigest!==input.proposalDigest)throw new DomainError('Reviewed proposal changed.','CONFLICT');
 const prepared=await draft(source,change,actor.id);
 return locked(`prepare:${input.confirmationEventId}`,async tx=>{
  const current=await sourceFor(input,tx);if(hash(current)!==hash(source))throw new DomainError('Confirmed proposal or baseline changed during drafting.','CONFLICT');
  const existing=await tx.developmentScope.findUnique({where:{confirmationEventId:input.confirmationEventId},include:{revisions:{orderBy:{version:'asc'},take:1}}});
  if(existing){if(existing.requestDigest!==requestDigest||existing.idempotencyKey!==input.idempotencyKey)throw new DomainError('A scope already exists for this confirmed proposal; revise that scope.','CONFLICT');return{scopeId:existing.id,...receipt(existing.revisions[0])}}
  confirmLocalOperator(input.credential);
  const value=await tx.developmentScope.create({data:{id:randomUUID(),productId:input.productId,featureId:input.featureId,feedbackId:input.feedbackId,confirmationEventId:input.confirmationEventId,actorId:actor.id,actorName:actor.name,idempotencyKey:input.idempotencyKey,requestDigest}});
  return{scopeId:value.id,...await appendRevision(tx,value,1,current,prepared,input,requestDigest)};
 });
}
export async function reviseDevelopmentScope(input:HeadRequest&Edit){
 const actor=confirmLocalOperator(input.credential);key(input.idempotencyKey);const change=edit(input);
 const requestDigest=hash({operation:'REVISE',productId:input.productId,featureId:input.featureId,scopeId:input.scopeId,expectedVersion:input.expectedVersion,reviewedDigest:input.reviewedDigest,change,actor});
 const initial=await read(db,input),old=initial.revisions.find(r=>r.idempotencyKey===input.idempotencyKey);
 if(old){if(old.requestDigest!==requestDigest)throw new DomainError('Request key belongs to a different revision.','CONFLICT');await sourceFor(initial);return receipt(old)}
 const current=head(initial,input),manifest=current.manifest as unknown as ScopeManifest,source=await sourceFor(initial);if(hash(manifest)!==current.digest)throw new DomainError('Scope content proof is invalid.');matches(source,manifest);
 const prepared=await draft(source,change,actor.id,manifest.content);
 return locked(initial.id,async tx=>{const value=await read(tx,input),previous=value.revisions.find(r=>r.idempotencyKey===input.idempotencyKey);if(previous){if(previous.requestDigest!==requestDigest)throw new DomainError('Request key belongs to a different revision.','CONFLICT');return receipt(previous)}head(value,input);const latest=await sourceFor(value,tx);matches(latest,manifest);return appendRevision(tx,value,current.version+1,latest,prepared,input,requestDigest)});
}
function decisionPayload(event:{createdAt:Date},approval:Approval){return{...event,createdAt:event.createdAt.toISOString(),approval:{...approval,requestedAt:approval.requestedAt.toISOString(),resolvedAt:approval.resolvedAt?.toISOString()??null}}}
function authenticDecision(event:Loaded['events'][number],input:ScopeLocation,digest:string){
 const {signature,approval,...payload}=event;
 return event.scopeDigest===digest&&validScopeDecision(decisionPayload(payload,approval),signature,event)&&approval.status===event.type&&approval.approvalType==='DEVELOPMENT_SCOPE'&&approval.productId===input.productId&&approval.workItemId===input.featureId;
}
export async function decideDevelopmentScope(input:HeadRequest&{decision:'APPROVED'|'REJECTED';reason?:string}){
 const actor=confirmLocalOperator(input.credential);key(input.idempotencyKey);
 if(!['APPROVED','REJECTED'].includes(input.decision)||typeof(input.reason??'')!=='string'||(input.reason??'').length>4000)throw new DomainError('A valid scope decision and review note are required.');
 const reason=input.reason??'';rejectOperatorSecret(reason);
 const requestDigest=hash({operation:input.decision,productId:input.productId,featureId:input.featureId,scopeId:input.scopeId,expectedVersion:input.expectedVersion,reviewedDigest:input.reviewedDigest,reason,actor});
 return locked(input.scopeId,async tx=>{
  const value=await read(tx,input),revision=head(value,input),manifest=revision.manifest as unknown as ScopeManifest;
  if(hash(manifest)!==revision.digest)throw new DomainError('Scope content proof is invalid.');
  matches(await sourceFor(value,tx),manifest);
  const previous=value.events.find(event=>event.idempotencyKey===input.idempotencyKey);
  if(previous){if(previous.requestDigest!==requestDigest)throw new DomainError('Request key belongs to a different decision.','CONFLICT');if(!authenticDecision(previous,input,revision.digest))throw new DomainError('Scope decision authority cannot be established.');return{eventId:previous.id,scopeRevisionId:previous.revisionId,digest:previous.scopeDigest}}
  if(value.events.some(event=>event.revisionId===revision.id))throw new DomainError('This revision already has a human decision; create a new revision.','CONFLICT');
  if(input.decision==='APPROVED'){const blockers=approvalBlockers(manifest);if(blockers.length)throw new DomainError(blockers.join(' '))}
  confirmLocalOperator(input.credential);const now=new Date();
  const approval=await tx.approval.create({data:{productId:input.productId,workItemId:input.featureId,approvalType:'DEVELOPMENT_SCOPE',status:input.decision,requestedAt:now,resolvedAt:now,approvedBy:actor.name,comments:`Scope ${value.id} revision ${revision.version}; digest ${revision.digest}. Scope only; no coding authority.`}});
  const payload={id:randomUUID(),scopeId:value.id,revisionId:revision.id,type:input.decision,scopeDigest:revision.digest,reason,actorKind:actor.kind,actorId:actor.id,actorName:actor.name,approvalId:approval.id,idempotencyKey:input.idempotencyKey,requestDigest,createdAt:now};
  const event=await tx.developmentScopeEvent.create({data:{...payload,signature:signScopeDecision(decisionPayload(payload,approval),input.credential)}});
  await tx.activity.create({data:{productId:input.productId,workItemId:input.featureId,type:'WORK_ITEM_UPDATED',actor:actor.name,description:`Development scope revision ${revision.version} ${input.decision.toLowerCase()}. Scope only; no work activated or coding authorised.`}});
  return{eventId:event.id,scopeRevisionId:revision.id,digest:revision.digest};
 });
}
/** Inspection never reconciles acceptance or records permanent invalidation. */
export async function getDevelopmentScope(input:ScopeLocation){
 const value=await read(db,input),revision=value.revisions.at(-1)!;
 const manifest=revision.manifest as unknown as ScopeManifest,blockers=approvalBlockers(manifest);
 let status:string='DRAFT';
 try{matches(await sourceFor(value),manifest)}catch(error){status=error instanceof DomainError&&error.code==='CONFLICT'?'STALE':'UNAVAILABLE';blockers.push('The confirmed proposal, baseline or human authority is stale or unavailable.')}
 const event=value.events.find(e=>e.revisionId===revision.id);
 if(hash(manifest)!==revision.digest){status='UNAVAILABLE';blockers.push('Scope content proof is invalid.')}
 if(event){const valid=authenticDecision(event,input,revision.digest);
  if(!valid){status='UNAVAILABLE';blockers.push('Scope decision authority cannot be established.')}else if(status==='DRAFT')status=event.type==='APPROVED'?(blockers.length?'UNAVAILABLE':'APPROVED'):'REJECTED';
 }
 return {scopeId:value.id,productId:value.productId,featureId:value.featureId,feedbackId:value.feedbackId,status,version:revision.version,digest:revision.digest,manifest,blockers,history:value.revisions.map(r=>({id:r.id,version:r.version,digest:r.digest,manifest:r.manifest as unknown as ScopeManifest,at:r.createdAt.toISOString()})),decisions:value.events.map(e=>({id:e.id,revisionId:e.revisionId,type:e.type,digest:e.scopeDigest,actor:e.actorName,reason:e.reason,at:e.createdAt.toISOString(),superseded:e.revisionId!==revision.id}))};
}

/** Narrow historical authority reader for controlled rework; never re-signs old decisions. */
export async function readScopeAuthorityForRework(input:ScopeLocation,revisionId:string,reader:Reader=db){
 const value=await read(reader,input),revision=value.revisions.at(-1),event=value.events.find(e=>e.revisionId===revisionId);
 if(!revision||revision.id!==revisionId||!event||event.type!=='APPROVED'||hash(revision.manifest)!==revision.digest||!authenticDecision(event,input,revision.digest))throw new DomainError('Exact current protected scope approval is required.');
 const manifest=revision.manifest as unknown as ScopeManifest;if(approvalBlockers(manifest).length)throw new DomainError('Scope baseline is not eligible for rework.');
 return{revision,event,manifest};
}
