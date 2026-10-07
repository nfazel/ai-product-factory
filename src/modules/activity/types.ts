import type { ActivityType } from "@/domain/constants";

export type ActivityRecord = {
  id: string;
  productId: string;
  productName: string;
  workItemId: string | null;
  workItemTitle: string | null;
  type: string;
  description: string;
  actor: string;
  createdAt: Date;
};

export type ActivityFilters = {
  productId?: string;
  workItemId?: string;
  workItemQuery?: string;
  actor?: string;
  type?: ActivityType;
  from?: Date;
  to?: Date;
  limit?: number;
};
