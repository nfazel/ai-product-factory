-- CreateEnum
CREATE TYPE "GovernanceReviewStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "GovernanceAssessment" AS ENUM ('PASS', 'PASS_WITH_ACTIONS', 'BLOCKED');

-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('SECURITY', 'PRIVACY', 'ARCHITECTURE', 'RELIABILITY', 'OBSERVABILITY', 'DATA', 'INTEGRATION', 'TESTABILITY', 'MAINTAINABILITY', 'DEPENDENCY', 'DELIVERY', 'COMPLIANCE', 'OPERABILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'ACCEPTED', 'MITIGATED', 'RISK_ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ThreatLikelihood" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ThreatImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ThreatStatus" AS ENUM ('OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CodingRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'PROHIBITED');

-- CreateEnum
CREATE TYPE "CodingExecutionMode" AS ENUM ('AUTONOMOUS', 'SUPERVISED', 'HUMAN_ONLY');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('AI_ANALYSIS', 'HUMAN_CONFIRMATION', 'TEST_RESULT', 'STATIC_ANALYSIS', 'DEPENDENCY_SCAN', 'SECURITY_SCAN', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "GovernanceTopic" AS ENUM ('SECURITY', 'PRIVACY', 'PLAN', 'ARCHITECTURE', 'GENERAL');

-- CreateEnum
CREATE TYPE "GovernanceProposalSection" AS ENUM ('FULL', 'SECURITY', 'PRIVACY', 'PLAN', 'ARCHITECTURE', 'TASK');

-- CreateTable
CREATE TABLE "EngineeringGovernanceReview" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "solutionArchitectureId" TEXT NOT NULL,
    "implementationPlanId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "GovernanceReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "overallAssessment" "GovernanceAssessment" NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "assistantSummary" TEXT NOT NULL DEFAULT '',
    "securityAssessment" TEXT NOT NULL DEFAULT '',
    "privacyAssessment" TEXT NOT NULL DEFAULT '',
    "engineeringAssessment" TEXT NOT NULL DEFAULT '',
    "implementationPlanAssessment" TEXT NOT NULL DEFAULT '',
    "dependencyReview" TEXT NOT NULL DEFAULT '',
    "readinessNote" TEXT NOT NULL DEFAULT '',
    "seededDemo" BOOLEAN NOT NULL DEFAULT false,
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT NOT NULL DEFAULT '',
    "reviewFlaggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineeringGovernanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceFinding" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "category" "FindingCategory" NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "evidence" TEXT NOT NULL DEFAULT '',
    "recommendation" TEXT NOT NULL DEFAULT '',
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "owner" TEXT NOT NULL DEFAULT '',
    "dueBeforeCoding" BOOLEAN NOT NULL DEFAULT false,
    "rationale" TEXT NOT NULL DEFAULT '',
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceFindingLink" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "componentId" TEXT,
    "adrId" TEXT,
    "taskId" TEXT,
    "nfrId" TEXT,
    "workItemId" TEXT,
    "assumptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovernanceFindingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Threat" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "affectedComponentId" TEXT,
    "attackSurface" TEXT NOT NULL DEFAULT '',
    "likelihood" "ThreatLikelihood" NOT NULL DEFAULT 'MEDIUM',
    "impact" "ThreatImpact" NOT NULL DEFAULT 'MEDIUM',
    "mitigation" TEXT NOT NULL DEFAULT '',
    "status" "ThreatStatus" NOT NULL DEFAULT 'OPEN',
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Threat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingRiskAssessment" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "implementationTaskId" TEXT NOT NULL,
    "riskLevel" "CodingRiskLevel" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "recommendedExecutionMode" "CodingExecutionMode" NOT NULL,
    "requiredHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "overrideRiskLevel" "CodingRiskLevel",
    "overrideExecutionMode" "CodingExecutionMode",
    "overrideReason" TEXT NOT NULL DEFAULT '',
    "overriddenBy" TEXT NOT NULL DEFAULT '',
    "overriddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodingRiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingPolicy" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "allowedPaths" JSONB NOT NULL DEFAULT '[]',
    "restrictedPaths" JSONB NOT NULL DEFAULT '[]',
    "prohibitedActions" JSONB NOT NULL DEFAULT '[]',
    "requiredChecks" JSONB NOT NULL DEFAULT '[]',
    "maxFilesPerTask" INTEGER,
    "requireTests" BOOLEAN NOT NULL DEFAULT true,
    "requireHumanReview" BOOLEAN NOT NULL DEFAULT true,
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "reapprovalRequired" BOOLEAN NOT NULL DEFAULT false,
    "reapprovalReason" TEXT NOT NULL DEFAULT '',
    "reapprovalFlaggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceEvidence" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "findingId" TEXT,
    "type" "EvidenceType" NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovernanceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceQuestion" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "impact" "AssumptionImpact" NOT NULL DEFAULT 'MEDIUM',
    "topic" "GovernanceTopic" NOT NULL DEFAULT 'GENERAL',
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "status" "QuestionStatus" NOT NULL DEFAULT 'OPEN',
    "answer" TEXT NOT NULL DEFAULT '',
    "answeredBy" TEXT NOT NULL DEFAULT '',
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "GovernanceQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceProposal" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "section" "GovernanceProposalSection" NOT NULL DEFAULT 'FULL',
    "taskRef" TEXT NOT NULL DEFAULT '',
    "status" "ProposalStatus" NOT NULL DEFAULT 'OPEN',
    "summary" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "seededDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngineeringGovernanceReview_productId_idx" ON "EngineeringGovernanceReview"("productId");

-- CreateIndex
CREATE INDEX "EngineeringGovernanceReview_solutionArchitectureId_idx" ON "EngineeringGovernanceReview"("solutionArchitectureId");

-- CreateIndex
CREATE INDEX "EngineeringGovernanceReview_implementationPlanId_idx" ON "EngineeringGovernanceReview"("implementationPlanId");

-- CreateIndex
CREATE INDEX "EngineeringGovernanceReview_status_idx" ON "EngineeringGovernanceReview"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EngineeringGovernanceReview_productId_version_key" ON "EngineeringGovernanceReview"("productId", "version");

-- CreateIndex
CREATE INDEX "GovernanceFinding_reviewId_idx" ON "GovernanceFinding"("reviewId");

-- CreateIndex
CREATE INDEX "GovernanceFinding_category_idx" ON "GovernanceFinding"("category");

-- CreateIndex
CREATE INDEX "GovernanceFinding_severity_idx" ON "GovernanceFinding"("severity");

-- CreateIndex
CREATE INDEX "GovernanceFinding_status_idx" ON "GovernanceFinding"("status");

-- CreateIndex
CREATE INDEX "GovernanceFindingLink_findingId_idx" ON "GovernanceFindingLink"("findingId");

-- CreateIndex
CREATE INDEX "GovernanceFindingLink_componentId_idx" ON "GovernanceFindingLink"("componentId");

-- CreateIndex
CREATE INDEX "GovernanceFindingLink_adrId_idx" ON "GovernanceFindingLink"("adrId");

-- CreateIndex
CREATE INDEX "GovernanceFindingLink_taskId_idx" ON "GovernanceFindingLink"("taskId");

-- CreateIndex
CREATE INDEX "GovernanceFindingLink_nfrId_idx" ON "GovernanceFindingLink"("nfrId");

-- CreateIndex
CREATE INDEX "GovernanceFindingLink_workItemId_idx" ON "GovernanceFindingLink"("workItemId");

-- CreateIndex
CREATE INDEX "GovernanceFindingLink_assumptionId_idx" ON "GovernanceFindingLink"("assumptionId");

-- CreateIndex
CREATE INDEX "Threat_reviewId_idx" ON "Threat"("reviewId");

-- CreateIndex
CREATE INDEX "Threat_affectedComponentId_idx" ON "Threat"("affectedComponentId");

-- CreateIndex
CREATE INDEX "Threat_status_idx" ON "Threat"("status");

-- CreateIndex
CREATE INDEX "CodingRiskAssessment_implementationTaskId_idx" ON "CodingRiskAssessment"("implementationTaskId");

-- CreateIndex
CREATE INDEX "CodingRiskAssessment_riskLevel_idx" ON "CodingRiskAssessment"("riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "CodingRiskAssessment_reviewId_implementationTaskId_key" ON "CodingRiskAssessment"("reviewId", "implementationTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "CodingPolicy_reviewId_key" ON "CodingPolicy"("reviewId");

-- CreateIndex
CREATE INDEX "CodingPolicy_productId_idx" ON "CodingPolicy"("productId");

-- CreateIndex
CREATE INDEX "GovernanceEvidence_reviewId_idx" ON "GovernanceEvidence"("reviewId");

-- CreateIndex
CREATE INDEX "GovernanceEvidence_findingId_idx" ON "GovernanceEvidence"("findingId");

-- CreateIndex
CREATE INDEX "GovernanceEvidence_type_idx" ON "GovernanceEvidence"("type");

-- CreateIndex
CREATE INDEX "GovernanceQuestion_reviewId_idx" ON "GovernanceQuestion"("reviewId");

-- CreateIndex
CREATE INDEX "GovernanceQuestion_status_idx" ON "GovernanceQuestion"("status");

-- CreateIndex
CREATE INDEX "GovernanceQuestion_blocking_idx" ON "GovernanceQuestion"("blocking");

-- CreateIndex
CREATE INDEX "GovernanceProposal_productId_createdAt_idx" ON "GovernanceProposal"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "GovernanceProposal_section_status_idx" ON "GovernanceProposal"("section", "status");

-- AddForeignKey
ALTER TABLE "EngineeringGovernanceReview" ADD CONSTRAINT "EngineeringGovernanceReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringGovernanceReview" ADD CONSTRAINT "EngineeringGovernanceReview_solutionArchitectureId_fkey" FOREIGN KEY ("solutionArchitectureId") REFERENCES "SolutionArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringGovernanceReview" ADD CONSTRAINT "EngineeringGovernanceReview_implementationPlanId_fkey" FOREIGN KEY ("implementationPlanId") REFERENCES "ImplementationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceFinding" ADD CONSTRAINT "GovernanceFinding_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "EngineeringGovernanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceFindingLink" ADD CONSTRAINT "GovernanceFindingLink_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "GovernanceFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceFindingLink" ADD CONSTRAINT "GovernanceFindingLink_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "ArchitectureComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceFindingLink" ADD CONSTRAINT "GovernanceFindingLink_adrId_fkey" FOREIGN KEY ("adrId") REFERENCES "ArchitectureDecisionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceFindingLink" ADD CONSTRAINT "GovernanceFindingLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ImplementationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceFindingLink" ADD CONSTRAINT "GovernanceFindingLink_nfrId_fkey" FOREIGN KEY ("nfrId") REFERENCES "NonFunctionalRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceFindingLink" ADD CONSTRAINT "GovernanceFindingLink_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceFindingLink" ADD CONSTRAINT "GovernanceFindingLink_assumptionId_fkey" FOREIGN KEY ("assumptionId") REFERENCES "RequirementAssumption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Threat" ADD CONSTRAINT "Threat_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "EngineeringGovernanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Threat" ADD CONSTRAINT "Threat_affectedComponentId_fkey" FOREIGN KEY ("affectedComponentId") REFERENCES "ArchitectureComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingRiskAssessment" ADD CONSTRAINT "CodingRiskAssessment_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "EngineeringGovernanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingRiskAssessment" ADD CONSTRAINT "CodingRiskAssessment_implementationTaskId_fkey" FOREIGN KEY ("implementationTaskId") REFERENCES "ImplementationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingPolicy" ADD CONSTRAINT "CodingPolicy_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingPolicy" ADD CONSTRAINT "CodingPolicy_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "EngineeringGovernanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceEvidence" ADD CONSTRAINT "GovernanceEvidence_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "EngineeringGovernanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceEvidence" ADD CONSTRAINT "GovernanceEvidence_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "GovernanceFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceQuestion" ADD CONSTRAINT "GovernanceQuestion_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "EngineeringGovernanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceProposal" ADD CONSTRAINT "GovernanceProposal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
