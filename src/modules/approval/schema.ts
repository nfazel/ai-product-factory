import { z } from "zod";

import { APPROVAL_TYPES } from "@/domain/constants";

const optionalId = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

export const createApprovalSchema = z.object({
  productId: z.string().trim().min(1, "Choose a product"),
  workItemId: optionalId,
  approvalType: z.enum(APPROVAL_TYPES),
  comments: z.string().trim().max(2000).optional().default(""),
});

export const resolveApprovalSchema = z.object({
  id: z.string().trim().min(1),
  comments: z.string().trim().max(2000).optional().default(""),
  approvedBy: z.string().trim().max(120).optional().default(""),
});
