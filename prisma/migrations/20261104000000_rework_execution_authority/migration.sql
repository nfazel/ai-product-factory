-- Phase 2b: a human can authorise a managed rework task for execution, in a separate signed step after the Phase 2a coding decision.
-- Until that event exists for a task, every Phase 1 and Phase 2a guard applies unchanged.
BEGIN;
ALTER TABLE "ReworkEvent" DROP CONSTRAINT "ReworkEvent_type_check";
ALTER TABLE "ReworkEvent" ADD CONSTRAINT "ReworkEvent_type_check" CHECK(type IN ('APPROVED','REJECTED','ACTIVATED','TASK_CODING_APPROVED','TASK_EXECUTION_AUTHORISED'));
ALTER TABLE "ReworkEvent" DROP CONSTRAINT "ReworkEvent_check1";
ALTER TABLE "ReworkEvent" ADD CONSTRAINT "ReworkEvent_check1" CHECK(COALESCE(
 manifest->>'kind'='REWORK_EVENT' AND manifest->>'type'=type
 AND manifest->>'amendmentId'="amendmentId" AND manifest->>'scopeRevisionId'="scopeRevisionId"
 AND ((type IN ('APPROVED','REJECTED','ACTIVATED') AND "taskId" IS NULL AND manifest->>'version'='1' AND manifest->>'grantsCodingAuthority'='false')
 OR (type='TASK_CODING_APPROVED' AND "taskId" IS NOT NULL AND manifest->>'version'='2' AND manifest->>'grantsCodingAuthority'='false'
 AND manifest->>'taskId'="taskId" AND manifest->>'codingDecision'='APPROVED'
 AND manifest->>'executionAuthorised'='false' AND manifest->>'reviewedDigest' ~ '^[a-f0-9]{64}$')
 OR (type='TASK_EXECUTION_AUTHORISED' AND "taskId" IS NOT NULL AND manifest->>'version'='3' AND manifest->>'grantsCodingAuthority'='true'
 AND manifest->>'taskId'="taskId" AND manifest->>'executionAuthorised'='true'
 AND manifest->>'codingDecisionEventId' IS NOT NULL AND manifest->>'reviewedDigest' ~ '^[a-f0-9]{64}$')),false));
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
  IF a.id IS NULL OR NEW."scopeRevisionId"<>a."scopeRevisionId" OR p."productId"<>a."productId" OR p.status::text<>(CASE WHEN NEW.type='REJECTED' THEN 'REJECTED' ELSE 'APPROVED' END) OR p."approvalType"<>(CASE WHEN NEW.type='ACTIVATED' THEN 'REWORK_ACTIVATION' WHEN NEW.type IN('TASK_CODING_APPROVED','TASK_EXECUTION_AUTHORISED') THEN 'IMPLEMENTATION_TASK' ELSE 'REWORK_AMENDMENT' END) OR NEW.manifest->>'amendmentDigest' IS DISTINCT FROM a.digest OR NEW.manifest->'actor'->>'kind' IS DISTINCT FROM 'LOCAL_OPERATOR' OR NEW.manifest->'actor'->>'name' IS DISTINCT FROM p."approvedBy" OR NEW.manifest->'actor'->>'id' IS NULL OR NEW.manifest->'actor'->>'id' !~ '^local-operator:[a-f0-9]{24}$' THEN RAISE EXCEPTION 'Rework decision authority binding mismatch'; END IF;
  IF NEW.type='ACTIVATED' AND NOT EXISTS(SELECT 1 FROM "ReworkEvent" e WHERE e."amendmentId"=a.id AND e.type='APPROVED' AND e.id=NEW.manifest->>'amendmentApprovalEventId') THEN RAISE EXCEPTION 'Protected amendment approval required before activation'; END IF;
 END IF;
 RETURN NEW;
