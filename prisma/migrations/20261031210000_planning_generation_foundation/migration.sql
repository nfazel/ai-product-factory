BEGIN;
-- CreateTable
CREATE TABLE "PlanningGeneration" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "artifactKind" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "artifactVersion" INTEGER,
    "baselineId" TEXT,
    "inputPinId" TEXT,
    "inputIdentity" TEXT NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningPublication" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "artifactKind" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "artifactRevision" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "baselineId" TEXT,
    "finalPinId" TEXT,
    "inputIdentity" TEXT NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanningGeneration_artifactId_key" ON "PlanningGeneration"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningGeneration_inputPinId_key" ON "PlanningGeneration"("inputPinId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningGeneration_productId_idempotencyKey_key" ON "PlanningGeneration"("productId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningGeneration_productId_artifactKind_artifactVersion_key" ON "PlanningGeneration"("productId", "artifactKind", "artifactVersion");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningPublication_generationId_key" ON "PlanningPublication"("generationId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningPublication_artifactId_key" ON "PlanningPublication"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningPublication_finalPinId_key" ON "PlanningPublication"("finalPinId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningPublication_productId_idempotencyKey_key" ON "PlanningPublication"("productId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "PlanningGeneration" ADD CONSTRAINT "PlanningGeneration_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlanningGeneration" ADD CONSTRAINT "PlanningGeneration_baselineId_productId_fkey" FOREIGN KEY ("baselineId", "productId") REFERENCES "RequirementsBaseline"("id", "productId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlanningGeneration" ADD CONSTRAINT "PlanningGeneration_inputPinId_fkey" FOREIGN KEY ("inputPinId") REFERENCES "RequirementsContextPin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlanningPublication" ADD CONSTRAINT "PlanningPublication_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "PlanningGeneration"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlanningPublication" ADD CONSTRAINT "PlanningPublication_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlanningPublication" ADD CONSTRAINT "PlanningPublication_baselineId_productId_fkey" FOREIGN KEY ("baselineId", "productId") REFERENCES "RequirementsBaseline"("id", "productId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlanningPublication" ADD CONSTRAINT "PlanningPublication_finalPinId_fkey" FOREIGN KEY ("finalPinId") REFERENCES "RequirementsContextPin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Preserve existing v1/v2 expressions and add a non-authorising generation-input purpose.
ALTER TABLE "RequirementsContextPin" DROP CONSTRAINT "RequirementsContextPin_capture_check";
ALTER TABLE "RequirementsContextPin" ADD CONSTRAINT "RequirementsContextPin_capture_check" CHECK (
 ("formatVersion"=1 AND digest ~ '^[a-f0-9]{64}$' AND signature ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$' AND length("idempotencyKey") BETWEEN 8 AND 128
 AND "operationKind" IN ('ARCHITECTURE_PROPOSAL','IMPLEMENTATION_PLAN','CODING_WORKSPACE','VERIFICATION_SESSION','FEATURE_REVIEW','RELEASE_CANDIDATE','FEATURE_FEEDBACK','DEVELOPMENT_SCOPE_REVISION')
 AND COALESCE(manifest->>'kind'='REQUIREMENTS_CONTEXT_CAPTURE' AND manifest->>'version'='1' AND manifest->>'grantsApproval'='false' AND manifest->>'productId'="productId" AND manifest->>'operationKind'="operationKind" AND manifest->>'operationId'="operationId" AND jsonb_typeof(manifest->'selectedCriterionIds')='array',false)) OR (
 "formatVersion"=2 AND digest ~ '^[a-f0-9]{64}$' AND signature ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND length("idempotencyKey") BETWEEN 8 AND 128
 AND "operationKind" IN ('ARCHITECTURE_PROPOSAL','DEFINITION_PROPOSAL','SOLUTION_ARCHITECTURE','IMPLEMENTATION_PLAN','REQUIREMENTS_APPROVAL_DECISION')
 AND COALESCE(manifest->>'kind'='REQUIREMENTS_CONTEXT_CAPTURE' AND manifest->>'version'='2' AND manifest->>'grantsApproval'='false'
 AND manifest->>'productId'="productId" AND manifest->>'operationKind'="operationKind" AND manifest->>'operationId'="operationId"
 AND jsonb_typeof(manifest->'selectedCriterionIds')='array' AND manifest->'target'->>'digest' ~ '^[a-f0-9]{64}$'
 AND jsonb_typeof(manifest->'target'->'snapshot')='object',false)
 ) OR (
 "formatVersion"=3 AND "operationKind"='PLANNING_GENERATION' AND digest ~ '^[a-f0-9]{64}$' AND signature ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND length("idempotencyKey") BETWEEN 8 AND 128
 AND COALESCE(manifest->>'kind'='REQUIREMENTS_CONTEXT_CAPTURE' AND manifest->>'version'='3' AND manifest->>'grantsApproval'='false'
 AND manifest->>'operationKind'="operationKind" AND manifest->>'operationId'="operationId" AND manifest->>'productId'="productId"
 AND manifest->>'inputDigest' ~ '^[a-f0-9]{64}$' AND length(manifest->>'inputIdentity')>0 AND jsonb_typeof(manifest->'selectedCriterionIds')='array',false)
 ));

CREATE OR REPLACE FUNCTION requirements_pin_capture_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
 IF NEW."formatVersion"=3 THEN
  IF NEW.manifest->>'purpose' IS DISTINCT FROM (NEW.manifest->>'generationPurpose')||'_GENERATION_INPUT'
   OR NEW.manifest->>'artifactKind' IS DISTINCT FROM (CASE NEW.manifest->>'generationPurpose' WHEN 'DEFINITION_PROPOSAL' THEN 'DEFINITION_PROPOSAL' WHEN 'ARCHITECTURE_PROPOSAL' THEN 'ARCHITECTURE_PROPOSAL' WHEN 'IMPLEMENTATION_PLAN_PROPOSAL' THEN 'ARCHITECTURE_PROPOSAL' WHEN 'SOLUTION_ARCHITECTURE' THEN 'SOLUTION_ARCHITECTURE' WHEN 'IMPLEMENTATION_PLAN' THEN 'IMPLEMENTATION_PLAN' END) THEN
   RAISE EXCEPTION 'Generation input purpose mismatch' USING ERRCODE='23514';
  END IF;
  target_table='PlanningGeneration';
 ELSIF NEW."formatVersion"=2 THEN
  IF NEW.manifest->'provenance'->>'capturedBy' IS DISTINCT FROM 'SERVER' OR (NEW.manifest->'provenance'->>'createdAt')::timestamptz AT TIME ZONE 'UTC' IS DISTINCT FROM NEW."createdAt"
   OR NEW.manifest->'target'->>'revision' IS DISTINCT FROM (CASE WHEN NEW.manifest->'target'->>'kind' IN ('SOLUTION_ARCHITECTURE','IMPLEMENTATION_PLAN') THEN 'v'||(NEW.manifest->'target'->'snapshot'->>'version')||':'||(NEW.manifest->'target'->>'digest') ELSE 'sha256:'||(NEW.manifest->'target'->>'digest') END) THEN
   RAISE EXCEPTION 'Planning pin revision/provenance mismatch' USING ERRCODE='23514';
  END IF;
  IF NEW."operationKind"='REQUIREMENTS_APPROVAL_DECISION' THEN
   IF NEW.manifest->'provenance'->>'kind' IS DISTINCT FROM 'CURRENT_ARTIFACT_REVIEW' OR NEW.manifest->>'purpose' IS DISTINCT FROM (NEW.manifest->'target'->>'kind')||'_APPROVAL' THEN RAISE EXCEPTION 'Wrong approval pin purpose' USING ERRCODE='23514'; END IF;
   target_table=CASE NEW.manifest->'target'->>'kind' WHEN 'PRODUCT_DEFINITION' THEN 'ProductDefinition' WHEN 'SOLUTION_ARCHITECTURE' THEN 'SolutionArchitecture' WHEN 'IMPLEMENTATION_PLAN' THEN 'ImplementationPlan' END;
   IF target_table IS NULL THEN RAISE EXCEPTION 'Unsupported approval target' USING ERRCODE='23514'; END IF;
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE id=$1 AND "productId"=$2)',target_table) INTO occupied USING NEW.manifest->'target'->>'id',NEW."productId";
   IF NOT occupied THEN RAISE EXCEPTION 'Approval target must belong to product' USING ERRCODE='23514'; END IF;
   target_table='Approval';
  ELSE
   IF NEW.manifest->'provenance'->>'kind' IS DISTINCT FROM 'PROSPECTIVE_ARTIFACT' OR NEW.manifest->'target'->>'id' IS DISTINCT FROM NEW."operationId" OR NEW.manifest->'target'->>'kind' IS DISTINCT FROM NEW."operationKind" OR NEW.manifest->>'purpose' IS DISTINCT FROM NEW."operationKind"||'_CREATION' THEN RAISE EXCEPTION 'Wrong artifact pin purpose' USING ERRCODE='23514'; END IF;
   target_table=CASE NEW."operationKind" WHEN 'ARCHITECTURE_PROPOSAL' THEN 'ArchitectureProposal' WHEN 'DEFINITION_PROPOSAL' THEN 'DefinitionProposal' WHEN 'SOLUTION_ARCHITECTURE' THEN 'SolutionArchitecture' WHEN 'IMPLEMENTATION_PLAN' THEN 'ImplementationPlan' END;
  END IF;
 ELSE
 target_table=CASE NEW."operationKind" WHEN 'ARCHITECTURE_PROPOSAL' THEN 'ArchitectureProposal' WHEN 'IMPLEMENTATION_PLAN' THEN 'ImplementationPlan' WHEN 'CODING_WORKSPACE' THEN 'RepositoryWorkspace' WHEN 'VERIFICATION_SESSION' THEN 'VerificationSession' WHEN 'FEATURE_REVIEW' THEN 'FeatureReviewEvent' WHEN 'RELEASE_CANDIDATE' THEN 'ReleaseCandidate' WHEN 'FEATURE_FEEDBACK' THEN 'FeatureFeedback' WHEN 'DEVELOPMENT_SCOPE_REVISION' THEN 'DevelopmentScopeRevision' END;
 END IF;
 IF target_table IS NULL THEN RAISE EXCEPTION 'Unsupported prospective operation' USING ERRCODE='23514'; END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE id=$1)',target_table) INTO occupied USING NEW."operationId";
 IF occupied THEN RAISE EXCEPTION 'Existing operations cannot be pinned retrospectively' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;


CREATE FUNCTION planning_bootstrap_allowed(target text, own_generation text DEFAULT NULL) RETURNS boolean LANGUAGE sql VOLATILE AS $$
 SELECT EXISTS(SELECT 1 FROM "Product" WHERE id=target AND "currentStage"='DEFINE' AND status<>'ARCHIVED')
 AND NOT requirements_product_has_state(target)
 AND NOT EXISTS(SELECT 1 FROM "ProductDefinition" WHERE "productId"=target AND status<>'NOT_STARTED')
 AND NOT EXISTS(SELECT 1 FROM "DefinitionProposal" WHERE "productId"=target)
 AND NOT EXISTS(SELECT 1 FROM "ArchitectureProposal" WHERE "productId"=target)
 AND NOT EXISTS(SELECT 1 FROM "SolutionArchitecture" WHERE "productId"=target)
 AND NOT EXISTS(SELECT 1 FROM "ImplementationPlan" WHERE "productId"=target)
 AND NOT EXISTS(SELECT 1 FROM "WorkItem" WHERE "productId"=target)
 AND NOT EXISTS(SELECT 1 FROM "ProductOutcome" WHERE "productId"=target)
 AND NOT EXISTS(SELECT 1 FROM "ProductCapability" WHERE "productId"=target)
 AND NOT EXISTS(SELECT 1 FROM "ProductSlice" WHERE "productId"=target)
 AND NOT EXISTS(SELECT 1 FROM "NonFunctionalRequirement" WHERE "productId"=target)
 AND NOT EXISTS(SELECT 1 FROM "Approval" WHERE "productId"=target AND "approvalType"='PRODUCT_DEFINITION' AND status='APPROVED')
 AND NOT EXISTS(SELECT 1 FROM "PlanningPublication" WHERE "productId"=target AND mode='UNBOUND_BOOTSTRAP' AND "generationId" IS DISTINCT FROM own_generation);
$$;
ALTER TABLE "PlanningGeneration" ADD CONSTRAINT "PlanningGeneration_format" CHECK (
 mode IN ('BASELINE_BOUND','UNBOUND_BOOTSTRAP') AND digest ~ '^[a-f0-9]{64}$' AND signature ~ '^[a-f0-9]{64}$' AND "inputDigest" ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND purpose IN ('DEFINITION_PROPOSAL','ARCHITECTURE_PROPOSAL','IMPLEMENTATION_PLAN_PROPOSAL','SOLUTION_ARCHITECTURE','IMPLEMENTATION_PLAN')
 AND "artifactKind"=CASE purpose WHEN 'IMPLEMENTATION_PLAN_PROPOSAL' THEN 'ARCHITECTURE_PROPOSAL' ELSE purpose END
 AND (("artifactKind" IN ('SOLUTION_ARCHITECTURE','IMPLEMENTATION_PLAN') AND "artifactVersion" IS NOT NULL AND "artifactVersion">0) OR ("artifactKind" IN ('DEFINITION_PROPOSAL','ARCHITECTURE_PROPOSAL') AND "artifactVersion" IS NULL))
 AND ((mode='BASELINE_BOUND' AND "baselineId" IS NOT NULL AND "inputPinId" IS NOT NULL) OR (mode='UNBOUND_BOOTSTRAP' AND purpose='DEFINITION_PROPOSAL' AND "baselineId" IS NULL AND "inputPinId" IS NULL))
 AND COALESCE(manifest->>'kind'='PLANNING_GENERATION' AND manifest->>'version'='1' AND manifest->>'grantsApproval'='false' AND manifest->>'generationId'=id AND manifest->>'productId'="productId" AND manifest->>'purpose'=purpose AND manifest->>'mode'=mode AND manifest->>'artifactKind'="artifactKind" AND manifest->>'artifactId'="artifactId" AND manifest->>'inputIdentity'="inputIdentity" AND manifest->>'inputDigest'="inputDigest" AND manifest->'provenance'->>'kind'='SERVER_RESERVATION',false)
);
ALTER TABLE "PlanningPublication" ADD CONSTRAINT "PlanningPublication_format" CHECK (
 digest ~ '^[a-f0-9]{64}$' AND signature ~ '^[a-f0-9]{64}$' AND "contentDigest" ~ '^[a-f0-9]{64}$' AND "inputDigest" ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND ((mode='BASELINE_BOUND' AND "baselineId" IS NOT NULL AND "finalPinId" IS NOT NULL) OR (mode='UNBOUND_BOOTSTRAP' AND purpose='DEFINITION_PROPOSAL' AND "baselineId" IS NULL AND "finalPinId" IS NULL))
 AND COALESCE(manifest->>'kind'='PLANNING_PUBLICATION' AND manifest->>'version'='1' AND manifest->>'grantsApproval'='false' AND manifest->>'generationId'="generationId" AND manifest->>'productId'="productId" AND manifest->>'artifactRevision'="artifactRevision" AND manifest->>'contentDigest'="contentDigest" AND manifest->'provenance'->>'kind'='SEALED_SNAPSHOT_ONLY',false)
);
CREATE UNIQUE INDEX "PlanningPublication_one_bootstrap" ON "PlanningPublication"("productId") WHERE mode='UNBOUND_BOOTSTRAP';
CREATE TRIGGER "PlanningGeneration_immutable" BEFORE UPDATE OR DELETE ON "PlanningGeneration" FOR EACH ROW EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE TRIGGER "PlanningGeneration_no_truncate" BEFORE TRUNCATE ON "PlanningGeneration" FOR EACH STATEMENT EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE TRIGGER "PlanningPublication_immutable" BEFORE UPDATE OR DELETE ON "PlanningPublication" FOR EACH ROW EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE TRIGGER "PlanningPublication_no_truncate" BEFORE TRUNCATE ON "PlanningPublication" FOR EACH STATEMENT EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE FUNCTION planning_generation_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pin "RequirementsContextPin"; artifact_table text; occupied boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('initial-requirements:'||NEW."productId",0));
 IF NEW.manifest->>'inputPinId' IS DISTINCT FROM NEW."inputPinId" OR NEW.manifest->'context'->'baseline'->>'id' IS DISTINCT FROM NEW."baselineId" OR NEW.manifest->>'artifactVersion' IS DISTINCT FROM NEW."artifactVersion"::text OR (NEW.manifest->'provenance'->>'createdAt')::timestamptz AT TIME ZONE 'UTC' IS DISTINCT FROM NEW."createdAt" THEN RAISE EXCEPTION 'Generation provenance mismatch' USING ERRCODE='23514'; END IF;
 artifact_table=CASE NEW."artifactKind" WHEN 'DEFINITION_PROPOSAL' THEN 'DefinitionProposal' WHEN 'ARCHITECTURE_PROPOSAL' THEN 'ArchitectureProposal' WHEN 'SOLUTION_ARCHITECTURE' THEN 'SolutionArchitecture' WHEN 'IMPLEMENTATION_PLAN' THEN 'ImplementationPlan' END;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE id=$1)',artifact_table) INTO occupied USING NEW."artifactId";
 IF occupied THEN RAISE EXCEPTION 'Generation cannot reserve an existing artifact' USING ERRCODE='23514'; END IF;
 IF NEW.mode='UNBOUND_BOOTSTRAP' THEN
  IF NOT planning_bootstrap_allowed(NEW."productId") OR NEW.manifest->'context'->'baseline' IS DISTINCT FROM 'null'::jsonb OR NEW.manifest->>'inputPinId' IS NOT NULL OR NEW.manifest->>'inputPinDigest' IS NOT NULL OR NEW.manifest->'context'->'members' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Bootstrap is initial definition only' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO pin FROM "RequirementsContextPin" WHERE id=NEW."inputPinId";
  IF pin.id IS NULL OR pin."formatVersion"<>3 OR pin."productId"<>NEW."productId" OR pin."baselineId"<>NEW."baselineId" OR pin."operationId"<>NEW.id OR NOT COALESCE(pin."operationKind"='PLANNING_GENERATION' AND pin.digest=NEW.manifest->>'inputPinDigest' AND pin.manifest->>'inputIdentity'=NEW."inputIdentity" AND pin.manifest->>'inputDigest'=NEW."inputDigest" AND pin.manifest->>'generationPurpose'=NEW.purpose AND pin.manifest->>'artifactId'=NEW."artifactId" AND pin.manifest->>'artifactKind'=NEW."artifactKind" AND pin.manifest->'baseline'=NEW.manifest->'context'->'baseline' AND pin.manifest->'members'=NEW.manifest->'context'->'members',false) OR pin.manifest->>'artifactVersion' IS DISTINCT FROM NEW."artifactVersion"::text THEN RAISE EXCEPTION 'Generation must bind exact input pin and product' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "PlanningGeneration_binding" BEFORE INSERT ON "PlanningGeneration" FOR EACH ROW EXECUTE FUNCTION planning_generation_binding();
