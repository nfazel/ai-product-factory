-- A coding-risk recommendation override is not a resolution or a risk acceptance.
-- Existing override rows stay as recorded. Their underlying risk starts open.

CREATE TYPE "CodingRiskDisposition" AS ENUM ('OPEN', 'RESOLVED', 'RISK_ACCEPTED');

ALTER TABLE "CodingRiskAssessment"
  ADD COLUMN "disposition" "CodingRiskDisposition" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "decisionRationale" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "decidedBy" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "decidedAt" TIMESTAMP(3);

CREATE INDEX "CodingRiskAssessment_disposition_idx" ON "CodingRiskAssessment"("disposition");
