-- Atomic constraint extension: no interval without the original v1 fence.
BEGIN;
-- CreateTable
CREATE TABLE "RequirementsApprovalReceipt" (
    "id" TEXT NOT NULL,
    "pinId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetRevision" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "formatVersion" INTEGER NOT NULL DEFAULT 1,
    "manifest" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementsApprovalReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequirementsApprovalReceipt_pinId_key" ON "RequirementsApprovalReceipt"("pinId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementsApprovalReceipt_approvalId_key" ON "RequirementsApprovalReceipt"("approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementsApprovalReceipt_productId_idempotencyKey_key" ON "RequirementsApprovalReceipt"("productId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementsApprovalReceipt_productId_targetKind_targetId_t_key" ON "RequirementsApprovalReceipt"("productId", "targetKind", "targetId", "targetRevision", "baselineId");

-- AddForeignKey
ALTER TABLE "RequirementsApprovalReceipt" ADD CONSTRAINT "RequirementsApprovalReceipt_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "RequirementsContextPin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RequirementsApprovalReceipt" ADD CONSTRAINT "RequirementsApprovalReceipt_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Extend supported formats without updating any existing pin or legacy signature.
ALTER TABLE "RequirementsContextPin" DROP CONSTRAINT "RequirementsContextPin_capture_check";
ALTER TABLE "RequirementsContextPin" ADD CONSTRAINT "RequirementsContextPin_capture_check" CHECK (
 ("formatVersion"=1 AND digest ~ '^[a-f0-9]{64}$' AND signature ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$' AND length("idempotencyKey") BETWEEN 8 AND 128
 AND "operationKind" IN ('ARCHITECTURE_PROPOSAL','IMPLEMENTATION_PLAN','CODING_WORKSPACE','VERIFICATION_SESSION','FEATURE_REVIEW','RELEASE_CANDIDATE','FEATURE_FEEDBACK','DEVELOPMENT_SCOPE_REVISION')
 AND COALESCE(manifest->>'kind'='REQUIREMENTS_CONTEXT_CAPTURE' AND manifest->>'version'='1' AND manifest->>'grantsApproval'='false' AND manifest->>'productId'="productId" AND manifest->>'operationKind'="operationKind" AND manifest->>'operationId'="operationId" AND jsonb_typeof(manifest->'selectedCriterionIds')='array',false)) OR (
 "formatVersion"=2 AND digest ~ '^[a-f0-9]{64}$' AND signature ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND length("idempotencyKey") BETWEEN 8 AND 128
 AND "operationKind" IN ('DEFINITION_PROPOSAL','SOLUTION_ARCHITECTURE','IMPLEMENTATION_PLAN','REQUIREMENTS_APPROVAL_DECISION')
 AND COALESCE(manifest->>'kind'='REQUIREMENTS_CONTEXT_CAPTURE' AND manifest->>'version'='2' AND manifest->>'grantsApproval'='false'
 AND manifest->>'productId'="productId" AND manifest->>'operationKind'="operationKind" AND manifest->>'operationId'="operationId"
 AND jsonb_typeof(manifest->'selectedCriterionIds')='array' AND manifest->'target'->>'digest' ~ '^[a-f0-9]{64}$'
 AND jsonb_typeof(manifest->'target'->'snapshot')='object',false)
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
 IF NEW."formatVersion"=2 THEN
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
   target_table=CASE NEW."operationKind" WHEN 'DEFINITION_PROPOSAL' THEN 'DefinitionProposal' WHEN 'SOLUTION_ARCHITECTURE' THEN 'SolutionArchitecture' WHEN 'IMPLEMENTATION_PLAN' THEN 'ImplementationPlan' END;
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

ALTER TABLE "RequirementsApprovalReceipt" ADD CONSTRAINT "RequirementsReceipt_format" CHECK (
 "formatVersion"=1 AND decision IN ('APPROVED','REJECTED') AND digest ~ '^[a-f0-9]{64}$' AND signature ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND length("idempotencyKey") BETWEEN 8 AND 128
 AND COALESCE(manifest->>'kind'='REQUIREMENTS_APPROVAL_RECEIPT' AND manifest->>'version'='1' AND manifest->>'decision'=decision
 AND manifest->'operator'->>'kind'='LOCAL_OPERATOR' AND manifest->'operator'->>'id' ~ '^local-operator:[a-f0-9]{24}$',false)
);
CREATE TRIGGER "RequirementsReceipt_immutable" BEFORE UPDATE OR DELETE ON "RequirementsApprovalReceipt" FOR EACH ROW EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE TRIGGER "RequirementsReceipt_no_truncate" BEFORE TRUNCATE ON "RequirementsApprovalReceipt" FOR EACH STATEMENT EXECUTE FUNCTION requirements_baseline_no_rewrite();
CREATE FUNCTION requirements_receipt_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pin "RequirementsContextPin"; approval "Approval";
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('initial-requirements:'||NEW."productId",0));
 SELECT * INTO pin FROM "RequirementsContextPin" WHERE id=NEW."pinId";
 SELECT * INTO approval FROM "Approval" WHERE id=NEW."approvalId";
 IF NOT EXISTS(SELECT 1 FROM "Approval" a WHERE a.id=NEW."approvalId" AND a.xmin::text::numeric=mod(pg_current_xact_id()::text::numeric,4294967296) AND a."requestedAt">=date_trunc('milliseconds',transaction_timestamp() AT TIME ZONE 'UTC')) THEN
  RAISE EXCEPTION 'Receipt requires fresh same-transaction Approval creation' USING ERRCODE='23514';
 END IF;
 IF pin.id IS NULL OR approval.id IS NULL OR pin."formatVersion"<>2 OR pin."operationKind"<>'REQUIREMENTS_APPROVAL_DECISION'
 OR pin."operationId"<>approval.id OR pin."productId"<>NEW."productId" OR approval."productId"<>NEW."productId" OR pin."baselineId"<>NEW."baselineId"
 OR NOT COALESCE(NEW.manifest->'pin'=pin.manifest AND NEW.manifest->>'pinDigest'=pin.digest
 AND NEW."targetKind"=pin.manifest->'target'->>'kind' AND NEW."targetId"=pin.manifest->'target'->>'id' AND NEW."targetRevision"=pin.manifest->'target'->>'revision'
 AND NEW.manifest->'approval'->>'id'=approval.id AND NEW.manifest->'approval'->>'productId'=approval."productId"
 AND NEW.manifest->'approval'->>'approvalType'=approval."approvalType" AND NEW."targetKind"=approval."approvalType"
 AND NEW.decision=approval.status::text AND NEW.manifest->'approval'->>'status'=approval.status::text
 AND NEW.manifest->'operator'->>'name'=approval."approvedBy" AND NEW.manifest->'approval'->>'approvedBy'=approval."approvedBy"
 AND NEW.manifest->'approval'->>'comments'=approval.comments
 AND (NEW.manifest->>'decidedAt')::timestamptz AT TIME ZONE 'UTC'=NEW."createdAt"
 AND (NEW.manifest->'approval'->>'resolvedAt')::timestamptz AT TIME ZONE 'UTC'=approval."resolvedAt"
 AND (NEW.manifest->'approval'->>'requestedAt')::timestamptz AT TIME ZONE 'UTC'=approval."requestedAt"
 AND approval."requestedAt">=pin."createdAt" AND approval."resolvedAt">=approval."requestedAt" AND approval."resolvedAt"<=NEW."createdAt",false)
 OR NEW.manifest->'approval'->>'workItemId' IS DISTINCT FROM approval."workItemId" THEN
  RAISE EXCEPTION 'Receipt must bind exact fresh protected approval and requirements pin' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "RequirementsReceipt_binding" BEFORE INSERT ON "RequirementsApprovalReceipt" FOR EACH ROW EXECUTE FUNCTION requirements_receipt_binding_guard();

COMMIT;
