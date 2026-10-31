import 'server-only';
import {assertRequirementsSchema,resolveLegacy,resolveLiveCurrent,withRequirementsSnapshot,type ContextReader,type RequirementsContext,RequirementsContextError} from './context';
import {readRequirementsPin} from './pins';

/** Read-only mode selection: database errors never establish legacy status. */
export async function currentRequirementsForView(productId:string,reader?:ContextReader){
 return withRequirementsSnapshot(reader,async tx=>{
  await assertRequirementsSchema(tx);
  const markers=await tx.requirementsBaseline.count({where:{productId}})+await tx.requirementsBaselineSelection.count({where:{productId}})+await tx.criterionLineage.count({where:{productId}})+await tx.requirementsContextPin.count({where:{productId}});
  return markers?resolveLiveCurrent(tx,productId):resolveLegacy(tx,productId);
 });
}
export function criteriaForView<T extends {id:string;workItemId:string;description:string}>(context:RequirementsContext,rows:T[],workItemId?:string):T[]{
 const members=context.members.filter(m=>(!workItemId||m.workItemId===workItemId)&&context.selectedCriterionIds.includes(m.criterionId));
 const byId=new Map(rows.map(r=>[r.id,r]));
 return members.map(m=>{const row=byId.get(m.criterionId);if(!row||row.workItemId!==m.workItemId)throw new RequirementsContextError('INTEGRITY','Requirements presentation ownership or member data is unavailable.');return{...row,description:m.description}});
}
export function requirementsViewLabel(context:RequirementsContext){return{mode:context.mode,baseline:context.baseline,grantsApproval:false as const}}
/** This envelope is outside signed artifacts. Never infer a historical pin from live rows. */
export async function artifactRequirementsForView(productId:string,operationKind:string,operationId:string,current:RequirementsContext,reader?:ContextReader){
 if(current.productId!==productId)throw new RequirementsContextError('INTEGRITY','Requirements presentation product mismatch.');
 return withRequirementsSnapshot(reader,async tx=>{
  const row=await tx.requirementsContextPin.findUnique({where:{operationKind_operationId:{operationKind,operationId}}});
  if(!row)return{status:'UNPROVEN' as const,current:requirementsViewLabel(current),historical:null,criteria:null,grantsApproval:false as const};
  if(row.productId!==productId)throw new RequirementsContextError('INTEGRITY','Requirements pin belongs to another product.');
  try{const captured=await readRequirementsPin(tx,productId,row.id);const same=current.baseline?.id===captured.manifest.baseline.id&&current.baseline?.digest===captured.manifest.baseline.digest&&current.baseline?.selectionId===captured.manifest.baseline.selectionId;return{status:same?'CURRENT' as const:'STALE' as const,current:requirementsViewLabel(current),historical:requirementsViewLabel(captured.context),criteria:captured.context.members.filter(m=>captured.context.selectedCriterionIds.includes(m.criterionId)),grantsApproval:false as const}}
  catch(error){if(error instanceof RequirementsContextError&&error.code==='NOT_FOUND')throw error;return{status:'UNAVAILABLE' as const,current:requirementsViewLabel(current),historical:null,criteria:null,grantsApproval:false as const}}
 });
}
