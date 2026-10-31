'use server';
import {headers} from 'next/headers';
import {submitFeedback,getFeedback,listFeedback,analyseFeedback,decideFeedback} from '@/modules/feature-feedback/service';
import {conversationView,conversationList,type FeedbackActionResult} from '@/modules/feature-feedback/presentation';
import {DomainError} from '@/modules/shared/errors';
/** Same protected local review transport as Increment 1; no actor supplied by caller. */
export async function featureFeedbackAction(data:FormData):Promise<FeedbackActionResult>{
 const text=(name:string)=>{const value=data.get(name);return typeof value==='string'?value:''};
 const productId=text('productId'),featureId=text('featureId');let feedbackId=text('feedbackId'),scopeVerified=false,analysing=false;
 try{
  const h=await headers(),origin=new URL(h.get('origin')??'');
  if(!['http:','https:'].includes(origin.protocol)||origin.host!==h.get('host')||(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))return{status:'error',message:'Open this workspace on localhost or a secure same-origin connection.'};
  if(!productId||!featureId)throw new DomainError('Choose a feature first.');
  scopeVerified=true;const operation=text('operation');
  if(operation==='LIST')return{status:'success',conversations:conversationList(await listFeedback(productId,featureId,text('cursor')||undefined))};
  if(operation==='LOAD')return{status:'success',conversation:conversationView(await getFeedback({productId,featureId,feedbackId}))};
  if(!['START','ANALYSE','RESPOND','REVISE','CONFIRM','REJECT','CANCEL'].includes(operation))throw new DomainError('Choose a feedback action.');
  if(operation==='CONFIRM'&&text('acknowledged')!=='yes')throw new DomainError('Explicitly acknowledge that you reviewed this exact proposal.');
  const credential=text('credential'),nonce=text('idempotencyKey');
  if(!/^[A-Za-z0-9:_-]{8,90}$/.test(nonce))throw new DomainError('A unique feedback request key is required.');
  if(operation==='START'){
   const thread=await submitFeedback({productId,featureId,originalText:text('text'),credential,idempotencyKey:`${nonce}:submit`});feedbackId=thread.id;
  }else if(operation!=='ANALYSE')await decideFeedback({productId,featureId,feedbackId,credential,idempotencyKey:`${nonce}:decision`,expectedRevision:Number(text('revision')),reviewedDigest:text('digest'),decision:operation as 'RESPOND'|'REVISE'|'CONFIRM'|'REJECT'|'CANCEL',...(text('text')?{text:text('text')}:{})});
  let state=await getFeedback({productId,featureId,feedbackId});
  if(['START','ANALYSE','RESPOND','REVISE'].includes(operation)&&state.status==='AWAITING_ANALYSIS'){
   analysing=true;await analyseFeedback({productId,featureId,feedbackId,credential,idempotencyKey:`${nonce}:analysis`,expectedRevision:state.revision,reviewedDigest:state.digest});state=await getFeedback({productId,featureId,feedbackId});
  }
  const conversation=conversationView(state),conversations=conversationList(await listFeedback(productId,featureId));
  if(operation==='CONFIRM'&&!conversation.confirmed)return{status:'error',message:'The historical decision was retained, but it is not current. Review the latest conversation.',conversation,conversations};
  return {status:'success',message:operation==='CONFIRM'?'Proposal confirmed as intent only. No development, requirement approval or feature acceptance was started.':operation==='REJECT'?'Proposal rejected. Its history is retained.':operation==='CANCEL'?'Conversation cancelled. Its history is retained.':undefined,conversation,conversations};
 }catch(error){
  let conversation;try{if(scopeVerified&&feedbackId)conversation=conversationView(await getFeedback({productId,featureId,feedbackId}))}catch{/* Never return another scope or raw diagnostics. */}
  const saved=conversation?.status==='AWAITING_ANALYSIS';
  return{status:'error',message:analysing?(error instanceof DomainError&&error.code==='CONFLICT'?'The conversation or feature changed. Reload it before deciding.':'Your feedback is saved. AI analysis is unavailable or not configured; check AI settings and retry.'):error instanceof DomainError?error.message:saved?'Your feedback is saved. AI analysis is unavailable; check AI settings and retry.':'This request could not finish. Reload the saved conversation before retrying.',...(conversation?{conversation}:{})};
 }
}
