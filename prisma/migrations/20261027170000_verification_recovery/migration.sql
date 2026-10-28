-- AlterTable
ALTER TABLE "VerificationSession" ADD COLUMN     "runState" JSONB NOT NULL DEFAULT '{}';
