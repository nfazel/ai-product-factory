import { z } from "zod";

import {
  ARCHITECTURE_SECTIONS,
  COMPONENT_TYPES,
  DATA_CLASSIFICATIONS,
  INTEGRATION_DIRECTIONS,
  RELATIONSHIP_TYPES,
  SECURITY_AREAS,
  SECURITY_CLASSIFICATIONS,
  SYSTEM_KINDS,
  TASK_COMPLEXITIES,
} from "@/domain/constants";

const tempId = (prefix: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}-[1-9]\\d*$`), `Use a stable id such as ${prefix}-1.`);

const idList = z.array(z.string().trim().min(1).max(80)).max(12);

export const proposedComponentSchema = z
  .object({
    tempId: tempId("component"),
    name: z.string().trim().min(1).max(180),
    type: z.enum(COMPONENT_TYPES),
    description: z.string().trim().min(1).max(2000),
    responsibilities: z.string().trim().min(1).max(2000),
    technology: z.string().trim().max(300),
    rationale: z.string().trim().min(1).max(2000),
    capabilityIds: idList,
    workItemIds: idList,
    nfrIds: idList,
  })
  .strict();

export const proposedRelationshipSchema = z
  .object({
    tempId: tempId("relationship"),
    sourceTempId: tempId("component"),
    targetTempId: tempId("component"),
    relationshipType: z.enum(RELATIONSHIP_TYPES),
    description: z.string().trim().max(1000),
  })
  .strict();

export const proposedTechnologySchema = z
  .object({
    tempId: tempId("technology"),
    choice: z.string().trim().min(1).max(180),
    reason: z.string().trim().min(1).max(2000),
    alternatives: z.string().trim().min(1).max(2000),
    tradeoffs: z.string().trim().min(1).max(2000),
    relevantConstraint: z.string().trim().max(1000),
  })
  .strict();

export const proposedAdrSchema = z
  .object({
    tempId: tempId("adr"),
    title: z.string().trim().min(1).max(180),
    context: z.string().trim().min(1).max(2000),
    decision: z.string().trim().min(1).max(2000),
    rationale: z.string().trim().min(1).max(2000),
    alternatives: z.string().trim().min(1).max(2000),
    consequences: z.string().trim().min(1).max(2000),
  })
  .strict();

export const proposedDataSchema = z
  .object({
    tempId: tempId("data"),
    name: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
    owner: z.string().trim().max(180),
    classification: z.enum(DATA_CLASSIFICATIONS),
    retention: z.string().trim().max(500),
    relationships: z.string().trim().max(1000),
    externalSource: z.string().trim().max(500),
  })
  .strict();

export const proposedIntegrationSchema = z
  .object({
    tempId: tempId("integration"),
    name: z.string().trim().min(1).max(180),
    purpose: z.string().trim().min(1).max(1000),
    direction: z.enum(INTEGRATION_DIRECTIONS),
    protocol: z.string().trim().max(180),
    authenticationAssumption: z.string().trim().max(500),
    dataExchanged: z.string().trim().max(1000),
    failureConsiderations: z.string().trim().max(1000),
  })
  .strict();

export const proposedSecuritySchema = z
  .object({
    tempId: tempId("finding"),
    area: z.enum(SECURITY_AREAS),
    classification: z.enum(SECURITY_CLASSIFICATIONS),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
  })
  .strict();

export const proposedCoverageSchema = z
  .object({
    tempId: tempId("coverage"),
    nfrId: z.string().trim().min(1).max(80),
    componentTempId: z.string().trim().max(40),
    adrTempId: z.string().trim().max(40),
    mechanism: z.string().trim().min(1).max(1000),
  })
  .strict();

export const proposedQuestionSchema = z
  .object({
    tempId: tempId("question"),
    question: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(1000),
    impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
  })
  .strict();

export const proposedTaskSchema = z
  .object({
    tempId: tempId("task"),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
    objective: z.string().trim().min(1).max(1000),
    verticalSlice: z.string().trim().min(1).max(180),
    workItemId: z.string().trim().max(80),
    relatedFeature: z.string().trim().max(180),
    acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).max(8),
    componentTempIds: z.array(tempId("component")).max(8),
    filesLikely: z.string().trim().max(1000),
    guidance: z.string().trim().max(2000),
    validation: z.string().trim().min(1).max(1000),
    risks: z.string().trim().max(1000),
    sequence: z.number().int().min(1).max(50),
    complexity: z.enum(TASK_COMPLEXITIES),
    parallelisable: z.boolean(),
    dependsOn: z.array(tempId("task")).max(8),
  })
  .strict();

export const architectureResponseSchema = z
  .object({
    assistantSummary: z.string().trim().min(1).max(4000),
    systemKind: z.enum(SYSTEM_KINDS),
    architectureStyle: z.string().trim().min(1).max(180),
    architectureSummary: z.string().trim().min(1).max(4000),
    rationale: z.string().trim().min(1).max(4000),
    frontendApproach: z.string().trim().max(2000),
    backendApproach: z.string().trim().max(2000),
    dataApproach: z.string().trim().max(2000),
    integrationApproach: z.string().trim().max(2000),
    securityApproach: z.string().trim().max(2000),
    deploymentApproach: z.string().trim().max(2000),
    observabilityApproach: z.string().trim().max(2000),
    components: z.array(proposedComponentSchema).min(1).max(12),
    relationships: z.array(proposedRelationshipSchema).max(24),
    technologyDecisions: z.array(proposedTechnologySchema).max(8),
    adrs: z.array(proposedAdrSchema).max(8),
    dataDesign: z.array(proposedDataSchema).max(12),
    integrations: z.array(proposedIntegrationSchema).max(8),
    securityAssessment: z.array(proposedSecuritySchema).max(12),
    nfrCoverage: z.array(proposedCoverageSchema).max(20),
    architectureQuestions: z.array(proposedQuestionSchema).max(8),
    implementationPlanProposal: z
      .object({
        summary: z.string().trim().min(1).max(2000),
        tasks: z.array(proposedTaskSchema).min(1).max(15),
      })
      .strict(),
    technicalReadiness: z
      .object({
        note: z.string().trim().max(1000),
      })
      .strict(),
  })
  .strict();

export type ArchitectureResponse = z.infer<typeof architectureResponseSchema>;

const reviewFields = {
  reviewStatus: z.enum(["PENDING", "ACCEPTED", "REJECTED"]),
  edited: z.boolean(),
};

function reviewed<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...shape, ...reviewFields }).strict();
}

export const storedArchitectureSchema = z
  .object({
    assistantSummary: z.string(),
    systemKind: z.enum(SYSTEM_KINDS),
    architectureStyle: z.string(),
    architectureSummary: z.string(),
    rationale: z.string(),
    frontendApproach: z.string(),
    backendApproach: z.string(),
    dataApproach: z.string(),
    integrationApproach: z.string(),
    securityApproach: z.string(),
    deploymentApproach: z.string(),
    observabilityApproach: z.string(),
    summaryEdited: z.boolean(),
    components: z.array(reviewed(proposedComponentSchema.shape)).max(12),
    relationships: z.array(reviewed(proposedRelationshipSchema.shape)).max(24),
    technologyDecisions: z.array(reviewed(proposedTechnologySchema.shape)).max(8),
    adrs: z.array(reviewed(proposedAdrSchema.shape)).max(8),
    dataDesign: z.array(reviewed(proposedDataSchema.shape)).max(12),
    integrations: z.array(reviewed(proposedIntegrationSchema.shape)).max(8),
    securityAssessment: z.array(reviewed(proposedSecuritySchema.shape)).max(12),
    nfrCoverage: z.array(reviewed(proposedCoverageSchema.shape)).max(20),
    architectureQuestions: z.array(reviewed(proposedQuestionSchema.shape)).max(8),
    implementationPlanProposal: z.object({
      summary: z.string(),
      tasks: z.array(reviewed(proposedTaskSchema.shape)).max(15),
    }),
    technicalReadiness: z.object({ note: z.string() }),
  })
  .strict();

export type StoredArchitecture = z.infer<typeof storedArchitectureSchema>;

export const codebaseContextSchema = z.object({
  productId: z.string().trim().min(1),
  repositoryName: z.string().trim().max(180),
  repositoryUrl: z.string().trim().max(300),
  defaultBranch: z.string().trim().max(120),
  systemKind: z.enum(SYSTEM_KINDS),
  languages: z.string().trim().max(500),
  frameworks: z.string().trim().max(500),
  databaseTechnologies: z.string().trim().max(500),
  infrastructure: z.string().trim().max(500),
  deploymentPlatform: z.string().trim().max(180),
  architectureSummary: z.string().trim().max(4000),
  keyDirectories: z.string().trim().max(1000),
  keyComponents: z.string().trim().max(1000),
  knownIntegrations: z.string().trim().max(1000),
  constraints: z.string().trim().max(2000),
  observations: z.string().trim().max(2000),
});

export const architectureProductSchema = z.object({
  productId: z.string().trim().min(1),
});

export const architectureSectionSchema = z.object({
  productId: z.string().trim().min(1),
  section: z.enum(ARCHITECTURE_SECTIONS),
  featureTitle: z.string().trim().max(180).optional().default(""),
});

export const proposalItemSchema = z.object({
  productId: z.string().trim().min(1),
  proposalId: z.string().trim().min(1),
  section: z.enum([
    "components",
    "relationships",
    "technologyDecisions",
    "adrs",
    "dataDesign",
    "integrations",
    "securityAssessment",
    "architectureQuestions",
    "tasks",
    "summary",
  ] as const),
  tempId: z.string().trim().min(1),
});

export const editSummarySchema = architectureProductSchema.extend({
  proposalId: z.string().trim().optional().default(""),
  architectureStyle: z.string().trim().max(180),
  summary: z.string().trim().max(4000),
  rationale: z.string().trim().max(4000),
});

export const editRecordSchema = z.object({
  productId: z.string().trim().min(1),
  recordId: z.string().trim().min(1),
  title: z.string().trim().max(2000),
  body: z.string().trim().max(4000),
});

export const answerArchitectureQuestionSchema = z.object({
  productId: z.string().trim().min(1),
  questionId: z.string().trim().min(1),
  answer: z.string().trim().min(1).max(2000),
});

export const taskDependencySchema = z.object({
  productId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
  dependsOnId: z.string().trim().min(1),
});

const pending = { reviewStatus: "PENDING" as const, edited: false };

export function toStoredArchitecture(response: ArchitectureResponse): StoredArchitecture {
  const tag = <T extends object>(item: T) => ({ ...item, ...pending });
  return {
    assistantSummary: response.assistantSummary,
    systemKind: response.systemKind,
    architectureStyle: response.architectureStyle,
    architectureSummary: response.architectureSummary,
    rationale: response.rationale,
    frontendApproach: response.frontendApproach,
    backendApproach: response.backendApproach,
    dataApproach: response.dataApproach,
    integrationApproach: response.integrationApproach,
    securityApproach: response.securityApproach,
    deploymentApproach: response.deploymentApproach,
    observabilityApproach: response.observabilityApproach,
    summaryEdited: false,
    components: response.components.map(tag),
    relationships: response.relationships.map(tag),
    technologyDecisions: response.technologyDecisions.map(tag),
    adrs: response.adrs.map(tag),
    dataDesign: response.dataDesign.map(tag),
    integrations: response.integrations.map(tag),
    securityAssessment: response.securityAssessment.map(tag),
    nfrCoverage: response.nfrCoverage.map(tag),
    architectureQuestions: response.architectureQuestions.map(tag),
    implementationPlanProposal: {
      summary: response.implementationPlanProposal.summary,
      tasks: response.implementationPlanProposal.tasks.map(tag),
    },
    technicalReadiness: response.technicalReadiness,
  };
}
