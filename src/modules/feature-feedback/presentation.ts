import type {getFeedback,listFeedback} from './service';
import {analysisSchema,type FeedbackAnalysis} from './schema';
export type ConversationView={id:string;originalText:string;status:string;revision:number;digest:string;confirmed:boolean;contextStatus:'CURRENT'|'STALE'|'UNAVAILABLE'|null;events:{id:string;revision:number;type:string;text:string;analysis:FeedbackAnalysis|null;affectedRequirements:{id:string;text:string}[];actor:string;at:string;version:string;reviewedRevision:number|null}[]};
export type ConversationList={items:{id:string;text:string;at:string}[];nextCursor:string|null};
export type FeedbackActionResult={status:'success'|'error';message?:string;conversation?:ConversationView;conversations?:ConversationList};
export function conversationView(value:Awaited<ReturnType<typeof getFeedback>>):ConversationView{
 return {id:value.id,originalText:value.originalText,status:value.status,revision:value.revision,digest:value.digest,confirmed:value.confirmed,contextStatus:value.contextStatus,events:value.events.map(event=>{
  const payload=event.payload as {text?:unknown;analysis?:unknown;reviewedRevision?:number},parsed=event.type==='AI_ANALYSIS'?analysisSchema.safeParse(payload.analysis):null,analysis=parsed?.success?parsed.data:null,context=event.context as {build?:{commitSha?:string};requirements?:{id:string;description:string}[]};
  return{id:event.id,revision:event.revision,type:event.type,text:typeof payload.text==='string'?payload.text:'',analysis,affectedRequirements:(analysis?.proposal?.affectedRequirementIds??[]).map(id=>({id,text:context.requirements?.find(r=>r.id===id)?.description??id})),actor:event.actorName,at:event.createdAt.toISOString(),version:context.build?.commitSha||'No implementation snapshot',reviewedRevision:payload.reviewedRevision??null};
 })};
}
export function conversationList(value:Awaited<ReturnType<typeof listFeedback>>):ConversationList{return {items:value.items.map(item=>({id:item.id,text:item.originalText.slice(0,160),at:item.createdAt.toISOString()})),nextCursor:value.nextCursor}}
