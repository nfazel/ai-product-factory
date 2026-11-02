import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import type {Prisma} from '@/generated/prisma/client';
import {canonicalJson,contentHash} from '@/modules/coding/external-manifest';
import {confirmLocalOperator,operatorConfirmationAvailable,rejectOperatorSecret} from '@/modules/feature-review/authorization';
import {getAIProvider,isAIConfigured,prepareAI} from '@/modules/ai/provider';
import {DomainError} from '@/modules/shared/errors';
import {feedbackContext,contextDigest,type FeedbackContext} from './context';
import {analysisSchema,analysisSchemaFor,type FeedbackAnalysis} from './schema';
import {FEEDBACK_SYSTEM_PROMPT} from './prompt';
import {signFeedbackDecision,validFeedbackDecision} from './proof';

type Reader=Prisma.TransactionClient;
type Scope={productId:string;featureId:string;feedbackId:string};
type Request=Scope&{credential?:string;idempotencyKey:string;expectedRevision:number;reviewedDigest:string};
const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value));
const hash=(value:unknown)=>contentHash(canonicalJson(value));
const receipt=(event:{id:string;revision:number;digest:string})=>({eventId:event.id,revision:event.revision,digest:event.digest});
// Conversational attribution is explicitly unverified and never approval authority.
const participant={kind:'LOCAL_PARTICIPANT',id:'local-feedback-participant',name:'Local participant (unverified)'};
const protectedDecisions=new Set(['CONFIRM','REJECT','CANCEL']);
function protectedOperator(credential?:string){
 if(!operatorConfirmationAvailable())throw new DomainError('Protected operator confirmation is unavailable. Ask the local operator to configure it before making this decision.');
 try{return confirmLocalOperator(credential??'')}catch{throw new DomainError('Local operator confirmation was not accepted. Use the credential for this environment; no decision was recorded.')}
}
const terminal=new Set(['CONFIRMED','REJECTED','CANCELLED']);
function key(value:string){if(!/^[A-Za-z0-9:_-]{8,128}$/.test(value))throw new DomainError('A unique request key is required.');rejectOperatorSecret(value)}
function text(value:string){if(typeof value!=='string'||!value.trim()||value.length>20000)throw new DomainError('Feedback must contain 1–20000 characters.');rejectOperatorSecret(value);return value}
async function locked<T>(id:string,work:(tx:Reader)=>Promise<T>):Promise<T>{for(let attempt=0;attempt<3;attempt++)try{return await db.$transaction(async tx=>{await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`feature-feedback:${id}`},0))`;return work(tx)},{isolationLevel:'Serializable',maxWait:10000,timeout:60000})}catch(error){if(!['P2034','P2002'].includes((error as {code?:string}).code??'')||attempt===2)throw error}throw new DomainError('Concurrent request could not be resolved.','CONFLICT')}
async function read(reader:Reader,scope:Scope){
 const thread=await reader.featureFeedback.findFirst({where:{id:scope.feedbackId,productId:scope.productId,featureId:scope.featureId},include:{events:{orderBy:{revision:'asc'}}}});
 if(!thread)throw new DomainError('Feedback was not found in this product and feature.','NOT_FOUND');
 // Parent identity remains checked even if a feature was moved after submission.
 const owner=await reader.workItem.findFirst({where:{id:scope.featureId,productId:scope.productId,type:'FEATURE'},select:{id:true}});
 if(!owner)throw new DomainError('Feature does not belong to this product.','NOT_FOUND');
 return thread;
}
function headOf(thread:Awaited<ReturnType<typeof read>>){const head=thread.events.at(-1);return{head,revision:head?.revision??0,digest:head?.digest??thread.contextDigest}}
function expectHead(thread:Awaited<ReturnType<typeof read>>,request:Request){const state=headOf(thread);if(!Number.isInteger(request.expectedRevision)||request.expectedRevision!==state.revision||request.reviewedDigest!==state.digest||terminal.has(state.head?.type??''))throw new DomainError('The conversation or proposal changed; inspect the current version.','CONFLICT');return state}
function replay(thread:Awaited<ReturnType<typeof read>>,requestId:string,requestDigest:string){const event=thread.events.find(e=>e.idempotencyKey===requestId);if(event&&event.requestDigest!==requestDigest)throw new DomainError('Request key already belongs to a different decision.','CONFLICT');return event}
async function append(tx:Reader,scope:Scope,revision:number,type:string,payload:unknown,context:FeedbackContext,requestId:string,requestDigest:string,credential:string|undefined,ai=false){
 rejectOperatorSecret({payload,context});const protectedDecision=['CONFIRMED','REJECTED','CANCELLED'].includes(type),actor=protectedDecision?protectedOperator(credential):participant;
 if(!ai&&!protectedDecision){
  const ready=await tx.$queryRaw<{ready:boolean}[]>`SELECT COALESCE(bool_or(position('LOCAL_PARTICIPANT' IN pg_get_constraintdef(oid))>0),false) AS ready FROM pg_constraint WHERE conrelid=to_regclass('public."FeatureFeedbackEvent"') AND conname='FeatureFeedbackEvent_proof_check'`;
  if(!ready[0]?.ready)throw new DomainError('Feedback storage needs an update before clarification or revision can be saved. Ask the local operator to apply the reviewed conversational-feedback migration; your response was not saved.');
 }
 const data={id:randomUUID(),feedbackId:scope.feedbackId,revision,type,payload:json(payload),context:json(context),contextDigest:contextDigest(context),actorKind:ai?'AI':actor.kind,actorId:ai?'configured-ai-provider':actor.id,actorName:ai?'Configured AI provider':actor.name,idempotencyKey:requestId,requestDigest,createdAt:new Date()};
 const digest=hash({...data,createdAt:data.createdAt.toISOString()}),signature=protectedDecision?signFeedbackDecision({kind:'FEATURE_FEEDBACK_EVENT',...data,createdAt:data.createdAt.toISOString(),digest},credential!):'';
 const event=await tx.featureFeedbackEvent.create({data:{...data,digest,signature}});
 await tx.activity.create({data:{productId:scope.productId,workItemId:scope.featureId,type:'WORK_ITEM_UPDATED',description:`Feature feedback ${type.toLowerCase()} recorded. No implementation or approval state changed.`,actor:ai?'Configured AI provider':actor.name}});
 return receipt(event);
}
/** Public read projection excludes signed proof, but preserves immutable intent history. */
export async function getFeedback(scope:Scope,reader:Reader=db){
 const thread=await read(reader,scope),{head,revision,digest}=headOf(thread);
 let status=terminal.has(head?.type??'')?head!.type:head?.type==='AI_ANALYSIS'?(head.payload as {analysis:FeedbackAnalysis}).analysis.status:'AWAITING_ANALYSIS';
 if(head?.type==='CONFIRMED'){
  const {signature,digest:eventDigest,...data}=head;
  const payload={...data,createdAt:data.createdAt.toISOString()};
  const target=thread.events.find(event=>event.revision===head.revision-1),reviewed=head.payload as {reviewedDigest:string;reviewedRevision:number};
  if(hash(payload)!==eventDigest||!validFeedbackDecision({kind:'FEATURE_FEEDBACK_EVENT',...payload,digest:eventDigest},signature,head)||target?.type!=='AI_ANALYSIS'||(target.payload as {analysis:FeedbackAnalysis}).analysis.status!=='PROPOSAL'||reviewed.reviewedDigest!==target.digest||reviewed.reviewedRevision!==target.revision)status='CONFIRMATION_UNAVAILABLE';
  else try{const current=await feedbackContext(scope.productId,scope.featureId,reader);if(contextDigest(current)!==head.contextDigest||(current.build.repositoryId&&(!current.build.available||!current.build.clean)))status='CONFIRMED_STALE'}catch{status='CONFIRMATION_UNAVAILABLE'}
 }
 let contextStatus:'CURRENT'|'STALE'|'UNAVAILABLE'|null=null;
 if(head?.type==='AI_ANALYSIS')try{const current=await feedbackContext(scope.productId,scope.featureId,reader);contextStatus=contextDigest(current)===head.contextDigest&&(!current.build.repositoryId||(current.build.available&&current.build.clean))?'CURRENT':'STALE'}catch{contextStatus='UNAVAILABLE'}
 return {...thread,events:thread.events.map(({signature,...event})=>{void signature;return event}),revision,digest,status,contextStatus,confirmed:status==='CONFIRMED'};
}

export async function submitFeedback(input:{productId:string;featureId:string;originalText:string;credential?:string;idempotencyKey:string}){
 const actor=participant;key(input.idempotencyKey);const originalText=text(input.originalText),requestDigest=hash({productId:input.productId,featureId:input.featureId,originalText,actor});
 return locked(`submit:${input.productId}:${input.featureId}`,async tx=>{
  const previous=await tx.featureFeedback.findUnique({where:{productId_featureId_idempotencyKey:{productId:input.productId,featureId:input.featureId,idempotencyKey:input.idempotencyKey}}});
  if(previous){if(previous.requestDigest!==requestDigest)throw new DomainError('Request key already used for different feedback.','CONFLICT');await read(tx,{...input,feedbackId:previous.id});return previous}
  const context=await feedbackContext(input.productId,input.featureId,tx);
  const thread=await tx.featureFeedback.create({data:{productId:input.productId,featureId:input.featureId,originalText,context:json(context),contextDigest:contextDigest(context),actorId:actor.id,actorName:actor.name,idempotencyKey:input.idempotencyKey,requestDigest}});
  await tx.activity.create({data:{productId:input.productId,workItemId:input.featureId,type:'WORK_ITEM_UPDATED',description:'Feature feedback submitted. No implementation or approval state changed.',actor:actor.name}});
  return thread;
 });
}
export async function analyseFeedback(input:Request){
 const actor=participant;key(input.idempotencyKey);const requestDigest=hash({operation:'ANALYSE',productId:input.productId,featureId:input.featureId,feedbackId:input.feedbackId,expectedRevision:input.expectedRevision,reviewedDigest:input.reviewedDigest,actor});
 const initial=await read(db,input);const previous=replay(initial,input.idempotencyKey,requestDigest);if(previous)return receipt(previous);
 const state=expectHead(initial,input);if(state.head&&!['RESPONSE','REVISION_REQUESTED'].includes(state.head.type))throw new DomainError('Respond or request revision before another analysis.');
 const context=await feedbackContext(input.productId,input.featureId);rejectOperatorSecret({context,feedback:initial.originalText,events:initial.events});
 const requirementIds=context.requirements.map(r=>r.id),schema=analysisSchemaFor(requirementIds);
 const conversation={originalFeedback:initial.originalText,context,allowedRequirementIds:requirementIds,history:initial.events.map(e=>({revision:e.revision,type:e.type,payload:e.payload}))};
 if(canonicalJson(conversation).length>200000)throw new DomainError('Conversation exceeds the analysis limit. Start a scoped follow-up.');
 await prepareAI();if(!isAIConfigured())throw new DomainError('AI is not configured. Original feedback remains saved.');
 const provider=await getAIProvider();const generated=await provider.generate({systemPrompt:FEEDBACK_SYSTEM_PROMPT,messages:[{role:'user',content:canonicalJson(conversation)}],responseSchema:schema,schemaName:'feature_feedback_analysis',purpose:'feature-feedback'});
 const parsed=schema.safeParse(generated.data);if(!parsed.success)throw new DomainError('AI analysis did not match the feedback proposal schema.');
 const validIds=new Set(requirementIds);if(parsed.data.proposal?.affectedRequirementIds.some(id=>!validIds.has(id)))throw new DomainError('AI proposal referenced requirements outside this feature.');
 return locked(input.feedbackId,async tx=>{const thread=await read(tx,input),existing=replay(thread,input.idempotencyKey,requestDigest);if(existing)return receipt(existing);expectHead(thread,input);const current=await feedbackContext(input.productId,input.featureId,tx);if(contextDigest(current)!==contextDigest(context))throw new DomainError('Feature context changed during analysis. Retry against the current version.','CONFLICT');return append(tx,input,state.revision+1,'AI_ANALYSIS',{analysis:parsed.data,provider:generated.provider??'configured',model:generated.model,usage:generated.usage,requestedBy:actor},context,input.idempotencyKey,requestDigest,input.credential,true)});
}
export async function decideFeedback(input:Request&{decision:'CONFIRM'|'REVISE'|'REJECT'|'CANCEL'|'RESPOND';text?:string}){
 const actor=protectedDecisions.has(input.decision)?protectedOperator(input.credential):participant;key(input.idempotencyKey);if(!['CONFIRM','REVISE','REJECT','CANCEL','RESPOND'].includes(input.decision))throw new DomainError('Unknown feedback decision.');
 const note=['RESPOND','REVISE'].includes(input.decision)?text(input.text??''):input.text===undefined?'':text(input.text);const requestDigest=hash({operation:input.decision,productId:input.productId,featureId:input.featureId,feedbackId:input.feedbackId,expectedRevision:input.expectedRevision,reviewedDigest:input.reviewedDigest,text:note,actor});
 return locked(input.feedbackId,async tx=>{const thread=await read(tx,input),previous=replay(thread,input.idempotencyKey,requestDigest);if(previous)return receipt(previous);const {head,revision}=expectHead(thread,input);const analysis=head?.type==='AI_ANALYSIS'?(head.payload as {analysis:FeedbackAnalysis}).analysis:null;
  if(input.decision==='CONFIRM'&&analysis?.status!=='PROPOSAL')throw new DomainError('Only a current actionable proposal can be confirmed.');
  if(input.decision==='REVISE'&&analysis?.status!=='PROPOSAL')throw new DomainError('Inspect a proposal before requesting revision.');
  if(input.decision==='RESPOND'&&analysis?.status!=='CLARIFICATION')throw new DomainError('No current clarification question is awaiting a response.');
  if(input.decision==='REJECT'&&!analysis)throw new DomainError('Inspect an AI interpretation before rejecting it.');
  const context=await feedbackContext(input.productId,input.featureId,tx);
  if(input.decision==='CONFIRM'&&(head!.contextDigest!==contextDigest(context)||(context.build.repositoryId&&(!context.build.available||!context.build.clean))))throw new DomainError('Proposal requirements or implementation context is stale or unavailable. Review a fresh proposal.','CONFLICT');
  const types={CONFIRM:'CONFIRMED',REVISE:'REVISION_REQUESTED',REJECT:'REJECTED',CANCEL:'CANCELLED',RESPOND:'RESPONSE'};
  return append(tx,input,revision+1,types[input.decision],{text:note,reviewedRevision:input.expectedRevision,reviewedDigest:input.reviewedDigest},context,input.idempotencyKey,requestDigest,input.credential);
 });
}

/** Scoped, paginated inspection only; no technical eligibility or acceptance reconciliation. */
export async function listFeedback(productId:string,featureId:string,cursor?:string){
 if(!await db.workItem.findFirst({where:{id:featureId,productId,type:'FEATURE'},select:{id:true}}))throw new DomainError('Feature does not belong to this product.','NOT_FOUND');
 if(cursor&&!await db.featureFeedback.findFirst({where:{id:cursor,productId,featureId},select:{id:true}}))throw new DomainError('Conversation cursor does not belong to this feature.','NOT_FOUND');
 const rows=await db.featureFeedback.findMany({where:{productId,featureId},orderBy:[{createdAt:'desc'},{id:'desc'}],take:21,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,originalText:true,createdAt:true,events:{orderBy:{revision:'desc'},take:1,select:{type:true,payload:true}}}});
 return {items:rows.slice(0,20),nextCursor:rows.length>20?rows[19].id:null};
}

/** Server-only proof reference for downstream intent planning. No coding authority. */
export async function confirmedFeedbackSource(scope:Scope,reader:Reader=db){
 const state=await getFeedback(scope,reader);
 if(!state.confirmed)throw new DomainError('A current protected human-confirmed proposal is required.',state.status==='CONFIRMED_STALE'?'CONFLICT':'INVALID');
 const thread=await read(reader,scope),confirmation=thread.events.at(-1)!;
 const proposal=thread.events.find(event=>event.revision===confirmation.revision-1)!;
 const {signature:proposalSignature,digest:proposalDigest,...proposalData}=proposal;void proposalSignature;
 if(hash({...proposalData,createdAt:proposal.createdAt.toISOString()})!==proposalDigest)throw new DomainError('Confirmed proposal content proof is invalid.');
 const analysis=analysisSchema.parse((proposal.payload as {analysis:unknown}).analysis);
 return {binding:{feedbackId:thread.id,proposalEventId:proposal.id,proposalRevision:proposal.revision,proposalDigest:proposal.digest,proposalContentDigest:hash(analysis),confirmationEventId:confirmation.id,confirmationDigest:confirmation.digest,confirmationProofDigest:contentHash(confirmation.signature),confirmationActorId:confirmation.actorId},analysis,context:confirmation.context as unknown as FeedbackContext};
}
