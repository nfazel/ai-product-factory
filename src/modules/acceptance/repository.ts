import "server-only";

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
  const rows = await db.acceptanceCriterion.findMany({
    where: { workItemId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toCriterion);
}

export async function insertCriterion(input: {
  workItemId: string;
  description: string;
}) {
  const row = await db.acceptanceCriterion.create({
    data: { workItemId: input.workItemId, description: input.description },
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
