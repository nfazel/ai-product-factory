-- CreateEnum
CREATE TYPE "ProductStartMode" AS ENUM ('IDEA', 'EXISTING_REQUIREMENTS');

-- CreateEnum
CREATE TYPE "RequirementSourceKind" AS ENUM ('PASTED_TEXT', 'UPLOADED_DOCUMENT');

-- CreateEnum
CREATE TYPE "RequirementSourceStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'EXTRACTION_FAILED');

-- CreateEnum
CREATE TYPE "SourceRequirementKind" AS ENUM ('BUSINESS', 'FUNCTIONAL', 'NON_FUNCTIONAL', 'SECURITY', 'REGULATORY', 'DATA', 'INTEGRATION', 'TECHNICAL_CONSTRAINT', 'USER_EXPERIENCE', 'OPERATIONAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InterpretationConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "RequirementConfirmation" AS ENUM ('UNREVIEWED', 'CONFIRMED', 'NEEDS_CHANGE', 'REJECTED');

-- CreateEnum
CREATE TYPE "RequirementDisposition" AS ENUM ('UNSET', 'IN_SCOPE', 'OUT_OF_SCOPE', 'DEFERRED', 'DUPLICATE', 'SUPERSEDED', 'NOT_A_REQUIREMENT');

-- CreateEnum
CREATE TYPE "IntakeFindingType" AS ENUM ('AMBIGUOUS', 'INCOMPLETE', 'CONFLICT', 'DUPLICATE', 'MISSING_ACCEPTANCE_CRITERIA', 'MISSING_OUTCOME', 'UNCONFIRMED_ASSUMPTION', 'MISSING_ACTOR', 'MISSING_BUSINESS_RULE', 'UNTESTABLE', 'SECURITY_QUESTION', 'NFR_GAP', 'DEPENDENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "IntakeFindingSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "IntakeFindingStatus" AS ENUM ('OPEN', 'ADDRESSED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "IntakeQuestionPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "IntakeQuestionStatus" AS ENUM ('OPEN', 'ANSWERED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "IntakeAnalysisStatus" AS ENUM ('CURRENT', 'STALE', 'FAILED');

-- CreateEnum
CREATE TYPE "TraceTargetKind" AS ENUM ('PRODUCT_OUTCOME', 'PRODUCT_CAPABILITY', 'WORK_ITEM', 'ACCEPTANCE_CRITERION', 'NFR');

-- CreateEnum
CREATE TYPE "TraceLinkProvenance" AS ENUM ('AI_PROPOSED', 'HUMAN_CONFIRMED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "requirementsReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startMode" "ProductStartMode" NOT NULL DEFAULT 'IDEA';

-- AlterTable
ALTER TABLE "ProductBrief" ADD COLUMN     "fromRequirements" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RequirementSource" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "RequirementSourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL DEFAULT '',
    "mediaType" TEXT NOT NULL DEFAULT '',
    "sourceText" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "storageName" TEXT NOT NULL DEFAULT '',
    "status" "RequirementSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "extractionNote" TEXT NOT NULL DEFAULT '',
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementsAnalysis" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "IntakeAnalysisStatus" NOT NULL DEFAULT 'CURRENT',
    "agentRunId" TEXT NOT NULL DEFAULT '',
    "problem" TEXT NOT NULL DEFAULT '',
    "value" TEXT NOT NULL DEFAULT '',
    "users" JSONB NOT NULL DEFAULT '[]',
    "needs" JSONB NOT NULL DEFAULT '[]',
    "outcomes" JSONB NOT NULL DEFAULT '[]',
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "constraints" JSONB NOT NULL DEFAULT '[]',
    "risks" JSONB NOT NULL DEFAULT '[]',
    "scope" JSONB NOT NULL DEFAULT '[]',
    "successMeasures" JSONB NOT NULL DEFAULT '[]',
    "suggestedCapabilities" JSONB NOT NULL DEFAULT '[]',
    "missingProblem" BOOLEAN NOT NULL DEFAULT false,
    "missingOutcome" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementsAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisSource" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,

    CONSTRAINT "AnalysisSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRequirement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL DEFAULT '',
    "sourceText" TEXT NOT NULL,
    "sectionHeading" TEXT NOT NULL DEFAULT '',
    "pageNumber" INTEGER,
    "blockIndex" INTEGER NOT NULL DEFAULT 0,
    "requirementType" "SourceRequirementKind" NOT NULL DEFAULT 'UNKNOWN',
    "interpretation" TEXT NOT NULL DEFAULT '',
    "confirmedInterpretation" TEXT NOT NULL DEFAULT '',
    "confidence" "InterpretationConfidence" NOT NULL DEFAULT 'UNCERTAIN',
    "confirmation" "RequirementConfirmation" NOT NULL DEFAULT 'UNREVIEWED',
    "confirmedBy" TEXT NOT NULL DEFAULT '',
    "confirmedAt" TIMESTAMP(3),
    "disposition" "RequirementDisposition" NOT NULL DEFAULT 'UNSET',
    "dispositionReason" TEXT NOT NULL DEFAULT '',
    "dispositionBy" TEXT NOT NULL DEFAULT '',
    "suggestedCapability" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementFinding" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "findingType" "IntakeFindingType" NOT NULL,
    "severity" "IntakeFindingSeverity" NOT NULL,
    "status" "IntakeFindingStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "gapNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingSourceLink" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "sourceRequirementId" TEXT,

    CONSTRAINT "FindingSourceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeQuestion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "priority" "IntakeQuestionPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "IntakeQuestionStatus" NOT NULL DEFAULT 'OPEN',
    "answer" TEXT NOT NULL DEFAULT '',
    "answeredBy" TEXT NOT NULL DEFAULT '',
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeQuestionLink" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sourceRequirementId" TEXT NOT NULL,

    CONSTRAINT "IntakeQuestionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementTraceLink" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceRequirementId" TEXT NOT NULL,
    "targetKind" "TraceTargetKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "provenance" "TraceLinkProvenance" NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementTraceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequirementSource_productId_status_idx" ON "RequirementSource"("productId", "status");

-- CreateIndex
CREATE INDEX "RequirementSource_sourceHash_idx" ON "RequirementSource"("sourceHash");

-- CreateIndex
CREATE INDEX "RequirementsAnalysis_productId_status_idx" ON "RequirementsAnalysis"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementsAnalysis_productId_version_key" ON "RequirementsAnalysis"("productId", "version");

-- CreateIndex
CREATE INDEX "AnalysisSource_sourceId_idx" ON "AnalysisSource"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisSource_analysisId_sourceId_key" ON "AnalysisSource"("analysisId", "sourceId");

-- CreateIndex
CREATE INDEX "SourceRequirement_productId_idx" ON "SourceRequirement"("productId");

-- CreateIndex
CREATE INDEX "SourceRequirement_sourceId_idx" ON "SourceRequirement"("sourceId");

-- CreateIndex
CREATE INDEX "SourceRequirement_analysisId_idx" ON "SourceRequirement"("analysisId");

-- CreateIndex
CREATE INDEX "SourceRequirement_confirmation_idx" ON "SourceRequirement"("confirmation");

-- CreateIndex
CREATE INDEX "RequirementFinding_productId_status_idx" ON "RequirementFinding"("productId", "status");

-- CreateIndex
CREATE INDEX "RequirementFinding_analysisId_idx" ON "RequirementFinding"("analysisId");

-- CreateIndex
CREATE INDEX "FindingSourceLink_findingId_idx" ON "FindingSourceLink"("findingId");

-- CreateIndex
CREATE INDEX "FindingSourceLink_sourceRequirementId_idx" ON "FindingSourceLink"("sourceRequirementId");

-- CreateIndex
CREATE INDEX "IntakeQuestion_productId_status_idx" ON "IntakeQuestion"("productId", "status");

-- CreateIndex
CREATE INDEX "IntakeQuestion_analysisId_idx" ON "IntakeQuestion"("analysisId");

-- CreateIndex
CREATE INDEX "IntakeQuestion_priority_idx" ON "IntakeQuestion"("priority");

-- CreateIndex
CREATE INDEX "IntakeQuestionLink_sourceRequirementId_idx" ON "IntakeQuestionLink"("sourceRequirementId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeQuestionLink_questionId_sourceRequirementId_key" ON "IntakeQuestionLink"("questionId", "sourceRequirementId");

-- CreateIndex
CREATE INDEX "RequirementTraceLink_productId_idx" ON "RequirementTraceLink"("productId");

-- CreateIndex
CREATE INDEX "RequirementTraceLink_targetId_idx" ON "RequirementTraceLink"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementTraceLink_sourceRequirementId_targetKind_targetI_key" ON "RequirementTraceLink"("sourceRequirementId", "targetKind", "targetId");

-- AddForeignKey
ALTER TABLE "RequirementSource" ADD CONSTRAINT "RequirementSource_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementsAnalysis" ADD CONSTRAINT "RequirementsAnalysis_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisSource" ADD CONSTRAINT "AnalysisSource_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "RequirementsAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisSource" ADD CONSTRAINT "AnalysisSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RequirementSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRequirement" ADD CONSTRAINT "SourceRequirement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRequirement" ADD CONSTRAINT "SourceRequirement_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RequirementSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRequirement" ADD CONSTRAINT "SourceRequirement_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "RequirementsAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementFinding" ADD CONSTRAINT "RequirementFinding_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementFinding" ADD CONSTRAINT "RequirementFinding_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "RequirementsAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingSourceLink" ADD CONSTRAINT "FindingSourceLink_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "RequirementFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingSourceLink" ADD CONSTRAINT "FindingSourceLink_sourceRequirementId_fkey" FOREIGN KEY ("sourceRequirementId") REFERENCES "SourceRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeQuestion" ADD CONSTRAINT "IntakeQuestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeQuestion" ADD CONSTRAINT "IntakeQuestion_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "RequirementsAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeQuestionLink" ADD CONSTRAINT "IntakeQuestionLink_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "IntakeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeQuestionLink" ADD CONSTRAINT "IntakeQuestionLink_sourceRequirementId_fkey" FOREIGN KEY ("sourceRequirementId") REFERENCES "SourceRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementTraceLink" ADD CONSTRAINT "RequirementTraceLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementTraceLink" ADD CONSTRAINT "RequirementTraceLink_sourceRequirementId_fkey" FOREIGN KEY ("sourceRequirementId") REFERENCES "SourceRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

