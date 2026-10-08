-- AlterEnum
ALTER TYPE "ImplementationTaskStatus" ADD VALUE 'CODE_REVIEW';

-- CreateEnum
CREATE TYPE "RepositoryProvider" AS ENUM ('LOCAL', 'GITHUB_FUTURE');

-- CreateEnum
CREATE TYPE "RepositoryRecordStatus" AS ENUM ('CONFIGURED', 'UNAVAILABLE', 'DISABLED');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('CREATING', 'ACTIVE', 'CHECKING', 'READY_FOR_REVIEW', 'FAILED', 'ABANDONED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ExecutionContractStatus" AS ENUM ('DRAFT', 'APPROVED', 'EXECUTING', 'COMPLETED', 'FAILED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ExecutionPlanStatus" AS ENUM ('PROPOSED', 'APPROVED', 'EXECUTING', 'COMPLETED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "CodingEscalationType" AS ENUM ('REQUIREMENT_AMBIGUITY', 'ARCHITECTURE_CONFLICT', 'MISSING_DEPENDENCY', 'POLICY_CONFLICT', 'SCOPE_EXPANSION', 'TEST_FAILURE', 'SECURITY_CONCERN', 'UNEXPECTED_CODEBASE', 'OTHER');

-- CreateEnum
CREATE TYPE "CodingEscalationStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CodingEvidenceType" AS ENUM ('FILE_CHANGE', 'TEST_RESULT', 'TYPECHECK', 'LINT', 'BUILD', 'STATIC_ANALYSIS', 'AGENT_ANALYSIS', 'HUMAN_CONFIRMATION');

-- CreateEnum
CREATE TYPE "CodingEvidenceSource" AS ENUM ('REPOSITORY', 'COMMAND_RUNNER', 'AI_ANALYSIS', 'HUMAN');

-- CreateEnum
CREATE TYPE "CodingToolAction" AS ENUM ('READ_FILE', 'LIST_DIRECTORY', 'WRITE_FILE', 'CREATE_FILE', 'DELETE_FILE', 'RUN_COMMAND', 'GET_DIFF', 'GET_STATUS');

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "RepositoryProvider" NOT NULL DEFAULT 'LOCAL',
    "repositoryUrl" TEXT NOT NULL DEFAULT '',
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "localPath" TEXT NOT NULL,
    "status" "RepositoryRecordStatus" NOT NULL DEFAULT 'UNAVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryWorkspace" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "implementationTaskId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "workspacePath" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "baseCommit" TEXT NOT NULL DEFAULT '',
    "headCommit" TEXT NOT NULL DEFAULT '',
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'CREATING',
    "executionContractStale" BOOLEAN NOT NULL DEFAULT false,
    "staleReason" TEXT NOT NULL DEFAULT '',
    "staleFlaggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RepositoryWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingExecutionContract" (
    "id" TEXT NOT NULL,
    "implementationTaskId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "objective" TEXT NOT NULL DEFAULT '',
    "allowedPaths" JSONB NOT NULL DEFAULT '[]',
    "restrictedPaths" JSONB NOT NULL DEFAULT '[]',
    "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
    "requiredChecks" JSONB NOT NULL DEFAULT '[]',
    "architectureConstraints" TEXT NOT NULL DEFAULT '',
    "codingPolicyConstraints" TEXT NOT NULL DEFAULT '',
    "dependencies" JSONB NOT NULL DEFAULT '[]',
    "validationExpectations" TEXT NOT NULL DEFAULT '',
    "maxFiles" INTEGER,
    "executionMode" "CodingExecutionMode" NOT NULL,
    "riskLevel" "CodingRiskLevel" NOT NULL,
    "allowFileDelete" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExecutionContractStatus" NOT NULL DEFAULT 'APPROVED',
    "sourceFingerprint" TEXT NOT NULL DEFAULT '',
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "staleReason" TEXT NOT NULL DEFAULT '',
    "staleFlaggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodingExecutionContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingExecutionPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "analysisNote" TEXT NOT NULL DEFAULT '',
    "filesExpectedToChange" JSONB NOT NULL DEFAULT '[]',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "risks" TEXT NOT NULL DEFAULT '',
    "validationPlan" TEXT NOT NULL DEFAULT '',
    "status" "ExecutionPlanStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodingExecutionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingEscalation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "CodingEscalationType" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "recommendedAction" TEXT NOT NULL DEFAULT '',
    "status" "CodingEscalationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CodingEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingEvidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "implementationTaskId" TEXT NOT NULL,
    "type" "CodingEvidenceType" NOT NULL,
    "source" "CodingEvidenceSource" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '',
    "command" TEXT NOT NULL DEFAULT '',
    "exitCode" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodingEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingToolEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "action" "CodingToolAction" NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "path" TEXT NOT NULL DEFAULT '',
    "command" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodingToolEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingSelfReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "findings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodingSelfReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingRevision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "feedback" TEXT NOT NULL DEFAULT '',
    "requiredChanges" TEXT NOT NULL DEFAULT '',
    "affectedFiles" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodingRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingDiff" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "files" JSONB NOT NULL DEFAULT '[]',
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "patch" TEXT NOT NULL DEFAULT '',
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodingDiff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeChangeApproval" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "implementationTaskId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "baseCommit" TEXT NOT NULL,
    "headCommit" TEXT NOT NULL,
    "diffHash" TEXT NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "staleReason" TEXT NOT NULL DEFAULT '',
    "staleFlaggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeChangeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_productId_key" ON "Repository"("productId");

-- CreateIndex
CREATE INDEX "Repository_status_idx" ON "Repository"("status");

-- CreateIndex
CREATE INDEX "RepositoryWorkspace_productId_status_idx" ON "RepositoryWorkspace"("productId", "status");

-- CreateIndex
CREATE INDEX "RepositoryWorkspace_repositoryId_idx" ON "RepositoryWorkspace"("repositoryId");

-- CreateIndex
CREATE INDEX "RepositoryWorkspace_implementationTaskId_idx" ON "RepositoryWorkspace"("implementationTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "CodingExecutionContract_workspaceId_key" ON "CodingExecutionContract"("workspaceId");

-- CreateIndex
CREATE INDEX "CodingExecutionContract_implementationTaskId_idx" ON "CodingExecutionContract"("implementationTaskId");

-- CreateIndex
CREATE INDEX "CodingExecutionContract_status_idx" ON "CodingExecutionContract"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CodingExecutionPlan_workspaceId_key" ON "CodingExecutionPlan"("workspaceId");

-- CreateIndex
CREATE INDEX "CodingEscalation_workspaceId_status_idx" ON "CodingEscalation"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "CodingEscalation_type_idx" ON "CodingEscalation"("type");

-- CreateIndex
CREATE INDEX "CodingEvidence_workspaceId_idx" ON "CodingEvidence"("workspaceId");

-- CreateIndex
CREATE INDEX "CodingEvidence_implementationTaskId_idx" ON "CodingEvidence"("implementationTaskId");

-- CreateIndex
CREATE INDEX "CodingEvidence_type_idx" ON "CodingEvidence"("type");

-- CreateIndex
CREATE INDEX "CodingToolEvent_workspaceId_createdAt_idx" ON "CodingToolEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "CodingToolEvent_allowed_idx" ON "CodingToolEvent"("allowed");

-- CreateIndex
CREATE UNIQUE INDEX "CodingSelfReview_workspaceId_key" ON "CodingSelfReview"("workspaceId");

-- CreateIndex
CREATE INDEX "CodingRevision_workspaceId_idx" ON "CodingRevision"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CodingDiff_workspaceId_key" ON "CodingDiff"("workspaceId");

-- CreateIndex
CREATE INDEX "CodeChangeApproval_productId_idx" ON "CodeChangeApproval"("productId");

-- CreateIndex
CREATE INDEX "CodeChangeApproval_workspaceId_idx" ON "CodeChangeApproval"("workspaceId");

-- CreateIndex
CREATE INDEX "CodeChangeApproval_implementationTaskId_idx" ON "CodeChangeApproval"("implementationTaskId");

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryWorkspace" ADD CONSTRAINT "RepositoryWorkspace_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryWorkspace" ADD CONSTRAINT "RepositoryWorkspace_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryWorkspace" ADD CONSTRAINT "RepositoryWorkspace_implementationTaskId_fkey" FOREIGN KEY ("implementationTaskId") REFERENCES "ImplementationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingExecutionContract" ADD CONSTRAINT "CodingExecutionContract_implementationTaskId_fkey" FOREIGN KEY ("implementationTaskId") REFERENCES "ImplementationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingExecutionContract" ADD CONSTRAINT "CodingExecutionContract_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RepositoryWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingExecutionPlan" ADD CONSTRAINT "CodingExecutionPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RepositoryWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingEscalation" ADD CONSTRAINT "CodingEscalation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RepositoryWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingEvidence" ADD CONSTRAINT "CodingEvidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RepositoryWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingToolEvent" ADD CONSTRAINT "CodingToolEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RepositoryWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingSelfReview" ADD CONSTRAINT "CodingSelfReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RepositoryWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingRevision" ADD CONSTRAINT "CodingRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RepositoryWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingDiff" ADD CONSTRAINT "CodingDiff_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RepositoryWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeChangeApproval" ADD CONSTRAINT "CodeChangeApproval_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeChangeApproval" ADD CONSTRAINT "CodeChangeApproval_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RepositoryWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
