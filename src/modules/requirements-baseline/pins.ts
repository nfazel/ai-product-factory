import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db} from '@/lib/db';
import {canonicalJson,contentHash} from '@/modules/coding/external-manifest';
import {rejectOperatorSecret} from '@/modules/feature-review/authorization';
import {signRequirementsContext,validRequirementsContext} from './context-proof';
import {assertRequirementsSchema,lockRequirementsProduct,resolveLiveCurrent,resolvePinnedSnapshot,withRequirementsSnapshot,RequirementsContextError,type ContextReader,type RequirementsContext} from './context';
const operations={ARCHITECTURE_PROPOSAL:'ArchitectureProposal',IMPLEMENTATION_PLAN:'ImplementationPlan',CODING_WORKSPACE:'RepositoryWorkspace',VERIFICATION_SESSION:'VerificationSession',FEATURE_REVIEW:'FeatureReviewEvent',RELEASE_CANDIDATE:'ReleaseCandidate',FEATURE_FEEDBACK:'FeatureFeedback',DEVELOPMENT_SCOPE_REVISION:'DevelopmentScopeRevision'} as const;
const operationKinds=['ARCHITECTURE_PROPOSAL','IMPLEMENTATION_PLAN','CODING_WORKSPACE','VERIFICATION_SESSION','FEATURE_REVIEW','RELEASE_CANDIDATE','FEATURE_FEEDBACK','DEVELOPMENT_SCOPE_REVISION'] as const;
const inputSchema=z.object({productId:z.string().min(1),operationKind:z.enum(operationKinds),expectedBaselineId:z.string().min(1),expectedDigest:z.string().regex(/^[a-f0-9]{64}$/),criterionIds:z.array(z.string().min(1)).max(5000).optional(),idempotencyKey:z.string().regex(/^[A-Za-z0-9:_-]{8,128}$/)}).strict();
const manifestSchema=z.object({kind:z.literal('REQUIREMENTS_CONTEXT_CAPTURE'),version:z.literal(1),productId:z.string(),operationKind:z.enum(operationKinds),operationId:z.string(),baseline:z.object({id:z.string(),version:z.literal(1),digest:z.string().regex(/^[a-f0-9]{64}$/),selectionId:z.string()}).strict(),members:z.array(z.object({criterionId:z.string(),workItemId:z.string(),description:z.string()}).strict()),selectedCriterionIds:z.array(z.string()),grantsApproval:z.literal(false)}).strict();
type PinManifest=z.infer<typeof manifestSchema>;
const hash=(value:unknown)=>contentHash(canonicalJson(value));
function proof(row:{id:string;productId:string;baselineId:string;operationKind:string;operationId:string;formatVersion:number;manifest:unknown;digest:string;idempotencyKey:string;requestDigest:string;createdAt:Date}){return{kind:'REQUIREMENTS_CONTEXT_PIN_PROOF',version:1,id:row.id,productId:row.productId,baselineId:row.baselineId,operationKind:row.operationKind,operationId:row.operationId,formatVersion:row.formatVersion,manifest:row.manifest,digest:row.digest,idempotencyKey:row.idempotencyKey,requestDigest:row.requestDigest,createdAt:row.createdAt.toISOString()}}
export async function readRequirementsPin(reader:ContextReader,productId:string,pinId:string){
 await assertRequirementsSchema(reader);
 const row=await reader.requirementsContextPin.findFirst({where:{id:pinId,productId}});if(!row)throw new RequirementsContextError('NOT_FOUND','Requirements pin not found in this product.');
 if(row.formatVersion===3)return (await import('./generation')).readGenerationInputPin(reader,productId,pinId);
 if(row.formatVersion===2)return (await import('./planning-pins')).readPlanningPin(reader,productId,pinId);
 const parsed=manifestSchema.safeParse(row.manifest);if(!parsed.success||row.formatVersion!==1||row.digest!==hash(row.manifest)||!validRequirementsContext(proof(row),row.signature))throw new RequirementsContextError('INTEGRITY','Requirements pin proof is invalid or unavailable.');
 const manifest=parsed.data,context=await resolvePinnedSnapshot(reader,productId,row.baselineId);
 if(manifest.productId!==productId||manifest.operationKind!==row.operationKind||manifest.operationId!==row.operationId||manifest.baseline.id!==row.baselineId||canonicalJson(manifest.baseline)!==canonicalJson(context.baseline)||canonicalJson(manifest.members)!==canonicalJson(context.members)||new Set(manifest.selectedCriterionIds).size!==manifest.selectedCriterionIds.length||manifest.selectedCriterionIds.some(id=>!manifest.members.some(m=>m.criterionId===id)))throw new RequirementsContextError('INTEGRITY','Requirements pin binding does not match its exact captured baseline.');
 return{row,manifest,context:{...context,mode:'HISTORICAL' as const,selectedCriterionIds:manifest.selectedCriterionIds}};
}
/** Allocate a prospective ID, not an operation/workspace. No existing record can be pinned retroactively. */
export async function captureRequirementsContextPin(raw:z.input<typeof inputSchema>,reader?:ContextReader){
 const input=inputSchema.parse(raw);rejectOperatorSecret(input);const ids=input.criterionIds?[...input.criterionIds].sort():undefined;
 if(ids&&new Set(ids).size!==ids.length)throw new RequirementsContextError('INTEGRITY','Criterion selection must be unique.');
 const requestDigest=hash({...input,criterionIds:ids,idempotencyKey:undefined});
 const work=async(tx:ContextReader)=>{
  await lockRequirementsProduct(tx,input.productId);await assertRequirementsSchema(tx);
  const existing=await tx.requirementsContextPin.findUnique({where:{productId_idempotencyKey:{productId:input.productId,idempotencyKey:input.idempotencyKey}}});
  if(existing){if(existing.requestDigest!==requestDigest)throw new RequirementsContextError('INTEGRITY','Pin request key belongs to different content.');await readRequirementsPin(tx,input.productId,existing.id);return{pinId:existing.id,operationKind:existing.operationKind,operationId:existing.operationId,baselineId:existing.baselineId,digest:existing.digest,grantsApproval:false as const}}
  const context=await resolveLiveCurrent(tx,input.productId);
  if(context.baseline.id!==input.expectedBaselineId||context.baseline.digest!==input.expectedDigest)throw new RequirementsContextError('DRIFT','Requirements baseline changed before capture.');
  const selection=ids??context.members.map(m=>m.criterionId).sort();if(selection.some(id=>!context.members.some(m=>m.criterionId===id)))throw new RequirementsContextError('INTEGRITY','Selected criterion is outside the effective product baseline.');
  const operationId=randomUUID();const table=operations[input.operationKind];const occupied=await tx.$queryRawUnsafe<{id:string}[]>(`SELECT id FROM "${table}" WHERE id=$1`,operationId);if(occupied.length)throw new RequirementsContextError('INTEGRITY','Prospective operation identity already exists.');
  const manifest:PinManifest={kind:'REQUIREMENTS_CONTEXT_CAPTURE',version:1,productId:input.productId,operationKind:input.operationKind,operationId,baseline:{...context.baseline,version:1},members:context.members,selectedCriterionIds:selection,grantsApproval:false};
  rejectOperatorSecret(manifest);const payload={id:randomUUID(),productId:input.productId,baselineId:context.baseline.id,operationKind:input.operationKind,operationId,formatVersion:1,manifest:JSON.parse(JSON.stringify(manifest)),digest:hash(manifest),idempotencyKey:input.idempotencyKey,requestDigest,createdAt:new Date()};
  const pin=await tx.requirementsContextPin.create({data:{...payload,signature:signRequirementsContext(proof(payload))}});
  return{pinId:pin.id,operationKind:pin.operationKind,operationId:pin.operationId,baselineId:pin.baselineId,digest:pin.digest,grantsApproval:false as const};
 };
 return reader?work(reader):db.$transaction(work,{isolationLevel:'ReadCommitted',maxWait:10000,timeout:60000});
}
/** Current applicability is independent of capture authenticity. No permanent invalidation is written. */
export async function inspectRequirementsPin(productId:string,pinId:string,reader?:ContextReader){
 try{return await withRequirementsSnapshot(reader,async tx=>{const captured=await readRequirementsPin(tx,productId,pinId);try{const current=await resolveLiveCurrent(tx,productId);const applicable=canonicalJson(current.baseline)===canonicalJson(captured.manifest.baseline);return{status:applicable?'CURRENT':'STALE',grantsApproval:false as const}}catch(error){if(error instanceof RequirementsContextError&&error.code==='DRIFT')return{status:'STALE',grantsApproval:false as const};throw error}})}catch{return{status:'UNAVAILABLE',grantsApproval:false as const}}
}
export type RequirementsContextPinInput=z.input<typeof inputSchema>;
export type HistoricalRequirementsContext=RequirementsContext&{mode:'HISTORICAL'};
