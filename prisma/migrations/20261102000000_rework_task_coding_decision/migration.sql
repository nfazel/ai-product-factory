-- Phase 2a records a human decision only. Existing task/workspace rejection stays intact.
BEGIN;
ALTER TABLE "ReworkEvent" ADD COLUMN "taskId" TEXT REFERENCES "ImplementationTask"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ReworkEvent" DROP CONSTRAINT "ReworkEvent_type_check";
ALTER TABLE "ReworkEvent" ADD CONSTRAINT "ReworkEvent_type_check" CHECK(type IN ('APPROVED','REJECTED','ACTIVATED','TASK_CODING_APPROVED'));
ALTER TABLE "ReworkEvent" DROP CONSTRAINT "ReworkEvent_amendmentId_type_key";
CREATE UNIQUE INDEX "ReworkEvent_legacy_type" ON "ReworkEvent"("amendmentId",type) WHERE "taskId" IS NULL;
CREATE UNIQUE INDEX "ReworkEvent_amendmentId_type_taskId_key" ON "ReworkEvent"("amendmentId",type,"taskId");
ALTER TABLE "ReworkEvent" DROP CONSTRAINT "ReworkEvent_check1";
ALTER TABLE "ReworkEvent" ADD CONSTRAINT "ReworkEvent_check1" CHECK(COALESCE(
 manifest->>'kind'='REWORK_EVENT' AND manifest->>'type'=type
 AND manifest->>'amendmentId'="amendmentId" AND manifest->>'scopeRevisionId'="scopeRevisionId"
 AND manifest->>'grantsCodingAuthority'='false'
 AND ((type IN ('APPROVED','REJECTED','ACTIVATED') AND "taskId" IS NULL AND manifest->>'version'='1')
 OR (type='TASK_CODING_APPROVED' AND "taskId" IS NOT NULL AND manifest->>'version'='2'
 AND manifest->>'taskId'="taskId" AND manifest->>'codingDecision'='APPROVED'
 AND manifest->>'executionAuthorised'='false' AND manifest->>'reviewedDigest' ~ '^[a-f0-9]{64}$')),false));
CREATE OR REPLACE FUNCTION rework_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "ReworkAmendment"; p "Approval"; r "DevelopmentScopeRevision";
BEGIN
 IF TG_TABLE_NAME='ReworkAmendment' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('rework-reservations',0));
  SELECT * INTO r FROM "DevelopmentScopeRevision" WHERE id=NEW."scopeRevisionId";
  IF NOT EXISTS(SELECT 1 FROM "DevelopmentScope" s JOIN "ImplementationPlan" ip ON ip.id=NEW."planId" WHERE s.id=r."scopeId" AND s."productId"=NEW."productId" AND ip."productId"=s."productId" AND ip.status='APPROVED') OR NOT EXISTS(SELECT 1 FROM "DevelopmentScopeEvent" WHERE "revisionId"=r.id AND type='APPROVED') THEN RAISE EXCEPTION 'Rework requires an approved same-product scope and plan'; END IF;
  IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(NEW.manifest->'tasks') x)<>jsonb_array_length(NEW.manifest->'tasks') OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.manifest->'tasks') x JOIN "ImplementationTask" t ON t.id=x->>'id') OR EXISTS(SELECT 1 FROM "ReworkAmendment" prior,jsonb_array_elements(prior.manifest->'tasks') x,jsonb_array_elements(NEW.manifest->'tasks') y WHERE x->>'id'=y->>'id') THEN RAISE EXCEPTION 'Task identities must be fresh unique reservations'; END IF;
 ELSE
  SELECT * INTO a FROM "ReworkAmendment" WHERE id=NEW."amendmentId";
  SELECT * INTO p FROM "Approval" WHERE id=NEW."approvalId";
  PERFORM pg_advisory_xact_lock(hashtextextended('rework:'||a."productId",0));
  IF a.id IS NULL OR NEW."scopeRevisionId"<>a."scopeRevisionId" OR p."productId"<>a."productId" OR p.status::text<>(CASE WHEN NEW.type='REJECTED' THEN 'REJECTED' ELSE 'APPROVED' END) OR p."approvalType"<>(CASE WHEN NEW.type='ACTIVATED' THEN 'REWORK_ACTIVATION' WHEN NEW.type='TASK_CODING_APPROVED' THEN 'IMPLEMENTATION_TASK' ELSE 'REWORK_AMENDMENT' END) OR NEW.manifest->>'amendmentDigest' IS DISTINCT FROM a.digest OR NEW.manifest->'actor'->>'kind' IS DISTINCT FROM 'LOCAL_OPERATOR' OR NEW.manifest->'actor'->>'name' IS DISTINCT FROM p."approvedBy" OR NEW.manifest->'actor'->>'id' IS NULL OR NEW.manifest->'actor'->>'id' !~ '^local-operator:[a-f0-9]{24}$' THEN RAISE EXCEPTION 'Rework decision authority binding mismatch'; END IF;
  IF NEW.type='ACTIVATED' AND NOT EXISTS(SELECT 1 FROM "ReworkEvent" e WHERE e."amendmentId"=a.id AND e.type='APPROVED' AND e.id=NEW.manifest->>'amendmentApprovalEventId') THEN RAISE EXCEPTION 'Protected amendment approval required before activation'; END IF;
 END IF;
 RETURN NEW;
