import {manifestRuntimes,type RuntimeManifest} from './runtime-manifest';
/** What a person is agreeing to, in plain words. Pure: no database, no filesystem. */
export type RuntimeReviewSummary={
 commit:string;files:number;
 codeApprovedBy:string;codeApprovedAt:string;
 planVersion:number;planApprovedBy:string;planApprovedAt:string;planSummary:string;
 checks:{command:string;howItRuns:string}[];
 criteria:string[];
 /** Tests a person has stated prove a criterion, in plain words. */
 proves:{command:string;criterion:string}[];
};
const HOW='Starts the app and a throwaway database in isolated containers, then runs this command against them.';
export function describeRuntimeManifest(manifest:RuntimeManifest):RuntimeReviewSummary{
 let checks:{command:string;howItRuns:string}[]=[];
 try{checks=[...manifestRuntimes(manifest).keys()].map(command=>({command,howItRuns:HOW}))}catch{/* malformed metadata is rejected when the review is prepared */}
 const content=manifest.plan.content as {summary?:unknown}|null;
 return{
  commit:manifest.commitSha,files:manifest.files.length,
  codeApprovedBy:manifest.codeApproval.approvedBy,codeApprovedAt:manifest.codeApproval.resolvedAt,
  planVersion:manifest.plan.version,planApprovedBy:manifest.plan.approvedBy,planApprovedAt:manifest.plan.approvedAt,
  planSummary:typeof content?.summary==='string'?content.summary.slice(0,600):'',
  checks,criteria:manifest.criteria.map(c=>c.description),
  proves:(manifest.reviewerCoverage??[]).map(link=>({command:link.command,criterion:manifest.criteria.find(c=>c.id===link.criterionId)?.description??link.criterionId})),
 };
}
