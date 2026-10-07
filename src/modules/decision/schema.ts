import { z } from "zod";

const optionalId = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

export const createDecisionSchema = z.object({
  productId: z.string().trim().min(1),
  workItemId: optionalId,
  title: z.string().trim().min(1, "Title is required").max(160),
  description: z
    .string()
    .trim()
    .min(1, "Describe the context")
    .max(2000),
  decision: z.string().trim().min(1, "Record the decision").max(2000),
  reason: z.string().trim().min(1, "Record the reason").max(2000),
  decisionMaker: z
    .string()
    .trim()
    .min(1, "Name the decision maker")
    .max(120),
});
