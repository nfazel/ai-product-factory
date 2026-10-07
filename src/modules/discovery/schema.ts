import { z } from "zod";

import { SIGNAL_LEVELS } from "@/domain/constants";

const textItem = z.string().trim().min(1).max(500);
const impactSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const briefUpdatesSchema = z
  .object({
    problemStatement: z.string().max(4000),
    productVision: z.string().max(4000),
    targetUsers: z.array(textItem).max(12),
    userNeeds: z.array(textItem).max(12),
    desiredOutcomes: z.array(textItem).max(12),
    valueProposition: z.string().max(4000),
    assumptions: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(500),
            impact: impactSchema,
            confidence: z.enum(SIGNAL_LEVELS),
          })
          .strict(),
      )
      .max(12),
    constraints: z.array(textItem).max(12),
    risks: z.array(textItem).max(12),
    openQuestions: z.array(textItem).max(8),
    inScope: z.array(textItem).max(12),
    outOfScope: z.array(textItem).max(12),
    successMeasures: z.array(textItem).max(12),
  })
  .strict();

export const discoveryAssessmentSchema = z
  .object({
    problemClarity: z.enum(SIGNAL_LEVELS),
    userClarity: z.enum(SIGNAL_LEVELS),
    outcomeClarity: z.enum(SIGNAL_LEVELS),
    scopeClarity: z.enum(SIGNAL_LEVELS),
    riskClarity: z.enum(SIGNAL_LEVELS),
    readyForReview: z.boolean(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const discoveryResponseSchema = z
  .object({
    assistantMessage: z.string().trim().min(1).max(6000),
    briefUpdates: briefUpdatesSchema,
    questions: z.array(z.string().trim().min(1).max(400)).max(5),
    assumptionsIdentified: z.array(z.string().trim().min(1).max(500)).max(12),
    risksIdentified: z.array(z.string().trim().min(1).max(500)).max(12),
    discoveryAssessment: discoveryAssessmentSchema,
  })
  .strict();

export type DiscoveryResponse = z.infer<typeof discoveryResponseSchema>;

export const startDiscoverySchema = z.object({
  productId: z.string().trim().min(1),
  initialIdea: z
    .string()
    .trim()
    .min(10, "Describe the product idea in a sentence or two.")
    .max(4000),
  optionalContext: z.string().trim().max(4000).optional().default(""),
  knownConstraints: z.string().trim().max(4000).optional().default(""),
  knownUsers: z.string().trim().max(4000).optional().default(""),
  desiredOutcome: z.string().trim().max(4000).optional().default(""),
});

export const discoveryMessageSchema = z.object({
  productId: z.string().trim().min(1),
  message: z.string().trim().min(1, "Write a reply before sending.").max(4000),
});

export const discoveryProductSchema = z.object({
  productId: z.string().trim().min(1),
});

export const editBriefSchema = z.object({
  productId: z.string().trim().min(1),
  section: z.enum([
    "problemStatement",
    "productVision",
    "targetUsers",
    "userNeeds",
    "desiredOutcomes",
    "valueProposition",
    "inScope",
    "outOfScope",
    "constraints",
    "risks",
    "successMeasures",
    "openQuestions",
  ]),
  value: z.string().max(8000),
});

export const assumptionStatusSchema = z.object({
  productId: z.string().trim().min(1),
  assumptionId: z.string().trim().min(1),
  status: z.enum(["UNVALIDATED", "VALIDATED", "INVALIDATED"]),
});
