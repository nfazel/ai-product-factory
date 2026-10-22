CREATE TYPE "CiState" AS ENUM ('PASSED', 'FAILED', 'PENDING', 'NOT_CONFIGURED', 'UNKNOWN');

CREATE TYPE "CiRequirement" AS ENUM ('REQUIRED', 'EXCEPTION');

ALTER TYPE "SourceControlEvidenceType" ADD VALUE 'REMOTE_BRANCH_ABSENT';

ALTER TABLE "PullRequestRecord" ADD COLUMN "mergeable" BOOLEAN,
ADD COLUMN "mergeableState" TEXT NOT NULL DEFAULT '',
ADD COLUMN "ciState" "CiState" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "ciDetail" TEXT NOT NULL DEFAULT '',
ADD COLUMN "protectionAccess" TEXT NOT NULL DEFAULT '';

ALTER TABLE "PullRequestReview" ADD COLUMN "commitSha" TEXT NOT NULL DEFAULT '';

CREATE TABLE "CiRequirementDecision" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "requirement" "CiRequirement" NOT NULL,
    "rationale" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CiRequirementDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CiRequirementDecision_productId_key" ON "CiRequirementDecision"("productId");

ALTER TABLE "CiRequirementDecision" ADD CONSTRAINT "CiRequirementDecision_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
