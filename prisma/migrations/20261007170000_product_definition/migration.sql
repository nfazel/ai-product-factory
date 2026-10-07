-- CreateEnum
CREATE TYPE "OutcomeStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'ACHIEVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "CapabilityStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SliceStatus" AS ENUM ('PROPOSED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "NfrCategory" AS ENUM ('PERFORMANCE', 'SECURITY', 'PRIVACY', 'ACCESSIBILITY', 'AVAILABILITY', 'SCALABILITY', 'AUDITABILITY', 'COMPLIANCE', 'USABILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "RequirementItemStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DefinitionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'APPROVED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('OPEN', 'PARTIALLY_COMMITTED', 'COMMITTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "WorkItemProvenance" AS ENUM ('HUMAN_CREATED', 'AI_PROPOSAL', 'AI_ACCEPTED');

-- CreateEnum
CREATE TYPE "RequirementOrigin" AS ENUM ('AI_PROPOSAL', 'HUMAN_CONFIRMED', 'HUMAN_CREATED');

-- CreateTable
CREATE TABLE "ProductDefinition" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "DefinitionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "seededDemo" BOOLEAN NOT NULL DEFAULT false,
    "reviewSummary" TEXT NOT NULL DEFAULT '',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefinitionProposal" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'OPEN',
    "summary" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "seededDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefinitionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOutcome" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "successMeasure" TEXT NOT NULL DEFAULT '',
    "targetValue" TEXT NOT NULL DEFAULT '',
    "status" "OutcomeStatus" NOT NULL DEFAULT 'PROPOSED',
    "sourceBriefId" TEXT,
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "origin" "RequirementOrigin" NOT NULL DEFAULT 'AI_PROPOSAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCapability" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "CapabilityStatus" NOT NULL DEFAULT 'PROPOSED',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "origin" "RequirementOrigin" NOT NULL DEFAULT 'AI_PROPOSAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSlice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "rationale" TEXT NOT NULL DEFAULT '',
    "status" "SliceStatus" NOT NULL DEFAULT 'PROPOSED',
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "origin" "RequirementOrigin" NOT NULL DEFAULT 'AI_PROPOSAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSlice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonFunctionalRequirement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "category" "NfrCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "measure" TEXT NOT NULL DEFAULT '',
    "status" "RequirementItemStatus" NOT NULL DEFAULT 'PROPOSED',
    "source" "RequirementOrigin" NOT NULL DEFAULT 'AI_PROPOSAL',
    "humanLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NonFunctionalRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementQuestion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "workItemId" TEXT,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "impact" "AssumptionImpact" NOT NULL DEFAULT 'MEDIUM',
    "status" "QuestionStatus" NOT NULL DEFAULT 'OPEN',
    "answer" TEXT NOT NULL DEFAULT '',
    "answeredBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RequirementQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementAssumption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "workItemId" TEXT,
    "description" TEXT NOT NULL,
    "impact" "AssumptionImpact" NOT NULL DEFAULT 'MEDIUM',
    "confidence" "SignalLevel" NOT NULL DEFAULT 'LOW',
    "status" "AssumptionStatus" NOT NULL DEFAULT 'UNVALIDATED',
    "origin" "RequirementOrigin" NOT NULL DEFAULT 'AI_PROPOSAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementAssumption_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN "capabilityId" TEXT,
ADD COLUMN "sliceId" TEXT,
ADD COLUMN "provenance" "WorkItemProvenance" NOT NULL DEFAULT 'HUMAN_CREATED',
ADD COLUMN "persona" TEXT NOT NULL DEFAULT '',
ADD COLUMN "userNeed" TEXT NOT NULL DEFAULT '',
ADD COLUMN "userValue" TEXT NOT NULL DEFAULT '',
ADD COLUMN "priorityAssigned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "dependenciesIdentified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "assumptionsNoted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "humanLocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "ProductDefinition_productId_key" ON "ProductDefinition"("productId");

