import { z } from "zod";

export const ESCALATION_TYPES = [
  "REQUIREMENT_AMBIGUITY",
  "ARCHITECTURE_CONFLICT",
  "MISSING_DEPENDENCY",
  "POLICY_CONFLICT",
  "SCOPE_EXPANSION",
  "TEST_FAILURE",
  "SECURITY_CONCERN",
  "UNEXPECTED_CODEBASE",
  "OTHER",
] as const;

export const COMPLETION_PROPOSALS = [
  "COMPLETED",
  "COMPLETED_WITH_CONCERNS",
  "ESCALATED",
  "FAILED",
] as const;

export const repositoryAnalysisSchema = z
  .object({
    summary: z.string().trim().min(1).max(2000),
    relevantFiles: z.array(z.string().trim().min(1).max(240)).max(20),
    notes: z.string().trim().max(2000),
  })
  .strict();

export const executionPlanSchema = z
  .object({
    summary: z.string().trim().min(1).max(2000),
    filesExpectedToChange: z.array(z.string().trim().min(1).max(240)).max(30),
    steps: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
    risks: z.string().trim().max(2000),
    validationPlan: z.string().trim().min(1).max(2000),
  })
  .strict();

export const escalationSchema = z
  .object({
    type: z.enum(ESCALATION_TYPES),
    description: z.string().trim().min(1).max(2000),
    reason: z.string().trim().min(1).max(2000),
    recommendedAction: z.string().trim().min(1).max(2000),
  })
  .strict();

export const changeRequestSchema = z
  .object({
    summary: z.string().trim().min(1).max(2000),
    operations: z
      .array(
        z
          .object({
            action: z.enum(["CREATE_FILE", "WRITE_FILE", "DELETE_FILE"]),
            path: z.string().trim().min(1).max(240),
            content: z.string().max(80_000),
          })
          .strict(),
      )
      .max(30),
    commands: z.array(z.string().trim().min(1).max(200)).max(8),
    escalation: escalationSchema.nullable(),
    completionProposal: z.enum(COMPLETION_PROPOSALS),
  })
  .strict();

export const selfReviewSchema = z
  .object({
    summary: z.string().trim().min(1).max(2000),
    potentialDefects: z.array(z.string().trim().max(500)).max(12),
    missingAcceptance: z.array(z.string().trim().max(500)).max(12),
    unnecessaryChanges: z.array(z.string().trim().max(500)).max(12),
    architectureDeviations: z.array(z.string().trim().max(500)).max(12),
    securityConcerns: z.array(z.string().trim().max(500)).max(12),
    missingTests: z.array(z.string().trim().max(500)).max(12),
  })
  .strict();

export const completionAssessmentSchema = z
  .object({
    proposal: z.enum(COMPLETION_PROPOSALS),
    rationale: z.string().trim().min(1).max(2000),
  })
  .strict();

export type RepositoryAnalysis = z.infer<typeof repositoryAnalysisSchema>;
export type ExecutionPlanDraft = z.infer<typeof executionPlanSchema>;
export type ChangeRequest = z.infer<typeof changeRequestSchema>;
export type SelfReviewDraft = z.infer<typeof selfReviewSchema>;
export type CompletionAssessment = z.infer<typeof completionAssessmentSchema>;
