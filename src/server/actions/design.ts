'use server';
import {headers} from 'next/headers';
import {approveDesign,createDesign,getDesignState,reviseDesign} from '@/modules/design/service';
import {designView,type DesignView} from '@/modules/design/presentation';
import {findCurrentBrief} from '@/modules/discovery/repository';
import {platformSummary,readTargetPlatforms} from '@/modules/discovery/platform';
import {DomainError} from '@/modules/shared/errors';

export type DesignActionResult={status:'success'|'error';message?:string;design?:DesignView};

/** Drafts, revises and approves screen designs. Approval authorises screens only: no tasks, coding or acceptance. */
export async function designAction(data:FormData):Promise<DesignActionResult>{
 const text=(name:string)=>{const value=data.get(name);return typeof value==='string'?value:''};
 const productId=text('productId');let operation='';
 try{
  const h=await headers(),origin=new URL(h.get('origin')??'');
  if(!['http:','https:'].includes(origin.protocol)||origin.host!==h.get('host')||(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))return{status:'error',message:'Open this workspace on localhost or a secure same-origin connection.'};
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(productId))throw new DomainError('Choose a product first.');
  operation=text('operation');
  const load=async()=>{const [state,brief]=await Promise.all([getDesignState(productId),findCurrentBrief(productId)]);return designView(state,platformSummary(readTargetPlatforms(brief?.constraints??[])))};
  if(operation==='LOAD')return{status:'success',design:await load()};
  if(operation==='GENERATE'){await createDesign(productId);return{status:'success',message:'Design drafted. Review it, ask for changes, and approve it when you are happy. Nothing has been built.',design:await load()}}
  if(operation==='REVISE'){await reviseDesign({productId,previousRunId:text('runId'),instructions:text('instructions')});const design=await load();return{status:'success',message:`Design updated to version ${design.current?.version}. Review what changed.`,design}}
  if(operation==='APPROVE'){
   if(text('reviewed')!=='yes')throw new DomainError('Confirm that you have looked at every screen.');
   await approveDesign({productId,runId:text('runId'),digest:text('digest')});
   return{status:'success',message:'Design approved. It will guide the scope and tasks you create next; no code has been written.',design:await load()};
  }
  throw new DomainError('Choose a design action.');
 }catch(error){
  console.warn('[design]',{operation:['LOAD','GENERATE','REVISE','APPROVE'].includes(operation)?operation:'UNKNOWN',code:error instanceof DomainError?error.code:'UNEXPECTED'});
  return{status:'error',message:error instanceof DomainError?error.message:'The design request could not finish. Try again; nothing was approved.'};
 }
}