END;$$;
CREATE FUNCTION rework_coding_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "ReworkAmendment"; t "ImplementationTask"; p "Approval"; activation "ReworkEvent"; decision "ReworkEvent"; review jsonb; spec jsonb;
BEGIN
 IF NEW.type<>'TASK_CODING_APPROVED' THEN RETURN NEW; END IF;
 SELECT * INTO a FROM "ReworkAmendment" WHERE id=NEW."amendmentId";
 SELECT * INTO t FROM "ImplementationTask" WHERE id=NEW."taskId";
 SELECT * INTO p FROM "Approval" WHERE id=NEW."approvalId";
 SELECT * INTO activation FROM "ReworkEvent" WHERE "amendmentId"=a.id AND type='ACTIVATED';
 SELECT * INTO decision FROM "ReworkEvent" WHERE "amendmentId"=a.id AND type='APPROVED';
 review=NEW.manifest->'review';
 SELECT x INTO spec FROM jsonb_array_elements(a.manifest->'tasks') x WHERE x->>'id'=NEW."taskId";
 IF a.id IS NULL OR t.id IS NULL OR p.id IS NULL OR spec IS NULL OR activation.id IS NULL OR decision.id IS NULL
 OR NOT EXISTS(SELECT 1 FROM "ReworkTaskBinding" WHERE "taskId"=t.id AND "amendmentId"=a.id)
 OR t.status<>'PROPOSED' OR t."implementationPlanId"<>a."planId"
 OR p."workItemId" IS DISTINCT FROM t."workItemId" OR p."approvalType"<>'IMPLEMENTATION_TASK'
 OR review->>'kind' IS DISTINCT FROM 'REWORK_TASK_CODING_REVIEW' OR review->>'version' IS DISTINCT FROM '1'
 OR review->>'productId' IS DISTINCT FROM a."productId" OR review->>'taskId' IS DISTINCT FROM t.id
 OR review->>'amendmentId' IS DISTINCT FROM a.id OR review->>'amendmentDigest' IS DISTINCT FROM a.digest
 OR review->>'scopeRevisionId' IS DISTINCT FROM a."scopeRevisionId" OR review->>'scopeDigest' IS DISTINCT FROM a.manifest->>'scopeDigest'
 OR review->>'planId' IS DISTINCT FROM a."planId" OR review->'task' IS DISTINCT FROM spec
 OR review->'activation'->>'id' IS DISTINCT FROM activation.id OR review->'activation'->>'digest' IS DISTINCT FROM activation.digest
 OR review->'amendmentApproval'->>'id' IS DISTINCT FROM decision.id OR review->'amendmentApproval'->>'digest' IS DISTINCT FROM decision.digest
 OR review->'context' IS DISTINCT FROM activation.manifest->'after'
 OR NEW.manifest->'approval'->>'id' IS DISTINCT FROM p.id
 OR NEW.manifest->'approval'->>'productId' IS DISTINCT FROM a."productId"
 OR NEW.manifest->'approval'->>'workItemId' IS DISTINCT FROM t."workItemId"
 OR NEW.manifest->'approval'->>'status' IS DISTINCT FROM 'APPROVED'
 OR NEW.manifest->'approval'->>'approvalType' IS DISTINCT FROM 'IMPLEMENTATION_TASK'
 THEN RAISE EXCEPTION 'Protected task coding decision binding mismatch'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER "ReworkEvent_coding_binding" BEFORE INSERT ON "ReworkEvent" FOR EACH ROW EXECUTE FUNCTION rework_coding_decision_guard();
COMMIT;
