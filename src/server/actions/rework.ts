'use server';
import {headers} from 'next/headers';
import {draftReworkAmendment,decideReworkAmendment,activateReworkAmendment,readReworkForScope,authoriseReworkTaskExecution,type ReworkView} from '@/modules/rework/service';
import {approveImplementationTask} from '@/modules/coding/service';
import {db} from '@/lib/db';
import {findDevelopmentScopeId} from '@/modules/development-scope';
import {confirmLocalOperator,operatorConfirmationAvailable,resolveOperatorCredential} from '@/modules/feature-review/authorization';
import {AIFailure} from '@/modules/ai/failures';
import {DomainError} from '@/modules/shared/errors';

export type ReworkActionResult={status:'success'|'error';message?:string;rework?:ReworkView|null};

/** Same protected check as scope decisions: skipped only through the proof-of-concept switch, never by the browser. */
function requireOperator(credential:string){
 if(!operatorConfirmationAvailable())throw new DomainError('Protected operator confirmation is unavailable. Ask the local operator to configure it before making this decision.');
 try{confirmLocalOperator(credential)}catch{throw new DomainError('Local operator confirmation was not accepted. Use the credential for this environment; nothing was changed.')}
}

/** Drafts, decides and creates development tasks for an approved scope. Creating tasks does not authorise any coding. */
export async function reworkAction(data:FormData):Promise<ReworkActionResult>{
 const text=(name:string)=>{const value=data.get(name);return typeof value==='string'?value:''};
 const productId=text('productId'),featureId=text('featureId'),feedbackId=text('feedbackId');let operation='';
 try{
  const h=await headers(),origin=new URL(h.get('origin')??'');
  if(!['http:','https:'].includes(origin.protocol)||origin.host!==h.get('host')||(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))return{status:'error',message:'Open this workspace on localhost or a secure same-origin connection.'};
  if(!productId||!featureId||!feedbackId)throw new DomainError('Choose a confirmed conversation first.');
  operation=text('operation');
  const scopeId=await findDevelopmentScopeId({productId,featureId,feedbackId});
  const load=async()=>scopeId?readReworkForScope({productId,featureId,scopeId}):null;
  if(operation==='LOAD')return{status:'success',rework:await load()};
  if(!['DRAFT','APPROVE','REJECT','ACTIVATE','AUTHORISE_TASK'].includes(operation))throw new DomainError('Choose a task action.');
  if(!scopeId)throw new DomainError('Approve a development scope first.');
  const nonce=text('idempotencyKey');
  if(!/^[A-Za-z0-9:_-]{8,90}$/.test(nonce))throw new DomainError('A unique request key is required.');
  const credential=resolveOperatorCredential(text('credential'));requireOperator(credential);
  const current=await readReworkForScope({productId,featureId,scopeId});
  if(operation==='DRAFT'){
   if(!current.eligibility.ok||!current.eligibility.planId)throw new DomainError(current.eligibility.reasons[0]??'Tasks cannot be drafted for this scope yet.');
   if(current.amendment&&!['REJECTED'].includes(current.amendment.state))throw new DomainError('Tasks have already been drafted for this scope.');
   await draftReworkAmendment({productId,featureId,scopeId,scopeRevisionId:current.eligibility.scopeRevisionId,planId:current.eligibility.planId,credential,idempotencyKey:`${nonce}:draft`});
   return{status:'success',message:'Tasks drafted. Review them before approving; nothing has been created yet.',rework:await load()};
  }
  const amendment=current.amendment;
  if(!amendment)throw new DomainError('Draft development tasks first.');
  if(operation==='AUTHORISE_TASK'){
   // Two separate signed steps, one click: the coding decision, then the authority to execute. The browser names only the task and what it reviewed.
   if(text('authoriseAck')!=='yes')throw new DomainError('Confirm that you reviewed this task and authorise it to be built.');
   const taskId=text('taskId'),shown=amendment.created.find(item=>item.id===taskId);
   if(!shown||shown.coding!=='NOT_AUTHORISED'||!shown.reviewedDigest)throw new DomainError('This task cannot be authorised right now. Reload and check its state.');
   if(text('reviewedDigest')!==shown.reviewedDigest)throw new DomainError('This task changed; review the latest version.');
   const row=await db.reworkAmendment.findFirst({where:{id:amendment.id,productId},select:{id:true,scopeRevisionId:true}});
   if(!row)throw new DomainError('The task amendment was not found.');
   const approval={amendmentId:row.id,scopeRevisionId:row.scopeRevisionId,reviewedDigest:shown.reviewedDigest,credential};
   await approveImplementationTask(productId,taskId,{reworkApproval:{...approval,idempotencyKey:`${nonce}:coding`}});
   await authoriseReworkTaskExecution({...approval,productId,taskId,idempotencyKey:`${nonce}:execution`});
   return{status:'success',message:'Authorised. This task can now be built in Build, with its own plan, code review and verification.',rework:await load()};
  }
  const reviewedDigest=text('digest');
  if(reviewedDigest!==amendment.digest)throw new DomainError('These tasks changed; review the latest version.');
  if(operation==='ACTIVATE'){
   if(text('impactAck')!=='yes')throw new DomainError('Confirm that you understand the feature may need re-verification and acceptance.');
   await activateReworkAmendment({productId,amendmentId:amendment.id,reviewedDigest,acknowledgeAcceptanceImpact:true,credential,idempotencyKey:`${nonce}:activate`});
   return{status:'success',message:'Development tasks created. Coding has not started; each task needs its own approval first.',rework:await load()};
  }
  if(operation==='APPROVE'&&text('unchangedAck')!=='yes')throw new DomainError('Confirm that the approved requirements stay unchanged.');
  await decideReworkAmendment({productId,amendmentId:amendment.id,reviewedDigest,decision:operation==='APPROVE'?'APPROVED':'REJECTED',requirementsUnchanged:true,credential,idempotencyKey:`${nonce}:decide`});
  return{status:'success',message:operation==='APPROVE'?'Tasks approved. Nothing has been created or started yet.':'Tasks rejected. Their history is retained; you can draft new ones.',rework:await load()};
 }catch(error){
  // Fixed codes only: never FormData, credentials or raw exceptions.
  console.warn('[rework]',{operation:['LOAD','DRAFT','APPROVE','REJECT','ACTIVATE','AUTHORISE_TASK'].includes(operation)?operation:'UNKNOWN',code:error instanceof DomainError?error.code:'UNEXPECTED',...(error instanceof AIFailure?{category:error.category}:{})});
  return{status:'error',message:error instanceof DomainError?error.message:'The task request could not finish. Reload and try again; nothing was approved or created.'};
 }
}
