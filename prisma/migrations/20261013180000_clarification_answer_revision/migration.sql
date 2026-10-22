-- Clarification answers keep their history. Existing answers stay on the question row.
-- New review flags default to false, so current approvals are unchanged.

CREATE TYPE "ClarificationKind" AS ENUM ('INTAKE', 'REQUIREMENT', 'ARCHITECTURE', 'GOVERNANCE', 'RELEASE');

CREATE TABLE "ClarificationAnswerRevision" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "ClarificationKind" NOT NULL,
    "questionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "material" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClarificationAnswerRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClarificationAnswerRevision_productId_createdAt_idx" ON "ClarificationAnswerRevision"("productId", "createdAt");
CREATE INDEX "ClarificationAnswerRevision_questionId_createdAt_idx" ON "ClarificationAnswerRevision"("questionId", "createdAt");

ALTER TABLE "ClarificationAnswerRevision" ADD CONSTRAINT "ClarificationAnswerRevision_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductBrief" ADD COLUMN "reviewRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductBrief" ADD COLUMN "reviewReason" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ProductDefinition" ADD COLUMN "reviewRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductDefinition" ADD COLUMN "reviewReason" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ReleaseCandidate" ADD COLUMN "reviewRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReleaseCandidate" ADD COLUMN "reviewReason" TEXT NOT NULL DEFAULT '';
