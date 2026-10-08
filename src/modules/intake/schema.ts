import { z } from "zod";

export const REQUIREMENT_KINDS = [
  "BUSINESS",
  "FUNCTIONAL",
  "NON_FUNCTIONAL",
  "SECURITY",
  "REGULATORY",
  "DATA",
  "INTEGRATION",
  "TECHNICAL_CONSTRAINT",
  "USER_EXPERIENCE",
  "OPERATIONAL",
  "UNKNOWN",
] as const;

export const FINDING_TYPES = [
  "AMBIGUOUS",
  "INCOMPLETE",
  "CONFLICT",
  "DUPLICATE",
  "MISSING_ACCEPTANCE_CRITERIA",
  "MISSING_OUTCOME",
  "UNCONFIRMED_ASSUMPTION",
  "MISSING_ACTOR",
  "MISSING_BUSINESS_RULE",
  "UNTESTABLE",
  "SECURITY_QUESTION",
  "NFR_GAP",
  "DEPENDENCY",
  "OTHER",
] as const;

const requirementSchema = z
  .object({
    key: z.string().trim().min(1).max(40),
    sourceKey: z.string().trim().min(1).max(40),
    identifier: z.string().trim().max(40).nullable(),
    excerpt: z.string().trim().min(1).max(2000),
    sectionHeading: z.string().trim().max(200),
    blockIndex: z.number().int().nonnegative().max(5000),
    pageNumber: z.number().int().positive().max(5000).nullable(),
    requirementType: z.enum(REQUIREMENT_KINDS),
    interpretation: z.string().trim().min(1).max(2000),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW", "UNCERTAIN"]),
    suggestedCapability: z.string().trim().max(200),
  })
  .strict();

const findingSchema = z
  .object({
    findingType: z.enum(FINDING_TYPES),
    severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH"]),
    title: z.string().trim().min(1).max(200),
    explanation: z.string().trim().min(1).max(2000),
    requirementKeys: z.array(z.string().trim().min(1).max(40)).max(12),
    gapNote: z.string().trim().max(500),
  })
  .strict();

const questionSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(500),
    priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
    requirementKeys: z.array(z.string().trim().min(1).max(40)).max(12),
  })
  .strict();

export const intakeAnalysisSchema = z
  .object({
    requirements: z.array(requirementSchema).min(1).max(80),
    findings: z.array(findingSchema).max(80),
    questions: z.array(questionSchema).max(40),
    brief: z
      .object({
        problem: z.string().trim().max(2000),
        users: z.array(z.string().trim().min(1).max(300)).max(12),
        needs: z.array(z.string().trim().min(1).max(300)).max(12),
        outcomes: z.array(z.string().trim().min(1).max(300)).max(8),
        value: z.string().trim().max(1000),
        assumptions: z.array(z.string().trim().min(1).max(300)).max(12),
        constraints: z.array(z.string().trim().min(1).max(300)).max(12),
        risks: z.array(z.string().trim().min(1).max(300)).max(12),
        scope: z.array(z.string().trim().min(1).max(300)).max(12),
        successMeasures: z.array(z.string().trim().min(1).max(300)).max(8),
      })
      .strict(),
    suggestedCapabilities: z.array(z.string().trim().min(1).max(200)).max(10),
  })
  .strict();

export type IntakeAnalysisResponse = z.infer<typeof intakeAnalysisSchema>;
