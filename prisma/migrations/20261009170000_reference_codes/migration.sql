-- Stable cross-artifact codes. Database ids stay the foreign keys.
-- Empty codes are assigned by creation order and then kept when a row is revised in place.

ALTER TABLE "WorkItem" ADD COLUMN "referenceCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProductCapability" ADD COLUMN "referenceCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "NonFunctionalRequirement" ADD COLUMN "referenceCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RequirementAssumption" ADD COLUMN "referenceCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ArchitectureComponent" ADD COLUMN "referenceCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ArchitectureDecisionRecord" ADD COLUMN "referenceCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ImplementationTask" ADD COLUMN "referenceCode" TEXT NOT NULL DEFAULT '';

WITH numbered AS (
  SELECT id,
    CASE type
      WHEN 'EPIC' THEN 'EPIC'
      WHEN 'FEATURE' THEN 'FEAT'
      WHEN 'STORY' THEN 'STORY'
      WHEN 'DEFECT' THEN 'DEFECT'
      ELSE 'TASK'
    END AS prefix,
    row_number() OVER (
      PARTITION BY "productId",
        CASE type
          WHEN 'EPIC' THEN 'EPIC'
          WHEN 'FEATURE' THEN 'FEAT'
          WHEN 'STORY' THEN 'STORY'
          WHEN 'DEFECT' THEN 'DEFECT'
          ELSE 'TASK'
        END
      ORDER BY "createdAt", id
    ) AS seq
  FROM "WorkItem"
)
UPDATE "WorkItem" AS row
SET "referenceCode" = numbered.prefix || '-' || lpad(numbered.seq::text, 3, '0')
FROM numbered
WHERE row.id = numbered.id;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY "productId" ORDER BY "createdAt", id) AS seq
  FROM "ProductCapability"
)
UPDATE "ProductCapability" AS row
SET "referenceCode" = 'CAP-' || lpad(numbered.seq::text, 3, '0')
FROM numbered WHERE row.id = numbered.id;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY "productId" ORDER BY "createdAt", id) AS seq
  FROM "NonFunctionalRequirement"
)
UPDATE "NonFunctionalRequirement" AS row
SET "referenceCode" = 'NFR-' || lpad(numbered.seq::text, 3, '0')
FROM numbered WHERE row.id = numbered.id;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY "productId" ORDER BY "createdAt", id) AS seq
  FROM "RequirementAssumption"
)
UPDATE "RequirementAssumption" AS row
SET "referenceCode" = 'ASM-' || lpad(numbered.seq::text, 3, '0')
FROM numbered WHERE row.id = numbered.id;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY "solutionArchitectureId" ORDER BY "createdAt", id) AS seq
  FROM "ArchitectureComponent"
)
UPDATE "ArchitectureComponent" AS row
SET "referenceCode" = 'CMP-' || lpad(numbered.seq::text, 3, '0')
FROM numbered WHERE row.id = numbered.id;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY "solutionArchitectureId" ORDER BY "createdAt", id) AS seq
  FROM "ArchitectureDecisionRecord"
)
UPDATE "ArchitectureDecisionRecord" AS row
SET "referenceCode" = 'ADR-' || lpad(numbered.seq::text, 3, '0')
FROM numbered WHERE row.id = numbered.id;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY "implementationPlanId" ORDER BY sequence, "createdAt", id) AS seq
  FROM "ImplementationTask"
)
UPDATE "ImplementationTask" AS row
SET "referenceCode" = 'TSK-' || lpad(numbered.seq::text, 3, '0')
FROM numbered WHERE row.id = numbered.id;

CREATE UNIQUE INDEX "WorkItem_product_reference_key" ON "WorkItem" ("productId", "referenceCode") WHERE "referenceCode" <> '';
CREATE UNIQUE INDEX "ProductCapability_product_reference_key" ON "ProductCapability" ("productId", "referenceCode") WHERE "referenceCode" <> '';
CREATE UNIQUE INDEX "NonFunctionalRequirement_product_reference_key" ON "NonFunctionalRequirement" ("productId", "referenceCode") WHERE "referenceCode" <> '';
CREATE UNIQUE INDEX "RequirementAssumption_product_reference_key" ON "RequirementAssumption" ("productId", "referenceCode") WHERE "referenceCode" <> '';
CREATE UNIQUE INDEX "ArchitectureComponent_architecture_reference_key" ON "ArchitectureComponent" ("solutionArchitectureId", "referenceCode") WHERE "referenceCode" <> '';
CREATE UNIQUE INDEX "ArchitectureDecisionRecord_architecture_reference_key" ON "ArchitectureDecisionRecord" ("solutionArchitectureId", "referenceCode") WHERE "referenceCode" <> '';
CREATE UNIQUE INDEX "ImplementationTask_plan_reference_key" ON "ImplementationTask" ("implementationPlanId", "referenceCode") WHERE "referenceCode" <> '';
