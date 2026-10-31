import {z} from 'zod';
const text=z.string().trim().min(1).max(4000);
const list=z.array(text).max(40);
export const scopeContentSchema=z.object({
 classification:z.enum(['DEFECT','ENHANCEMENT','REQUIREMENT_CHANGE','NEW_FEATURE']),
 summary:text,changes:list.min(1),preserve:list.min(1),exclusions:list.min(1),
 affectedBehaviour:list.min(1),additionalAcceptanceCriteria:list,
 affectedRequirementIds:z.array(z.string().min(1).max(200)).max(100),
 requirementsRequiringApproval:list,assumptions:list,unresolvedQuestions:list,
 separateFeature:z.boolean(),separateFeatureReason:z.string().max(4000),
 dependencies:list,
 behaviouralTests:z.array(z.object({behaviour:text,method:text,expected:text}).strict()).min(1).max(40),
 risks:z.object({architecture:list,authentication:list,data:list,security:list,platformPermissions:list}).strict(),
}).strict().superRefine((value,ctx)=>{
 if(value.classification==='NEW_FEATURE'&&(!value.separateFeature||!value.separateFeatureReason.trim()))ctx.addIssue({code:'custom',message:'New features require separate feature scope and rationale.'});
 if(value.classification==='REQUIREMENT_CHANGE'&&!value.requirementsRequiringApproval.length)ctx.addIssue({code:'custom',message:'Requirement changes must identify separate requirements approval.'});
});
export type ScopeContent=z.infer<typeof scopeContentSchema>;
