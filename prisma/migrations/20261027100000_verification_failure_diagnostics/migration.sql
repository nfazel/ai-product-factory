-- Records which verification stage stopped without a verdict, plus a redacted technical detail.
-- Additive only: existing sessions keep empty values and their verdicts are unchanged.
ALTER TABLE "VerificationSession" ADD COLUMN "failureStage" TEXT NOT NULL DEFAULT '',
ADD COLUMN "failureDetail" TEXT NOT NULL DEFAULT '';
