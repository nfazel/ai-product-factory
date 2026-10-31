BEGIN;
CREATE TABLE "ReworkAmendment" (
 id TEXT PRIMARY KEY,"productId" TEXT NOT NULL REFERENCES "Product"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "planId" TEXT NOT NULL REFERENCES "ImplementationPlan"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "scopeRevisionId" TEXT NOT NULL REFERENCES "DevelopmentScopeRevision"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 manifest JSONB NOT NULL,digest TEXT NOT NULL,"idempotencyKey" TEXT NOT NULL,"requestDigest" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("productId","idempotencyKey"),CHECK(digest ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$'),
 CHECK(COALESCE(manifest->>'kind'='REWORK_AMENDMENT' AND manifest->>'version'='1' AND manifest->>'requirementsUnchanged'='true' AND manifest->>'productId'="productId" AND manifest->>'planId'="planId" AND manifest->>'scopeRevisionId'="scopeRevisionId" AND jsonb_array_length(manifest->'tasks') BETWEEN 1 AND 20,false))
);
CREATE TABLE "ReworkEvent" (
 id TEXT PRIMARY KEY,"amendmentId" TEXT NOT NULL REFERENCES "ReworkAmendment"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "scopeRevisionId" TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('APPROVED','REJECTED','ACTIVATED')),
 manifest JSONB NOT NULL,digest TEXT NOT NULL,signature TEXT NOT NULL,
 "approvalId" TEXT NOT NULL UNIQUE REFERENCES "Approval"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "idempotencyKey" TEXT NOT NULL,"requestDigest" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("amendmentId",type),UNIQUE("amendmentId","idempotencyKey"),
 CHECK(digest ~ '^[a-f0-9]{64}$' AND signature ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$'),
 CHECK(COALESCE(manifest->>'kind'='REWORK_EVENT' AND manifest->>'version'='1' AND manifest->>'type'=type AND manifest->>'amendmentId'="amendmentId" AND manifest->>'scopeRevisionId'="scopeRevisionId" AND manifest->>'grantsCodingAuthority'='false',false))
);
CREATE UNIQUE INDEX "ReworkEvent_one_decision" ON "ReworkEvent"("amendmentId") WHERE type IN ('APPROVED','REJECTED');
CREATE UNIQUE INDEX "ReworkEvent_one_activation" ON "ReworkEvent"("scopeRevisionId") WHERE type='ACTIVATED';
CREATE TABLE "ReworkTaskBinding" (
 "taskId" TEXT PRIMARY KEY REFERENCES "ImplementationTask"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "amendmentId" TEXT NOT NULL REFERENCES "ReworkAmendment"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TRIGGER "ReworkAmendment_immutable" BEFORE UPDATE OR DELETE ON "ReworkAmendment" FOR EACH ROW EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "ReworkAmendment_no_truncate" BEFORE TRUNCATE ON "ReworkAmendment" FOR EACH STATEMENT EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "ReworkEvent_immutable" BEFORE UPDATE OR DELETE ON "ReworkEvent" FOR EACH ROW EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "ReworkEvent_no_truncate" BEFORE TRUNCATE ON "ReworkEvent" FOR EACH STATEMENT EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "ReworkTaskBinding_immutable" BEFORE UPDATE OR DELETE ON "ReworkTaskBinding" FOR EACH ROW EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "ReworkTaskBinding_no_truncate" BEFORE TRUNCATE ON "ReworkTaskBinding" FOR EACH STATEMENT EXECUTE FUNCTION development_scope_no_rewrite();
CREATE FUNCTION rework_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF a.id IS NULL OR NEW."scopeRevisionId"<>a."scopeRevisionId" OR p."productId"<>a."productId" OR p.status::text<>(CASE WHEN NEW.type='REJECTED' THEN 'REJECTED' ELSE 'APPROVED' END) OR p."approvalType"<>(CASE WHEN NEW.type='ACTIVATED' THEN 'REWORK_ACTIVATION' ELSE 'REWORK_AMENDMENT' END) OR NEW.manifest->>'amendmentDigest' IS DISTINCT FROM a.digest OR NEW.manifest->'actor'->>'kind' IS DISTINCT FROM 'LOCAL_OPERATOR' OR NEW.manifest->'actor'->>'name' IS DISTINCT FROM p."approvedBy" OR NEW.manifest->'actor'->>'id' IS NULL OR NEW.manifest->'actor'->>'id' !~ '^local-operator:[a-f0-9]{24}$' THEN RAISE EXCEPTION 'Rework decision authority binding mismatch'; END IF;
  IF NEW.type='ACTIVATED' AND NOT EXISTS(SELECT 1 FROM "ReworkEvent" e WHERE e."amendmentId"=a.id AND e.type='APPROVED' AND e.id=NEW.manifest->>'amendmentApprovalEventId') THEN RAISE EXCEPTION 'Protected amendment approval required before activation'; END IF;
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER "ReworkAmendment_binding" BEFORE INSERT ON "ReworkAmendment" FOR EACH ROW EXECUTE FUNCTION rework_binding_guard();
CREATE TRIGGER "ReworkEvent_binding" BEFORE INSERT ON "ReworkEvent" FOR EACH ROW EXECUTE FUNCTION rework_binding_guard();
CREATE FUNCTION rework_task_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "ReworkAmendment"; spec jsonb;
BEGIN
 SELECT r.* INTO a FROM "ReworkAmendment" r WHERE r.manifest->'tasks' @> jsonb_build_array(jsonb_build_object('id',COALESCE(NEW.id,OLD.id))) LIMIT 1;
 IF a.id IS NULL AND NOT EXISTS(SELECT 1 FROM "ReworkTaskBinding" WHERE "taskId"=COALESCE(NEW.id,OLD.id)) THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_OP<>'INSERT' THEN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'referenceCode'-'updatedAt')=(to_jsonb(OLD)-'referenceCode'-'updatedAt') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Managed rework tasks are immutable and blocked from legacy approval';
 END IF;
 SELECT x INTO spec FROM jsonb_array_elements(a.manifest->'tasks') x WHERE x->>'id'=NEW.id;
 IF NEW."implementationPlanId"<>a."planId" OR NEW.status<>'PROPOSED' OR NEW."workItemId" IS DISTINCT FROM spec->>'workItemId' OR NEW.title IS DISTINCT FROM spec->>'title' OR NEW.description IS DISTINCT FROM spec->>'description' OR NEW.objective IS DISTINCT FROM spec->>'objective' OR NEW.guidance IS DISTINCT FROM spec->>'guidance' OR NEW.validation IS DISTINCT FROM spec->>'validation' OR NEW.risks IS DISTINCT FROM spec->>'risks' OR NEW."filesLikely" IS DISTINCT FROM spec->>'filesLikely' OR NEW.sequence IS DISTINCT FROM (spec->>'sequence')::integer OR NEW.complexity<>'UNKNOWN' OR NEW."parallelisable" OR NEW."humanLocked" OR NEW."verticalSlice"<>'' OR NOT NEW."dependenciesIdentified" THEN RAISE EXCEPTION 'Task differs from approved rework specification'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER "ReworkTask_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ImplementationTask" FOR EACH ROW EXECUTE FUNCTION rework_task_guard();
CREATE FUNCTION rework_task_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; a "ReworkAmendment"; e "ReworkEvent";
BEGIN
 target=COALESCE(to_jsonb(NEW)->>'taskId',to_jsonb(NEW)->>'id');
 SELECT r.* INTO a FROM "ReworkAmendment" r WHERE r.manifest->'tasks' @> jsonb_build_array(jsonb_build_object('id',target)) LIMIT 1;
 IF a.id IS NOT NULL OR TG_TABLE_NAME='ReworkTaskBinding' THEN
  SELECT * INTO e FROM "ReworkEvent" WHERE "amendmentId"=a.id AND type='ACTIVATED';
  IF a.id IS NULL OR e.id IS NULL OR NOT EXISTS(SELECT 1 FROM "ReworkTaskBinding" b JOIN "ImplementationTask" t ON t.id=b."taskId" WHERE b."taskId"=target AND b."amendmentId"=a.id AND t."implementationPlanId"=a."planId") OR EXISTS(SELECT 1 FROM jsonb_array_elements(a.manifest->'tasks') x WHERE NOT EXISTS(SELECT 1 FROM "ReworkTaskBinding" WHERE "taskId"=x->>'id' AND "amendmentId"=a.id)) THEN RAISE EXCEPTION 'Rework activation must atomically create every authorised task and binding'; END IF;
 END IF;
 RETURN NEW;
END;$$;
CREATE CONSTRAINT TRIGGER "ReworkTask_binding" AFTER INSERT ON "ImplementationTask" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rework_task_complete();
CREATE CONSTRAINT TRIGGER "ReworkTaskBinding_binding" AFTER INSERT ON "ReworkTaskBinding" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rework_task_complete();
CREATE FUNCTION rework_workspace_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM "ReworkTaskBinding" WHERE "taskId"=OLD."implementationTaskId") THEN RAISE EXCEPTION 'Managed rework workspace recovery is blocked'; END IF;
 IF EXISTS(SELECT 1 FROM "ReworkTaskBinding" WHERE "taskId"=NEW."implementationTaskId") OR EXISTS(SELECT 1 FROM "ReworkAmendment" WHERE manifest->'tasks' @> jsonb_build_array(jsonb_build_object('id',NEW."implementationTaskId"))) THEN RAISE EXCEPTION 'Managed rework coding is blocked in Phase 1'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER "ReworkWorkspace_guard" BEFORE INSERT OR UPDATE ON "RepositoryWorkspace" FOR EACH ROW EXECUTE FUNCTION rework_workspace_guard();
