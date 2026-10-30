import type {FeatureAcceptanceFact} from './release';
export function featureAcceptanceBlockers(facts:{tasks:{id:string}[];featureAcceptance?:FeatureAcceptanceFact[]}){
 const rows=facts.featureAcceptance??[],blockers:string[]=[];
 if(facts.tasks.length&&!rows.length)blockers.push('Human feature acceptance has not been established for this release scope.');
 for(const row of rows)if(row.status!=='ACCEPTED'||!row.acceptanceId||!/^[a-f0-9]{64}$/.test(row.digest)||!/^[a-f0-9]{40}$/.test(row.commitSha)||!row.taskIds.length)blockers.push(`Feature "${row.title}" requires current human acceptance (${row.status.toLowerCase().replaceAll('_',' ')}).`);
 for(const task of facts.tasks)if(!rows.some(row=>row.taskIds.includes(task.id)))blockers.push(`Implementation task ${task.id} is not covered by an accepted complete feature.`);
 return blockers;
}
export function releaseScopeChanged(items:{type:string;implementationTaskId:string|null;workItemId?:string|null}[],tasks:{id:string}[],features?:FeatureAcceptanceFact[]){const previous=items.filter(item=>item.type==='IMPLEMENTATION_TASK').map(item=>item.implementationTaskId).filter((id):id is string=>Boolean(id)).sort();const previousFeatures=items.filter(item=>item.type==='FEATURE'&&item.workItemId).map(item=>item.workItemId!).sort();return (previous.length>0&&JSON.stringify(previous)!==JSON.stringify(tasks.map(task=>task.id).sort()))||Boolean(features&&previousFeatures.length&&JSON.stringify([...new Set(previousFeatures)])!==JSON.stringify(features.map(feature=>feature.featureId).sort()))}

export function candidateFeatureBlockers(candidate:{items:{type:string;implementationTaskId:string|null;workItemId?:string|null}[]},facts:{tasks:{id:string}[];featureAcceptance?:FeatureAcceptanceFact[]}){return [...featureAcceptanceBlockers(facts),...(releaseScopeChanged(candidate.items,facts.tasks,facts.featureAcceptance)?['Release scope changed; create a new candidate after review.']:[])]}
