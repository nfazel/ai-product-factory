import { z } from "zod";

import { ACCEPTANCE_STATUSES } from "@/domain/constants";

export const createAcceptanceSchema = z.object({
  workItemId: z.string().trim().min(1),
  description: z
    .string()
    .trim()
    .min(1, "Describe what must be true")
    .max(1000),
});

export const updateAcceptanceSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(ACCEPTANCE_STATUSES),
});
