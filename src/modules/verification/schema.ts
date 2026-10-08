import { z } from "zod";

const SOURCES = [
  "ACCEPTANCE_CRITERION",
  "NFR",
  "SECURITY_FINDING",
  "RISK",
  "AGENT_ANALYSIS",
  "HUMAN",
] as const;

const TEST_TYPES = [
  "UNIT",
  "INTEGRATION",
  "API",
  "UI",
  "END_TO_END",
  "SECURITY",
  "PERFORMANCE",
  "ACCESSIBILITY",
  "MANUAL",
  "OTHER",
] as const;

const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export const conditionAnalysisSchema = z
  .object({
    summary: z.string().trim().max(2000),
    conditions: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            description: z.string().trim().max(1000),
            negative: z.boolean(),
            acceptanceCriterionId: z.string().trim().max(80),
            source: z.enum(SOURCES),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();

export const verificationPlanSchema = z
  .object({
    summary: z.string().trim().min(1).max(2000),
    existingTestNotes: z.string().trim().max(2000),
    untestedAreas: z.array(z.string().trim().max(300)).max(8),
  })
  .strict();

export const testCaseSchema = z
  .object({
    testCases: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            purpose: z.string().trim().max(1000),
            preconditions: z.string().trim().max(1000),
            steps: z.array(z.string().trim().min(1).max(300)).max(8),
            expectedResult: z.string().trim().min(1).max(1000),
            testType: z.enum(TEST_TYPES),
            priority: z.enum(PRIORITIES),
            source: z.enum(SOURCES),
            acceptanceCriterionId: z.string().trim().max(80),
            automated: z.boolean(),
            filePath: z.string().trim().max(240),
            body: z.string().max(20_000),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

export const coverageMappingSchema = z
  .object({
    mappings: z
      .array(
        z
          .object({
            acceptanceCriterionId: z.string().trim().min(1).max(80),
            rationale: z.string().trim().max(1000),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

export const interpretationSchema = z
  .object({
    summary: z.string().trim().max(2000),
    concerns: z.array(z.string().trim().max(500)).max(8),
  })
  .strict();

export const defectProposalSchema = z
  .object({
    defects: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            description: z.string().trim().max(2000),
            severity: z.enum(PRIORITIES),
            acceptanceCriterionId: z.string().trim().max(80),
            condition: z.string().trim().max(1000),
            expected: z.string().trim().max(1000),
            actual: z.string().trim().max(1000),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

export const verificationSummarySchema = z
  .object({
    proposedVerdict: z.enum(["PASS", "PASS_WITH_CONCERNS", "FAIL", "INCONCLUSIVE"]),
    rationale: z.string().trim().max(2000),
  })
  .strict();
