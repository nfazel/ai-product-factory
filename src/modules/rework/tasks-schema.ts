import {z} from 'zod';
import type {ScopeManifest} from '@/modules/development-scope/service';
const text=z.string().trim().min(1).max(4000),ids=z.array(z.string().min(1)).max(100);
export const reworkTaskSchema=z.object({workItemId:z.string().min(1),title:text,description:text,objective:text,guidance:text,validation:text,risks:z.string().max(4000),filesLikely:text,criterionIds:ids.min(1),dependsOn:ids.default([]),componentIds:ids.default([])}).strict();
export const taskList=z.array(reworkTaskSchema).min(1).max(20);
export type AllowedReferences={workItemIds:string[];criterionIds:string[];componentIds:string[];originalTaskIds:string[]};
/** Per-request schema: unknown references become repairable schema issues that name the allowed ids, instead of a late hard failure. */
export function reworkTasksFor(allowed:AllowedReferences){
 const hint=(list:string[])=>list.length?`Use only: ${list.slice(0,12).join(', ')}.`:'Use an empty list.';
 return z.object({tasks:taskList}).superRefine((value,ctx)=>value.tasks.forEach((task,index)=>{
  const check=(field:'workItemId'|'criterionIds'|'componentIds'|'dependsOn',bad:boolean,known:string[],label:string)=>{if(bad)ctx.addIssue({code:'custom',path:['tasks',index,field],message:`Unknown ${label}. ${hint(known)}`})};
  check('workItemId',!allowed.workItemIds.includes(task.workItemId),allowed.workItemIds,'work item');
  check('criterionIds',task.criterionIds.some(id=>!allowed.criterionIds.includes(id)),allowed.criterionIds,'requirement');
  check('componentIds',task.componentIds.some(id=>!allowed.componentIds.includes(id)),allowed.componentIds,'component');
  check('dependsOn',task.dependsOn.some(id=>!allowed.originalTaskIds.includes(id)),allowed.originalTaskIds,'task');
 }));
}
/** Plain-language reasons a scope cannot yet become development tasks (requirements must stay unchanged). */
export function unchangedIssues(m:ScopeManifest){
 const c=m.content,reasons:string[]=[];
 if(!['DEFECT','ENHANCEMENT'].includes(c.classification))reasons.push('This change is a new feature or a requirement change. For now, development tasks can only be created for fixes and enhancements that keep approved requirements unchanged.');
 if(c.separateFeature)reasons.push('The scope recommends building this as a separate feature.');
 if(c.requirementsRequiringApproval.length)reasons.push('The scope needs changes to approved requirements, which must be approved separately first.');
 if(c.additionalAcceptanceCriteria.length)reasons.push('The scope adds new acceptance criteria, which would change approved requirements. Revise the scope so those checks are written as tests instead.');
 if(c.unresolvedQuestions.length)reasons.push('The scope still has unresolved questions.');
 return reasons;
}