-- CreateIndex
CREATE INDEX "DefinitionProposal_productId_createdAt_idx" ON "DefinitionProposal"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "DefinitionProposal_status_idx" ON "DefinitionProposal"("status");

-- CreateIndex
CREATE INDEX "ProductOutcome_productId_idx" ON "ProductOutcome"("productId");

-- CreateIndex
CREATE INDEX "ProductOutcome_status_idx" ON "ProductOutcome"("status");

-- CreateIndex
CREATE INDEX "ProductOutcome_sourceBriefId_idx" ON "ProductOutcome"("sourceBriefId");

-- CreateIndex
CREATE INDEX "ProductCapability_productId_idx" ON "ProductCapability"("productId");

-- CreateIndex
CREATE INDEX "ProductCapability_outcomeId_idx" ON "ProductCapability"("outcomeId");

-- CreateIndex
CREATE INDEX "ProductCapability_status_idx" ON "ProductCapability"("status");

-- CreateIndex
CREATE INDEX "ProductSlice_productId_idx" ON "ProductSlice"("productId");

-- CreateIndex
CREATE INDEX "ProductSlice_status_idx" ON "ProductSlice"("status");

-- CreateIndex
CREATE INDEX "NonFunctionalRequirement_productId_idx" ON "NonFunctionalRequirement"("productId");

-- CreateIndex
CREATE INDEX "NonFunctionalRequirement_category_idx" ON "NonFunctionalRequirement"("category");

-- CreateIndex
CREATE INDEX "NonFunctionalRequirement_status_idx" ON "NonFunctionalRequirement"("status");

-- CreateIndex
CREATE INDEX "RequirementQuestion_productId_idx" ON "RequirementQuestion"("productId");

-- CreateIndex
CREATE INDEX "RequirementQuestion_workItemId_idx" ON "RequirementQuestion"("workItemId");

-- CreateIndex
CREATE INDEX "RequirementQuestion_status_idx" ON "RequirementQuestion"("status");

-- CreateIndex
CREATE INDEX "RequirementQuestion_impact_idx" ON "RequirementQuestion"("impact");

-- CreateIndex
CREATE INDEX "RequirementAssumption_productId_idx" ON "RequirementAssumption"("productId");

-- CreateIndex
CREATE INDEX "RequirementAssumption_workItemId_idx" ON "RequirementAssumption"("workItemId");

-- CreateIndex
CREATE INDEX "RequirementAssumption_status_idx" ON "RequirementAssumption"("status");

-- CreateIndex
CREATE INDEX "RequirementAssumption_impact_idx" ON "RequirementAssumption"("impact");

-- CreateIndex
CREATE INDEX "WorkItem_capabilityId_idx" ON "WorkItem"("capabilityId");

-- CreateIndex
CREATE INDEX "WorkItem_sliceId_idx" ON "WorkItem"("sliceId");

-- AddForeignKey
ALTER TABLE "ProductDefinition" ADD CONSTRAINT "ProductDefinition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefinitionProposal" ADD CONSTRAINT "DefinitionProposal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOutcome" ADD CONSTRAINT "ProductOutcome_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOutcome" ADD CONSTRAINT "ProductOutcome_sourceBriefId_fkey" FOREIGN KEY ("sourceBriefId") REFERENCES "ProductBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCapability" ADD CONSTRAINT "ProductCapability_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCapability" ADD CONSTRAINT "ProductCapability_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "ProductOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSlice" ADD CONSTRAINT "ProductSlice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonFunctionalRequirement" ADD CONSTRAINT "NonFunctionalRequirement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementQuestion" ADD CONSTRAINT "RequirementQuestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementQuestion" ADD CONSTRAINT "RequirementQuestion_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementAssumption" ADD CONSTRAINT "RequirementAssumption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementAssumption" ADD CONSTRAINT "RequirementAssumption_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "ProductCapability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_sliceId_fkey" FOREIGN KEY ("sliceId") REFERENCES "ProductSlice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
