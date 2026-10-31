import 'server-only';
import {db} from '@/lib/db';
import type {Prisma} from '@/generated/prisma/client';
import {canonicalJson} from '@/modules/coding/external-manifest';
import {baselineDigest,initialRequirementsManifest,type CriterionMember} from './manifest';
import {readInitialRequirementsCapture} from './service';
export type ContextReader=Prisma.TransactionClient;
export class RequirementsContextError extends Error {constructor(readonly code:'SCHEMA_UNAVAILABLE'|'UNAVAILABLE'|'NOT_FOUND'|'BASELINE_REQUIRED'|'NOT_LEGACY'|'PARTIAL_STATE'|'CONFLICTING_STATE'|'INTEGRITY'|'DRIFT',message:string){super(message);this.name='RequirementsContextError'}}
export type RequirementsContext={formatVersion:1;mode:'CURRENT'|'HISTORICAL'|'LEGACY';productId:string;baseline:{id:string;version:number;digest:string;selectionId:string}|null;members:CriterionMember[];selectedCriterionIds:string[];grantsApproval:false};
export const CONTEXT_TABLES=['RequirementsBaseline','RequirementsBaselineMember','CriterionLineage','RequirementsBaselineSelection','RequirementsContextPin'];
export async function assertRequirementsSchema(reader:ContextReader){
 const rows=await reader.$queryRaw<{name:string;available:boolean}[]>`SELECT name,to_regclass(format('public.%I',name)) IS NOT NULL AS available FROM unnest(${CONTEXT_TABLES}::text[]) AS name`;
 if(rows.length!==CONTEXT_TABLES.length||rows.some(r=>!r.available))throw new RequirementsContextError('SCHEMA_UNAVAILABLE','Requirements context schema is unavailable; absence of versioned state cannot be established.');
 const expected=['AcceptanceCriterion_requirements_guard','AcceptanceCriterion_requirements_no_truncate','WorkItem_requirements_owner_guard','000_RequirementsBaseline_product_lock','000_RequirementsSelection_product_lock','000_CriterionLineage_product_lock','000_RequirementsPin_product_lock','RequirementsContextPin_capture_guard','RequirementsContextPin_immutable','RequirementsContextPin_no_truncate'];
 const guards=await reader.$queryRaw<{name:string;enabled:string;mode:string}[]>`SELECT tgname AS name,tgenabled::text AS enabled,current_setting('session_replication_role') AS mode FROM pg_trigger WHERE NOT tgisinternal AND tgname=ANY(${expected}::text[]) AND tgrelid IN (to_regclass('public."AcceptanceCriterion"'),to_regclass('public."WorkItem"'),to_regclass('public."RequirementsBaseline"'),to_regclass('public."RequirementsBaselineSelection"'),to_regclass('public."CriterionLineage"'),to_regclass('public."RequirementsContextPin"'))`;
 if(guards.length!==expected.length||new Set(guards.map(g=>g.name)).size!==expected.length||guards.some(g=>!['O','A'].includes(g.enabled)||g.mode!=='origin'))throw new RequirementsContextError('SCHEMA_UNAVAILABLE','Requirements integrity guards are unavailable; no legacy fallback is permitted.');

}
export async function withRequirementsSnapshot<T>(reader:ContextReader|undefined,work:(tx:ContextReader)=>Promise<T>):Promise<T>{
 try{return reader?await work(reader):await db.$transaction(work,{isolationLevel:'RepeatableRead',maxWait:10000,timeout:60000})}catch(error){if(error instanceof RequirementsContextError)throw error;const code=(error as {code?:string}).code;throw new RequirementsContextError(['P2021','P2022'].includes(code??'')?'SCHEMA_UNAVAILABLE':'UNAVAILABLE','Requirements context could not be established. No legacy fallback is permitted.')}
}
export async function lockRequirementsProduct(reader:ContextReader,productId:string){await reader.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`initial-requirements:${productId}`},0))`}
async function product(reader:ContextReader,productId:string){if(!await reader.product.findUnique({where:{id:productId},select:{id:true}}))throw new RequirementsContextError('NOT_FOUND','Product not found.')}
async function validateLineage(reader:ContextReader,productId:string,members:CriterionMember[]){
 const rows=await reader.criterionLineage.findMany({where:{productId},include:{criterion:{include:{workItem:{select:{id:true,productId:true}}}}}}),byId=new Map(rows.map(r=>[r.criterionId,r]));
 const generations=new Set<string>(),predecessors=new Set<string>();
 for(const row of rows){const previous=row.predecessorId?byId.get(row.predecessorId):null,root=byId.get(row.rootId),position=`${row.rootId}:${row.generation}`;
  if(row.productId!==productId||row.criterion.workItem.productId!==productId||row.criterion.workItemId!==row.workItemId||!root||root.predecessorId!==null||root.generation!==1||root.rootId!==root.criterionId||root.workItemId!==row.workItemId||generations.has(position)||!Number.isInteger(row.generation)||row.generation<1)throw new RequirementsContextError('INTEGRITY','Invalid criterion lineage.');
  if(row.generation===1?(row.predecessorId!==null||row.rootId!==row.criterionId):(!previous||previous.workItemId!==row.workItemId||previous.rootId!==row.rootId||previous.generation+1!==row.generation||predecessors.has(row.predecessorId!)))throw new RequirementsContextError('INTEGRITY','Invalid criterion predecessor chain.');
  generations.add(position);if(row.predecessorId)predecessors.add(row.predecessorId);
 }
 for(const member of members){const row=byId.get(member.criterionId);if(!row||row.generation!==1||row.rootId!==member.criterionId||row.workItemId!==member.workItemId)throw new RequirementsContextError('INTEGRITY','Historical membership lacks its exact supported lineage.');}
}
export async function resolveBaselineSnapshot(reader:ContextReader,productId:string,baselineId?:string){
 await assertRequirementsSchema(reader);await product(reader,productId);
 const [baselines,selections]=await Promise.all([reader.requirementsBaseline.findMany({where:{productId},select:{id:true,version:true}}),reader.requirementsBaselineSelection.findMany({where:{productId},orderBy:{sequence:'desc'},select:{id:true,baselineId:true,sequence:true}})]);
 if(!selections.length){const fragments=baselines.length+await reader.criterionLineage.count({where:{productId}})+await reader.requirementsContextPin.count({where:{productId}});throw new RequirementsContextError(fragments?'PARTIAL_STATE':'BASELINE_REQUIRED','An intact explicitly initialised requirements baseline is required.');}
 if(selections.length!==1||baselines.length!==1||selections[0].sequence!==1||baselines[0].version!==1||selections[0].baselineId!==baselines[0].id)throw new RequirementsContextError('CONFLICTING_STATE','Conflicting or unsupported effective requirements selection.');
 if(baselineId&&baselineId!==baselines[0].id)throw new RequirementsContextError('NOT_FOUND','Baseline not found in this product.');
 const captured=await readInitialRequirementsCapture(reader,productId,baselineId);if(!captured)throw new RequirementsContextError('INTEGRITY','Requirements capture is incomplete.');
 await validateLineage(reader,productId,captured.manifest.members);
 return{formatVersion:1 as const,mode:'CURRENT' as const,productId,baseline:{id:captured.baseline.id,version:captured.baseline.version,digest:captured.baseline.digest,selectionId:captured.record.id},members:captured.manifest.members,selectedCriterionIds:captured.manifest.members.map(m=>m.criterionId),grantsApproval:false as const};
}
/** Historical authenticity is independent of the current effective selection. */
export async function resolvePinnedSnapshot(reader:ContextReader,productId:string,baselineId:string){
 await assertRequirementsSchema(reader);await product(reader,productId);
 const captured=await readInitialRequirementsCapture(reader,productId,baselineId);
 if(!captured)throw new RequirementsContextError('NOT_FOUND','Pinned baseline not found in this product.');
 await validateLineage(reader,productId,captured.manifest.members);
 return{formatVersion:1 as const,mode:'HISTORICAL' as const,productId,baseline:{id:captured.baseline.id,version:captured.baseline.version,digest:captured.baseline.digest,selectionId:captured.record.id},members:captured.manifest.members,selectedCriterionIds:captured.manifest.members.map(m=>m.criterionId),grantsApproval:false as const};
}
export async function resolveLiveCurrent(reader:ContextReader,productId:string){
 const context=await resolveBaselineSnapshot(reader,productId),live=await reader.acceptanceCriterion.findMany({where:{workItem:{productId}},select:{id:true,workItemId:true,description:true}});
 const manifest=initialRequirementsManifest(productId,live.map(c=>({criterionId:c.id,workItemId:c.workItemId,description:c.description})));
 if(baselineDigest(manifest)!==context.baseline.digest||canonicalJson(manifest.members)!==canonicalJson(context.members))throw new RequirementsContextError('DRIFT','Live criteria differ from the effective requirements baseline.');
 return context;
}
export async function resolveLegacy(reader:ContextReader,productId:string):Promise<RequirementsContext>{
 await assertRequirementsSchema(reader);await product(reader,productId);
 const markers=await reader.requirementsBaseline.count({where:{productId}})+await reader.requirementsBaselineSelection.count({where:{productId}})+await reader.criterionLineage.count({where:{productId}})+await reader.requirementsContextPin.count({where:{productId}});
 if(markers)throw new RequirementsContextError('NOT_LEGACY','Versioned or partial requirements state exists. Legacy resolution is forbidden.');
 const criteria=await reader.acceptanceCriterion.findMany({where:{workItem:{productId}},orderBy:{createdAt:'asc'},select:{id:true,workItemId:true,description:true}});
 return{formatVersion:1,mode:'LEGACY',productId,baseline:null,members:criteria.map(c=>({criterionId:c.id,workItemId:c.workItemId,description:c.description})),selectedCriterionIds:criteria.map(c=>c.id),grantsApproval:false};
}
/** Shared authoritative context primitive; consumers must select a mode explicitly. */
export async function resolveRequirementsContext(input:{productId:string;mode:'CURRENT'|'LEGACY'}|{productId:string;mode:'HISTORICAL';pinId:string},reader?:ContextReader):Promise<RequirementsContext>{
 return withRequirementsSnapshot(reader,async tx=>{if(input.mode==='CURRENT')return resolveLiveCurrent(tx,input.productId);if(input.mode==='LEGACY')return resolveLegacy(tx,input.productId);if(input.mode!=='HISTORICAL'||!input.pinId)throw new RequirementsContextError('INTEGRITY','An explicit context mode and historical pin are required.');const {readRequirementsPin}=await import('./pins');return(await readRequirementsPin(tx,input.productId,input.pinId)).context});
}
/** Friendly service preflight plus transaction lock; database guards cover every writer. */
export async function assertOrdinaryCriterionWrites(reader:ContextReader,productId:string){await lockRequirementsProduct(reader,productId);await resolveLegacy(reader,productId)}
