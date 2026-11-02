'use server';
import {headers} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {recordFeatureReview} from '@/modules/feature-review/service';
import {resolveOperatorCredential} from '@/modules/feature-review/authorization';
import type {ActionState} from '@/lib/action-state';
import {DomainError} from '@/modules/shared/errors';
export async function featureReviewAction(_previous:ActionState,data:FormData):Promise<ActionState>{
 try{
  const requestHeaders=await headers(),origin=new URL(requestHeaders.get('origin')??'');
  if(!['http:','https:'].includes(origin.protocol)||origin.host!==requestHeaders.get('host')||(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))return{status:'error',message:'Operator confirmation requires the local workspace or a secure same-origin connection.'};
  const text=(key:string)=>{const value=data.get(key);return typeof value==='string'?value:''};
  const decision=text('decision');
  if(!['ACCEPTED','DEFERRED'].includes(decision))return{status:'error',message:'Choose Accept Feature or Review Later.'};
  const productId=text('productId'),featureId=text('featureId');
  if(!productId||!featureId)return{status:'error',message:'The feature could not be identified.'};
  const outcome=await recordFeatureReview({productId,featureId,decision:decision as 'ACCEPTED'|'DEFERRED',reviewedDigest:text('digest'),idempotencyKey:text('idempotencyKey'),credential:resolveOperatorCredential(text('credential')),acknowledgedConcerns:data.getAll('concern').filter((value):value is string=>typeof value==='string'),reason:text('reason')});
  revalidatePath(`/products/${productId}/build`);revalidatePath(`/products/${productId}/releases`);
  if(decision==='ACCEPTED'&&outcome.review.status!=='ACCEPTED')return{status:'error',message:'The earlier decision is retained, but current feature acceptance requires a fresh review.'};
  return{status:'success',message:decision==='ACCEPTED'?'Feature acceptance recorded for the reviewed version.':'Review deferred. Work on other features can continue.'};
 }catch(error){return{status:'error',message:error instanceof DomainError?error.message:'The review could not be recorded. Check operator confirmation and current eligibility, then retry.'}}
}
