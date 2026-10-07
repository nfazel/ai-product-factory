import { z } from "zod";

import { PRODUCT_STAGES, PRODUCT_STATUSES } from "@/domain/constants";

export const createProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Product name is required")
    .max(120, "Keep the name under 120 characters"),
  description: z
    .string()
    .trim()
    .min(1, "A short description is required")
    .max(500, "Keep the description under 500 characters"),
  vision: z
    .string()
    .trim()
    .min(1, "Product vision is required")
    .max(2000),
  problemStatement: z
    .string()
    .trim()
    .min(1, "Problem statement is required")
    .max(2000),
  targetUsers: z
    .string()
    .trim()
    .min(1, "Target users are required")
    .max(1000),
});

export const updateProductSchema = createProductSchema.extend({
  id: z.string().trim().min(1),
  status: z.enum(PRODUCT_STATUSES),
  currentStage: z.enum(PRODUCT_STAGES),
});
