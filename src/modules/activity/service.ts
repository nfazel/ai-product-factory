import "server-only";

import type { ActivityType } from "@/domain/constants";
import { getCurrentActor } from "@/modules/identity/actor";
import {
  insertActivity,
  listActors,
  queryActivity,
} from "@/modules/activity/repository";
import type { ActivityFilters, ActivityRecord } from "@/modules/activity/types";

export async function recordActivity(input: {
  productId: string;
  workItemId?: string | null;
  type: ActivityType;
  description: string;
  actor?: string;
}) {
  const actor = input.actor ?? getCurrentActor().name;
  await insertActivity({ ...input, actor });
}

export async function listActivity(
  filters: ActivityFilters = {},
): Promise<ActivityRecord[]> {
  return queryActivity(filters);
}

export async function listActivityActors() {
  return listActors();
}
