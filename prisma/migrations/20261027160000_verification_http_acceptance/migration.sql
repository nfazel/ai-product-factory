-- Phase 2: HTTP black-box acceptance. Additive only. Existing rows keep the empty defaults, which the application
-- reads as "no fixture plan" and "no HTTP requests recorded".
ALTER TABLE "VerificationSession"
  ADD COLUMN "fixturePlan" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "VerificationExecution"
  ADD COLUMN "observations" JSONB NOT NULL DEFAULT '[]';
