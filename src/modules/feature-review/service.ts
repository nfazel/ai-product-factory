import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import type {FeatureReviewEvent,Prisma} from '@/generated/prisma/client';
import {canonicalJson,contentHash} from '@/modules/coding/external-manifest';
import {DomainError} from '@/modules/shared/errors';
import {confirmLocalOperator,operatorConfirmationAvailable,currentOperatorPrincipal,rejectOperatorSecret,signFeatureDecision,validFeatureDecision} from './authorization';
import {loadFeatureManifest,type ReviewReader} from './loader';
import {featureManifestDigest,knownFeatureChange,reviewEligibility,type FeatureReviewManifest} from './manifest';

type Reader=ReviewReader;
function signedPayload<T extends {createdAt:Date}>(event:T){const value={...event} as T&{sequence?:number};delete value.sequence;return {...value,createdAt:event.createdAt.toISOString()}}
function authentic(event:FeatureReviewEvent){const {signature,manifest,...payload}=event;try{return event.manifestVersion===1&&event.type!=='INVALIDATED'&&currentOperatorPrincipal(event)&&(manifest as FeatureReviewManifest).kind==='FEATURE_REVIEW_MANIFEST'&&(manifest as FeatureReviewManifest).productId===event.productId&&(manifest as FeatureReviewManifest).featureId===event.featureId&&featureManifestDigest(manifest as FeatureReviewManifest)===event.manifestDigest&&validFeatureDecision(signedPayload(payload),signature)}catch{return false}}
function json(value:unknown):Prisma.InputJsonValue{return JSON.parse(JSON.stringify(value))}
async function locked<T>(productId:string,featureId:string,work:(tx:Reader)=>Promise<T>):Promise<T>{
 for(let attempt=0;attempt<3;attempt++)try{return await db.$transaction(async tx=>{await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`feature-review:${productId}:${featureId}`},0))`;return work(tx)},{isolationLevel:'Serializable',maxWait:10000,timeout:60000})}catch(error){const code=(error as {code?:string}).code;if(!['P2034','P2002'].includes(code??'')||attempt===2)throw error}
 throw new DomainError('Concurrent review could not be resolved. Retry with the same idempotency key.');
}
async function history(reader:Reader,productId:string,featureId:string){return reader.featureReviewEvent.findMany({where:{productId,featureId},orderBy:{sequence:'asc'}})}
async function reconcile(reader:Reader,manifest:FeatureReviewManifest,events:FeatureReviewEvent[]){
 const digest=featureManifestDigest(manifest),eligibility=reviewEligibility(manifest),invalidated=new Set(events.filter(event=>event.type==='INVALIDATED').map(event=>event.invalidatesEventId));
 for(const event of events.filter(event=>event.type==='ACCEPTED'&&!invalidated.has(event.id))){
  if((manifest.observation?.unavailable||!operatorConfirmationAvailable())&&!knownFeatureChange(event.manifest as FeatureReviewManifest,manifest))continue;
  const concerns=eligibility.concerns.map(concern=>concern.id).sort();
  if(event.manifestDigest===digest&&eligibility.eligible&&authentic(event)&&canonicalJson(event.acknowledgedConcerns)===canonicalJson(concerns))continue;
  await reader.featureReviewEvent.create({data:{id:randomUUID(),productId:manifest.productId,featureId:manifest.featureId,type:'INVALIDATED',manifest:json(manifest),manifestDigest:digest,actorKind:'SYSTEM',actorId:'feature-review-policy',actorName:'Feature review policy',reason:'The implementation, approved scope, verification evidence or approval authority no longer matches this acceptance.',acknowledgedConcerns:[],idempotencyKey:`invalidate:${event.id}`,requestDigest:contentHash(`invalidate:${event.id}`),invalidatesEventId:event.id}});
 }
 return history(reader,manifest.productId,manifest.featureId);
}
function publicHistory(events:FeatureReviewEvent[]){return events.map(({signature,...event})=>{void signature;return event})}
function state(manifest:FeatureReviewManifest,events:FeatureReviewEvent[]){const unavailable=Boolean(manifest.observation?.unavailable||!operatorConfirmationAvailable());const invalid=new Set(events.filter(event=>event.type==='INVALIDATED').map(event=>event.invalidatesEventId));const accepted=events.findLast(event=>event.type==='ACCEPTED'&&!invalid.has(event.id)&&event.manifestDigest===featureManifestDigest(manifest)&&authentic(event));return {manifest,digest:featureManifestDigest(manifest),...reviewEligibility(manifest),eligible:!unavailable&&reviewEligibility(manifest).eligible,status:manifest.productArchived||manifest.scope.some(item=>item.archivedAt)?'ARCHIVED':unavailable?'UNAVAILABLE':accepted?'ACCEPTED':events.some(event=>event.type==='ACCEPTED')?'REVIEW_REQUIRED':events.at(-1)?.type==='DEFERRED'?'DEFERRED':'AWAITING_ACCEPTANCE',acceptanceId:unavailable?null:accepted?.id??null,history:publicHistory(events)}}
/** Inspection is available without operator confirmation; it never grants acceptance. */
export async function getFeatureReview(productId:string,featureId:string){return locked(productId,featureId,async tx=>{const manifest=await loadFeatureManifest(productId,featureId,tx);const events=await reconcile(tx,manifest,await history(tx,productId,featureId));return state(manifest,events)})}
export type ReviewDecisionInput={productId:string;featureId:string;decision:'ACCEPTED'|'DEFERRED';reviewedDigest:string;idempotencyKey:string;credential:string;reason?:string;acknowledgedConcerns?:string[]};
/** Shared local CLI and protected Build action boundary. The principal is derived only after server-side confirmation. */
export async function recordFeatureReview(input:ReviewDecisionInput){
 const actor=confirmLocalOperator(input.credential);
 if(!['ACCEPTED','DEFERRED'].includes(input.decision)||!/^[a-f0-9]{64}$/.test(input.reviewedDigest)||(!/^[A-Za-z0-9:_-]{8,128}$/.test(input.idempotencyKey)||/^(invalidate|archive):/.test(input.idempotencyKey)))throw new DomainError('A valid decision, exact reviewed digest and idempotency key are required.');
 if(input.reason&&input.reason.length>2000)throw new DomainError('Review comments exceed their limit.');
 const ack=input.acknowledgedConcerns??[];
 if(!Array.isArray(ack)||ack.length>100||ack.some(value=>typeof value!=='string'||value.length>300)||new Set(ack).size!==ack.length)throw new DomainError('Concern acknowledgement must name each concern once.');
 const acknowledgedConcerns=[...ack].sort(),reason=input.reason?.trim()??'';
 rejectOperatorSecret({reason,acknowledgedConcerns,idempotencyKey:input.idempotencyKey});
 const requestDigest=contentHash(canonicalJson({decision:input.decision,reviewedDigest:input.reviewedDigest,reason,acknowledgedConcerns,actor}));
 const outcome=await locked(input.productId,input.featureId,async tx=>{
  const existing=await tx.featureReviewEvent.findUnique({where:{featureId_idempotencyKey:{featureId:input.featureId,idempotencyKey:input.idempotencyKey}}});
  if(existing){if(existing.productId!==input.productId||existing.requestDigest!==requestDigest||!authentic(existing))throw new DomainError('The idempotency key was used for a different review.','CONFLICT');return {eventId:existing.id,replayed:true}}
  const manifest=await loadFeatureManifest(input.productId,input.featureId,tx),events=await reconcile(tx,manifest,await history(tx,input.productId,input.featureId));
  if(featureManifestDigest(manifest)!==input.reviewedDigest)return {error:'The reviewed feature version changed. Inspect it again before deciding.'};
  const eligibility=reviewEligibility(manifest);
  if(input.decision==='ACCEPTED'&&!eligibility.eligible)return {error:`Feature acceptance is unavailable. ${eligibility.blockers.join(' ')}`};
  const expected=input.decision==='ACCEPTED'?eligibility.concerns.map(concern=>concern.id).sort():[];
  if(canonicalJson(acknowledgedConcerns)!==canonicalJson(expected))return {error:'Explicit acknowledgement of the exact non-blocking concerns is required.'};
  if(input.decision==='DEFERRED'&&events.some(event=>event.type==='ACCEPTED'&&!events.some(invalidation=>invalidation.invalidatesEventId===event.id)))return {error:'Deferral does not withdraw an existing acceptance.'};
  if(manifest.scope.some(item=>item.archivedAt)||manifest.productArchived)return {error:'Archived or inactive feature records remain readable but cannot receive new human decisions.'};
  confirmLocalOperator(input.credential);rejectOperatorSecret({reason,acknowledgedConcerns});
  const payload={id:randomUUID(),productId:input.productId,featureId:input.featureId,type:input.decision,manifestVersion:1,manifestDigest:input.reviewedDigest,actorKind:actor.kind,actorId:actor.id,actorName:actor.name,reason,acknowledgedConcerns,idempotencyKey:input.idempotencyKey,requestDigest,invalidatesEventId:null,createdAt:new Date()};
  const event=await tx.featureReviewEvent.create({data:{...payload,manifest:json(manifest),signature:signFeatureDecision(signedPayload(payload))}});
  return {eventId:event.id,replayed:false};
 });
 if('error'in outcome)throw new DomainError(outcome.error!);
 return {...outcome,review:await getFeatureReview(input.productId,input.featureId)};
}
/** Archival preserves immutable events and their parent identities. */
export async function archiveReviewedFeature(productId:string,featureId:string,credential:string){
 const actor=confirmLocalOperator(credential);
 return locked(productId,featureId,async tx=>{
  const manifest=await loadFeatureManifest(productId,featureId,tx);
  const previous=await tx.featureReviewEvent.findFirst({where:{productId,featureId,type:'ARCHIVED'}});
  if(!previous){
   confirmLocalOperator(credential);
   const digest=featureManifestDigest(manifest),payload={id:randomUUID(),productId,featureId,type:'ARCHIVED' as const,manifestVersion:1,manifestDigest:digest,actorKind:actor.kind,actorId:actor.id,actorName:actor.name,reason:'The operator archived this feature review. History is retained.',acknowledgedConcerns:[],idempotencyKey:`archive:${featureId}`,requestDigest:contentHash(canonicalJson({archive:featureId,digest,actor})),invalidatesEventId:null,createdAt:new Date()};
   await tx.featureReviewEvent.create({data:{...payload,manifest:json(manifest),signature:signFeatureDecision(signedPayload(payload))}});
   await tx.activity.create({data:{productId,workItemId:featureId,type:'WORK_ITEM_UPDATED',description:'Protected local operator archived this feature review; history was retained.',actor:actor.name}});
  }
  const archived=await loadFeatureManifest(productId,featureId,tx),events=await reconcile(tx,archived,await history(tx,productId,featureId));return state(archived,events);
 });
}
