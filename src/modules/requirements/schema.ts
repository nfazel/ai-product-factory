import { z } from "zod";

import {
  DEFINITION_SECTIONS,
  NFR_CATEGORIES,
  PRIORITIES,
  SIGNAL_LEVELS,
} from "@/domain/constants";

const tempId = (prefix: string) =>
  z
    .string()
    .regex(
      new RegExp(`^${prefix}-[1-9]\\d*$`),
      `Use a stable id such as ${prefix}-1.`,
    );

const prioritySchema = z.enum(PRIORITIES);
const impactSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const proposedOutcomeSchema = z
  .object({
    tempId: tempId("outcome"),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
    successMeasure: z.string().trim().min(1).max(500),
    targetValue: z.string().trim().max(200),
  })
  .strict();

export const proposedCapabilitySchema = z
  .object({
    tempId: tempId("capability"),
    outcomeTempId: tempId("outcome"),
    name: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
    priority: prioritySchema,
  })
  .strict();

export const proposedEpicSchema = z
  .object({
    tempId: tempId("epic"),
    capabilityTempId: tempId("capability"),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
    priority: prioritySchema,
  })
  .strict();

export const proposedFeatureSchema = z
  .object({
    tempId: tempId("feature"),
    epicTempId: tempId("epic"),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
    priority: prioritySchema,
    inFirstSlice: z.boolean(),
  })
  .strict();

export const proposedStorySchema = z
  .object({
    tempId: tempId("story"),
    featureTempId: tempId("feature"),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
    persona: z.string().trim().max(180),
    need: z.string().trim().max(500),
    value: z.string().trim().max(500),
    priority: prioritySchema,
    inFirstSlice: z.boolean(),
  })
  .strict();

export const proposedAcceptanceSchema = z
  .object({
    tempId: tempId("ac"),
    storyTempId: tempId("story"),
    description: z.string().trim().min(1).max(1000),
  })
  .strict();

export const proposedNfrSchema = z
  .object({
    tempId: tempId("nfr"),
    category: z.enum(NFR_CATEGORIES),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
    measure: z.string().trim().max(500),
  })
  .strict();

export const proposedSliceSchema = z
  .object({
    tempId: tempId("slice"),
    name: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
    rationale: z.string().trim().min(1).max(2000),
  })
  .strict();

export const proposedAssumptionSchema = z
  .object({
    tempId: tempId("assumption"),
    description: z.string().trim().min(1).max(500),
    impact: impactSchema,
    confidence: z.enum(SIGNAL_LEVELS),
    storyTempId: z.string().trim().max(40),
  })
  .strict();

export const proposedDependencySchema = z
  .object({
    tempId: tempId("dependency"),
    fromTempId: z.string().trim().min(1).max(40),
    toTempId: z.string().trim().min(1).max(40),
    note: z.string().trim().max(500),
  })
  .strict();

export const proposedQuestionSchema = z
  .object({
    tempId: tempId("question"),
    storyTempId: z.string().trim().max(40),
    question: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(500),
    impact: impactSchema,
  })
  .strict();

export const requirementsResponseSchema = z
  .object({
    assistantSummary: z.string().trim().min(1).max(4000),
    proposedOutcomes: z.array(proposedOutcomeSchema).min(1).max(7),
    proposedCapabilities: z.array(proposedCapabilitySchema).min(1).max(10),
    proposedEpics: z.array(proposedEpicSchema).min(1).max(6),
    proposedFeatures: z.array(proposedFeatureSchema).min(1).max(12),
    proposedStories: z.array(proposedStorySchema).max(12),
    proposedAcceptanceCriteria: z.array(proposedAcceptanceSchema).max(36),
    proposedNFRs: z.array(proposedNfrSchema).max(10),
    proposedFirstSlice: proposedSliceSchema,
    assumptions: z.array(proposedAssumptionSchema).max(12),
    dependencies: z.array(proposedDependencySchema).max(20),
    openQuestions: z.array(proposedQuestionSchema).max(12),
    readinessAssessment: z
      .object({
        summary: z.string().trim().min(1).max(1000),
        notes: z.array(z.string().trim().min(1).max(400)).max(10),
      })
      .strict(),
  })
  .strict();