CREATE FUNCTION planning_publication_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gen "PlanningGeneration"; pin "RequirementsContextPin";
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('initial-requirements:'||NEW."productId",0));
 SELECT * INTO gen FROM "PlanningGeneration" WHERE id=NEW."generationId";
 IF gen.id IS NULL OR (gen."productId",gen.purpose,gen.mode,gen."artifactKind",gen."artifactId",gen."inputIdentity",gen."inputDigest") IS DISTINCT FROM (NEW."productId",NEW.purpose,NEW.mode,NEW."artifactKind",NEW."artifactId",NEW."inputIdentity",NEW."inputDigest") OR gen."baselineId" IS DISTINCT FROM NEW."baselineId" OR NEW.manifest->>'generationDigest' IS DISTINCT FROM gen.digest OR (NEW.manifest->>'purpose',NEW.manifest->>'mode',NEW.manifest->>'artifactId',NEW.manifest->>'artifactKind',NEW.manifest->>'inputIdentity',NEW.manifest->>'inputDigest',NEW.manifest->>'finalPinId',NEW.manifest->'baseline'->>'id') IS DISTINCT FROM (NEW.purpose,NEW.mode,NEW."artifactId",NEW."artifactKind",NEW."inputIdentity",NEW."inputDigest",NEW."finalPinId",NEW."baselineId") OR (NEW.manifest->'provenance'->>'createdAt')::timestamptz AT TIME ZONE 'UTC' IS DISTINCT FROM NEW."createdAt" THEN RAISE EXCEPTION 'Publication identity/input mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.mode='UNBOUND_BOOTSTRAP' THEN
  IF NOT planning_bootstrap_allowed(NEW."productId",gen.id) OR NEW.manifest->'baseline' IS DISTINCT FROM 'null'::jsonb OR NEW.manifest->>'finalPinId' IS NOT NULL OR NEW.manifest->>'finalPinDigest' IS NOT NULL THEN RAISE EXCEPTION 'Bootstrap publication is no longer initial or unbound' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO pin FROM "RequirementsContextPin" WHERE id=NEW."finalPinId";
  IF pin.id IS NULL OR pin."formatVersion"<>2 OR pin."productId"<>NEW."productId" OR pin."baselineId"<>NEW."baselineId" OR pin."operationId"<>NEW."artifactId" OR pin."operationKind"<>NEW."artifactKind" OR NOT COALESCE(pin.digest=NEW.manifest->>'finalPinDigest' AND pin.manifest->>'purpose'=NEW."artifactKind"||'_CREATION' AND pin.manifest->'baseline'=gen.manifest->'context'->'baseline' AND pin.manifest->'target'->>'digest'=NEW."contentDigest" AND pin.manifest->'target'->>'revision'=NEW."artifactRevision" AND pin.manifest->'target'->'snapshot'=NEW.manifest->'snapshot',false) THEN RAISE EXCEPTION 'Publication must bind reservation final artifact pin' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "PlanningPublication_binding" BEFORE INSERT ON "PlanningPublication" FOR EACH ROW EXECUTE FUNCTION planning_publication_binding();
COMMIT;
