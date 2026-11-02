'use server';
import {headers} from 'next/headers';
import {submitFeedback,getFeedback,listFeedback,analyseFeedback,decideFeedback} from '@/modules/feature-feedback/service';
import {conversationView,conversationList,type FeedbackActionResult} from '@/modules/feature-feedback/presentation';
import {DomainError} from '@/modules/shared/errors';
import {AIFailure} from '@/modules/ai/failures';
// Curated provider failures and the service's own analysis outcomes; other errors may carry provider diagnostics.
const ANALYSIS_MESSAGES=['AI analysis did not match','AI proposal referenced requirements','AI is not configured','Conversation exceeds the analysis limit','Feature context changed during analysis'];
function analysisMessage(error:unknown){return error instanceof AIFailure||(error instanceof DomainError&&ANALYSIS_MESSAGES.some(m=>error.message.startsWith(m)))?(error as Error).message:null}
/** Conversation input is unverified intent; decisions retain protected confirmation. */
export async function featureFeedbackAction(data:FormData):Promise<FeedbackActionResult>{
 const text=(name:string)=>{const value=data.get(name);return typeof value==='string'?value:''};
 const productId=text('productId'),featureId=text('featureId');let feedbackId=text('feedbackId'),scopeVerified=false,analysing=false,recorded=false;let operation='';
 try{
  const h=await headers(),origin=new URL(h.get('origin')??'');
  if(!['http:','https:'].includes(origin.protocol)||origin.host!==h.get('host')||(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))return{status:'error',message:'Open this workspace on localhost or a secure same-origin connection.'};
  if(!productId||!featureId)throw new DomainError('Choose a feature first.');
  scopeVerified=true;operation=text('operation');
  if(operation==='LIST')return{status:'success',conversations:conversationList(await listFeedback(productId,featureId,text('cursor')||undefined))};
  if(operation==='LOAD')return{status:'success',conversation:conversationView(await getFeedback({productId,featureId,feedbackId}))};
  if(!['START','ANALYSE','RESPOND','REVISE','CONFIRM','REJECT','CANCEL'].includes(operation))throw new DomainError('Choose a feedback action.');
  if(operation==='CONFIRM'&&text('acknowledged')!=='yes')throw new DomainError('Explicitly acknowledge that you reviewed this exact proposal.');
  const credential=text('credential'),nonce=text('idempotencyKey');
  if(!/^[A-Za-z0-9:_-]{8,90}$/.test(nonce))throw new DomainError('A unique feedback request key is required.');
  if(operation==='START'){
   const thread=await submitFeedback({productId,featureId,originalText:text('text'),idempotencyKey:`${nonce}:submit`});feedbackId=thread.id;recorded=true;
  }else if(operation!=='ANALYSE'){await decideFeedback({productId,featureId,feedbackId,...(['CONFIRM','REJECT','CANCEL'].includes(operation)?{credential}:{}),idempotencyKey:`${nonce}:decision`,expectedRevision:Number(text('revision')),reviewedDigest:text('digest'),decision:operation as 'RESPOND'|'REVISE'|'CONFIRM'|'REJECT'|'CANCEL',...(text('text')?{text:text('text')}:{})});recorded=true;}
  let state=await getFeedback({productId,featureId,feedbackId});
  if(['START','ANALYSE','RESPOND','REVISE'].includes(operation)&&state.status==='AWAITING_ANALYSIS'){
   analysing=true;await analyseFeedback({productId,featureId,feedbackId,idempotencyKey:`${nonce}:analysis`,expectedRevision:state.revision,reviewedDigest:state.digest});state=await getFeedback({productId,featureId,feedbackId});
  }
  const conversation=conversationView(state),conversations=conversationList(await listFeedback(productId,featureId));
  if(operation==='CONFIRM'&&!conversation.confirmed)return{status:'error',message:'The historical decision was retained, but it is not current. Review the latest conversation.',conversation,conversations};
  return {status:'success',message:operation==='CONFIRM'?'Proposal confirmed as intent only. No development, requirement approval or feature acceptance was started.':operation==='REJECT'?'Proposal rejected. Its history is retained.':operation==='CANCEL'?'Conversation cancelled. Its history is retained.':undefined,conversation,conversations};
 }catch(error){
  // Record only fixed operation/stage/error codes, never FormData, secrets or raw exceptions.
  const knownOperation=['START','ANALYSE','RESPOND','REVISE','CONFIRM','REJECT','CANCEL','LIST','LOAD'].includes(operation)?operation:'UNKNOWN';
  const code=error instanceof DomainError?error.code:'UNEXPECTED',category=error instanceof AIFailure?error.category:undefined;
  console.warn('[feature-feedback]',{operation:knownOperation,stage:analysing?'ANALYSIS':recorded?'READ_AFTER_SAVE':'BEFORE_SAVE',code,...(category?{category}:{})});
  let conversation;try{if(scopeVerified&&feedbackId)conversation=conversationView(await getFeedback({productId,featureId,feedbackId}))}catch{/* Never return another scope or raw diagnostics. */}
  const saved=conversation?.status==='AWAITING_ANALYSIS';
  return{status:'error',message:analysing?(error instanceof DomainError&&error.code==='CONFLICT'?'The conversation or feature changed. Reload it before deciding.':analysisMessage(error)?`Your feedback is saved, but AI analysis did not finish: ${analysisMessage(error)} Retry AI analysis when ready.`:'Your feedback is saved. AI analysis is unavailable; check AI settings and retry.'):error instanceof DomainError?error.message:saved?'Your feedback is saved. AI analysis is unavailable; check AI settings and retry.':recorded?'The action was saved, but its current conversation could not be loaded. Reload history before trying again.':'Your feedback action could not be saved. Reload this feature and try again; no confirmation was recorded.',...(conversation?{conversation}:{})};
 }
}
