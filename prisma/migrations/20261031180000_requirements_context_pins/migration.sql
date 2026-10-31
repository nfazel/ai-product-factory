-- CreateTable
CREATE TABLE "RequirementsContextPin" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "operationKind" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "formatVersion" INTEGER NOT NULL DEFAULT 1,
    "manifest" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementsContextPin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequirementsContextPin_productId_idempotencyKey_key" ON "RequirementsContextPin"("productId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementsContextPin_operationKind_operationId_key" ON "RequirementsContextPin"("operationKind", "operationId");

-- AddForeignKey
ALTER TABLE "RequirementsContextPin" ADD CONSTRAINT "RequirementsContextPin_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RequirementsContextPin" ADD CONSTRAINT "RequirementsContextPin_baselineId_productId_fkey" FOREIGN KEY ("baselineId", "productId") REFERENCES "RequirementsBaseline"("id", "productId") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- No bypass variable or amendment authorisation is introduced. F1c remains disabled.
CREATE FUNCTION requirements_product_has_state(target text) RETURNS boolean LANGUAGE sql VOLATILE AS $$
 SELECT EXISTS(SELECT 1 FROM "RequirementsBaseline" WHERE "productId"=target)
 OR EXISTS(SELECT 1 FROM "RequirementsBaselineSelection" WHERE "productId"=target)
 OR EXISTS(SELECT 1 FROM "CriterionLineage" WHERE "productId"=target)
 OR EXISTS(SELECT 1 FROM "RequirementsContextPin" WHERE "productId"=target);
$$;
CREATE FUNCTION requirements_state_product_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('initial-requirements:'||NEW."productId",0));
 RETURN NEW;
END;
$$;
CREATE TRIGGER "000_RequirementsBaseline_product_lock" BEFORE INSERT ON "RequirementsBaseline" FOR EACH ROW EXECUTE FUNCTION requirements_state_product_lock();
CREATE TRIGGER "000_RequirementsSelection_product_lock" BEFORE INSERT ON "RequirementsBaselineSelection" FOR EACH ROW EXECUTE FUNCTION requirements_state_product_lock();
CREATE TRIGGER "000_CriterionLineage_product_lock" BEFORE INSERT ON "CriterionLineage" FOR EACH ROW EXECUTE FUNCTION requirements_state_product_lock();
CREATE TRIGGER "000_RequirementsPin_product_lock" BEFORE INSERT ON "RequirementsContextPin" FOR EACH ROW EXECUTE FUNCTION requirements_state_product_lock();
CREATE FUNCTION requirements_criterion_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_product text; new_product text; target text;
BEGIN
 IF TG_OP='UPDATE' AND (OLD.id,OLD."workItemId",OLD.description) IS NOT DISTINCT FROM (NEW.id,NEW."workItemId",NEW.description) THEN RETURN NEW; END IF;
 IF TG_OP<>'INSERT' THEN SELECT "productId" INTO old_product FROM "WorkItem" WHERE id=OLD."workItemId"; END IF;
 IF TG_OP<>'DELETE' THEN SELECT "productId" INTO new_product FROM "WorkItem" WHERE id=NEW."workItemId"; END IF;
 FOR target IN SELECT DISTINCT p FROM unnest(ARRAY[old_product,new_product]) p WHERE p IS NOT NULL ORDER BY p LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('initial-requirements:'||target,0));
  IF requirements_product_has_state(target) THEN RAISE EXCEPTION 'Versioned or partial requirements state: criterion changes require the future approved amendment path' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "AcceptanceCriterion_requirements_guard" BEFORE INSERT OR UPDATE OR DELETE ON "AcceptanceCriterion" FOR EACH ROW EXECUTE FUNCTION requirements_criterion_write_guard();
CREATE FUNCTION requirements_criterion_truncate_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "RequirementsBaseline") OR EXISTS(SELECT 1 FROM "CriterionLineage") OR EXISTS(SELECT 1 FROM "RequirementsContextPin") THEN RAISE EXCEPTION 'Historical/versioned criteria cannot be truncated' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$$;
CREATE TRIGGER "AcceptanceCriterion_requirements_no_truncate" BEFORE TRUNCATE ON "AcceptanceCriterion" FOR EACH STATEMENT EXECUTE FUNCTION requirements_criterion_truncate_guard();
CREATE FUNCTION requirements_owner_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; has_criteria boolean;
BEGIN
 IF (OLD.id,OLD."productId",OLD."parentId",OLD.type,OLD.title,OLD.description,OLD.persona,OLD."userNeed",OLD."userValue") IS NOT DISTINCT FROM (NEW.id,NEW."productId",NEW."parentId",NEW.type,NEW.title,NEW.description,NEW.persona,NEW."userNeed",NEW."userValue") THEN RETURN NEW; END IF;
 WITH RECURSIVE subtree(id) AS (SELECT OLD.id UNION SELECT w.id FROM "WorkItem" w JOIN subtree s ON w."parentId"=s.id)
 SELECT EXISTS(SELECT 1 FROM "AcceptanceCriterion" c JOIN subtree s ON s.id=c."workItemId") INTO has_criteria;
 IF has_criteria THEN
  FOR target IN SELECT DISTINCT p FROM unnest(ARRAY[OLD."productId",NEW."productId"]) p ORDER BY p LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended('initial-requirements:'||target,0));
   IF requirements_product_has_state(target) THEN RAISE EXCEPTION 'Criterion owner meaning/placement requires a separately approved amendment' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "WorkItem_requirements_owner_guard" BEFORE UPDATE ON "WorkItem" FOR EACH ROW EXECUTE FUNCTION requirements_owner_write_guard();
