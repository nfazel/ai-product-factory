import {z} from 'zod';
const text=z.string().trim().min(1).max(4000);
export const analysisSchema=z.object({
 status:z.enum(['CLARIFICATION','PROPOSAL']),
 classification:z.enum(['DEFECT','IMPROVEMENT','REQUIREMENT_CHANGE','NEW_FEATURE']),
 intendedOutcome:text,
 interpretation:text,
 scope:z.enum(['CURRENT_FEATURE','SEPARATE_BACKLOG_FEATURE']),
 scopeReason:text,
 questions:z.array(z.object({id:z.string().min(1).max(100),text})).max(3),
 proposal:z.object({summary:text,changes:z.array(text).min(1).max(20),unchanged:z.array(text).min(1).max(20),affectedRequirementIds:z.array(z.string().min(1).max(200)).max(100),acceptanceCriteria:z.array(text).min(1).max(20)}).nullable(),
}).strict().superRefine((value,ctx)=>{
 if(value.status==='PROPOSAL'&&(!value.proposal||value.questions.length))ctx.addIssue({code:'custom',message:'A proposal requires actionable changes without outstanding questions.'});
 if(value.status==='CLARIFICATION'&&(value.proposal||!value.questions.length))ctx.addIssue({code:'custom',message:'Clarification requires concise questions and no proposal.'});
 if(new Set(value.questions.map(q=>q.id)).size!==value.questions.length)ctx.addIssue({code:'custom',message:'Question identities must be distinct.'});
 if(value.classification==='NEW_FEATURE'&&value.scope!=='SEPARATE_BACKLOG_FEATURE')ctx.addIssue({code:'custom',message:'New features require separate backlog scope.'});
});
export type FeedbackAnalysis=z.infer<typeof analysisSchema>;
