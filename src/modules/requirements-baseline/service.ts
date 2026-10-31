import 'server-only';
import {db} from '@/lib/db';
import type {Prisma} from '@/generated/prisma/client';
import {canonicalJson,contentHash} from '@/modules/coding/external-manifest';
import {confirmLocalOperator,rejectOperatorSecret} from '@/modules/feature-review/authorization';
import {DomainError} from '@/modules/shared/errors';
import {initialRequirementsManifest,baselineDigest,type InitialRequirementsManifest} from './manifest';
import {signInitialisation,validInitialisation} from './proof';
type Reader=Prisma.TransactionClient;
const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value));
async function observe(reader:Reader,productId:string){
 const product=await reader.product.findUnique({where:{id:productId},select:{id:true,definition:true}});
 if(!product)throw new DomainError('Product not found.','NOT_FOUND');
 const criteria=await reader.acceptanceCriterion.findMany({where:{workItem:{productId}},include:{workItem:{select:{id:true,productId:true,parentId:true,type:true}}},orderBy:{id:'asc'}});
 const approvals=await reader.approval.findMany({where:{productId,approvalType:'PRODUCT_DEFINITION'},orderBy:{id:'asc'}});
 const blockers:string[]=[];
 if(criteria.some(c=>c.workItem.productId!==productId||!c.description.trim()))blockers.push('Existing criterion content or ownership is inconsistent.');
 const recorded=approvals.filter(a=>a.status==='APPROVED'&&Boolean(a.approvedBy?.trim())&&a.resolvedAt);
 if(product.definition?.status==='APPROVED'&&!recorded.length)blockers.push('The definition claims approval without recorded approval authority.');
 const manifest=initialRequirementsManifest(productId,criteria.map(c=>({criterionId:c.id,workItemId:c.workItemId,description:c.description})));
 const provenance={kind:'EXISTING_DATA_CAPTURE',grantsApproval:false,authorityBinding:'UNVERSIONED_LEGACY_RECORDS',definition:product.definition,recordedRequirementsApprovals:approvals,authorityObservation:recorded.length?'RECORDED_AUTHORITY_ONLY':'NO_RECORDED_AUTHORITY',observedCriteria:criteria.map(c=>({id:c.id,status:c.status,createdAt:c.createdAt,updatedAt:c.updatedAt,owner:c.workItem}))};
 rejectOperatorSecret({manifest,provenance});return{manifest,digest:baselineDigest(manifest),provenance,blockers};
}
/** Explicit preview only; no writes or startup/ordinary-reader registration. */
export async function previewRequirementsInitialisation(productId:string){const value=await observe(db,productId);return{manifest:value.manifest,digest:value.digest,blockers:value.blockers,recordedApprovalIds:value.provenance.recordedRequirementsApprovals.map(a=>a.id),grantsApproval:false as const}}
async function locked<T>(productId:string,work:(tx:Reader)=>Promise<T>):Promise<T>{for(let attempt=0;attempt<3;attempt++)try{return await db.$transaction(async tx=>{await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`initial-requirements:${productId}`},0))`;return work(tx)},{isolationLevel:'Serializable',maxWait:10000,timeout:60000})}catch(error){if(!['P2034','P2002'].includes((error as {code?:string}).code??'')||attempt===2)throw error}throw new DomainError('Concurrent initialisation could not be resolved.','CONFLICT')}
async function captured(reader:Reader,productId:string,baselineId?:string){
 const record=await reader.requirementsBaselineSelection.findFirst({where:{productId,...(baselineId?{baselineId}:{})},orderBy:{sequence:'desc'},include:{baseline:{include:{members:{orderBy:{criterionId:'asc'}}}}}});
 if(!record)return null;
 const {baseline,signature,...payload}=record,manifest=baseline.manifest as unknown as InitialRequirementsManifest;
 if(record.sequence!==1||manifest.kind!=='INITIAL_REQUIREMENTS_MEMBERSHIP'||manifest.formatVersion!==1||manifest.version!==1||manifest.productId!==productId||baseline.productId!==productId||baseline.version!==1||baselineDigest(manifest)!==baseline.digest||record.digest!==baseline.digest)throw new DomainError('Initial requirements membership proof is inconsistent.');
 const members=baseline.members.map(m=>({criterionId:m.criterionId,workItemId:m.workItemId,description:m.description})).sort((a,b)=>a.criterionId<b.criterionId?-1:a.criterionId>b.criterionId?1:0);
 if(canonicalJson(members)!==canonicalJson(manifest.members))throw new DomainError('Historical requirements membership is inconsistent.');
 const proof={...payload,createdAt:payload.createdAt.toISOString(),manifest,provenance:baseline.provenance};
 if(!validInitialisation(proof,signature,record))throw new DomainError('Initial requirements capture authority is unavailable.');
 return{record,baseline,manifest};
}
/** The only writer in F1a: capture the existing set as version 1. No approval is created. */
export async function initialiseRequirementsBaseline(input:{productId:string;expectedDigest:string;credential:string;idempotencyKey:string}){
 const actor=confirmLocalOperator(input.credential);
 if(!/^[A-Za-z0-9:_-]{8,128}$/.test(input.idempotencyKey)||!/^[a-f0-9]{64}$/.test(input.expectedDigest))throw new DomainError('Exact membership digest and unique request key are required.');rejectOperatorSecret(input.idempotencyKey);
 const requestDigest=contentHash(canonicalJson({productId:input.productId,expectedDigest:input.expectedDigest,actor}));
 return locked(input.productId,async tx=>{
  const current=await observe(tx,input.productId);if(current.blockers.length)throw new DomainError(current.blockers.join(' '));
  if(current.digest!==input.expectedDigest)throw new DomainError('Existing requirements changed; preview the exact membership again.','CONFLICT');
  const existing=await captured(tx,input.productId);
  if(existing){if(existing.record.idempotencyKey===input.idempotencyKey&&existing.record.requestDigest!==requestDigest)throw new DomainError('Request key belongs to a different capture.','CONFLICT');if(existing.baseline.digest!==current.digest)throw new DomainError('Initial membership has drifted; F1a cannot change the effective baseline.','CONFLICT');return{baselineId:existing.baseline.id,version:1,digest:existing.baseline.digest,grantsApproval:false as const}}
  const leftovers=await tx.requirementsBaseline.count({where:{productId:input.productId}})+await tx.criterionLineage.count({where:{productId:input.productId}});
  if(leftovers)throw new DomainError('Unsealed baseline or lineage records require investigation; automatic repair is prohibited.');
  confirmLocalOperator(input.credential);
  const id=`rb_${current.digest}`;
  await tx.requirementsBaseline.create({data:{id,productId:input.productId,version:1,digest:current.digest,manifest:json(current.manifest),provenance:json(current.provenance)}});
  for(const member of current.manifest.members){await tx.criterionLineage.create({data:{criterionId:member.criterionId,productId:input.productId,workItemId:member.workItemId,rootId:member.criterionId,generation:1}});await tx.requirementsBaselineMember.create({data:{baselineId:id,...member}})}
  const payload={id:`rbs_${current.digest}`,sequence:1,productId:input.productId,baselineId:id,digest:current.digest,actorKind:actor.kind,actorId:actor.id,actorName:actor.name,idempotencyKey:input.idempotencyKey,requestDigest,createdAt:new Date()};
  await tx.requirementsBaselineSelection.create({data:{...payload,signature:signInitialisation({...payload,createdAt:payload.createdAt.toISOString(),manifest:current.manifest,provenance:json(current.provenance)},input.credential)}});
  await tx.activity.create({data:{productId:input.productId,type:'REQUIREMENTS_BASELINE_INITIALISED',actor:actor.name,description:'Captured existing acceptance-criterion membership as initial baseline. No requirement, approval, verification, acceptance or work state changed.'}});
  return{baselineId:id,version:1,digest:current.digest,grantsApproval:false as const};
 });
}
/** Diagnostics only. Existing readers are unchanged; this is not a current-requirements resolver. */
export async function inspectRequirementsBaseline(productId:string){
 if(!await db.product.findUnique({where:{id:productId},select:{id:true}}))throw new DomainError('Product not found.','NOT_FOUND');
 const head=await db.requirementsBaselineSelection.findFirst({where:{productId},orderBy:{sequence:'desc'},select:{baselineId:true}});
 if(!head){const fragments=await db.requirementsBaseline.count({where:{productId}})+await db.criterionLineage.count({where:{productId}});return{status:fragments?'INCONSISTENT':'UNINITIALISED',baselineId:null,digest:null,grantsApproval:false as const}}
 try{const value=await captured(db,productId);if(!value)throw new DomainError('Initialisation disappeared.');const current=await observe(db,productId);return{status:current.blockers.length?'INCONSISTENT':current.digest===value.baseline.digest?'INITIALISED':'DRIFTED',baselineId:value.baseline.id,digest:value.baseline.digest,grantsApproval:false as const}}catch{return{status:'UNAVAILABLE',baselineId:head.baselineId,digest:null,grantsApproval:false as const}}
}
/** Explicit immutable historical snapshot; never mix it with the live criterion set. */
export async function getHistoricalRequirementsBaseline(productId:string,baselineId:string){
 const value=await captured(db,productId,baselineId);if(!value||value.baseline.id!==baselineId)throw new DomainError('Historical baseline was not found in this product.','NOT_FOUND');
 return{baselineId:value.baseline.id,version:value.baseline.version,digest:value.baseline.digest,members:value.manifest.members,provenance:value.baseline.provenance,grantsApproval:false as const};
}
