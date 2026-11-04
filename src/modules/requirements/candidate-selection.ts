import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import {recordActivity} from '@/modules/activity/service';
import {loadDefinitionCandidateInspection} from './candidate-inspection';
import {storedProposalSchema} from './schema';
import {DomainError} from '@/modules/shared/errors';

/**
 * Turns a sealed definition candidate into a normal, reviewable proposal. The candidate stays exactly as it was sealed; the proposal
 * is a copy of it that the existing review, edit and commit steps work on, bound to it by an append-only selection record that names
 * who selected it and the digest it was sealed with. Selecting is not approving: nothing is confirmed, committed or approved here.
 */
export type CandidateSelector = {name:string;kind:'PERSON'|'PLAN_RUN'};

export async function selectDefinitionCandidate(input:{productId:string;publicationId:string;selector:CandidateSelector}){
 const {productId,publicationId,selector}=input;
 if(!selector.name.trim())throw new DomainError('Say who is selecting the candidate.');
 // Verified, read-only: signatures, digests, provenance and the original successful generation are all checked here.
 const candidate=await loadDefinitionCandidateInspection(productId,publicationId).catch(()=>{throw new DomainError('That definition candidate could not be verified, so it was not selected.')});
 if(candidate.requirements.applicability!=='CURRENT')throw new DomainError(`This candidate cannot be selected. ${candidate.requirements.reason}`);

 return db.$transaction(async tx=>{
  const existing=await tx.definitionCandidateSelection.findUnique({where:{publicationId}});
  if(existing)return {proposalId:existing.proposalId,selectionId:existing.id,alreadySelected:true};
  const product=await tx.product.findUniqueOrThrow({where:{id:productId},select:{currentStage:true,status:true}});
  if(product.currentStage!=='DEFINE'||product.status==='ARCHIVED')throw new DomainError('A definition candidate can only be selected while the product is in Define.');
  if(await tx.definitionProposal.count({where:{productId,status:{in:['OPEN','PARTIALLY_COMMITTED']}}}))throw new DomainError('There is already an open definition proposal. Finish or discard it first.');
  const definition=await tx.productDefinition.findUnique({where:{productId}});
  if(definition&&definition.status!=='NOT_STARTED'&&definition.status!=='IN_PROGRESS')throw new DomainError('The definition is already past drafting, so a candidate cannot be selected.');
  const payload=storedProposalSchema.parse(candidate.proposal);
  const selection=await tx.definitionCandidateSelection.create({data:{id:randomUUID(),productId,publicationId,proposalId:candidate.artifactId,contentDigest:candidate.contentDigest,selectedBy:selector.name.trim(),selectedByKind:selector.kind}});
  await tx.definitionProposal.create({data:{id:candidate.artifactId,productId,agentRunId:candidate.provenance.agentRunId,summary:payload.assistantSummary,payload,status:'OPEN',seededDemo:false}});
  await tx.productDefinition.upsert({where:{productId},update:{status:'IN_PROGRESS'},create:{productId,status:'IN_PROGRESS'}});
  await recordActivity({productId,type:'DEFINITION_GENERATED',description:`${selector.name.trim()} selected the Requirements Agent's definition candidate as a draft proposal. It is not confirmed, committed or approved.`,actor:selector.name.trim()});
  return {proposalId:candidate.artifactId,selectionId:selection.id,alreadySelected:false};
 },{isolationLevel:'Serializable',maxWait:10000,timeout:60000});
}
