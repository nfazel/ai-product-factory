import "server-only";

import {executeAgent} from "@/modules/agent/service";
import {requestApproval,resolveApproval} from "@/modules/approval/service";
import {DomainError} from "@/modules/shared/errors";
import {getDesignState} from "./read";
import {approvalComment} from "./state";

export {approvedDesignReference,getDesignState} from "./read";

const locks=new Map<string,Promise<unknown>>();
async function exclusive<T>(productId:string,work:()=>Promise<T>):Promise<T>{
 const previous=locks.get(productId)??Promise.resolve(),next=previous.catch(()=>undefined).then(work);locks.set(productId,next);
 try{return await next}finally{if(locks.get(productId)===next)locks.delete(productId)}
}

/** First proposal for a product. Later changes go through reviseDesign so nothing is silently replaced. */
export function createDesign(productId:string){
 return exclusive(productId,async()=>{
  if((await getDesignState(productId)).current)throw new DomainError("A design already exists. Ask for changes to it instead.");
  await executeAgent({productId,agentType:"UX_DESIGN",input:{mode:"CREATE"}});
  return getDesignState(productId);
 });
}

export function reviseDesign(input:{productId:string;previousRunId:string;instructions:string}){
 return exclusive(input.productId,async()=>{
  const instructions=input.instructions.trim();
  if(!instructions||instructions.length>4000)throw new DomainError("Describe the change in 1–4000 characters.");
  const current=(await getDesignState(input.productId)).current;
  if(!current)throw new DomainError("There is no design to change yet.");
  if(current.runId!==input.previousRunId)throw new DomainError("The design changed; review the latest version.","CONFLICT");
  await executeAgent({productId:input.productId,agentType:"UX_DESIGN",input:{mode:"REVISE",previousRunId:current.runId,instructions}});
  return getDesignState(input.productId);
 });
}

/** Records the person's decision on this exact version. It authorises screens only: no tasks, coding or acceptance. */
export function approveDesign(input:{productId:string;runId:string;digest:string}){
 return exclusive(input.productId,async()=>{
  const state=await getDesignState(input.productId),current=state.current;
  if(!current)throw new DomainError("There is no design to approve yet.");
  if(current.runId!==input.runId||current.digest!==input.digest)throw new DomainError("The design changed; review the latest version.","CONFLICT");
  if(state.status==="APPROVED")throw new DomainError("This version is already approved.");
  const comment=approvalComment(current.runId,current.digest);
  const approval=await requestApproval({productId:input.productId,approvalType:"UI_DESIGN",comments:comment});
  await resolveApproval(approval.id,"APPROVED",{comments:comment});
  return getDesignState(input.productId);
 });
}
