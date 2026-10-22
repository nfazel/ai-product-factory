-- Execution plan review keeps version history on the existing plan row.
-- Existing plans stay on their current status. Nothing is approved by this migration.

ALTER TYPE "ExecutionPlanStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';

ALTER TABLE "CodingExecutionPlan"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "approvedBy" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "changeRequest" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "history" JSONB NOT NULL DEFAULT '[]';