export type RequirementsResponse = z.infer<typeof requirementsResponseSchema>;

const reviewFields = {
  reviewStatus: z.enum(["PENDING", "ACCEPTED", "REJECTED"]),
  edited: z.boolean(),
  committedId: z.string().nullable(),
  replacesId: z.string().nullable(),
};

function reviewed<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...shape, ...reviewFields }).strict();
}

export const storedProposalSchema = z
  .object({
    assistantSummary: z.string(),
    outcomes: z.array(reviewed(proposedOutcomeSchema.shape)).max(7),
    capabilities: z.array(reviewed(proposedCapabilitySchema.shape)).max(10),
    epics: z.array(reviewed(proposedEpicSchema.shape)).max(6),
    features: z.array(reviewed(proposedFeatureSchema.shape)).max(12),
    stories: z.array(reviewed(proposedStorySchema.shape)).max(12),
    acceptanceCriteria: z.array(reviewed(proposedAcceptanceSchema.shape)).max(36),
    nfrs: z.array(reviewed(proposedNfrSchema.shape)).max(10),
    firstSlice: reviewed(proposedSliceSchema.shape).nullable(),
    assumptions: z.array(reviewed(proposedAssumptionSchema.shape)).max(12),
    dependencies: z.array(reviewed(proposedDependencySchema.shape)).max(20),
    questions: z.array(reviewed(proposedQuestionSchema.shape)).max(12),
    readinessAssessment: z.object({
      summary: z.string(),
      notes: z.array(z.string()),
    }),
  })
  .strict();

export type StoredProposal = z.infer<typeof storedProposalSchema>;
export type ProposalItem = { tempId: string; reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED"; edited: boolean; committedId: string | null; replacesId: string | null };

export const productIdSchema = z.object({
  productId: z.string().trim().min(1),
});

export const proposalActionSchema = z.object({
  productId: z.string().trim().min(1),
  proposalId: z.string().trim().min(1),
  tempId: z.string().trim().min(1),
  section: z.enum(DEFINITION_SECTIONS),
});

export const editProposalSchema = proposalActionSchema.extend({
  title: z.string().trim().max(2000),
  body: z.string().trim().max(4000),
});

export const regenerateSchema = z.object({
  productId: z.string().trim().min(1),
  section: z.enum(DEFINITION_SECTIONS),
});

export const entityActionSchema = z.object({
  productId: z.string().trim().min(1),
  entityId: z.string().trim().min(1),
});

export const answerQuestionSchema = entityActionSchema.extend({
  answer: z.string().trim().min(1, "Write an answer before saving.").max(2000),
});

export function toStoredProposal(response: RequirementsResponse): StoredProposal {
  const pending = {
    reviewStatus: "PENDING" as const,
    edited: false,
    committedId: null,
    replacesId: null,
  };
  return {
    assistantSummary: response.assistantSummary,
    outcomes: response.proposedOutcomes.map((item) => ({ ...item, ...pending })),
    capabilities: response.proposedCapabilities.map((item) => ({ ...item, ...pending })),
    epics: response.proposedEpics.map((item) => ({ ...item, ...pending })),
    features: response.proposedFeatures.map((item) => ({ ...item, ...pending })),
    stories: response.proposedStories.map((item) => ({ ...item, ...pending })),
    acceptanceCriteria: response.proposedAcceptanceCriteria.map((item) => ({
      ...item,
      ...pending,
    })),
    nfrs: response.proposedNFRs.map((item) => ({ ...item, ...pending })),
    firstSlice: { ...response.proposedFirstSlice, ...pending },
    assumptions: response.assumptions.map((item) => ({ ...item, ...pending })),
    dependencies: response.dependencies.map((item) => ({ ...item, ...pending })),
    questions: response.openQuestions.map((item) => ({ ...item, ...pending })),
    readinessAssessment: response.readinessAssessment,
  };
}
