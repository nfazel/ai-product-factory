import 'server-only';
import {db} from '@/lib/db';
import {DomainError} from '@/modules/shared/errors';
import {AuthorityUnavailableError} from './authority-status';
import {prepareRuntimeReview,requireRuntimeReview,reviewableTestCommands} from './runtime-review';
import {manifestRuntimes} from './runtime-manifest';
import {workingCopyMissing} from '@/modules/coding/restore-workspace';
import {runtimeManifestDigest} from './runtime-manifest';
import {describeRuntimeManifest,type RuntimeReviewSummary} from './runtime-review-describe';

export type RuntimeReviewState='APPROVED'|'NEEDED'|'UNAVAILABLE'|'NOT_APPLICABLE';
export type RuntimeReviewView={
 state:RuntimeReviewState;message:string;
 digest:string|null;review:RuntimeReviewSummary|null;
 approved:{by:string;at:string}|null;
 containerVerification:boolean;
 /** Existing test commands the reviewer may choose to run against a throwaway app and database. Empty once approved. */
 candidates:string[];
 /** The task's working copy is gone but can be rebuilt exactly from the approved commit. */
 restorable:boolean;
 /** The task's acceptance criteria, so a reviewer can say which a test proves. Empty once approved. */
 criteriaChoices:{id:string;description:string}[];
};
const view=(state:RuntimeReviewState,message:string,extra:Partial<RuntimeReviewView>={}):RuntimeReviewView=>({state,message,digest:null,review:null,approved:null,candidates:[],criteriaChoices:[],restorable:false,containerVerification:process.env.APF_CONTAINER_VERIFICATION_READY==='1',...extra});

/** The workspace verification uses for a task: always its most recent one, chosen here, never by the browser. */
export async function runtimeReviewWorkspaceId(productId:string,taskId:string){
 const task=await db.implementationTask.findFirst({where:{id:taskId,plan:{productId}},select:{id:true,status:true}});
 if(!task)throw new DomainError('Task not found in this product.','NOT_FOUND');
 const workspace=await db.repositoryWorkspace.findFirst({where:{productId,implementationTaskId:taskId},orderBy:{createdAt:'desc'},select:{id:true}});
 return{task,workspaceId:workspace?.id??null};
}

/** Read-only. Prepares the manifest to show it; never approves or runs anything. */
export async function getRuntimeReviewView(productId:string,taskId:string):Promise<RuntimeReviewView>{
 const {task,workspaceId}=await runtimeReviewWorkspaceId(productId,taskId);
 if(task.status!=='COMPLETED')return view('NOT_APPLICABLE','Verification starts once this task\'s coding is complete.');
 if(!workspaceId)return view('UNAVAILABLE','This task has no saved coding workspace to review.');
 let manifest;
 try{manifest=await prepareRuntimeReview(productId,workspaceId)}
 catch(error){
  const missing=await db.repositoryWorkspace.findFirst({where:{id:workspaceId,productId,status:'COMPLETED'},select:{workspacePath:true}});
  if(missing&&workingCopyMissing(missing))return view('UNAVAILABLE','The temporary working copy of this task is gone, so its code cannot be read. It can be rebuilt exactly from the commit a person approved.',{restorable:true});
  if(error instanceof AuthorityUnavailableError)return view('UNAVAILABLE','The saved workspace cannot currently be read, so there is nothing to review yet.');
  return view('UNAVAILABLE',error instanceof DomainError?error.message:'The runtime details could not be prepared for review.');
 }
 const digest=runtimeManifestDigest(manifest),review=describeRuntimeManifest(manifest);
 try{
  const binding=await requireRuntimeReview(productId,workspaceId);
  const approval=await db.approval.findUnique({where:{id:binding.approvalId},select:{approvedBy:true,resolvedAt:true}});
  return view('APPROVED','A person has reviewed and approved exactly what will run.',{digest,review:describeRuntimeManifest(binding.manifest),approved:{by:approval?.approvedBy??'a person',at:approval?.resolvedAt?.toISOString()??''}});
 }catch(error){
  if(error instanceof AuthorityUnavailableError)return view('UNAVAILABLE','The existing review cannot currently be confirmed.',{digest,review});
  if(error instanceof DomainError){let declared:string[]=[];try{declared=[...manifestRuntimes(manifest).keys()]}catch{/* shown as unavailable when approving */}
   return view('NEEDED','A person must review and approve exactly what will run before verification can start.',{digest,review,candidates:await reviewableTestCommands(productId,workspaceId,declared),criteriaChoices:manifest.criteria.map(c=>({id:c.id,description:c.description}))});}
  throw error;
 }
}