ALTER TABLE "RequirementsContextPin" ADD CONSTRAINT "RequirementsContextPin_capture_check" CHECK (
 "formatVersion"=1 AND digest ~ '^[a-f0-9]{64}$' AND signature ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$' AND length("idempotencyKey") BETWEEN 8 AND 128
 AND "operationKind" IN ('ARCHITECTURE_PROPOSAL','IMPLEMENTATION_PLAN','CODING_WORKSPACE','VERIFICATION_SESSION','FEATURE_REVIEW','RELEASE_CANDIDATE','FEATURE_FEEDBACK','DEVELOPMENT_SCOPE_REVISION')
 AND COALESCE(manifest->>'kind'='REQUIREMENTS_CONTEXT_CAPTURE' AND manifest->>'version'='1' AND manifest->>'grantsApproval'='false' AND manifest->>'productId'="productId" AND manifest->>'operationKind'="operationKind" AND manifest->>'operationId'="operationId" AND jsonb_typeof(manifest->'selectedCriterionIds')='array',false)
);
CREATE TRIGGER "RequirementsContextPin_immutable" BEFORE UPDATE OR DELETE ON "RequirementsContextPin" FOR EACH ROW EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE TRIGGER "RequirementsContextPin_no_truncate" BEFORE TRUNCATE ON "RequirementsContextPin" FOR EACH STATEMENT EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE FUNCTION requirements_pin_capture_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE baseline "RequirementsBaseline"; selection "RequirementsBaselineSelection"; target_table text; occupied boolean;
BEGIN
 SELECT * INTO baseline FROM "RequirementsBaseline" WHERE id=NEW."baselineId";
 SELECT * INTO selection FROM "RequirementsBaselineSelection" WHERE "baselineId"=NEW."baselineId" AND "productId"=NEW."productId";
 IF baseline.id IS NULL OR selection.id IS NULL OR baseline."productId"<>NEW."productId"
 OR NOT COALESCE(NEW.manifest->'baseline'->>'id'=baseline.id AND NEW.manifest->'baseline'->>'digest'=baseline.digest AND NEW.manifest->'baseline'->>'version'='1' AND NEW.manifest->'baseline'->>'selectionId'=selection.id AND NEW.manifest->'members'=baseline.manifest->'members',false)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(NEW.manifest->'selectedCriterionIds') selected WHERE NOT EXISTS(SELECT 1 FROM "RequirementsBaselineMember" m WHERE m."baselineId"=baseline.id AND m."criterionId"=selected))
 OR (SELECT count(DISTINCT selected) FROM jsonb_array_elements_text(NEW.manifest->'selectedCriterionIds') selected)<>jsonb_array_length(NEW.manifest->'selectedCriterionIds')
 OR EXISTS(SELECT 1 FROM "AcceptanceCriterion" c JOIN "WorkItem" w ON w.id=c."workItemId" LEFT JOIN "RequirementsBaselineMember" m ON m."baselineId"=baseline.id AND m."criterionId"=c.id AND m."workItemId"=c."workItemId" AND m.description=c.description WHERE w."productId"=NEW."productId" AND m."criterionId" IS NULL) THEN
  RAISE EXCEPTION 'Pin capture must reference exact current product membership' USING ERRCODE='23514';
 END IF;
 target_table=CASE NEW."operationKind" WHEN 'ARCHITECTURE_PROPOSAL' THEN 'ArchitectureProposal' WHEN 'IMPLEMENTATION_PLAN' THEN 'ImplementationPlan' WHEN 'CODING_WORKSPACE' THEN 'RepositoryWorkspace' WHEN 'VERIFICATION_SESSION' THEN 'VerificationSession' WHEN 'FEATURE_REVIEW' THEN 'FeatureReviewEvent' WHEN 'RELEASE_CANDIDATE' THEN 'ReleaseCandidate' WHEN 'FEATURE_FEEDBACK' THEN 'FeatureFeedback' WHEN 'DEVELOPMENT_SCOPE_REVISION' THEN 'DevelopmentScopeRevision' END;
 IF target_table IS NULL THEN RAISE EXCEPTION 'Unsupported prospective operation' USING ERRCODE='23514'; END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE id=$1)',target_table) INTO occupied USING NEW."operationId";
 IF occupied THEN RAISE EXCEPTION 'Existing operations cannot be pinned retrospectively' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "RequirementsContextPin_capture_guard" BEFORE INSERT ON "RequirementsContextPin" FOR EACH ROW EXECUTE FUNCTION requirements_pin_capture_guard();
