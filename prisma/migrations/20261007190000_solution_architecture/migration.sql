-- CreateEnum
CREATE TYPE "CodebaseSource" AS ENUM ('MANUAL', 'DEMO', 'LOCAL_ANALYSIS', 'FUTURE_GITHUB');

-- CreateEnum
CREATE TYPE "SystemKind" AS ENUM ('GREENFIELD', 'EXISTING_SYSTEM');

-- CreateEnum
CREATE TYPE "ArchitectureStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('USER_INTERFACE', 'SERVICE', 'API', 'DATABASE', 'QUEUE', 'CACHE', 'EXTERNAL_SYSTEM', 'AI_SERVICE', 'IDENTITY', 'STORAGE', 'OBSERVABILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('CALLS', 'READS_FROM', 'WRITES_TO', 'PUBLISHES_TO', 'SUBSCRIBES_TO', 'AUTHENTICATES_WITH', 'INTEGRATES_WITH');

-- CreateEnum
CREATE TYPE "AdrStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SecurityArea" AS ENUM ('AUTHENTICATION', 'AUTHORISATION', 'SENSITIVE_DATA', 'ENCRYPTION', 'SECRETS', 'AUDITABILITY', 'EXTERNAL_INTEGRATIONS', 'DATA_RETENTION', 'PRIVACY', 'THREATS', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "SecurityClassification" AS ENUM ('INFORMATION', 'CONCERN', 'DECISION_REQUIRED', 'BLOCKER');

-- CreateEnum
CREATE TYPE "DataClassification" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "IntegrationDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ImplementationTaskStatus" AS ENUM ('PROPOSED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TaskComplexity" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ArchitectureProposalKind" AS ENUM ('ARCHITECTURE', 'IMPLEMENTATION_PLAN');

-- CreateTable
CREATE TABLE "CodebaseContext" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "repositoryName" TEXT NOT NULL DEFAULT '',
    "repositoryUrl" TEXT NOT NULL DEFAULT '',
    "defaultBranch" TEXT NOT NULL DEFAULT '',
    "systemKind" "SystemKind" NOT NULL DEFAULT 'GREENFIELD',
    "languages" JSONB NOT NULL DEFAULT '[]',
    "frameworks" JSONB NOT NULL DEFAULT '[]',
    "databaseTechnologies" JSONB NOT NULL DEFAULT '[]',
    "infrastructure" TEXT NOT NULL DEFAULT '',
    "deploymentPlatform" TEXT NOT NULL DEFAULT '',
    "architectureSummary" TEXT NOT NULL DEFAULT '',
    "keyDirectories" JSONB NOT NULL DEFAULT '[]',
    "keyComponents" JSONB NOT NULL DEFAULT '[]',
    "knownIntegrations" JSONB NOT NULL DEFAULT '[]',
    "constraints" TEXT NOT NULL DEFAULT '',
    "observations" TEXT NOT NULL DEFAULT '',
    "source" "CodebaseSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodebaseContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolutionArchitecture" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productSliceId" TEXT,
    "version" INTEGER NOT NULL,
    "status" "ArchitectureStatus" NOT NULL DEFAULT 'DRAFT',
    "systemKind" "SystemKind" NOT NULL DEFAULT 'GREENFIELD',
    "architectureStyle" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "rationale" TEXT NOT NULL DEFAULT '',
    "frontendApproach" TEXT NOT NULL DEFAULT '',
    "backendApproach" TEXT NOT NULL DEFAULT '',
    "dataApproach" TEXT NOT NULL DEFAULT '',
    "integrationApproach" TEXT NOT NULL DEFAULT '',
    "securityApproach" TEXT NOT NULL DEFAULT '',
    "deploymentApproach" TEXT NOT NULL DEFAULT '',
    "observabilityApproach" TEXT NOT NULL DEFAULT '',
    "seededDemo" BOOLEAN NOT NULL DEFAULT false,
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolutionArchitecture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchitectureComponent" (
    "id" TEXT NOT NULL,
    "solutionArchitectureId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ComponentType" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "responsibilities" TEXT NOT NULL DEFAULT '',
    "technology" TEXT NOT NULL DEFAULT '',
    "rationale" TEXT NOT NULL DEFAULT '',
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchitectureComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchitectureRelationship" (
    "id" TEXT NOT NULL,
    "solutionArchitectureId" TEXT NOT NULL,
    "sourceComponentId" TEXT NOT NULL,
    "targetComponentId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchitectureRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchitectureDecisionRecord" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "solutionArchitectureId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "decision" TEXT NOT NULL DEFAULT '',
    "rationale" TEXT NOT NULL DEFAULT '',
    "alternatives" TEXT NOT NULL DEFAULT '',
    "consequences" TEXT NOT NULL DEFAULT '',
    "status" "AdrStatus" NOT NULL DEFAULT 'PROPOSED',
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchitectureDecisionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnologyChoice" (
    "id" TEXT NOT NULL,
    "solutionArchitectureId" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "alternatives" TEXT NOT NULL DEFAULT '',
    "tradeoffs" TEXT NOT NULL DEFAULT '',
    "relevantConstraint" TEXT NOT NULL DEFAULT '',
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnologyChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataEntity" (
    "id" TEXT NOT NULL,
    "solutionArchitectureId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "retention" TEXT NOT NULL DEFAULT '',
    "relationships" TEXT NOT NULL DEFAULT '',
    "externalSource" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationDesign" (
    "id" TEXT NOT NULL,
    "solutionArchitectureId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "direction" "IntegrationDirection" NOT NULL DEFAULT 'OUTBOUND',
    "protocol" TEXT NOT NULL DEFAULT '',
    "authenticationAssumption" TEXT NOT NULL DEFAULT '',
    "dataExchanged" TEXT NOT NULL DEFAULT '',
    "failureConsiderations" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityFinding" (
    "id" TEXT NOT NULL,
    "solutionArchitectureId" TEXT NOT NULL,
    "area" "SecurityArea" NOT NULL,
    "classification" "SecurityClassification" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchitectureQuestion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "solutionArchitectureId" TEXT,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "impact" "AssumptionImpact" NOT NULL DEFAULT 'MEDIUM',
    "status" "QuestionStatus" NOT NULL DEFAULT 'OPEN',
    "answer" TEXT NOT NULL DEFAULT '',
    "answeredBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ArchitectureQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfrCoverage" (
    "id" TEXT NOT NULL,
    "solutionArchitectureId" TEXT NOT NULL,
    "nfrId" TEXT NOT NULL,
    "componentId" TEXT,
    "adrId" TEXT,
    "mechanism" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NfrCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentTrace" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "capabilityId" TEXT,
    "workItemId" TEXT,
    "nfrId" TEXT,
    "adrId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComponentTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationPlan" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productSliceId" TEXT,
    "solutionArchitectureId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT NOT NULL DEFAULT '',
    "seededDemo" BOOLEAN NOT NULL DEFAULT false,
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImplementationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationTask" (
    "id" TEXT NOT NULL,
    "implementationPlanId" TEXT NOT NULL,
    "workItemId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "objective" TEXT NOT NULL DEFAULT '',
    "verticalSlice" TEXT NOT NULL DEFAULT '',
    "guidance" TEXT NOT NULL DEFAULT '',
    "validation" TEXT NOT NULL DEFAULT '',
    "risks" TEXT NOT NULL DEFAULT '',
    "filesLikely" TEXT NOT NULL DEFAULT '',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "parallelisable" BOOLEAN NOT NULL DEFAULT false,
    "dependenciesIdentified" BOOLEAN NOT NULL DEFAULT false,
    "status" "ImplementationTaskStatus" NOT NULL DEFAULT 'PROPOSED',
    "complexity" "TaskComplexity" NOT NULL DEFAULT 'UNKNOWN',
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImplementationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationTaskComponent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,

    CONSTRAINT "ImplementationTaskComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationTaskDependency" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImplementationTaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchitectureProposal" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "kind" "ArchitectureProposalKind" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'OPEN',
    "summary" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "seededDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchitectureProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodebaseContext_productId_key" ON "CodebaseContext"("productId");

-- CreateIndex
CREATE INDEX "SolutionArchitecture_productId_idx" ON "SolutionArchitecture"("productId");

-- CreateIndex
CREATE INDEX "SolutionArchitecture_status_idx" ON "SolutionArchitecture"("status");

-- CreateIndex
CREATE INDEX "SolutionArchitecture_productSliceId_idx" ON "SolutionArchitecture"("productSliceId");

-- CreateIndex
CREATE UNIQUE INDEX "SolutionArchitecture_productId_version_key" ON "SolutionArchitecture"("productId", "version");

-- CreateIndex
CREATE INDEX "ArchitectureComponent_solutionArchitectureId_idx" ON "ArchitectureComponent"("solutionArchitectureId");

-- CreateIndex
CREATE INDEX "ArchitectureComponent_type_idx" ON "ArchitectureComponent"("type");

-- CreateIndex
CREATE INDEX "ArchitectureRelationship_solutionArchitectureId_idx" ON "ArchitectureRelationship"("solutionArchitectureId");

-- CreateIndex
CREATE INDEX "ArchitectureRelationship_sourceComponentId_idx" ON "ArchitectureRelationship"("sourceComponentId");

-- CreateIndex
CREATE INDEX "ArchitectureRelationship_targetComponentId_idx" ON "ArchitectureRelationship"("targetComponentId");

-- CreateIndex
CREATE INDEX "ArchitectureDecisionRecord_productId_idx" ON "ArchitectureDecisionRecord"("productId");

-- CreateIndex
CREATE INDEX "ArchitectureDecisionRecord_solutionArchitectureId_idx" ON "ArchitectureDecisionRecord"("solutionArchitectureId");

-- CreateIndex
CREATE INDEX "ArchitectureDecisionRecord_status_idx" ON "ArchitectureDecisionRecord"("status");

-- CreateIndex
CREATE INDEX "TechnologyChoice_solutionArchitectureId_idx" ON "TechnologyChoice"("solutionArchitectureId");

-- CreateIndex
CREATE INDEX "DataEntity_solutionArchitectureId_idx" ON "DataEntity"("solutionArchitectureId");

-- CreateIndex
CREATE INDEX "IntegrationDesign_solutionArchitectureId_idx" ON "IntegrationDesign"("solutionArchitectureId");

-- CreateIndex
CREATE INDEX "SecurityFinding_solutionArchitectureId_idx" ON "SecurityFinding"("solutionArchitectureId");

-- CreateIndex
CREATE INDEX "SecurityFinding_classification_idx" ON "SecurityFinding"("classification");

-- CreateIndex
CREATE INDEX "ArchitectureQuestion_productId_idx" ON "ArchitectureQuestion"("productId");

-- CreateIndex
CREATE INDEX "ArchitectureQuestion_solutionArchitectureId_idx" ON "ArchitectureQuestion"("solutionArchitectureId");

-- CreateIndex
CREATE INDEX "ArchitectureQuestion_status_idx" ON "ArchitectureQuestion"("status");

-- CreateIndex
CREATE INDEX "NfrCoverage_solutionArchitectureId_idx" ON "NfrCoverage"("solutionArchitectureId");

-- CreateIndex
CREATE INDEX "NfrCoverage_nfrId_idx" ON "NfrCoverage"("nfrId");

-- CreateIndex
CREATE INDEX "ComponentTrace_componentId_idx" ON "ComponentTrace"("componentId");

-- CreateIndex
CREATE INDEX "ComponentTrace_capabilityId_idx" ON "ComponentTrace"("capabilityId");

-- CreateIndex
CREATE INDEX "ComponentTrace_workItemId_idx" ON "ComponentTrace"("workItemId");

-- CreateIndex
CREATE INDEX "ImplementationPlan_productId_idx" ON "ImplementationPlan"("productId");

-- CreateIndex
CREATE INDEX "ImplementationPlan_solutionArchitectureId_idx" ON "ImplementationPlan"("solutionArchitectureId");

-- CreateIndex
CREATE INDEX "ImplementationPlan_status_idx" ON "ImplementationPlan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationPlan_productId_version_key" ON "ImplementationPlan"("productId", "version");

-- CreateIndex
CREATE INDEX "ImplementationTask_implementationPlanId_idx" ON "ImplementationTask"("implementationPlanId");

-- CreateIndex
CREATE INDEX "ImplementationTask_workItemId_idx" ON "ImplementationTask"("workItemId");

-- CreateIndex
CREATE INDEX "ImplementationTask_sequence_idx" ON "ImplementationTask"("sequence");

-- CreateIndex
CREATE INDEX "ImplementationTaskComponent_componentId_idx" ON "ImplementationTaskComponent"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationTaskComponent_taskId_componentId_key" ON "ImplementationTaskComponent"("taskId", "componentId");

-- CreateIndex
CREATE INDEX "ImplementationTaskDependency_dependsOnId_idx" ON "ImplementationTaskDependency"("dependsOnId");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationTaskDependency_taskId_dependsOnId_key" ON "ImplementationTaskDependency"("taskId", "dependsOnId");

-- CreateIndex
CREATE INDEX "ArchitectureProposal_productId_createdAt_idx" ON "ArchitectureProposal"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ArchitectureProposal_kind_status_idx" ON "ArchitectureProposal"("kind", "status");

-- AddForeignKey
ALTER TABLE "CodebaseContext" ADD CONSTRAINT "CodebaseContext_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolutionArchitecture" ADD CONSTRAINT "SolutionArchitecture_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolutionArchitecture" ADD CONSTRAINT "SolutionArchitecture_productSliceId_fkey" FOREIGN KEY ("productSliceId") REFERENCES "ProductSlice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureComponent" ADD CONSTRAINT "ArchitectureComponent_solutionArchitectureId_fkey" FOREIGN KEY ("solutionArchitectureId") REFERENCES "SolutionArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureRelationship" ADD CONSTRAINT "ArchitectureRelationship_solutionArchitectureId_fkey" FOREIGN KEY ("solutionArchitectureId") REFERENCES "SolutionArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureRelationship" ADD CONSTRAINT "ArchitectureRelationship_sourceComponentId_fkey" FOREIGN KEY ("sourceComponentId") REFERENCES "ArchitectureComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureRelationship" ADD CONSTRAINT "ArchitectureRelationship_targetComponentId_fkey" FOREIGN KEY ("targetComponentId") REFERENCES "ArchitectureComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureDecisionRecord" ADD CONSTRAINT "ArchitectureDecisionRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureDecisionRecord" ADD CONSTRAINT "ArchitectureDecisionRecord_solutionArchitectureId_fkey" FOREIGN KEY ("solutionArchitectureId") REFERENCES "SolutionArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnologyChoice" ADD CONSTRAINT "TechnologyChoice_solutionArchitectureId_fkey" FOREIGN KEY ("solutionArchitectureId") REFERENCES "SolutionArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataEntity" ADD CONSTRAINT "DataEntity_solutionArchitectureId_fkey" FOREIGN KEY ("solutionArchitectureId") REFERENCES "SolutionArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDesign" ADD CONSTRAINT "IntegrationDesign_solutionArchitectureId_fkey" FOREIGN KEY ("solutionArchitectureId") REFERENCES "SolutionArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityFinding" ADD CONSTRAINT "SecurityFinding_solutionArchitectureId_fkey" FOREIGN KEY ("solutionArchitectureId") REFERENCES "SolutionArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureQuestion" ADD CONSTRAINT "ArchitectureQuestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureQuestion" ADD CONSTRAINT "ArchitectureQuestion_solutionArchitectureId_fkey" FOREIGN KEY ("solutionArchitectureId") REFERENCES "SolutionArchitecture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfrCoverage" ADD CONSTRAINT "NfrCoverage_solutionArchitectureId_fkey" FOREIGN KEY ("solutionArchitectureId") REFERENCES "SolutionArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfrCoverage" ADD CONSTRAINT "NfrCoverage_nfrId_fkey" FOREIGN KEY ("nfrId") REFERENCES "NonFunctionalRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfrCoverage" ADD CONSTRAINT "NfrCoverage_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "ArchitectureComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfrCoverage" ADD CONSTRAINT "NfrCoverage_adrId_fkey" FOREIGN KEY ("adrId") REFERENCES "ArchitectureDecisionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentTrace" ADD CONSTRAINT "ComponentTrace_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "ArchitectureComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentTrace" ADD CONSTRAINT "ComponentTrace_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "ProductCapability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentTrace" ADD CONSTRAINT "ComponentTrace_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentTrace" ADD CONSTRAINT "ComponentTrace_nfrId_fkey" FOREIGN KEY ("nfrId") REFERENCES "NonFunctionalRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentTrace" ADD CONSTRAINT "ComponentTrace_adrId_fkey" FOREIGN KEY ("adrId") REFERENCES "ArchitectureDecisionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationPlan" ADD CONSTRAINT "ImplementationPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationPlan" ADD CONSTRAINT "ImplementationPlan_productSliceId_fkey" FOREIGN KEY ("productSliceId") REFERENCES "ProductSlice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationPlan" ADD CONSTRAINT "ImplementationPlan_solutionArchitectureId_fkey" FOREIGN KEY ("solutionArchitectureId") REFERENCES "SolutionArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationTask" ADD CONSTRAINT "ImplementationTask_implementationPlanId_fkey" FOREIGN KEY ("implementationPlanId") REFERENCES "ImplementationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationTask" ADD CONSTRAINT "ImplementationTask_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationTaskComponent" ADD CONSTRAINT "ImplementationTaskComponent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ImplementationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationTaskComponent" ADD CONSTRAINT "ImplementationTaskComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "ArchitectureComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationTaskDependency" ADD CONSTRAINT "ImplementationTaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ImplementationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationTaskDependency" ADD CONSTRAINT "ImplementationTaskDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "ImplementationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureProposal" ADD CONSTRAINT "ArchitectureProposal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
