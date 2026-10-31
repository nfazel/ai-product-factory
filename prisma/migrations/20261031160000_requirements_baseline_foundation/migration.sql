-- CreateTable
CREATE TABLE "RequirementsBaseline" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementsBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementsBaselineMember" (
    "baselineId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "RequirementsBaselineMember_pkey" PRIMARY KEY ("baselineId","criterionId")
);

-- CreateTable
CREATE TABLE "CriterionLineage" (
    "criterionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "rootId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "predecessorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CriterionLineage_pkey" PRIMARY KEY ("criterionId")
);

-- CreateTable
CREATE TABLE "RequirementsBaselineSelection" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "baselineId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementsBaselineSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequirementsBaseline_productId_version_key" ON "RequirementsBaseline"("productId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementsBaseline_id_productId_key" ON "RequirementsBaseline"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionLineage_predecessorId_key" ON "CriterionLineage"("predecessorId");

-- CreateIndex
CREATE INDEX "CriterionLineage_productId_idx" ON "CriterionLineage"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionLineage_rootId_generation_key" ON "CriterionLineage"("rootId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementsBaselineSelection_baselineId_key" ON "RequirementsBaselineSelection"("baselineId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementsBaselineSelection_baselineId_productId_key" ON "RequirementsBaselineSelection"("baselineId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementsBaselineSelection_productId_sequence_key" ON "RequirementsBaselineSelection"("productId", "sequence");

-- AddForeignKey
ALTER TABLE "RequirementsBaseline" ADD CONSTRAINT "RequirementsBaseline_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RequirementsBaselineMember" ADD CONSTRAINT "RequirementsBaselineMember_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "RequirementsBaseline"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RequirementsBaselineMember" ADD CONSTRAINT "RequirementsBaselineMember_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "AcceptanceCriterion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CriterionLineage" ADD CONSTRAINT "CriterionLineage_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "AcceptanceCriterion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CriterionLineage" ADD CONSTRAINT "CriterionLineage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CriterionLineage" ADD CONSTRAINT "CriterionLineage_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CriterionLineage" ADD CONSTRAINT "CriterionLineage_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "CriterionLineage"("criterionId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CriterionLineage" ADD CONSTRAINT "CriterionLineage_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "CriterionLineage"("criterionId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RequirementsBaselineSelection" ADD CONSTRAINT "RequirementsBaselineSelection_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RequirementsBaselineSelection" ADD CONSTRAINT "RequirementsBaselineSelection_baselineId_productId_fkey" FOREIGN KEY ("baselineId", "productId") REFERENCES "RequirementsBaseline"("id", "productId") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- F1a safety fence: only capture of the existing set is enabled.
-- Amendment baselines and advancing selections require a separately reviewed migration.
ALTER TABLE "RequirementsBaseline" ADD CONSTRAINT "RequirementsBaseline_initial_only" CHECK (
 version=1 AND digest ~ '^[a-f0-9]{64}$' AND COALESCE(manifest->>'kind'='INITIAL_REQUIREMENTS_MEMBERSHIP' AND manifest->>'formatVersion'='1' AND manifest->>'productId'="productId" AND manifest->>'version'='1' AND jsonb_typeof(manifest->'members')='array' AND provenance->>'kind'='EXISTING_DATA_CAPTURE' AND provenance->>'grantsApproval'='false',false)
);
ALTER TABLE "RequirementsBaselineSelection" ADD CONSTRAINT "RequirementsBaselineSelection_initial_only" CHECK (
 sequence=1 AND digest ~ '^[a-f0-9]{64}$' AND "actorKind"='LOCAL_OPERATOR' AND signature ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$' AND length("idempotencyKey") BETWEEN 8 AND 128
);
ALTER TABLE "CriterionLineage" ADD CONSTRAINT "CriterionLineage_shape" CHECK (
 (generation=1 AND "predecessorId" IS NULL AND "rootId"="criterionId") OR
 (generation>1 AND "predecessorId" IS NOT NULL AND "rootId"<>"criterionId")
);
CREATE FUNCTION requirements_baseline_no_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Requirements baseline history and lineage are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER "RequirementsBaseline_immutable" BEFORE UPDATE OR DELETE ON "RequirementsBaseline" FOR EACH ROW EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE TRIGGER "RequirementsBaseline_no_truncate" BEFORE TRUNCATE ON "RequirementsBaseline" FOR EACH STATEMENT EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE TRIGGER "RequirementsBaselineMember_immutable" BEFORE UPDATE OR DELETE ON "RequirementsBaselineMember" FOR EACH ROW EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE TRIGGER "RequirementsBaselineMember_no_truncate" BEFORE TRUNCATE ON "RequirementsBaselineMember" FOR EACH STATEMENT EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE TRIGGER "CriterionLineage_immutable" BEFORE UPDATE OR DELETE ON "CriterionLineage" FOR EACH ROW EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE TRIGGER "CriterionLineage_no_truncate" BEFORE TRUNCATE ON "CriterionLineage" FOR EACH STATEMENT EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE TRIGGER "RequirementsBaselineSelection_immutable" BEFORE UPDATE OR DELETE ON "RequirementsBaselineSelection" FOR EACH ROW EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE TRIGGER "RequirementsBaselineSelection_no_truncate" BEFORE TRUNCATE ON "RequirementsBaselineSelection" FOR EACH STATEMENT EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE FUNCTION criterion_lineage_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_product text; owner_work text; previous "CriterionLineage";
BEGIN
 SELECT w."productId",c."workItemId" INTO owner_product,owner_work FROM "AcceptanceCriterion" c JOIN "WorkItem" w ON w.id=c."workItemId" WHERE c.id=NEW."criterionId" FOR SHARE OF c,w;
 IF owner_product IS DISTINCT FROM NEW."productId" OR owner_work IS DISTINCT FROM NEW."workItemId" THEN
  RAISE EXCEPTION 'Criterion lineage ownership mismatch' USING ERRCODE='23514';
 END IF;
 IF NEW."predecessorId" IS NOT NULL THEN
  SELECT * INTO previous FROM "CriterionLineage" WHERE "criterionId"=NEW."predecessorId" FOR KEY SHARE;
  IF previous."criterionId" IS NULL OR previous."productId"<>NEW."productId" OR previous."workItemId"<>NEW."workItemId" OR previous."rootId"<>NEW."rootId" OR previous.generation+1<>NEW.generation THEN
   RAISE EXCEPTION 'Invalid criterion predecessor, root, generation or product' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "CriterionLineage_guard" BEFORE INSERT ON "CriterionLineage" FOR EACH ROW EXECUTE FUNCTION criterion_lineage_guard();
CREATE FUNCTION requirements_baseline_member_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "RequirementsBaseline"; owner_product text; owner_work text; current_description text; root "CriterionLineage";
BEGIN
 SELECT * INTO parent FROM "RequirementsBaseline" WHERE id=NEW."baselineId" FOR UPDATE;
 SELECT w."productId",c."workItemId",c.description INTO owner_product,owner_work,current_description FROM "AcceptanceCriterion" c JOIN "WorkItem" w ON w.id=c."workItemId" WHERE c.id=NEW."criterionId" FOR SHARE OF c,w;
 SELECT * INTO root FROM "CriterionLineage" WHERE "criterionId"=NEW."criterionId";
 IF parent.id IS NULL OR owner_product IS DISTINCT FROM parent."productId" OR owner_work IS DISTINCT FROM NEW."workItemId" OR current_description IS DISTINCT FROM NEW.description
 OR root."criterionId" IS NULL OR root.generation<>1 OR root."productId"<>parent."productId"
 OR EXISTS(SELECT 1 FROM "RequirementsBaselineSelection" WHERE "baselineId"=NEW."baselineId")
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(parent.manifest->'members') m WHERE m->>'criterionId'=NEW."criterionId" AND m->>'workItemId'=NEW."workItemId" AND m->>'description'=NEW.description) THEN
  RAISE EXCEPTION 'Initial membership must match its exact unsealed snapshot and owned root criterion' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "RequirementsBaselineMember_guard" BEFORE INSERT ON "RequirementsBaselineMember" FOR EACH ROW EXECUTE FUNCTION requirements_baseline_member_guard();
CREATE FUNCTION requirements_baseline_seal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "RequirementsBaseline"; expected integer; actual integer; live integer;
BEGIN
 SELECT * INTO parent FROM "RequirementsBaseline" WHERE id=NEW."baselineId" FOR UPDATE;
 expected=jsonb_array_length(parent.manifest->'members');
 SELECT count(*) INTO actual FROM "RequirementsBaselineMember" WHERE "baselineId"=NEW."baselineId";
 SELECT count(*) INTO live FROM "AcceptanceCriterion" c JOIN "WorkItem" w ON w.id=c."workItemId" WHERE w."productId"=NEW."productId";
 IF parent.id IS NULL OR parent."productId"<>NEW."productId" OR parent.digest<>NEW.digest OR expected<>actual OR actual<>live
 OR (SELECT count(DISTINCT m->>'criterionId') FROM jsonb_array_elements(parent.manifest->'members') m)<>expected
 OR EXISTS(SELECT 1 FROM "AcceptanceCriterion" c JOIN "WorkItem" w ON w.id=c."workItemId" LEFT JOIN "RequirementsBaselineMember" m ON m."baselineId"=NEW."baselineId" AND m."criterionId"=c.id AND m."workItemId"=c."workItemId" AND m.description=c.description WHERE w."productId"=NEW."productId" AND m."criterionId" IS NULL) THEN
  RAISE EXCEPTION 'Initial selection must seal exactly the existing product criterion set' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "RequirementsBaselineSelection_guard" BEFORE INSERT ON "RequirementsBaselineSelection" FOR EACH ROW EXECUTE FUNCTION requirements_baseline_seal_guard();
