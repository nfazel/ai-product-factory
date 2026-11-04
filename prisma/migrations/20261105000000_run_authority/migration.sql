-- Delegated run authority. Additive only: two new append-only tables and one new nullable column on "Approval".
-- No existing row is rewritten. An authority is a person's signed grant; it is never recorded as the person's own approval.
BEGIN;

CREATE TABLE "RunAuthority" (
 id TEXT PRIMARY KEY,
 "productId" TEXT NOT NULL REFERENCES "Product"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "planId" TEXT NOT NULL REFERENCES "ImplementationPlan"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "grantApprovalId" TEXT NOT NULL UNIQUE REFERENCES "Approval"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 manifest JSONB NOT NULL, digest TEXT NOT NULL, signature TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "maxRetries" INTEGER NOT NULL, "riskCeiling" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (digest ~ '^[a-f0-9]{64}$' AND signature ~ '^[a-f0-9]{64}$'),
 CHECK ("riskCeiling" = 'LOW'),
 CHECK ("maxRetries" BETWEEN 0 AND 5),
 CHECK ("expiresAt" > "createdAt"),
 CHECK (COALESCE(manifest->>'kind'='RUN_AUTHORITY' AND manifest->>'version'='1' AND manifest->>'productId'="productId" AND manifest->>'planId'="planId" AND manifest->>'riskCeiling'="riskCeiling" AND jsonb_typeof(manifest->'tasks')='array' AND jsonb_typeof(manifest->'steps')='array' AND manifest->'operator'->>'name' IS NOT NULL, false))
);

CREATE TABLE "RunAuthorityEvent" (
 id TEXT PRIMARY KEY,
 "authorityId" TEXT NOT NULL REFERENCES "RunAuthority"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 type TEXT NOT NULL CHECK (type IN ('STEP','REVOKED')),
 step TEXT CHECK (step IN ('APPROVE_TASK','APPROVE_PLAN','APPROVE_CODE','RECORD_SNAPSHOT','SIGN_RUNTIME_REVIEW','START_VERIFICATION')),
 "subjectId" TEXT,
 detail JSONB NOT NULL DEFAULT '{}'::jsonb,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((type = 'STEP' AND step IS NOT NULL AND "subjectId" IS NOT NULL) OR (type = 'REVOKED' AND step IS NULL))
);
CREATE UNIQUE INDEX "RunAuthorityEvent_one_revocation" ON "RunAuthorityEvent"("authorityId") WHERE type = 'REVOKED';
CREATE INDEX "RunAuthorityEvent_authorityId_idx" ON "RunAuthorityEvent"("authorityId");

ALTER TABLE "Approval" ADD COLUMN "authorityId" TEXT REFERENCES "RunAuthority"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "Approval_authorityId_idx" ON "Approval"("authorityId");

-- Append-only, like the rework chain.
CREATE TRIGGER "RunAuthority_immutable" BEFORE UPDATE OR DELETE ON "RunAuthority" FOR EACH ROW EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "RunAuthority_no_truncate" BEFORE TRUNCATE ON "RunAuthority" FOR EACH STATEMENT EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "RunAuthorityEvent_immutable" BEFORE UPDATE OR DELETE ON "RunAuthorityEvent" FOR EACH ROW EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "RunAuthorityEvent_no_truncate" BEFORE TRUNCATE ON "RunAuthorityEvent" FOR EACH STATEMENT EXECUTE FUNCTION development_scope_no_rewrite();

-- A grant must rest on a real, resolved human approval of the same product, for an approved plan of that product.
CREATE FUNCTION run_authority_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g RECORD; p RECORD;
BEGIN
 SELECT * INTO g FROM "Approval" WHERE id = NEW."grantApprovalId";
 IF g.id IS NULL OR g."productId" <> NEW."productId" OR g."approvalType" <> 'RUN_AUTHORITY' OR g.status::text <> 'APPROVED' OR g."resolvedAt" IS NULL
    OR g."approvedBy" IS NULL OR g."approvedBy" LIKE 'Builder%' OR g."approvedBy" IS DISTINCT FROM NEW.manifest->'operator'->>'name' THEN
  RAISE EXCEPTION 'A run authority must rest on the resolved approval of a person for the same product';
 END IF;
 SELECT * INTO p FROM "ImplementationPlan" WHERE id = NEW."planId";
 IF p.id IS NULL OR p."productId" <> NEW."productId" OR p.status::text <> 'APPROVED' THEN
  RAISE EXCEPTION 'A run authority can only be granted for an approved plan of the same product';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "RunAuthority_grant" BEFORE INSERT ON "RunAuthority" FOR EACH ROW EXECUTE FUNCTION run_authority_grant_guard();

-- No step can be recorded under an authority that has expired or been revoked.
CREATE FUNCTION run_authority_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a RECORD;
BEGIN
 SELECT * INTO a FROM "RunAuthority" WHERE id = NEW."authorityId";
 IF a.id IS NULL THEN RAISE EXCEPTION 'The run authority was not found'; END IF;
 IF NEW.type = 'STEP' AND (a."expiresAt" <= NEW."createdAt" OR EXISTS (SELECT 1 FROM "RunAuthorityEvent" e WHERE e."authorityId" = a.id AND e.type = 'REVOKED')) THEN
  RAISE EXCEPTION 'The run authority has expired or been revoked';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "RunAuthorityEvent_guard" BEFORE INSERT ON "RunAuthorityEvent" FOR EACH ROW EXECUTE FUNCTION run_authority_event_guard();

-- The words "Builder, under authority ..." and the link to an authority belong together. Neither can be used alone, and
-- only a code-change approval may be made under an authority.
CREATE FUNCTION run_authority_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a RECORD;
BEGIN
 IF TG_OP = 'UPDATE' AND OLD."authorityId" IS DISTINCT FROM NEW."authorityId" THEN
  RAISE EXCEPTION 'The authority of an approval cannot be changed';
 END IF;
 IF NEW."authorityId" IS NULL THEN
  IF NEW."approvedBy" LIKE 'Builder, under authority %' THEN
   RAISE EXCEPTION 'That wording is reserved for approvals made under a run authority';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO a FROM "RunAuthority" WHERE id = NEW."authorityId";
 IF a.id IS NULL OR a."productId" <> NEW."productId" OR NEW."approvalType" <> 'CODE_CHANGE' THEN
  RAISE EXCEPTION 'Only a code change approval of the same product may be made under a run authority';
 END IF;
 IF TG_OP = 'INSERT' AND (a."expiresAt" <= now() OR EXISTS (SELECT 1 FROM "RunAuthorityEvent" e WHERE e."authorityId" = a.id AND e.type = 'REVOKED')) THEN
  RAISE EXCEPTION 'The run authority has expired or been revoked';
 END IF;
 IF NEW."approvedBy" IS NOT NULL AND NEW."approvedBy" <> 'Builder, under authority ' || a.id || ' granted by ' || (a.manifest->'operator'->>'name') THEN
  RAISE EXCEPTION 'An approval under authority must say so, naming the authority and the person who granted it';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Approval_authority_guard" BEFORE INSERT OR UPDATE ON "Approval" FOR EACH ROW EXECUTE FUNCTION run_authority_approval_guard();

COMMIT;
