import { z } from "zod";

import { PRODUCT_STAGES, PRODUCT_STATUSES } from "@/domain/constants";

const nameField = z
  .string()
  .trim()
  .min(1, "Product name is required")
  .max(120, "Keep the name under 120 characters");

const problemField = z
  .string()
  .trim()
  .min(1, "Describe the problem you are trying to solve")
  .max(2000);

export const createProductSchema = z.object({
  name: nameField,
  problemStatement: problemField,
  description: z.string().trim().max(500).optional().default(""),
  vision: z.string().trim().max(2000).optional().default(""),
  targetUsers: z.string().trim().max(1000).optional().default(""),
});

export const updateProductSchema = z.object({
  id: z.string().trim().min(1),
  name: nameField,
  problemStatement: problemField,
  description: z.string().trim().max(500),
  vision: z.string().trim().max(2000),
  targetUsers: z.string().trim().max(1000),
  status: z.enum(PRODUCT_STATUSES),
  currentStage: z.enum(PRODUCT_STAGES),
});