END;$$;
CREATE OR REPLACE FUNCTION rework_task_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "ReworkAmendment"; spec jsonb;
BEGIN
 SELECT r.* INTO a FROM "ReworkAmendment" r WHERE r.manifest->'tasks' @> jsonb_build_array(jsonb_build_object('id',COALESCE(NEW.id,OLD.id))) LIMIT 1;
 IF a.id IS NULL AND NOT EXISTS(SELECT 1 FROM "ReworkTaskBinding" WHERE "taskId"=COALESCE(NEW.id,OLD.id)) THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_OP<>'INSERT' THEN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'referenceCode'-'updatedAt')=(to_jsonb(OLD)-'referenceCode'-'updatedAt') THEN RETURN NEW; END IF;
  -- After a human has authorised execution, only the task's progress status may change; its identity and specification stay frozen.
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM "ReworkEvent" WHERE type='TASK_EXECUTION_AUTHORISED' AND "taskId"=OLD.id)
   AND (to_jsonb(NEW)-'status'-'referenceCode'-'updatedAt')=(to_jsonb(OLD)-'status'-'referenceCode'-'updatedAt') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Managed rework tasks are immutable and blocked from legacy approval';
 END IF;
 SELECT x INTO spec FROM jsonb_array_elements(a.manifest->'tasks') x WHERE x->>'id'=NEW.id;
 IF NEW."implementationPlanId"<>a."planId" OR NEW.status<>'PROPOSED' OR NEW."workItemId" IS DISTINCT FROM spec->>'workItemId' OR NEW.title IS DISTINCT FROM spec->>'title' OR NEW.description IS DISTINCT FROM spec->>'description' OR NEW.objective IS DISTINCT FROM spec->>'objective' OR NEW.guidance IS DISTINCT FROM spec->>'guidance' OR NEW.validation IS DISTINCT FROM spec->>'validation' OR NEW.risks IS DISTINCT FROM spec->>'risks' OR NEW."filesLikely" IS DISTINCT FROM spec->>'filesLikely' OR NEW.sequence IS DISTINCT FROM (spec->>'sequence')::integer OR NEW.complexity<>'UNKNOWN' OR NEW."parallelisable" OR NEW."humanLocked" OR NEW."verticalSlice"<>'' OR NOT NEW."dependenciesIdentified" THEN RAISE EXCEPTION 'Task differs from approved rework specification'; END IF;
 RETURN NEW;
END;$$;
CREATE OR REPLACE FUNCTION rework_workspace_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- A task a human has authorised for execution is coded through the ordinary workspace flow.
 IF EXISTS(SELECT 1 FROM "ReworkEvent" WHERE type='TASK_EXECUTION_AUTHORISED' AND "taskId"=NEW."implementationTaskId") THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM "ReworkTaskBinding" WHERE "taskId"=OLD."implementationTaskId") THEN RAISE EXCEPTION 'Managed rework workspace recovery is blocked'; END IF;
 IF EXISTS(SELECT 1 FROM "ReworkTaskBinding" WHERE "taskId"=NEW."implementationTaskId") OR EXISTS(SELECT 1 FROM "ReworkAmendment" WHERE manifest->'tasks' @> jsonb_build_array(jsonb_build_object('id',NEW."implementationTaskId"))) THEN RAISE EXCEPTION 'Managed rework coding is blocked in Phase 1'; END IF;
 RETURN NEW;
END;$$;
CREATE FUNCTION rework_execution_authority_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d "ReworkEvent"; t "ImplementationTask";
BEGIN
 IF NEW.type<>'TASK_EXECUTION_AUTHORISED' THEN RETURN NEW; END IF;
 SELECT * INTO d FROM "ReworkEvent" WHERE "amendmentId"=NEW."amendmentId" AND type='TASK_CODING_APPROVED' AND "taskId"=NEW."taskId";
 SELECT * INTO t FROM "ImplementationTask" WHERE id=NEW."taskId";
 IF d.id IS NULL OR t.id IS NULL OR t.status<>'PROPOSED'
  OR NEW.manifest->>'codingDecisionEventId' IS DISTINCT FROM d.id
  OR NEW.manifest->>'reviewedDigest' IS DISTINCT FROM d.manifest->>'reviewedDigest'
  OR NOT EXISTS(SELECT 1 FROM "ReworkTaskBinding" WHERE "taskId"=t.id AND "amendmentId"=NEW."amendmentId")
 THEN RAISE EXCEPTION 'Execution authority requires a recorded coding decision for this proposed managed task'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER "ReworkEvent_execution_authority" BEFORE INSERT ON "ReworkEvent" FOR EACH ROW EXECUTE FUNCTION rework_execution_authority_guard();
COMMIT;
