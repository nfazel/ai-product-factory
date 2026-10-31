import "server-only";
import {currentRequirementsForView,criteriaForView} from "@/modules/requirements-baseline/presentation";
import {assertOrdinaryCriterionWrites} from "@/modules/requirements-baseline/context";

import { db } from "@/lib/db";
import type { AcceptanceCriterion } from "@/modules/acceptance/types";

function toCriterion(row: AcceptanceCriterion): AcceptanceCriterion {
  return {
    id: row.id,
    workItemId: row.workItemId,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listCriteria(workItemId: string) {
  return db.$transaction(async tx=>{
    const owner=await tx.workItem.findUnique({where:{id:workItemId},select:{productId:true}});
    if(!owner)return [];
    const context=await currentRequirementsForView(owner.productId,tx);
    const rows=await tx.acceptanceCriterion.findMany({where:{workItemId},orderBy:{createdAt:"asc"}});
    return criteriaForView(context,rows,workItemId).map(toCriterion);
  },{isolationLevel:"RepeatableRead"});
}

export async function insertCriterion(input: {
  workItemId: string;
  description: string;
}) {
  const row = await db.$transaction(async tx => {
    const owner=await tx.workItem.findUniqueOrThrow({where:{id:input.workItemId},select:{productId:true}});
    await assertOrdinaryCriterionWrites(tx,owner.productId);
    return tx.acceptanceCriterion.create({data:{workItemId:input.workItemId,description:input.description}});
  });
  return toCriterion(row);
}

export async function findCriterion(id: string) {
  const row = await db.acceptanceCriterion.findUnique({ where: { id } });
  return row ? toCriterion(row) : null;
}

export async function saveCriterionStatus(
  id: string,
  status: AcceptanceCriterion["status"],
) {
  const row = await db.acceptanceCriterion.update({
    where: { id },
    data: { status },
  });
  return toCriterion(row);
}
