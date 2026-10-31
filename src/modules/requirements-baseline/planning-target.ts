import 'server-only';
import {canonicalJson,contentHash} from '@/modules/coding/external-manifest';
import {rejectOperatorSecret} from '@/modules/feature-review/authorization';
import {RequirementsContextError,type ContextReader} from './context';
export const planningKinds=['DEFINITION_PROPOSAL','PRODUCT_DEFINITION','SOLUTION_ARCHITECTURE','IMPLEMENTATION_PLAN'] as const;
export type PlanningKind=typeof planningKinds[number];
export const planningHash=(value:unknown)=>contentHash(canonicalJson(value));
/** Explicit new-format projection only. Legacy serializers never call this. */
const relations=new Set(['components','traces','relationships','decisions','questions','findings','dataEntities','integrations','technologies','nfrCoverages','tasks','dependencies','workItems','criteria','outcomes','capabilities','slices','nfrs']);
function clean(value:unknown,root=false):unknown{
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 return Object.fromEntries(Object.entries(value).filter(([k])=>!['createdAt','updatedAt','referenceCode'].includes(k)&&!(!root&&['solutionArchitectureId','implementationPlanId'].includes(k))&&!(root&&['id','productId','status','approvedAt'].includes(k))).map(([k,v])=>[k,relations.has(k)&&Array.isArray(v)?v.map(row=>clean(row)):v]));
}
export function planningSnapshot(kind:PlanningKind,value:unknown){const snapshot=JSON.parse(canonicalJson(clean(value,true)));rejectOperatorSecret(snapshot);const digest=planningHash(snapshot);const version=kind==='IMPLEMENTATION_PLAN'||kind==='SOLUTION_ARCHITECTURE'?snapshot.version:null;if(version!==null&&(!Number.isSafeInteger(version)||version<1))throw new RequirementsContextError('INTEGRITY','Planning version must be positive.');return{kind,revision:version===null?`sha256:${digest}`:`v${version}:${digest}`,digest,snapshot}}
/** Loads exact semantic content; operational task status does not replace a content revision. */
export async function loadPlanningTarget(tx:ContextReader,productId:string,kind:PlanningKind,id:string){
 let row:unknown;
 if(kind==='DEFINITION_PROPOSAL')row=await tx.definitionProposal.findFirst({where:{id,productId}});
 if(kind==='SOLUTION_ARCHITECTURE')row=await tx.solutionArchitecture.findFirst({where:{id,productId},include:{components:{orderBy:{id:'asc'},include:{traces:{orderBy:{id:'asc'}}}},relationships:{orderBy:{id:'asc'}},decisions:{orderBy:{id:'asc'}},questions:{orderBy:{id:'asc'}},findings:{orderBy:{id:'asc'}},dataEntities:{orderBy:{id:'asc'}},integrations:{orderBy:{id:'asc'}},technologies:{orderBy:{id:'asc'}},nfrCoverages:{orderBy:{id:'asc'}}}});
 if(kind==='IMPLEMENTATION_PLAN'){
  const plan=await tx.implementationPlan.findFirst({where:{id,productId},include:{tasks:{orderBy:{id:'asc'},include:{components:{orderBy:{componentId:'asc'}},dependencies:{orderBy:{dependsOnId:'asc'}}}}}});
  row=plan?{...plan,tasks:plan.tasks.map(task=>{const {status,...content}=task;void status;return content})}:null;
 }
 if(kind==='PRODUCT_DEFINITION'){
  const definition=await tx.productDefinition.findFirst({where:{id,productId}});
  if(definition){const [workItems,criteria,outcomes,capabilities,slices,nfrs]=await Promise.all([tx.workItem.findMany({where:{productId},orderBy:{id:'asc'}}),tx.acceptanceCriterion.findMany({where:{workItem:{productId}},orderBy:{id:'asc'},select:{id:true,workItemId:true,description:true}}),tx.productOutcome.findMany({where:{productId},orderBy:{id:'asc'}}),tx.productCapability.findMany({where:{productId},orderBy:{id:'asc'}}),tx.productSlice.findMany({where:{productId},orderBy:{id:'asc'}}),tx.nonFunctionalRequirement.findMany({where:{productId},orderBy:{id:'asc'}})]);row={...definition,workItems:workItems.map(w=>{const{status,...content}=w;void status;return content}),criteria,outcomes,capabilities,slices,nfrs};}
 }
 if(!row)throw new RequirementsContextError('NOT_FOUND','Planning target not found in this product.');
 return{id,...planningSnapshot(kind,row)};
}
