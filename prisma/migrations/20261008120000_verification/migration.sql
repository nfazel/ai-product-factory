-- CreateEnum
CREATE TYPE "VerificationSessionStatus" AS ENUM ('PLANNING', 'READY', 'EXECUTING', 'REVIEW', 'PASSED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "VerificationVerdict" AS ENUM ('PASS', 'PASS_WITH_CONCERNS', 'FAIL', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "VerificationCoverageStatus" AS ENUM ('VERIFIED', 'FAILED', 'NOT_TESTED', 'BLOCKED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "VerificationTestStatus" AS ENUM ('PROPOSED', 'READY', 'PASSED', 'FAILED', 'BLOCKED', 'NOT_RUN', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "TestProvenance" AS ENUM ('HUMAN_EXISTING', 'CODING_AGENT', 'VERIFICATION_AGENT');

-- CreateEnum
CREATE TYPE "VerificationExecutionStatus" AS ENUM ('PASSED', 'FAILED', 'BLOCKED', 'NOT_RUN');

-- CreateEnum
CREATE TYPE "VerificationExecutionKind" AS ENUM ('NEW_VERIFICATION', 'EXISTING_REGRESSION');

-- CreateEnum
CREATE TYPE "VerificationEvidenceType" AS ENUM ('TEST_RESULT', 'BUILD_RESULT', 'TYPECHECK_RESULT', 'STATIC_ANALYSIS', 'MANUAL_CONFIRMATION', 'AI_ANALYSIS', 'SCREENSHOT_FUTURE', 'PERFORMANCE_RESULT_FUTURE', 'SECURITY_SCAN_FUTURE');

-- CreateEnum
CREATE TYPE "VerificationEvidenceSource" AS ENUM ('COMMAND_RUNNER', 'REPOSITORY', 'AI_ANALYSIS', 'HUMAN');

-- CreateEnum
CREATE TYPE "VerificationWorkspaceStatus" AS ENUM ('CREATING', 'ACTIVE', 'FAILED', 'ABANDONED', 'COMPLETED');

-- CreateTable
CREATE TABLE "VerificationSession" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "implementationTaskId" TEXT NOT NULL,
    "repositoryWorkspaceId" TEXT,
    "commitSha" TEXT NOT NULL DEFAULT '',
    "agentRunId" TEXT,
    "status" "VerificationSessionStatus" NOT NULL DEFAULT 'PLANNING',
    "overallVerdict" "VerificationVerdict",
    "proposedVerdict" TEXT NOT NULL DEFAULT '',
    "verdictReason" TEXT NOT NULL DEFAULT '',
    "existingTestNotes" TEXT NOT NULL DEFAULT '',
    "aiSummary" TEXT NOT NULL DEFAULT '',
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "staleReason" TEXT NOT NULL DEFAULT '',
    "staleFlaggedAt" TIMESTAMP(3),
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationContract" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "objective" TEXT NOT NULL DEFAULT '',
    "storyTitle" TEXT NOT NULL DEFAULT '',
    "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
    "nfrs" JSONB NOT NULL DEFAULT '[]',
    "architectureConstraints" TEXT NOT NULL DEFAULT '',
    "securityConstraints" TEXT NOT NULL DEFAULT '',
    "codingContractSummary" TEXT NOT NULL DEFAULT '',
    "commitSha" TEXT NOT NULL DEFAULT '',
    "changedFiles" JSONB NOT NULL DEFAULT '[]',
    "requiredAreas" JSONB NOT NULL DEFAULT '[]',
    "sourceFingerprint" TEXT NOT NULL DEFAULT '',
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCondition" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "acceptanceCriterionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "negative" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'ACCEPTANCE_CRITERION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationTestCase" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "acceptanceCriterionId" TEXT,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "preconditions" TEXT NOT NULL DEFAULT '',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "expectedResult" TEXT NOT NULL DEFAULT '',
    "testType" TEXT NOT NULL DEFAULT 'OTHER',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "source" TEXT NOT NULL DEFAULT 'ACCEPTANCE_CRITERION',
    "provenance" "TestProvenance" NOT NULL DEFAULT 'VERIFICATION_AGENT',
    "automated" BOOLEAN NOT NULL DEFAULT false,
    "status" "VerificationTestStatus" NOT NULL DEFAULT 'PROPOSED',
    "filePath" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationTestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCoverage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "acceptanceCriterionId" TEXT NOT NULL,
    "status" "VerificationCoverageStatus" NOT NULL DEFAULT 'NOT_TESTED',
    "rationale" TEXT NOT NULL DEFAULT '',
    "humanConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationWorkspace" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "workspacePath" TEXT NOT NULL DEFAULT '',
    "branchName" TEXT NOT NULL DEFAULT '',
    "baseCommit" TEXT NOT NULL DEFAULT '',
    "status" "VerificationWorkspaceStatus" NOT NULL DEFAULT 'CREATING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationExecution" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "testCaseId" TEXT,
    "command" TEXT NOT NULL DEFAULT '',
    "kind" "VerificationExecutionKind" NOT NULL,
    "status" "VerificationExecutionStatus" NOT NULL DEFAULT 'NOT_RUN',
    "exitCode" INTEGER,
    "outputSummary" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationEvidence" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "testCaseId" TEXT,
    "acceptanceCriterionId" TEXT,
    "type" "VerificationEvidenceType" NOT NULL,
    "source" "VerificationEvidenceSource" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '',
    "command" TEXT NOT NULL DEFAULT '',
    "exitCode" INTEGER,
    "artifactReference" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationEscalation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationNfrResult" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "nfrId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_TESTED',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationNfrResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationDefectLink" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "acceptanceCriterionId" TEXT,
    "implementationTaskId" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL DEFAULT '',
    "evidenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationDefectLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationApproval" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "implementationTaskId" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "evidenceFingerprint" TEXT NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "staleReason" TEXT NOT NULL DEFAULT '',
    "staleFlaggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegratedVerificationSession" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productSliceId" TEXT NOT NULL,
    "status" "VerificationSessionStatus" NOT NULL DEFAULT 'PLANNING',
    "overallVerdict" "VerificationVerdict",
    "planSummary" TEXT NOT NULL DEFAULT '',
    "evidenceGaps" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegratedVerificationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationContract_sessionId_key" ON "VerificationContract"("sessionId");
CREATE UNIQUE INDEX "VerificationCoverage_sessionId_acceptanceCriterionId_key" ON "VerificationCoverage"("sessionId", "acceptanceCriterionId");
CREATE UNIQUE INDEX "VerificationWorkspace_sessionId_key" ON "VerificationWorkspace"("sessionId");
CREATE INDEX "VerificationSession_productId_createdAt_idx" ON "VerificationSession"("productId", "createdAt");
CREATE INDEX "VerificationSession_implementationTaskId_idx" ON "VerificationSession"("implementationTaskId");
CREATE INDEX "VerificationSession_status_idx" ON "VerificationSession"("status");
CREATE INDEX "VerificationCondition_sessionId_idx" ON "VerificationCondition"("sessionId");
CREATE INDEX "VerificationTestCase_sessionId_idx" ON "VerificationTestCase"("sessionId");
CREATE INDEX "VerificationTestCase_acceptanceCriterionId_idx" ON "VerificationTestCase"("acceptanceCriterionId");
CREATE INDEX "VerificationCoverage_acceptanceCriterionId_idx" ON "VerificationCoverage"("acceptanceCriterionId");
CREATE INDEX "VerificationWorkspace_repositoryId_idx" ON "VerificationWorkspace"("repositoryId");
CREATE INDEX "VerificationExecution_sessionId_idx" ON "VerificationExecution"("sessionId");
CREATE INDEX "VerificationExecution_testCaseId_idx" ON "VerificationExecution"("testCaseId");
CREATE INDEX "VerificationEvidence_sessionId_idx" ON "VerificationEvidence"("sessionId");
CREATE INDEX "VerificationEvidence_acceptanceCriterionId_idx" ON "VerificationEvidence"("acceptanceCriterionId");
CREATE INDEX "VerificationEvidence_type_idx" ON "VerificationEvidence"("type");
CREATE INDEX "VerificationEscalation_sessionId_idx" ON "VerificationEscalation"("sessionId");
CREATE INDEX "VerificationNfrResult_sessionId_idx" ON "VerificationNfrResult"("sessionId");
CREATE INDEX "VerificationDefectLink_sessionId_idx" ON "VerificationDefectLink"("sessionId");
CREATE INDEX "VerificationDefectLink_workItemId_idx" ON "VerificationDefectLink"("workItemId");
CREATE INDEX "VerificationDefectLink_implementationTaskId_idx" ON "VerificationDefectLink"("implementationTaskId");
CREATE INDEX "VerificationApproval_productId_idx" ON "VerificationApproval"("productId");
CREATE INDEX "VerificationApproval_sessionId_idx" ON "VerificationApproval"("sessionId");
CREATE INDEX "VerificationApproval_implementationTaskId_idx" ON "VerificationApproval"("implementationTaskId");
CREATE INDEX "IntegratedVerificationSession_productId_idx" ON "IntegratedVerificationSession"("productId");
CREATE INDEX "IntegratedVerificationSession_productSliceId_idx" ON "IntegratedVerificationSession"("productSliceId");

-- AddForeignKey
ALTER TABLE "VerificationSession" ADD CONSTRAINT "VerificationSession_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationSession" ADD CONSTRAINT "VerificationSession_implementationTaskId_fkey" FOREIGN KEY ("implementationTaskId") REFERENCES "ImplementationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationSession" ADD CONSTRAINT "VerificationSession_repositoryWorkspaceId_fkey" FOREIGN KEY ("repositoryWorkspaceId") REFERENCES "RepositoryWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VerificationContract" ADD CONSTRAINT "VerificationContract_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationCondition" ADD CONSTRAINT "VerificationCondition_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationTestCase" ADD CONSTRAINT "VerificationTestCase_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationTestCase" ADD CONSTRAINT "VerificationTestCase_acceptanceCriterionId_fkey" FOREIGN KEY ("acceptanceCriterionId") REFERENCES "AcceptanceCriterion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VerificationCoverage" ADD CONSTRAINT "VerificationCoverage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationCoverage" ADD CONSTRAINT "VerificationCoverage_acceptanceCriterionId_fkey" FOREIGN KEY ("acceptanceCriterionId") REFERENCES "AcceptanceCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationWorkspace" ADD CONSTRAINT "VerificationWorkspace_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationWorkspace" ADD CONSTRAINT "VerificationWorkspace_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationExecution" ADD CONSTRAINT "VerificationExecution_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationExecution" ADD CONSTRAINT "VerificationExecution_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "VerificationTestCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VerificationEvidence" ADD CONSTRAINT "VerificationEvidence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationEvidence" ADD CONSTRAINT "VerificationEvidence_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "VerificationTestCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VerificationEscalation" ADD CONSTRAINT "VerificationEscalation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationNfrResult" ADD CONSTRAINT "VerificationNfrResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationDefectLink" ADD CONSTRAINT "VerificationDefectLink_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationDefectLink" ADD CONSTRAINT "VerificationDefectLink_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationApproval" ADD CONSTRAINT "VerificationApproval_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationApproval" ADD CONSTRAINT "VerificationApproval_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegratedVerificationSession" ADD CONSTRAINT "IntegratedVerificationSession_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegratedVerificationSession" ADD CONSTRAINT "IntegratedVerificationSession_productSliceId_fkey" FOREIGN KEY ("productSliceId") REFERENCES "ProductSlice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
