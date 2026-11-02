import {canonicalJson,contentHash} from '@/modules/coding/external-manifest';
import {designSchema,type Design} from './schema';
export type DesignVersion={runId:string;version:number;createdAt:string;digest:string;design:Design;instructions:string;approved:boolean};
export type DesignState={versions:DesignVersion[];current:DesignVersion|null;status:'NONE'|'DRAFT'|'APPROVED'};
type Run={id:string;createdAt:Date|string;input:unknown;output:unknown};
type Approval={status:string;comments:string};
export const designDigest=(design:Design)=>contentHash(canonicalJson(design));
export const approvalComment=(runId:string,digest:string)=>`UI design run ${runId}; digest ${digest}. Screens only; no coding authority.`;
const COMMENT=/UI design run (\S+); digest ([a-f0-9]{64})\./;
/** Versions are the completed design runs whose output still matches the schema, oldest first. */
export function designStateFrom(runs:Run[],approvals:Approval[]):DesignState{
 const versions:DesignVersion[]=[];
 const isApproved=(runId:string,digest:string)=>approvals.some(a=>{const m=COMMENT.exec(a.comments);return a.status==='APPROVED'&&m?.[1]===runId&&m?.[2]===digest});
 for(const run of [...runs].sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime())){
  const parsed=designSchema.safeParse((run.output as {design?:unknown}|null)?.design);if(!parsed.success)continue;
  const instructions=typeof (run.input as {instructions?:unknown}|null)?.instructions==='string'?(run.input as {instructions:string}).instructions:'';
  const digest=designDigest(parsed.data);
  versions.push({runId:run.id,version:versions.length+1,createdAt:new Date(run.createdAt).toISOString(),digest,design:parsed.data,instructions,approved:isApproved(run.id,digest)});
 }
 const current=versions.at(-1)??null;
 // Only an approval for this exact run and content counts; a later version starts as a draft again.
 return{versions,current,status:current?(current.approved?'APPROVED':'DRAFT'):'NONE'};
}
