import 'server-only';
import {db} from '@/lib/db';
import {DomainError} from '@/modules/shared/errors';
import type {Prisma} from '@/generated/prisma/client';
export const REWORK_BLOCKED='Managed rework is activated for tracking only. Protected rework coding integration is not enabled.';
export async function assertReworkSchema(reader:Prisma.TransactionClient=db){
 const r=await reader.$queryRaw<{ready:boolean}[]>`SELECT to_regclass('public."ReworkAmendment"') IS NOT NULL AND to_regclass('public."ReworkEvent"') IS NOT NULL AND to_regclass('public."ReworkTaskBinding"') IS NOT NULL AND (SELECT count(*)=14 FROM pg_trigger WHERE current_setting('session_replication_role')='origin' AND tgrelid IN (to_regclass('public."ReworkAmendment"'),to_regclass('public."ReworkEvent"'),to_regclass('public."ReworkTaskBinding"'),to_regclass('public."ImplementationTask"'),to_regclass('public."RepositoryWorkspace"')) AND NOT tgisinternal AND tgenabled IN ('O','A') AND tgname=ANY(ARRAY['ReworkAmendment_immutable','ReworkAmendment_no_truncate','ReworkEvent_immutable','ReworkEvent_no_truncate','ReworkEvent_binding','ReworkTask_guard','ReworkTask_no_truncate','ReworkWorkspace_guard','ReworkTaskBinding_immutable','ReworkTaskBinding_no_truncate','ReworkTask_binding','ReworkAmendment_binding','ReworkTaskBinding_binding','ReworkEvent_complete'])) AS ready`;
 if(!r[0]?.ready)throw new DomainError('Rework isolation schema or guards are unavailable. Coding is blocked.');
}
export async function isManagedReworkTask(productId:string,taskId:string){
 await assertReworkSchema();const task=await db.implementationTask.findFirst({where:{id:taskId,plan:{productId}},select:{id:true}});
 if(!task)throw new DomainError('Task not found in this product.','NOT_FOUND');
 const reserved=await db.$queryRaw<{id:string}[]>`SELECT id FROM "ReworkAmendment" WHERE manifest->'tasks' @> ${JSON.stringify([{id:taskId}])}::jsonb LIMIT 1`;
 return reserved.length>0||await db.reworkTaskBinding.count({where:{taskId}})>0;
}
export async function assertLegacyCodingTask(productId:string,taskId:string){if(await isManagedReworkTask(productId,taskId))throw new DomainError(REWORK_BLOCKED)}
export async function assertLegacyCodingWorkspace(productId:string,workspaceId:string){const w=await db.repositoryWorkspace.findFirst({where:{id:workspaceId,productId},select:{implementationTaskId:true}});if(!w)throw new DomainError('Workspace not found.','NOT_FOUND');await assertLegacyCodingTask(productId,w.implementationTaskId)}
