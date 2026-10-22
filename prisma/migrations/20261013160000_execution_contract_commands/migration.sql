-- Authorised setup and validation commands live on the execution plan.
-- Existing approved plans keep empty command lists. Nothing is approved by this migration.

ALTER TABLE "CodingExecutionPlan"
  ADD COLUMN "setupCommands" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "validationCommands" JSONB NOT NULL DEFAULT '[]';
