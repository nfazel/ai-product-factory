'use server';
import {headers} from 'next/headers';
import {getRuntimeReviewView,runtimeReviewWorkspaceId,type RuntimeReviewView} from '@/modules/verification/runtime-review-view';
import {approveRuntimeReview} from '@/modules/verification/runtime-review';
import {restoreCodingWorkspace} from '@/modules/coding/restore-workspace';
import {confirmLocalOperator,operatorConfirmationAvailable,resolveOperatorCredential} from '@/modules/feature-review/authorization';
import {getCurrentActor} from '@/modules/identity/actor';
import {DomainError} from '@/modules/shared/errors';

export type RuntimeReviewActionResult={status:'success'|'error';message?:string;review?:RuntimeReviewView};

/** Same protected check as the other decisions: skipped only through the proof-of-concept switch, never by the browser. */
function requireOperator(credential:string){
 if(!operatorConfirmationAvailable())throw new DomainError('Protected operator confirmation is unavailable. Ask the local operator to configure it before making this decision.');
 try{confirmLocalOperator(credential)}catch{throw new DomainError('Local operator confirmation was not accepted. Use the credential for this environment; nothing was changed.')}
}

/** Shows what verification would run and records a person's review of it. It never starts verification. */
export async function runtimeReviewAction(data:FormData):Promise<RuntimeReviewActionResult>{
 const text=(name:string)=>{const value=data.get(name);return typeof value==='string'?value:''};
 const productId=text('productId'),taskId=text('taskId');let operation='';
 try{
  const h=await headers(),origin=new URL(h.get('origin')??'');
  if(!['http:','https:'].includes(origin.protocol)||origin.host!==h.get('host')||(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))return{status:'error',message:'Open this workspace on localhost or a secure same-origin connection.'};
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(productId)||!/^[A-Za-z0-9_-]{8,64}$/.test(taskId))throw new DomainError('Choose a task first.');
  operation=text('operation');
  if(operation==='LOAD')return{status:'success',review:await getRuntimeReviewView(productId,taskId)};
  if(operation==='RESTORE'){
   // Rebuilds the folder from the commit a person approved. It decides nothing, so it needs no credential, only a click.
   const {workspaceId}=await runtimeReviewWorkspaceId(productId,taskId);
   if(!workspaceId)throw new DomainError('This task has no saved coding workspace to restore.');
   await restoreCodingWorkspace(productId,workspaceId);
   return{status:'success',message:'The working copy was rebuilt exactly at the approved commit. Review what will be run below.',review:await getRuntimeReviewView(productId,taskId)};
  }
  if(operation!=='APPROVE')throw new DomainError('Choose a review action.');
  if(text('reviewed')!=='yes')throw new DomainError('Confirm that you have read what will be run.');
  const reason=text('reason').trim();
  if(reason.length<12||reason.length>2000)throw new DomainError('Say in a sentence or two why you are comfortable approving this (at least 12 characters).');
  const credential=resolveOperatorCredential(text('credential'));requireOperator(credential);
  const {workspaceId}=await runtimeReviewWorkspaceId(productId,taskId);
  if(!workspaceId)throw new DomainError('This task has no saved coding workspace to review.');
  const runAgainstApp=data.getAll('runAgainstApp').filter((item):item is string=>typeof item==='string');
  if(runAgainstApp.length>5)throw new DomainError('Choose at most five commands.');
  // Each value is `<command>|<criterion id>`; the server validates both against the signed manifest, never the browser's say-so.
  const coverage=data.getAll('proves').flatMap(item=>{if(typeof item!=='string')return [];const at=item.lastIndexOf('|');return at>0?[{command:item.slice(0,at),criterionId:item.slice(at+1)}]:[]});
  if(coverage.length>20)throw new DomainError('Too many links between tests and criteria.');
  const actor=getCurrentActor();
  await approveRuntimeReview({productId,workspaceId,digest:text('digest'),credential,actor:{id:actor.id,name:actor.name},reason,runAgainstApp,coverage});
  return{status:'success',message:'Runtime review approved. Nothing has been run and the task has not been judged.',review:await getRuntimeReviewView(productId,taskId)};
 }catch(error){
  console.warn('[runtime-review]',{operation:['LOAD','APPROVE','RESTORE'].includes(operation)?operation:'UNKNOWN',code:error instanceof DomainError?error.code:'UNEXPECTED'});
  return{status:'error',message:error instanceof DomainError?error.message:'The runtime review could not finish. Reload and try again; nothing was approved.'};
 }
}