CREATE FUNCTION rework_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM "ReworkAmendment") THEN RAISE EXCEPTION 'Rework task history cannot be truncated'; END IF;RETURN NULL;END;$$;
CREATE TRIGGER "ReworkTask_no_truncate" BEFORE TRUNCATE ON "ImplementationTask" FOR EACH STATEMENT EXECUTE FUNCTION rework_no_truncate();
CREATE FUNCTION rework_event_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "ReworkAmendment";
BEGIN
 IF NEW.type='ACTIVATED' THEN
  SELECT * INTO a FROM "ReworkAmendment" WHERE id=NEW."amendmentId";
  IF NEW.manifest->'taskIds' IS DISTINCT FROM (SELECT jsonb_agg(x->'id') FROM jsonb_array_elements(a.manifest->'tasks') x) OR EXISTS(SELECT 1 FROM jsonb_array_elements(a.manifest->'tasks') x WHERE NOT EXISTS(SELECT 1 FROM "ReworkTaskBinding" b JOIN "ImplementationTask" t ON t.id=b."taskId" WHERE b."taskId"=x->>'id' AND b."amendmentId"=a.id AND t."implementationPlanId"=a."planId")) THEN RAISE EXCEPTION 'Activation cannot exist without every exact task and binding'; END IF;
 END IF;
 RETURN NEW;
END;$$;
CREATE CONSTRAINT TRIGGER "ReworkEvent_complete" AFTER INSERT ON "ReworkEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rework_event_complete();
COMMIT;
