-- Records why a verification test case is manual, so a person can see why it was not executed.
-- Additive only: existing cases keep an empty reason.
ALTER TABLE "VerificationTestCase" ADD COLUMN "manualReason" TEXT NOT NULL DEFAULT '';
