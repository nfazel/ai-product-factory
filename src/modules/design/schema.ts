import {z} from 'zod';
import {unsafeHtmlReasons} from './html';
const text=(max:number)=>z.string().trim().min(1).max(max);
const screenId=z.string().regex(/^[a-z][a-z0-9-]{0,40}$/,'Use a short lowercase id such as sign-up.');
export const screenSchema=z.object({
 id:screenId,
 name:text(80),
 purpose:text(400),
 features:z.array(text(120)).max(6),
 elements:z.array(text(160)).min(1).max(12),
 actions:z.array(text(160)).max(8),
 html:z.string().min(40).max(7000),
}).strict().superRefine((screen,ctx)=>{for(const reason of unsafeHtmlReasons(screen.html))ctx.addIssue({code:'custom',path:['html'],message:reason})});
export const designSchema=z.object({
 summary:text(1200),
 principles:z.array(text(200)).min(1).max(6),
 screens:z.array(screenSchema).min(1).max(8),
 flow:z.array(z.object({from:screenId,to:screenId,label:text(120)}).strict()).max(20),
 openQuestions:z.array(text(300)).max(6),
 changeNote:text(600),
}).strict().superRefine((design,ctx)=>{
 const ids=design.screens.map(screen=>screen.id);
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',path:['screens'],message:'Screen ids must be distinct.'});
 design.flow.forEach((step,index)=>{for(const end of ['from','to'] as const)if(!ids.includes(step[end]))ctx.addIssue({code:'custom',path:['flow',index,end],message:`Unknown screen. Use only: ${ids.join(', ')}.`})});
});
export type Design=z.infer<typeof designSchema>;
export type Screen=z.infer<typeof screenSchema>;
