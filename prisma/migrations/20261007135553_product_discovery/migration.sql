-- CreateEnum
CREATE TYPE "DiscoveryStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'APPROVED');

-- CreateEnum
CREATE TYPE "DiscoveryMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ProductBriefStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SignalLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AssumptionStatus" AS ENUM ('UNVALIDATED', 'VALIDATED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "AssumptionImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "BriefOrigin" AS ENUM ('AI_PROPOSAL', 'HUMAN_CONFIRMED', 'UNRESOLVED');

-- CreateTable
CREATE TABLE "DiscoverySession" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "DiscoveryStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "initialIdea" TEXT NOT NULL DEFAULT '',
    "optionalContext" TEXT NOT NULL DEFAULT '',
    "knownConstraints" TEXT NOT NULL DEFAULT '',
    "knownUsers" TEXT NOT NULL DEFAULT '',
    "desiredOutcome" TEXT NOT NULL DEFAULT '',
    "seededDemo" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoverySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "DiscoveryMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBrief" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sessionId" TEXT,
    "version" INTEGER NOT NULL,
    "problemStatement" TEXT NOT NULL DEFAULT '',
    "productVision" TEXT NOT NULL DEFAULT '',
    "valueProposition" TEXT NOT NULL DEFAULT '',
    "targetUsers" JSONB NOT NULL DEFAULT '[]',
    "userNeeds" JSONB NOT NULL DEFAULT '[]',
    "desiredOutcomes" JSONB NOT NULL DEFAULT '[]',
    "constraints" JSONB NOT NULL DEFAULT '[]',
    "risks" JSONB NOT NULL DEFAULT '[]',
    "openQuestions" JSONB NOT NULL DEFAULT '[]',
    "inScope" JSONB NOT NULL DEFAULT '[]',
    "outOfScope" JSONB NOT NULL DEFAULT '[]',
    "successMeasures" JSONB NOT NULL DEFAULT '[]',
    "fieldOrigins" JSONB NOT NULL DEFAULT '{}',
    "problemClarity" "SignalLevel" NOT NULL DEFAULT 'LOW',
    "userClarity" "SignalLevel" NOT NULL DEFAULT 'LOW',
    "outcomeClarity" "SignalLevel" NOT NULL DEFAULT 'LOW',
    "scopeClarity" "SignalLevel" NOT NULL DEFAULT 'LOW',
    "riskClarity" "SignalLevel" NOT NULL DEFAULT 'LOW',
    "readyForReview" BOOLEAN NOT NULL DEFAULT false,
    "readinessReason" TEXT NOT NULL DEFAULT '',
    "status" "ProductBriefStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assumption" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impact" "AssumptionImpact" NOT NULL DEFAULT 'MEDIUM',
    "confidence" "SignalLevel" NOT NULL DEFAULT 'LOW',
    "status" "AssumptionStatus" NOT NULL DEFAULT 'UNVALIDATED',
    "origin" "BriefOrigin" NOT NULL DEFAULT 'AI_PROPOSAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscoverySession_productId_key" ON "DiscoverySession"("productId");

-- CreateIndex
CREATE INDEX "DiscoverySession_status_idx" ON "DiscoverySession"("status");

-- CreateIndex
CREATE INDEX "DiscoveryMessage_sessionId_createdAt_idx" ON "DiscoveryMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductBrief_productId_idx" ON "ProductBrief"("productId");

-- CreateIndex
CREATE INDEX "ProductBrief_sessionId_idx" ON "ProductBrief"("sessionId");

-- CreateIndex
CREATE INDEX "ProductBrief_status_idx" ON "ProductBrief"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBrief_productId_version_key" ON "ProductBrief"("productId", "version");

-- CreateIndex
CREATE INDEX "Assumption_briefId_idx" ON "Assumption"("briefId");

-- CreateIndex
CREATE INDEX "Assumption_status_idx" ON "Assumption"("status");

-- CreateIndex
CREATE INDEX "Assumption_impact_idx" ON "Assumption"("impact");

-- AddForeignKey
ALTER TABLE "DiscoverySession" ADD CONSTRAINT "DiscoverySession_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryMessage" ADD CONSTRAINT "DiscoveryMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiscoverySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBrief" ADD CONSTRAINT "ProductBrief_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBrief" ADD CONSTRAINT "ProductBrief_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiscoverySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assumption" ADD CONSTRAINT "Assumption_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "ProductBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
