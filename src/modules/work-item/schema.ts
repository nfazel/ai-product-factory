import { z } from "zod";

import {
  PRIORITIES,
  PRODUCT_STAGES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
} from "@/domain/constants";

const optionalParent = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

export const createWorkItemSchema = z.object({
  productId: z.string().trim().min(1),
  parentId: optionalParent,
  title: z.string().trim().min(1, "Title is required").max(180),
  description: z.string().trim().max(4000).optional().default(""),
  type: z.enum(WORK_ITEM_TYPES),
  status: z.enum(WORK_ITEM_STATUSES).optional().default("DRAFT"),
  stage: z.enum(PRODUCT_STAGES),
  priority: z.enum(PRIORITIES).optional().default("MEDIUM"),
});

export const updateWorkItemSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1, "Title is required").max(180),
  description: z.string().trim().max(4000),
  status: z.enum(WORK_ITEM_STATUSES),
  stage: z.enum(PRODUCT_STAGES),
  priority: z.enum(PRIORITIES),
});

export const dependencySchema = z.object({
  workItemId: z.string().trim().min(1),
  dependsOnId: z.string().trim().min(1, "Choose the work item this depends on"),
});
