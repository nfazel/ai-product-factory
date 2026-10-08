-- AlterEnum
ALTER TYPE "RepositoryProvider" RENAME VALUE 'GITHUB_FUTURE' TO 'GITHUB';

-- CreateEnum
CREATE TYPE "SourceControlConnectionStatus" AS ENUM ('CONNECTED', 'MISCONFIGURED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "PublishedChangeStatus" AS ENUM ('READY', 'PUBLISHED', 'DIVERGED', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PullRequestState" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'MERGED');

-- CreateEnum
CREATE TYPE "PullRequestCheckStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PullRequestCheckConclusion" AS ENUM ('SUCCESS', 'FAILURE', 'NEUTRAL', 'CANCELLED', 'SKIPPED', 'TIMED_OUT', 'ACTION_REQUIRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PullRequestReviewState" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SourceControlEvidenceType" AS ENUM ('BRANCH_PUBLISHED', 'REMOTE_COMMIT', 'PULL_REQUEST_CREATED', 'CI_CHECK', 'HUMAN_REVIEW', 'PULL_REQUEST_MERGED');

-- CreateEnum
CREATE TYPE "SourceControlEvidenceSource" AS ENUM ('GITHUB', 'DEMO');

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN "owner" TEXT NOT NULL DEFAULT '',
ADD COLUMN "repositoryName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "remoteName" TEXT NOT NULL DEFAULT 'origin',
ADD COLUMN "installationId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "connectionStatus" "SourceControlConnectionStatus" NOT NULL DEFAULT 'UNAVAILABLE',
ADD COLUMN "connectionMessage" TEXT NOT NULL DEFAULT '',
ADD COLUMN "minimumHumanApprovals" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "SourceControlConnection" (
    "id" TEXT NOT NULL DEFAULT 'factory',
    "provider" "RepositoryProvider" NOT NULL DEFAULT 'GITHUB',
    "owner" TEXT NOT NULL DEFAULT '',
    "repositoryName" TEXT NOT NULL DEFAULT '',
    "repositoryUrl" TEXT NOT NULL DEFAULT '',
    "defaultBranch" TEXT NOT NULL DEFAULT '',
    "remoteName" TEXT NOT NULL DEFAULT 'origin',
    "installationId" TEXT NOT NULL DEFAULT '',
    "status" "SourceControlConnectionStatus" NOT NULL DEFAULT 'UNAVAILABLE',
    "message" TEXT NOT NULL DEFAULT '',
    "minimumHumanApprovals" INTEGER NOT NULL DEFAULT 1,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceControlConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedChange" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "implementationTaskId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "localBranch" TEXT NOT NULL DEFAULT '',
    "remoteBranch" TEXT NOT NULL DEFAULT '',
    "localCommitSha" TEXT NOT NULL DEFAULT '',
    "remoteCommitSha" TEXT NOT NULL DEFAULT '',
    "status" "PublishedChangeStatus" NOT NULL DEFAULT 'READY',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "publishedBy" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3),
    "failureMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishedChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequestRecord" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "publishedChangeId" TEXT NOT NULL,
    "providerPullRequestId" TEXT NOT NULL DEFAULT '',
    "number" INTEGER NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "baseBranch" TEXT NOT NULL DEFAULT '',
    "headBranch" TEXT NOT NULL DEFAULT '',
    "headSha" TEXT NOT NULL DEFAULT '',
    "state" "PullRequestState" NOT NULL DEFAULT 'OPEN',
    "author" TEXT NOT NULL DEFAULT '',
    "mergeCommitSha" TEXT NOT NULL DEFAULT '',
    "mergedAt" TIMESTAMP(3),
    "mergedBy" TEXT NOT NULL DEFAULT '',
    "protection" JSONB NOT NULL DEFAULT '{}',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PullRequestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequestCheck" (
    "id" TEXT NOT NULL,
    "pullRequestRecordId" TEXT NOT NULL,
    "providerCheckId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "status" "PullRequestCheckStatus" NOT NULL DEFAULT 'QUEUED',
    "conclusion" "PullRequestCheckConclusion" NOT NULL DEFAULT 'UNKNOWN',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "detailsUrl" TEXT NOT NULL DEFAULT '',
    "source" "SourceControlEvidenceSource" NOT NULL DEFAULT 'GITHUB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PullRequestCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequestReview" (
    "id" TEXT NOT NULL,
    "pullRequestRecordId" TEXT NOT NULL,
    "providerReviewId" TEXT NOT NULL DEFAULT '',
    "reviewer" TEXT NOT NULL DEFAULT '',
    "state" "PullRequestReviewState" NOT NULL DEFAULT 'UNKNOWN',
    "body" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PullRequestReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequestComment" (
    "id" TEXT NOT NULL,
    "pullRequestRecordId" TEXT NOT NULL,
    "providerCommentId" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "path" TEXT NOT NULL DEFAULT '',
    "line" INTEGER,
    "classification" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "recommendedAction" TEXT NOT NULL DEFAULT '',
    "affectedFiles" JSONB NOT NULL DEFAULT '[]',
    "withinContract" BOOLEAN NOT NULL DEFAULT false,
    "triaged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PullRequestComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceControlEvidence" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "publishedChangeId" TEXT,
    "pullRequestRecordId" TEXT,
    "type" "SourceControlEvidenceType" NOT NULL,
    "source" "SourceControlEvidenceSource" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceControlEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Repository_connectionStatus_idx" ON "Repository"("connectionStatus");

-- CreateIndex
CREATE INDEX "PublishedChange_productId_idx" ON "PublishedChange"("productId");

-- CreateIndex
CREATE INDEX "PublishedChange_implementationTaskId_idx" ON "PublishedChange"("implementationTaskId");

-- CreateIndex
CREATE INDEX "PublishedChange_repositoryId_idx" ON "PublishedChange"("repositoryId");

-- CreateIndex
CREATE INDEX "PublishedChange_status_idx" ON "PublishedChange"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PullRequestRecord_publishedChangeId_key" ON "PullRequestRecord"("publishedChangeId");

-- CreateIndex
CREATE INDEX "PullRequestRecord_productId_idx" ON "PullRequestRecord"("productId");

-- CreateIndex
CREATE INDEX "PullRequestRecord_repositoryId_idx" ON "PullRequestRecord"("repositoryId");

-- CreateIndex
CREATE INDEX "PullRequestRecord_state_idx" ON "PullRequestRecord"("state");

-- CreateIndex
CREATE UNIQUE INDEX "PullRequestCheck_pullRequestRecordId_providerCheckId_key" ON "PullRequestCheck"("pullRequestRecordId", "providerCheckId");

-- CreateIndex
CREATE INDEX "PullRequestCheck_pullRequestRecordId_idx" ON "PullRequestCheck"("pullRequestRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "PullRequestReview_pullRequestRecordId_providerReviewId_key" ON "PullRequestReview"("pullRequestRecordId", "providerReviewId");

-- CreateIndex
CREATE INDEX "PullRequestReview_pullRequestRecordId_idx" ON "PullRequestReview"("pullRequestRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "PullRequestComment_pullRequestRecordId_providerCommentId_key" ON "PullRequestComment"("pullRequestRecordId", "providerCommentId");

-- CreateIndex
CREATE INDEX "PullRequestComment_pullRequestRecordId_idx" ON "PullRequestComment"("pullRequestRecordId");

-- CreateIndex
CREATE INDEX "SourceControlEvidence_productId_idx" ON "SourceControlEvidence"("productId");

-- CreateIndex
CREATE INDEX "SourceControlEvidence_publishedChangeId_idx" ON "SourceControlEvidence"("publishedChangeId");

-- CreateIndex
CREATE INDEX "SourceControlEvidence_pullRequestRecordId_idx" ON "SourceControlEvidence"("pullRequestRecordId");

-- CreateIndex
CREATE INDEX "SourceControlEvidence_type_idx" ON "SourceControlEvidence"("type");

-- AddForeignKey
ALTER TABLE "PublishedChange" ADD CONSTRAINT "PublishedChange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedChange" ADD CONSTRAINT "PublishedChange_implementationTaskId_fkey" FOREIGN KEY ("implementationTaskId") REFERENCES "ImplementationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedChange" ADD CONSTRAINT "PublishedChange_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedChange" ADD CONSTRAINT "PublishedChange_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RepositoryWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestRecord" ADD CONSTRAINT "PullRequestRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestRecord" ADD CONSTRAINT "PullRequestRecord_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestRecord" ADD CONSTRAINT "PullRequestRecord_publishedChangeId_fkey" FOREIGN KEY ("publishedChangeId") REFERENCES "PublishedChange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestCheck" ADD CONSTRAINT "PullRequestCheck_pullRequestRecordId_fkey" FOREIGN KEY ("pullRequestRecordId") REFERENCES "PullRequestRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestReview" ADD CONSTRAINT "PullRequestReview_pullRequestRecordId_fkey" FOREIGN KEY ("pullRequestRecordId") REFERENCES "PullRequestRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestComment" ADD CONSTRAINT "PullRequestComment_pullRequestRecordId_fkey" FOREIGN KEY ("pullRequestRecordId") REFERENCES "PullRequestRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceControlEvidence" ADD CONSTRAINT "SourceControlEvidence_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
