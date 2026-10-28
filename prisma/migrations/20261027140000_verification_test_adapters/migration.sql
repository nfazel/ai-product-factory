-- Phase 1: test adapters. Additive only. Existing rows keep empty values, which the application reads as
-- "recorded before adapters existed" and treats with the same rules as before.
ALTER TABLE "VerificationTestCase"
  ADD COLUMN "adapterId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "targetSurface" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "requiredCapabilities" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "VerificationExecution"
  ADD COLUMN "adapterId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "failureCategory" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "snapshotCommit" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "durationMs" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "VerificationEvidence"
  ADD COLUMN "adapterId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "executionId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "snapshotCommit" TEXT NOT NULL DEFAULT '';
