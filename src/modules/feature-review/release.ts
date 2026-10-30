import 'server-only';
import {db} from '@/lib/db';
import {getFeatureReview} from './service';
export type FeatureAcceptanceFact={featureId:string;title:string;status:string;acceptanceId:string|null;digest:string;commitSha:string;taskIds:string[]};
export async function releaseFeatureAcceptance(productId:string,tasks:{id:string;workItemId:string}[],sliceId?:string):Promise<FeatureAcceptanceFact[]>{
 const items=await db.workItem.findMany({where:{productId},select:{id:true,parentId:true,type:true,title:true,sliceId:true}}),byId=new Map(items.map(item=>[item.id,item])),ids=new Set<string>(),facts:FeatureAcceptanceFact[]=[];
 const featureOf=(start:string)=>{let item=byId.get(start);const visited=new Set<string>();while(item&&item.type!=='FEATURE'&&!visited.has(item.id)){visited.add(item.id);item=item.parentId?byId.get(item.parentId):undefined}return item?.type==='FEATURE'?item:undefined};
 for(const task of tasks){const feature=featureOf(task.workItemId);if(feature)ids.add(feature.id);else facts.push({featureId:`unmapped:${task.id}`,title:task.id,status:'UNMAPPED',acceptanceId:null,digest:'',commitSha:'',taskIds:[task.id]})}
 // Explicit slice membership is included even before implementation tasks exist.
 for(const item of items)if(sliceId&&item.sliceId===sliceId){const feature=featureOf(item.id);if(feature)ids.add(feature.id)}
 for(const feature of items.filter(item=>item.type==='FEATURE')){let parent=feature.parentId?byId.get(feature.parentId):undefined;const seen=new Set<string>();while(parent&&!seen.has(parent.id)){seen.add(parent.id);if(sliceId&&parent.sliceId===sliceId)ids.add(feature.id);parent=parent.parentId?byId.get(parent.parentId):undefined}}
 for(const id of [...ids].sort())try{const review=await getFeatureReview(productId,id),included=new Set(tasks.map(task=>task.id)),complete=review.manifest.taskIds.length>0&&review.manifest.taskIds.every(taskId=>included.has(taskId));facts.push({featureId:id,title:byId.get(id)!.title,status:complete?review.status:'INCOMPLETE_SCOPE',acceptanceId:review.acceptanceId,digest:review.digest,commitSha:review.manifest.build.commitSha,taskIds:review.manifest.taskIds})}catch{facts.push({featureId:id,title:byId.get(id)!.title,status:'UNAVAILABLE',acceptanceId:null,digest:'',commitSha:'',taskIds:tasks.filter(task=>featureOf(task.workItemId)?.id===id).map(task=>task.id)})}
 return facts;
}
