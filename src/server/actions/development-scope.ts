'use server';
import {headers} from 'next/headers';
import {prepareDevelopmentScope,reviseDevelopmentScope,decideDevelopmentScope,getDevelopmentScope,findDevelopmentScopeId,developmentScopeView} from '@/modules/development-scope';
import type {DevelopmentScopeView} from '@/modules/development-scope';
import {confirmedFeedbackSource} from '@/modules/feature-feedback/service';
import {confirmLocalOperator,operatorConfirmationAvailable,resolveOperatorCredential} from '@/modules/feature-review/authorization';
import {DomainError} from '@/modules/shared/errors';

export type ScopeActionResult={status:'success'|'error';message?:string;scope?:DevelopmentScopeView|null};

/** Scope authority stays protected: every write needs the local operator credential. */
function requireOperator(credential:string){
 if(!operatorConfirmationAvailable())throw new DomainError('Protected operator confirmation is unavailable. Ask the local operator to configure it before making this decision.');
 try{confirmLocalOperator(credential)}catch{throw new DomainError('Local operator confirmation was not accepted. Use the credential for this environment; nothing was changed.')}
}

/** Prepares, revises and decides development scope for a confirmed proposal. Scope only: no tasks, coding or acceptance. */
export async function developmentScopeAction(data:FormData):Promise<ScopeActionResult>{
 const text=(name:string)=>{const value=data.get(name);return typeof value==='string'?value:''};
 const productId=text('productId'),featureId=text('featureId'),feedbackId=text('feedbackId');let operation='';
 try{
  const h=await headers(),origin=new URL(h.get('origin')??'');
  if(!['http:','https:'].includes(origin.protocol)||origin.host!==h.get('host')||(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))return{status:'error',message:'Open this workspace on localhost or a secure same-origin connection.'};
  if(!productId||!featureId||!feedbackId)throw new DomainError('Choose a confirmed conversation first.');
  operation=text('operation');
  const load=async(scopeId:string|null)=>scopeId?developmentScopeView(await getDevelopmentScope({productId,featureId,scopeId})):null;
  if(operation==='LOAD')return{status:'success',scope:await load(await findDevelopmentScopeId({productId,featureId,feedbackId}))};
  if(!['PREPARE','REVISE','APPROVE','REJECT'].includes(operation))throw new DomainError('Choose a scope action.');
  const credential=resolveOperatorCredential(text('credential')),nonce=text('idempotencyKey');
  if(!/^[A-Za-z0-9:_-]{8,90}$/.test(nonce))throw new DomainError('A unique scope request key is required.');
  requireOperator(credential);
  const instructions=text('instructions').trim()||undefined;
  if(operation==='PREPARE'){
   // The confirmed proposal is derived on the server from the saved, signed conversation; the browser supplies only which thread.
   const source=await confirmedFeedbackSource({productId,featureId,feedbackId});
   const {scopeId}=await prepareDevelopmentScope({productId,featureId,feedbackId,confirmationEventId:source.binding.confirmationEventId,proposalDigest:source.binding.proposalDigest,credential,idempotencyKey:`${nonce}:prepare`,...(instructions?{instructions}:{})});
   return{status:'success',message:'Scope drafted. Review it before approving; nothing has been started.',scope:await load(scopeId)};
  }
  const scopeId=text('scopeId'),head={productId,featureId,scopeId,credential,expectedVersion:Number(text('version')),reviewedDigest:text('digest')};
  if(operation==='REVISE'){
   if(!instructions)throw new DomainError('Describe what the scope should change.');
   await reviseDevelopmentScope({...head,idempotencyKey:`${nonce}:revise`,instructions});
   return{status:'success',message:'Scope revised. Review the new version before approving.',scope:await load(scopeId)};
  }
  await decideDevelopmentScope({...head,idempotencyKey:`${nonce}:decide`,decision:operation==='APPROVE'?'APPROVED':'REJECTED',reason:text('reason')});
  return{status:'success',message:operation==='APPROVE'?'Scope approved. No tasks were created and no coding was started.':'Scope rejected. Its history is retained.',scope:await load(scopeId)};
 }catch(error){
  // Fixed codes only: never FormData, credentials or raw exceptions.
  console.warn('[development-scope]',{operation:['LOAD','PREPARE','REVISE','APPROVE','REJECT'].includes(operation)?operation:'UNKNOWN',code:error instanceof DomainError?error.code:'UNEXPECTED'});
  return{status:'error',message:error instanceof DomainError?error.message:'The scope request could not finish. Reload and try again; nothing was approved.'};
 }
}
