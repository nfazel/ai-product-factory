import 'server-only';
import {DomainError} from '@/modules/shared/errors';
import {VERIFICATION_EVIDENCE_INCLUDE,verificationEvidenceFingerprint} from '@/modules/verification/integrity';
import type {ReviewReader} from './loader';
import type {FeatureReviewManifest} from './manifest';

/**
 * Accepting a feature is one signature over the whole feature, and it also records the owner's approval of each task's
 * verification, so nobody has to approve them one by one first. The approvals it records say so in their comments, and
 * they are left out of the reviewed manifest. Otherwise recording them would change what was just signed and void the acceptance.
 */
export const ACCEPTANCE_APPROVAL_NOTE='Verification approved by accepting feature';
export const isAcceptanceApproval=(comments:string|null|undefined)=>typeof comments==='string'&&comments.startsWith(ACCEPTANCE_APPROVAL_NOTE);

/** The approvals that count towards a task's reviewed authority: the owner's own, not the ones acceptance itself records. */
export function reviewedApprovals<T extends {approval:{comments:string|null}}>(approvals:T[]){return approvals.filter(item=>!isAcceptanceApproval(item.approval.comments))}

const PASSING=new Set(['PASS','PASS_WITH_CONCERNS']);

/**
 * Inside the acceptance transaction: records the owner's approval of every task verification the acceptance covers that does not
 * already have one. Either all are recorded with the acceptance or none are. A task whose evidence differs from what was
 * reviewed stops the whole acceptance.
 */
export async function approveVerificationsAtAcceptance(tx:ReviewReader,input:{manifest:FeatureReviewManifest;eventId:string;actorName:string}){
 const created:string[]=[];
 for(const fact of input.manifest.technical){
  if(!fact.current||!PASSING.has(fact.verdict)||!fact.sessionId||fact.approvalIds.length>0)continue;
  const session=await tx.verificationSession.findUnique({where:{id:fact.sessionId},include:VERIFICATION_EVIDENCE_INCLUDE});
  if(!session||session.productId!==input.manifest.productId||session.implementationTaskId!==fact.taskId||!PASSING.has(session.overallVerdict??''))throw new DomainError('A task verification this acceptance covers could not be found, so nothing was approved.');
  const fingerprint=verificationEvidenceFingerprint(session);
  if(fingerprint!==fact.fingerprint)throw new DomainError('A task verification changed after it was reviewed. Inspect the feature again before accepting.');
  const already=await tx.verificationApproval.findFirst({where:{sessionId:session.id,stale:false,evidenceFingerprint:fingerprint}});
  if(already)continue;
  const task=await tx.implementationTask.findUnique({where:{id:fact.taskId},select:{workItemId:true}});
  const now=new Date();
  const approval=await tx.approval.create({data:{productId:session.productId,workItemId:task?.workItemId??null,approvalType:'VERIFICATION',status:'APPROVED',approvedBy:input.actorName,requestedAt:now,resolvedAt:now,comments:`${ACCEPTANCE_APPROVAL_NOTE} ${input.manifest.featureId} (review ${input.eventId}). Task ${fact.taskId} at ${session.commitSha}.`}});
  await tx.verificationApproval.create({data:{productId:session.productId,approvalId:approval.id,sessionId:session.id,implementationTaskId:fact.taskId,commitSha:session.commitSha,evidenceFingerprint:fingerprint}});
  await tx.activity.create({data:{productId:session.productId,workItemId:task?.workItemId??null,type:'VERIFICATION_APPROVED',description:`${input.actorName} approved verification ${session.id} by accepting the feature.`,actor:input.actorName}});
  created.push(approval.id);
 }
 return created;
}
