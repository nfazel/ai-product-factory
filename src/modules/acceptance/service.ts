import "server-only";

import { ACCEPTANCE_STATUS_LABEL } from "@/domain/constants";
import { recordActivity } from "@/modules/activity/service";
import { noteVerificationStale } from "@/modules/verification/impact";
import { DomainError } from "@/modules/shared/errors";
import { findWorkItemRow } from "@/modules/work-item/repository";
import {
  findCriterion,
  insertCriterion,
  listCriteria,
  saveCriterionStatus,
} from "@/modules/acceptance/repository";
import type { AcceptanceCriterion } from "@/modules/acceptance/types";

export async function listAcceptanceCriteria(workItemId: string) {
  return listCriteria(workItemId);
}

export async function addAcceptanceCriterion(input: {
  workItemId: string;
  description: string;
}) {
  const item = await findWorkItemRow(input.workItemId);
  if (!item) throw new DomainError("Work item not found.", "NOT_FOUND");

  const criterion = await insertCriterion(input);
  await recordActivity({
    productId: item.productId,
    workItemId: item.id,
    type: "ACCEPTANCE_CRITERION_ADDED",
    description: `Added acceptance criterion: "${criterion.description}".`,
  });
  await noteVerificationStale(item.productId, "An acceptance criterion changed.");
  return criterion;
}

export async function updateAcceptanceStatus(
  id: string,
  status: AcceptanceCriterion["status"],
) {
  const existing = await findCriterion(id);
  if (!existing) {
    throw new DomainError("Acceptance criterion not found.", "NOT_FOUND");
  }
  if (existing.status === status) return existing;

  const item = await findWorkItemRow(existing.workItemId);
  if (!item) throw new DomainError("Work item not found.", "NOT_FOUND");

  const criterion = await saveCriterionStatus(id, status);
  await recordActivity({
    productId: item.productId,
    workItemId: item.id,
    type: "ACCEPTANCE_CRITERION_UPDATED",
    description: `Marked an acceptance criterion as ${ACCEPTANCE_STATUS_LABEL[status].toLowerCase()}.`,
  });
  await noteVerificationStale(item.productId, "An acceptance criterion changed.");
  return criterion;
}
