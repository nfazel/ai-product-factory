import 'server-only';
import {db} from '@/lib/db';
import {getFeatureReview} from './service';
import {recentAcceptance,GUIDANCE_TTL_MS,GUIDANCE_STALE_MS} from './acceptance-cache';
export type FeatureAcceptanceFact={featureId:string;title:string;status:string;acceptanceId:string|null;digest:string;commitSha:string;taskIds:string[];/** Whether the feature can be accepted now. Guidance only; the decision re-checks everything. */eligible?:boolean};
export async function releaseFeatureAcceptance(productId:string,tasks:{id:string;workItemId:string}[],sliceId?:string):Promise<FeatureAcceptanceFact[]>{
 const items=await db.workItem.findMany({where:{productId},select:{id:true,parentId:true,type:true,title:true,sliceId:true}}),byId=new Map(items.map(item=>[item.id,item])),ids=new Set<string>(),facts:FeatureAcceptanceFact[]=[];
 const featureOf=(start:string)=>{let item=byId.get(start);const visited=new Set<string>();while(item&&item.type!=='FEATURE'&&!visited.has(item.id)){visited.add(item.id);item=item.parentId?byId.get(item.parentId):undefined}return item?.type==='FEATURE'?item:undefined};
 for(const task of tasks){const feature=featureOf(task.workItemId);if(feature)ids.add(feature.id);else facts.push({featureId:`unmapped:${task.id}`,title:task.id,status:'UNMAPPED',acceptanceId:null,digest:'',commitSha:'',taskIds:[task.id]})}
 // Explicit slice membership is included even before implementation tasks exist.
 for(const item of items)if(sliceId&&item.sliceId===sliceId){const feature=featureOf(item.id);if(feature)ids.add(feature.id)}
 for(const feature of items.filter(item=>item.type==='FEATURE')){let parent=feature.parentId?byId.get(feature.parentId):undefined;const seen=new Set<string>();while(parent&&!seen.has(parent.id)){seen.add(parent.id);if(sliceId&&parent.sliceId===sliceId)ids.add(feature.id);parent=parent.parentId?byId.get(parent.parentId):undefined}}
 for(const id of [...ids].sort())try{const review=await getFeatureReview(productId,id),included=new Set(tasks.map(task=>task.id)),complete=review.manifest.taskIds.length>0&&review.manifest.taskIds.every(taskId=>included.has(taskId));facts.push({featureId:id,title:byId.get(id)!.title,status:complete?review.status:'INCOMPLETE_SCOPE',acceptanceId:review.acceptanceId,digest:review.digest,commitSha:review.manifest.build.commitSha,taskIds:review.manifest.taskIds,eligible:review.eligible})}catch{facts.push({featureId:id,title:byId.get(id)!.title,status:'UNAVAILABLE',acceptanceId:null,digest:'',commitSha:'',taskIds:tasks.filter(task=>featureOf(task.workItemId)?.id===id).map(task=>task.id)})}
 return facts;
}

/**
 * For on-screen guidance only. Working out every feature's acceptance reads Git and verification records and takes many
 * seconds, and every page of a product asks for it. A recent answer is reused, a slightly older one is shown at once while
 * a fresh one is worked out in the background, and identical concurrent requests share one run. Recording a feature decision
 * clears it. Release decisions call `releaseFeatureAcceptance` directly and are never served from here.
 */
export function guidanceFeatureAcceptance(productId:string,tasks:{id:string;workItemId:string}[],sliceId?:string){
 const key=`${productId}\0${sliceId??''}\0${tasks.map(task=>`${task.id}:${task.workItemId}`).sort().join(',')}`,now=Date.now(),known=recentAcceptance.get(key);
 const compute=()=>{
  const promise=releaseFeatureAcceptance(productId,tasks,sliceId),entry={at:Date.now(),promise,refreshing:false};
  recentAcceptance.set(key,entry);
  promise.catch(()=>{if(recentAcceptance.get(key)===entry)recentAcceptance.delete(key)});
  return promise;
 };
 if(known){
  const age=now-known.at;
  if(age<GUIDANCE_TTL_MS)return known.promise as Promise<FeatureAcceptanceFact[]>;
  if(age<GUIDANCE_STALE_MS){
   if(!known.refreshing){known.refreshing=true;const fresh=releaseFeatureAcceptance(productId,tasks,sliceId);fresh.then(()=>{recentAcceptance.set(key,{at:Date.now(),promise:fresh,refreshing:false})},()=>{known.refreshing=false})}
   return known.promise as Promise<FeatureAcceptanceFact[]>;
  }
 }
 for(const [other,entry] of recentAcceptance)if(now-entry.at>=GUIDANCE_STALE_MS*4)recentAcceptance.delete(other);
 return compute();
}
