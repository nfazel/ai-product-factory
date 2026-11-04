import {failureClassForEscalation} from '@/modules/verification/failure';
import 'server-only';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {Prisma} from '@/generated/prisma/client';
import {db} from '@/lib/db';
import {childEnv} from '@/modules/coding/git';
import {canonicalJson,contentHash} from '@/modules/coding/external-manifest';
import {verificationEntryBlockers} from '@/modules/verification/gates';
import {inspectSessionRuntimeBinding} from '@/modules/verification/runtime-review';
import {VERIFICATION_EVIDENCE_INCLUDE,verificationApprovalIsCurrent,verificationEvidenceFingerprint} from '@/modules/verification/integrity';
import {bindingFromState} from '@/modules/verification/runtime-manifest';
import {featureScope,type FeatureReviewManifest,type TechnicalFact} from './manifest';
import {isAcceptanceApproval,reviewedApprovals} from './acceptance-approvals';
import {rejectOperatorSecret} from './authorization';
import {DomainError} from '@/modules/shared/errors';
const exec=promisify(execFile);
export type ReviewReader=Prisma.TransactionClient;
export async function loadFeatureManifest(productId:string,featureId:string,reader:ReviewReader=db):Promise<FeatureReviewManifest>{
 const product=await reader.product.findUnique({where:{id:productId},include:{definition:true}});
 if(!product)throw new DomainError('Product not found.','NOT_FOUND');
 const items=await reader.workItem.findMany({where:{productId},include:{acceptanceCriteria:true},orderBy:{id:'asc'}});
 const archive=await reader.featureReviewEvent.findFirst({where:{productId,featureId,type:'ARCHIVED'},orderBy:{sequence:'asc'}});
 const scope=featureScope(featureId,items.map(item=>({id:item.id,parentId:item.parentId,type:item.type,title:item.title,description:item.description,userNeed:item.userNeed,userValue:item.userValue,status:item.status,archivedAt:item.id===featureId?archive?.createdAt.toISOString()??null:null})));
 const scopeIds=new Set(scope.map(item=>item.id));
 const requirements=items.filter(item=>scopeIds.has(item.id)&&item.type!=='DEFECT').flatMap(item=>item.acceptanceCriteria.map(criterion=>({id:criterion.id,workItemId:item.id,description:criterion.description}))).sort((a,b)=>a.id.localeCompare(b.id));
 const definitionApprovals=await reader.approval.findMany({where:{productId,approvalType:'PRODUCT_DEFINITION'},orderBy:{requestedAt:'desc'}});
 const approvedDefinition=definitionApprovals.find(approval=>approval.status==='APPROVED');
 const plans=await reader.implementationPlan.findMany({where:{productId,status:'APPROVED'},orderBy:[{version:'desc'},{createdAt:'desc'}]});
 const latestPlans=[...new Map(plans.slice().reverse().map(plan=>[plan.productSliceId??'',plan])).values()];
 const tasks=await reader.implementationTask.findMany({where:{workItemId:{in:[...scopeIds]},implementationPlanId:{in:latestPlans.map(plan=>plan.id)}},include:{plan:true},orderBy:{id:'asc'}});
 const repository=await reader.repository.findUnique({where:{productId}});
 const build={repositoryId:repository?.id??'',commitSha:'',tree:'',clean:false,available:false};
 if(repository?.status==='CONFIGURED')try{const git=async(args:string[])=>(await exec('git',['--no-replace-objects','-c','core.fsmonitor=false',...args],{cwd:repository.localPath,env:childEnv(),encoding:'utf8',timeout:15000,maxBuffer:1_000_000})).stdout.trim();build.commitSha=await git(['rev-parse','HEAD']);build.tree=await git(['rev-parse',`${build.commitSha}^{tree}`]);build.clean=!(await git(['status','--porcelain','--untracked-files=all']));build.available=true}catch{/* Unavailable or unversioned previews remain inspectable, never acceptable. */}
 const technical:TechnicalFact[]=[],blockingIssues:string[]=[],observation={unavailable:!build.available,changed:!repository||repository.status!=='CONFIGURED',reasons:[] as string[]};
 const unmapped=await reader.implementationTask.findMany({where:{implementationPlanId:{in:latestPlans.map(plan=>plan.id)},workItemId:null},select:{id:true}});
 for(const task of unmapped)blockingIssues.push(`Current approved task ${task.id} has no explicit feature trace.`);
 for(const task of tasks){
  const session=await reader.verificationSession.findFirst({where:{productId,implementationTaskId:task.id,demo:false},include:VERIFICATION_EVIDENCE_INCLUDE,orderBy:{createdAt:'desc'}});
  if(!session){technical.push({taskId:task.id,taskStatus:task.status,sessionId:'',commitSha:'',verdict:'NOT_RUN',fingerprint:'',approvalIds:[],authorityDigest:'',current:false,criteria:[],mandatoryPassed:false,concerns:[]});continue}
  const binding=bindingFromState(session.runState);
  const authority=reviewedApprovals(session.approvals).filter(approval=>approval.productId===productId&&approval.implementationTaskId===task.id&&approval.sessionId===session.id&&approval.approval.approvalType==='VERIFICATION'&&approval.approval.approvedBy&&approval.approval.resolvedAt&&verificationApprovalIsCurrent(approval,session));
  // The owner's own approvals decide as before. Approvals recorded by accepting a feature are kept out of what was reviewed, but
  // evidence that no longer matches them still voids the acceptance. With no approval at all, a passing verification bound to a
  // signed runtime review is awaiting acceptance, which is what accepting the feature then approves.
  const ownApprovals=reviewedApprovals(session.approvals),acceptanceApprovals=session.approvals.filter(approval=>isAcceptanceApproval(approval.approval.comments));
  const awaitingAcceptance=!ownApprovals.some(approval=>approval.approval.status==='APPROVED')&&Boolean(binding)&&verificationEvidenceFingerprint(session).startsWith('v2:');
  const acceptanceEvidenceIntact=!acceptanceApprovals.some(approval=>approval.approval.status==='APPROVED'&&!verificationApprovalIsCurrent(approval,session));
  const runtimeStatus=await inspectSessionRuntimeBinding(session.id),runtimeCurrent=runtimeStatus==='CURRENT';
  if(runtimeStatus==='UNAVAILABLE'){observation.unavailable=true;observation.reasons.push('Runtime approval authority could not be established.')}
  if(runtimeStatus==='CHANGED')observation.changed=true;
  let entry:string[],entryUnavailable=false;
  try{if(runtimeStatus==='UNAVAILABLE'||!build.available){entry=[];entryUnavailable=true}else entry=await verificationEntryBlockers(productId,task.id)}catch{entry=[];entryUnavailable=true;observation.unavailable=true;observation.reasons.push('Technical eligibility checks could not be observed.')}
  if(entry.length)observation.changed=true;
  const obligations=Array.isArray(session.contract?.obligations)?session.contract.obligations as unknown as {id:string;title:string;mandatory:boolean;status:string}[]:[];
  const mandatoryPassed=obligations.length>0&&obligations.every(obligation=>typeof obligation.mandatory==='boolean'&&(!obligation.mandatory||obligation.status==='VERIFIED'))&&!session.escalations.some(escalation=>escalation.status==='OPEN'&&Boolean(failureClassForEscalation(escalation.type)))&&!session.defectLinks.some(link=>['HIGH','CRITICAL'].includes(link.workItem.priority)&&link.workItem.status!=='DONE');
  // The existing independently approved verifier owns adapter-specific proof and
  // manual/automated evidence adequacy. Do not create a second technical approval
  // engine here: the current v2 fingerprint above binds all of that evidence.
  const covered=session.coverages.filter(coverage=>coverage.status==='VERIFIED').map(coverage=>coverage.acceptanceCriterionId).sort();
  const concerns=obligations.filter(obligation=>!obligation.mandatory&&obligation.status!=='VERIFIED'&&obligation.status!=='NOT_APPLICABLE').map(obligation=>({id:`${session.id}:obligation:${contentHash(canonicalJson(obligation))}`,text:obligation.title})).sort((a,b)=>a.id.localeCompare(b.id));
  if(session.overallVerdict==='PASS_WITH_CONCERNS')concerns.push({id:`${session.id}:verdict:${contentHash(session.verdictReason)}`,text:session.verdictReason||'Non-blocking concerns are recorded in the technical verification.'});
  for(const defect of session.defectLinks.filter(link=>link.workItem.status!=='DONE'&&!['HIGH','CRITICAL'].includes(link.workItem.priority)))concerns.push({id:`${session.id}:defect:${contentHash(canonicalJson(defect.workItem))}`,text:`${defect.workItem.title}: ${defect.workItem.description}`});
  for(const escalation of session.escalations.filter(value=>value.status==='OPEN'&&!failureClassForEscalation(value.type)))concerns.push({id:`${session.id}:escalation:${contentHash(canonicalJson(escalation))}`,text:escalation.description});
  concerns.sort((a,b)=>a.id.localeCompare(b.id));
  technical.push({taskId:task.id,taskStatus:task.status,sessionId:session.id,commitSha:session.commitSha,verdict:session.overallVerdict??'NOT_RUN',fingerprint:verificationEvidenceFingerprint(session),approvalIds:authority.map(approval=>approval.id).sort(),authorityDigest:contentHash(canonicalJson({binding,approvals:authority.map(approval=>({id:approval.id,approval:approval.approval,stale:approval.stale})).sort((a,b)=>a.id.localeCompare(b.id)),entry,plan:task.plan,task:{id:task.id,workItemId:task.workItemId,objective:task.objective,description:task.description,validation:task.validation}})),current:!entryUnavailable&&runtimeCurrent&&(authority.length>0||awaitingAcceptance)&&acceptanceEvidenceIntact&&entry.length===0&&!session.stale&&session.contract?.objective===(task.objective||task.title),criteria:covered,mandatoryPassed,concerns});
 }
 const defects=await reader.workItem.findMany({where:{productId,type:'DEFECT',status:{not:'DONE'},priority:{in:['HIGH','CRITICAL']}}});
 for(const defect of defects)blockingIssues.push(`Open ${defect.priority} defect ${defect.id}.`);
 const manifest:FeatureReviewManifest={kind:'FEATURE_REVIEW_MANIFEST',version:1,observation,productId,featureId,productActive:product.status==='ACTIVE',productArchived:product.status==='ARCHIVED',requirementsApproved:!product.requirementsReviewRequired&&product.definition?.status==='APPROVED'&&!product.definition.reviewRequired&&Boolean(approvedDefinition),definitionIdentity:contentHash(canonicalJson({definition:product.definition,approvals:definitionApprovals.map(approval=>({id:approval.id,status:approval.status,approvedBy:approval.approvedBy,resolvedAt:approval.resolvedAt,comments:approval.comments})).sort((a,b)=>a.id.localeCompare(b.id))})),scope,requirements,taskIds:tasks.map(task=>task.id),build,technical,blockingIssues:blockingIssues.sort()};
 rejectOperatorSecret(manifest);return manifest;
}
