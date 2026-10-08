import { z } from "zod";

import {
  CODING_EXECUTION_MODES,
  CODING_RISK_LEVELS,
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  GOVERNANCE_ASSESSMENTS,
  GOVERNANCE_SECTIONS,
  GOVERNANCE_TOPICS,
  THREAT_IMPACTS,
  THREAT_LIKELIHOODS,
} from "@/domain/constants";

const tempId = (prefix: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}-[1-9]\\d*$`), `Use a stable id such as ${prefix}-1.`);

const optionalId = z.string().trim().max(80);

const pathList = z.array(z.string().trim().min(1).max(200)).max(30);

export const proposedFindingSchema = z
  .object({
    tempId: tempId("finding"),
    category: z.enum(FINDING_CATEGORIES),
    severity: z.enum(FINDING_SEVERITIES),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
    evidence: z.string().trim().min(1).max(2000),
    recommendation: z.string().trim().min(1).max(2000),
    dueBeforeCoding: z.boolean(),
    owner: z.string().trim().max(120),
    componentId: optionalId,
    adrId: optionalId,
    taskId: optionalId,
    nfrId: optionalId,
    workItemId: optionalId,
    assumptionId: optionalId,
  })
  .strict();

export const proposedThreatSchema = z
  .object({
    tempId: tempId("threat"),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
    affectedComponentId: optionalId,
    attackSurface: z.string().trim().min(1).max(500),
    likelihood: z.enum(THREAT_LIKELIHOODS),
    impact: z.enum(THREAT_IMPACTS),
    mitigation: z.string().trim().min(1).max(2000),
  })
  .strict();

export const proposedCodingRiskSchema = z
  .object({
    taskId: z.string().trim().min(1).max(80),
    riskLevel: z.enum(CODING_RISK_LEVELS),
    reason: z.string().trim().min(1).max(2000),
    recommendedExecutionMode: z.enum(CODING_EXECUTION_MODES),
    requiredHumanReview: z.boolean(),
  })
  .strict();

export const proposedCodingPolicySchema = z
  .object({
    allowedPaths: pathList,
    restrictedPaths: pathList,
    prohibitedActions: pathList,
    requiredChecks: pathList,
    maxFilesPerTask: z.number().int().min(0).max(100),
    requireTests: z.boolean(),
    requireHumanReview: z.boolean(),
  })
  .strict();

export const proposedQuestionSchema = z
  .object({
    tempId: tempId("question"),
    question: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(2000),
    impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
    topic: z.enum(GOVERNANCE_TOPICS),
    blocking: z.boolean(),
  })
  .strict();

export const proposedEvidenceSchema = z
  .object({
    tempId: tempId("evidence"),
    findingTempId: optionalId,
    type: z.literal("AI_ANALYSIS"),
    source: z.literal("AI_REVIEW"),
    description: z.string().trim().min(1).max(2000),
    result: z.string().trim().min(1).max(500),
  })
  .strict();

export const governanceResponseSchema = z
  .object({
    assistantSummary: z.string().trim().min(1).max(2000),
    overallAssessment: z.enum(GOVERNANCE_ASSESSMENTS),
    securityAssessment: z.string().trim().min(20).max(4000),
    privacyAssessment: z.string().trim().min(20).max(4000),
    engineeringAssessment: z.string().trim().min(20).max(4000),
    implementationPlanAssessment: z.string().trim().min(20).max(4000),
    dependencyReview: z.string().trim().min(20).max(4000),
    findings: z.array(proposedFindingSchema).max(20),
    threats: z.array(proposedThreatSchema).max(12),
    codingRiskAssessments: z.array(proposedCodingRiskSchema).max(20),
    proposedCodingPolicy: proposedCodingPolicySchema,
    governanceQuestions: z.array(proposedQuestionSchema).max(12),
    evidence: z.array(proposedEvidenceSchema).max(24),
    readinessNote: z.string().trim().max(2000),
  })
  .strict();

export type GovernanceResponse = z.infer<typeof governanceResponseSchema>;

const reviewFields = {
  reviewStatus: z.enum(["PENDING", "ACCEPTED", "REJECTED"]),
  edited: z.boolean(),
};

function reviewed<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...shape, ...reviewFields }).strict();
}

export const storedGovernanceSchema = z
  .object({
    assistantSummary: z.string(),
    overallAssessment: z.enum(GOVERNANCE_ASSESSMENTS),
    securityAssessment: z.string(),
    privacyAssessment: z.string(),
    engineeringAssessment: z.string(),
    implementationPlanAssessment: z.string(),
    dependencyReview: z.string(),
    findings: z.array(reviewed(proposedFindingSchema.shape)),
    threats: z.array(reviewed(proposedThreatSchema.shape)),
    codingRiskAssessments: z.array(reviewed(proposedCodingRiskSchema.shape)),
    proposedCodingPolicy: proposedCodingPolicySchema,
    governanceQuestions: z.array(reviewed(proposedQuestionSchema.shape)),
    evidence: z.array(reviewed(proposedEvidenceSchema.shape)),
    readinessNote: z.string(),
    policyEdited: z.boolean(),
  })
  .strict();

export type StoredGovernance = z.infer<typeof storedGovernanceSchema>;

const pending = { reviewStatus: "PENDING" as const, edited: false };

export function toStoredGovernance(response: GovernanceResponse): StoredGovernance {
  return {
    ...response,
    findings: response.findings.map((item) => ({ ...item, ...pending })),
    threats: response.threats.map((item) => ({ ...item, ...pending })),
    codingRiskAssessments: response.codingRiskAssessments.map((item) => ({
      ...item,
      ...pending,
    })),
    governanceQuestions: response.governanceQuestions.map((item) => ({ ...item, ...pending })),
    evidence: response.evidence.map((item) => ({ ...item, ...pending })),
    policyEdited: false,
  };
}

export function included(item: { reviewStatus: string; edited: boolean }) {
  return item.reviewStatus === "ACCEPTED" || item.edited;
}

export const governanceProductSchema = z.object({
  productId: z.string().trim().min(1),
}).strict();

export const governanceSectionSchema = z
  .object({
    productId: z.string().trim().min(1),
    section: z.enum(GOVERNANCE_SECTIONS),
    taskId: z.string().trim().max(80).optional(),
  })
  .strict();

export const governanceProposalItemSchema = z
  .object({
    productId: z.string().trim().min(1),
    proposalId: z.string().trim().min(1),
    section: z.enum(["findings", "threats", "codingRiskAssessments", "governanceQuestions", "evidence"]),
    tempId: z.string().trim().min(1),
    status: z.enum(["ACCEPTED", "REJECTED"]),
  })
  .strict();

export const findingUpdateSchema = z
  .object({
    productId: z.string().trim().min(1),
    findingId: z.string().trim().min(1),
    status: z.enum(FINDING_STATUSES),
    rationale: z.string().trim().max(2000).optional(),
  })
  .strict();

export const findingCommentSchema = z
  .object({
    productId: z.string().trim().min(1),
    findingId: z.string().trim().min(1),
    rationale: z.string().trim().min(1).max(2000),
  })
  .strict();

export const codingRiskOverrideSchema = z
  .object({
    productId: z.string().trim().min(1),
    assessmentId: z.string().trim().min(1),
    riskLevel: z.enum(CODING_RISK_LEVELS),
    executionMode: z.enum(CODING_EXECUTION_MODES),
    rationale: z.string().trim().max(2000),
  })
  .strict();

export const codingPolicySchema = z
  .object({
    productId: z.string().trim().min(1),
    policyId: z.string().trim().min(1),
    allowedPaths: z.string().max(4000),
    restrictedPaths: z.string().max(4000),
    prohibitedActions: z.string().max(4000),
    requiredChecks: z.string().max(4000),
    maxFilesPerTask: z.string().trim().max(4).optional(),
    requireTests: z.string().optional(),
    requireHumanReview: z.string().optional(),
  })
  .strict();

export const questionAnswerSchema = z
  .object({
    productId: z.string().trim().min(1),
    questionId: z.string().trim().min(1),
    answer: z.string().trim().min(1).max(2000),
  })
  .strict();

export function lines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
