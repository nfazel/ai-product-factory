import 'server-only';
import {z} from 'zod';
import {DEFINITION_SECTIONS} from '@/domain/constants';
import {db} from '@/lib/db';
import type {ContextReader} from '@/modules/requirements-baseline/context';
import {RequirementsContextError} from '@/modules/requirements-baseline/context';
import {assertGenerationSchema,readPlanningPublication,readPlanningGeneration} from '@/modules/requirements-baseline/generation';
import {currentRequirementsForView} from '@/modules/requirements-baseline/presentation';
import {planningHash} from '@/modules/requirements-baseline/planning-target';
import {validateDefinitionCandidate} from './validate';

const contract='IMMUTABLE_DEFINITION_CANDIDATE_V1';
const outputSchema=z.object({summary:z.string().min(1),payload:z.unknown(),agentRunId:z.string().min(1),seededDemo:z.literal(false)}).strict();
const inputSchema=z.object({contract:z.literal(contract),productId:z.string(),mode:z.enum(['generate','regenerate']),section:z.enum(DEFINITION_SECTIONS).nullable(),sourceId:z.string().nullable(),facts:z.record(z.string(),z.json()),factsDigest:z.string(),context:z.record(z.string(),z.json()),previousRuns:z.array(z.json()),provider:z.object({provider:z.string(),model:z.string()}).strict(),promptDigest:z.string(),temperature:z.literal(0.2)}).strict();
function integrity(message:string):never{throw new RequirementsContextError('INTEGRITY',message)}
/** Database-enforced read-only snapshot, independent of guidance, providers and recovery. */
async function inspect<T>(productId:string,work:(tx:ContextReader,product:{id:string;name:string})=>Promise<T>){
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SET TRANSACTION READ ONLY`;
  await assertGenerationSchema(tx);
  const product=await tx.product.findUnique({where:{id:productId},select:{id:true,name:true}});
  if(!product)throw new RequirementsContextError('NOT_FOUND','Product not found.');
  return work(tx,product);
 },{isolationLevel:'RepeatableRead',maxWait:10000,timeout:60000});
}
async function load(tx:ContextReader,product:{id:string;name:string},publicationId:string){
 const p=await readPlanningPublication(product.id,publicationId,tx),g=await readPlanningGeneration(product.id,p.row.generationId,tx);
 // A proposal carrying the candidate's identity is legitimate only when a selection record names it. The record and the proposal must agree.
 const physical=await tx.definitionProposal.count({where:{id:p.row.artifactId}}),selection=await tx.definitionCandidateSelection.findUnique({where:{publicationId:p.row.id}});
 if(physical&&!selection)integrity('Unexpected materialisation without a supported candidate selection record.');
 if(selection&&(!physical||selection.proposalId!==p.row.artifactId||selection.contentDigest!==p.row.contentDigest||selection.productId!==product.id))integrity('The candidate selection record does not match the candidate.');
 if(p.row.purpose!=='DEFINITION_PROPOSAL'||p.row.artifactKind!=='DEFINITION_PROPOSAL'||g.row.inputIdentity!==contract)integrity('Not a supported immutable definition candidate.');
 const input=inputSchema.parse(g.manifest.inputSnapshot),snapshot=outputSchema.parse(p.manifest.snapshot),proposal=validateDefinitionCandidate(snapshot.payload);
 if(input.productId!==product.id||planningHash(input.facts)!==input.factsDigest||planningHash(input.context)!==planningHash(g.manifest.context)||snapshot.summary!==proposal.assistantSummary||planningHash(snapshot.payload)!==planningHash(proposal))integrity('Candidate capture or proposal content is inconsistent.');
 if(g.row.mode==='UNBOUND_BOOTSTRAP'&&(input.mode!=='generate'||input.section!==null||input.sourceId!==null))integrity('Bootstrap provenance is not an initial generation.');
 const factsProduct=input.facts.product as {id?:unknown}|undefined;
 const brief=input.facts.brief as {id?:unknown;problemStatement?:unknown;productId?:unknown;version?:unknown}|undefined;
 if(factsProduct?.id!==product.id||brief?.productId!==product.id||typeof brief.id!=='string'||typeof brief.problemStatement!=='string'||!brief.problemStatement.trim())integrity('Candidate product/problem context is missing or inconsistent.');
 const run=await tx.agentRun.findFirst({where:{id:snapshot.agentRunId,productId:product.id,agentType:'REQUIREMENTS',status:'COMPLETED'}});
 if(!run?.completedAt)integrity('Original successful generation provenance is unavailable.');
 const request=run!.input as Record<string,unknown>|null,result=run!.output as Record<string,unknown>|null;
 if(request?.mode!==input.mode||request?.section!==(input.section??undefined)||result?.approved!==false||request?.generationId!==g.row.id||request?.generationDigest!==g.row.digest||result?.contract!==contract||result?.generationId!==g.row.id||result?.generationDigest!==g.row.digest||result?.inputDigest!==g.row.inputDigest||planningHash(result?.payload)!==planningHash(proposal))integrity('Original generation provenance does not match the publication.');
 let applicability:'CURRENT'|'STALE'|'UNPROVEN'='UNPROVEN',reason='Current requirements context could not be established.';
 let currentBaseline:{id:string;digest:string}|null=null;
 try{
  const c=await currentRequirementsForView(product.id,tx);currentBaseline=c.baseline?{id:c.baseline.id,digest:c.baseline.digest}:null;
  const same=p.manifest.mode==='UNBOUND_BOOTSTRAP'?c.mode==='LEGACY'&&c.members.length===0:!!c.baseline&&planningHash({baseline:c.baseline,members:c.members,selectedCriterionIds:c.selectedCriterionIds})===planningHash(g.manifest.context);
  applicability=same?'CURRENT':'STALE';reason=same?'The captured requirements context remains current.':'Requirements context has changed since this candidate was generated.';
 }catch(error){
  if(error instanceof RequirementsContextError&&error.code==='DRIFT'){applicability='STALE';reason='Current requirements differ from the recorded baseline.';}
  // Historical content stays intact; inability to prove current applicability grants no authority.
 }
 return{product,publicationId:p.row.id,artifactId:p.row.artifactId,generationId:g.row.id,reservedAt:g.row.createdAt.toISOString(),generatedAt:run!.completedAt!.toISOString(),publishedAt:p.row.createdAt.toISOString(),contentDigest:p.row.contentDigest,revision:p.row.artifactRevision,
  provenance:{kind:'AI_GENERATED' as const,agentRunId:run!.id,provider:typeof result?.provider==='string'?result.provider:input.provider.provider,model:typeof result?.model==='string'?result.model:input.provider.model,mode:input.mode,sourceArtifactId:input.sourceId},
  requirements:{mode:p.manifest.mode,baseline:p.manifest.baseline,currentBaseline,applicability,reason},context:{briefId:brief.id,briefVersion:brief.version,problemStatement:brief.problemStatement},proposal,selected:Boolean(selection),selection:selection?{selectedBy:selection.selectedBy,selectedByKind:selection.selectedByKind,selectedAt:selection.createdAt.toISOString()}:null,approved:false as const,grantsApproval:false as const};
}
export type DefinitionCandidateInspection=Awaited<ReturnType<typeof load>>;
export async function loadDefinitionCandidateInspection(productId:string,publicationId:string){return inspect(productId,(tx,product)=>load(tx,product,publicationId))}
/** Every listed publication is authenticated; an invalid row is never silently replaced or omitted. */
export async function listDefinitionCandidateInspections(productId:string){
 return inspect(productId,async(tx,product)=>{
  const rows=await tx.planningPublication.findMany({where:{productId,purpose:'DEFINITION_PROPOSAL'},orderBy:[{createdAt:'desc'},{id:'asc'}],select:{id:true}});
  const candidates:DefinitionCandidateInspection[]=[];
  for(const row of rows)candidates.push(await load(tx,product,row.id));
  return{product,candidates};
 });
}
