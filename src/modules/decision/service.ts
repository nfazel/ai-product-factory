import "server-only";

import { recordActivity } from "@/modules/activity/service";
import { DomainError } from "@/modules/shared/errors";
import { findProductRow } from "@/modules/product/repository";
import { findWorkItemRow } from "@/modules/work-item/repository";
import { insertDecision, queryDecisions } from "@/modules/decision/repository";
import type { CreateDecisionInput } from "@/modules/decision/types";

export async function listDecisions(filters: {
  productId?: string;
  workItemId?: string;
  limit?: number;
}) {
  return queryDecisions(filters);
}

export async function recordDecision(input: CreateDecisionInput) {
  const product = await findProductRow(input.productId);
  if (!product) throw new DomainError("Product not found.", "NOT_FOUND");

  if (input.workItemId) {
    const item = await findWorkItemRow(input.workItemId);
    if (!item || item.productId !== input.productId) {
      throw new DomainError("Choose a work item from this product.");
    }
  }

  const decision = await insertDecision(input);
  await recordActivity({
    productId: decision.productId,
    workItemId: decision.workItemId,
    type: "DECISION_RECORDED",
    description: `Recorded decision "${decision.title}".`,
    actor: decision.decisionMaker,
  });
  return decision;
}
