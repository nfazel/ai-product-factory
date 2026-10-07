import type { AcceptanceStatus } from "@/domain/constants";

export type AcceptanceCriterion = {
  id: string;
  workItemId: string;
  description: string;
  status: AcceptanceStatus;
  createdAt: Date;
  updatedAt: Date;
};
