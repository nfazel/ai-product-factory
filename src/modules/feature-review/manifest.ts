import {canonicalJson,contentHash} from '@/modules/coding/external-manifest';

export type Requirement={id:string;workItemId:string;description:string};
export type ReviewScopeItem={id:string;parentId:string|null;type:string;title:string;description:string;userNeed:string;userValue:string;status:string;archivedAt:string|null};
export type TechnicalFact={taskId:string;taskStatus:string;sessionId:string;commitSha:string;verdict:string;fingerprint:string;approvalIds:string[];authorityDigest:string;current:boolean;criteria:string[];mandatoryPassed:boolean;concerns:{id:string;text:string}[]};
export type FeatureReviewManifest={kind:'FEATURE_REVIEW_MANIFEST';version:1;observation?:{unavailable:boolean;changed:boolean;reasons:string[]};productId:string;featureId:string;productActive:boolean;productArchived:boolean;requirementsApproved:boolean;definitionIdentity:string;scope:ReviewScopeItem[];requirements:Requirement[];taskIds:string[];build:{repositoryId:string;commitSha:string;tree:string;clean:boolean;available:boolean};technical:TechnicalFact[];blockingIssues:string[]};
export const featureManifestDigest=(manifest:FeatureReviewManifest)=>{const {observation,...bound}=manifest;void observation;return contentHash(canonicalJson(bound))};
export function knownFeatureChange(previous:FeatureReviewManifest,current:FeatureReviewManifest){
 if(current.observation?.changed)return true;
 const fields=['productId','featureId','productActive','productArchived','requirementsApproved','definitionIdentity','scope','requirements','taskIds','blockingIssues'] as const;
 if(fields.some(key=>canonicalJson(previous[key])!==canonicalJson(current[key])))return true;
 if(previous.build.repositoryId!==current.build.repositoryId)return true;
 if(current.build.available&&canonicalJson(previous.build)!==canonicalJson(current.build))return true;
 return canonicalJson(previous.technical)!==canonicalJson(current.technical.map((fact,index)=>({...fact,current:previous.technical[index]?.current??fact.current})));
}
export function reviewEligibility(manifest:FeatureReviewManifest){
 const blockers=[...manifest.blockingIssues];
 if(manifest.observation?.unavailable)blockers.push('Technical authority is temporarily unavailable; retry before accepting or releasing.');
 if(!manifest.productActive)blockers.push('The product is archived or inactive.');
 if(!manifest.requirementsApproved)blockers.push('Current approved requirements are required.');
 if(!manifest.scope.length||manifest.scope[0].id!==manifest.featureId||manifest.scope[0].type!=='FEATURE')blockers.push('Review must cover one complete feature.');
 if(manifest.scope.some(item=>item.archivedAt))blockers.push('Archived feature scope cannot be accepted.');
 if(manifest.scope.some(item=>item.type!=='DEFECT'&&(item.status==='DRAFT'||item.status==='BLOCKED')))blockers.push('Feature scope contains unapproved or blocked work.');
 if(!manifest.requirements.length)blockers.push('The feature has no approved acceptance criteria.');
 if(!manifest.taskIds.length)blockers.push('The feature has no approved implementation tasks.');
 if(!manifest.build.available||!manifest.build.clean||!/^[a-f0-9]{40}$/.test(manifest.build.commitSha)||!/^[a-f0-9]{40}$/.test(manifest.build.tree))blockers.push('An exact clean application build snapshot is required.');
 const valid=manifest.technical.filter(fact=>fact.current&&fact.taskStatus==='COMPLETED'&&fact.mandatoryPassed&&['PASS','PASS_WITH_CONCERNS'].includes(fact.verdict)&&fact.commitSha===manifest.build.commitSha);
 for(const id of manifest.taskIds)if(!valid.some(fact=>fact.taskId===id))blockers.push(`Implementation task ${id} lacks current independently approved verification at this application version.`);
 const covered=new Set(valid.flatMap(fact=>fact.criteria));
 for(const requirement of manifest.requirements)if(!covered.has(requirement.id))blockers.push(`Feature requirement ${requirement.id} lacks independent behavioural evidence.`);
 const concerns=[...new Map(valid.flatMap(fact=>fact.concerns).map(concern=>[concern.id,concern])).values()].sort((a,b)=>a.id.localeCompare(b.id));
 return {eligible:blockers.length===0,blockers:[...new Set(blockers)].sort(),concerns};
}
/** Stable order is defined by the domain, never by caller-supplied manifest JSON. */
export function featureScope(featureId:string,items:ReviewScopeItem[]){
 const byId=new Map(items.map(item=>[item.id,item]));const root=byId.get(featureId);
 if(!root||root.type!=='FEATURE')throw new Error('Feature not found in this product.');
 const result=[root],visited=new Set([root.id]);
 for(let index=0;index<result.length;index++)for(const child of items.filter(item=>item.parentId===result[index].id).sort((a,b)=>a.id.localeCompare(b.id))){if(visited.has(child.id))throw new Error('Invalid feature hierarchy.');if(child.type==='FEATURE')throw new Error('Nested feature scope requires explicit modelling before acceptance.');visited.add(child.id);result.push(child)}
 return result;
}
