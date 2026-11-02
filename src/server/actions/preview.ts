'use server';
import {headers} from 'next/headers';
import {getPreviewStatus,startPreview,stopPreview} from '@/modules/preview/service';
import type {PreviewView} from '@/modules/preview/helpers';
import {DomainError} from '@/modules/shared/errors';

export type PreviewActionResult={status:'success'|'error';message?:string;preview?:PreviewView};

/** Starts, stops and reports on a private, throwaway copy of the product. It grants no approval and changes no product data. */
export async function previewAction(data:FormData):Promise<PreviewActionResult>{
 const text=(name:string)=>{const value=data.get(name);return typeof value==='string'?value:''};
 const productId=text('productId');let operation='';
 try{
  const h=await headers(),origin=new URL(h.get('origin')??'');
  if(!['http:','https:'].includes(origin.protocol)||origin.host!==h.get('host')||(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))return{status:'error',message:'Open this workspace on localhost or a secure same-origin connection.'};
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(productId))throw new DomainError('Choose a product first.');
  operation=text('operation');
  if(operation==='STATUS')return{status:'success',preview:await getPreviewStatus(productId)};
  if(operation==='START')return{status:'success',message:'Preview started. Sign up with test details; this copy is private and its data is thrown away.',preview:await startPreview(productId)};
  if(operation==='STOP')return{status:'success',message:'Preview stopped and its test data removed.',preview:await stopPreview(productId)};
  throw new DomainError('Choose a preview action.');
 }catch(error){
  console.warn('[preview]',{operation:['STATUS','START','STOP'].includes(operation)?operation:'UNKNOWN',code:error instanceof DomainError?error.code:'UNEXPECTED'});
  return{status:'error',message:error instanceof DomainError?error.message:'The preview request could not finish. Try again; nothing in your product was changed.'};
 }
}
