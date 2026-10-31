-- CreateTable
CREATE TABLE "DevelopmentScope" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "confirmationEventId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevelopmentScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevelopmentScopeRevision" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "manifest" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevelopmentScopeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevelopmentScopeEvent" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scopeDigest" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevelopmentScopeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentScope_confirmationEventId_key" ON "DevelopmentScope"("confirmationEventId");

-- CreateIndex
CREATE INDEX "DevelopmentScope_productId_featureId_createdAt_idx" ON "DevelopmentScope"("productId", "featureId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentScope_productId_featureId_idempotencyKey_key" ON "DevelopmentScope"("productId", "featureId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentScopeRevision_scopeId_version_key" ON "DevelopmentScopeRevision"("scopeId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentScopeRevision_scopeId_idempotencyKey_key" ON "DevelopmentScopeRevision"("scopeId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentScopeRevision_id_scopeId_key" ON "DevelopmentScopeRevision"("id", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentScopeEvent_revisionId_key" ON "DevelopmentScopeEvent"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentScopeEvent_approvalId_key" ON "DevelopmentScopeEvent"("approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentScopeEvent_scopeId_idempotencyKey_key" ON "DevelopmentScopeEvent"("scopeId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentScopeEvent_revisionId_scopeId_key" ON "DevelopmentScopeEvent"("revisionId", "scopeId");

-- AddForeignKey
ALTER TABLE "DevelopmentScope" ADD CONSTRAINT "DevelopmentScope_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DevelopmentScope" ADD CONSTRAINT "DevelopmentScope_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "WorkItem"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DevelopmentScope" ADD CONSTRAINT "DevelopmentScope_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "FeatureFeedback"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DevelopmentScope" ADD CONSTRAINT "DevelopmentScope_confirmationEventId_fkey" FOREIGN KEY ("confirmationEventId") REFERENCES "FeatureFeedbackEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DevelopmentScopeRevision" ADD CONSTRAINT "DevelopmentScopeRevision_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "DevelopmentScope"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DevelopmentScopeEvent" ADD CONSTRAINT "DevelopmentScopeEvent_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "DevelopmentScope"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DevelopmentScopeEvent" ADD CONSTRAINT "DevelopmentScopeEvent_revisionId_scopeId_fkey" FOREIGN KEY ("revisionId", "scopeId") REFERENCES "DevelopmentScopeRevision"("id", "scopeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DevelopmentScopeEvent" ADD CONSTRAINT "DevelopmentScopeEvent_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Detached intent and review history are retained. No existing rows are rewritten.
CREATE FUNCTION development_scope_no_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Development scope history is append-only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER "DevelopmentScope_no_rewrite" BEFORE UPDATE OR DELETE ON "DevelopmentScope" FOR EACH ROW EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "DevelopmentScope_no_truncate" BEFORE TRUNCATE ON "DevelopmentScope" FOR EACH STATEMENT EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "DevelopmentScopeRevision_no_rewrite" BEFORE UPDATE OR DELETE ON "DevelopmentScopeRevision" FOR EACH ROW EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "DevelopmentScopeRevision_no_truncate" BEFORE TRUNCATE ON "DevelopmentScopeRevision" FOR EACH STATEMENT EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "DevelopmentScopeEvent_no_rewrite" BEFORE UPDATE OR DELETE ON "DevelopmentScopeEvent" FOR EACH ROW EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "DevelopmentScopeEvent_no_truncate" BEFORE TRUNCATE ON "DevelopmentScopeEvent" FOR EACH STATEMENT EXECUTE FUNCTION development_scope_no_rewrite();
ALTER TABLE "DevelopmentScope" ADD CONSTRAINT "DevelopmentScope_request_check" CHECK (length("idempotencyKey") BETWEEN 8 AND 128 AND "requestDigest" ~ '^[a-f0-9]{64}$');
ALTER TABLE "DevelopmentScopeRevision" ADD CONSTRAINT "DevelopmentScopeRevision_content_check" CHECK (
 "version">0 AND "digest" ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$' AND length("idempotencyKey") BETWEEN 8 AND 128 AND "actorKind" IN ('AI','LOCAL_OPERATOR')
);
ALTER TABLE "DevelopmentScopeEvent" ADD CONSTRAINT "DevelopmentScopeEvent_proof_check" CHECK (
 "type" IN ('APPROVED','REJECTED') AND "actorKind"='LOCAL_OPERATOR' AND "signature" ~ '^[a-f0-9]{64}$' AND "scopeDigest" ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$' AND length("idempotencyKey") BETWEEN 8 AND 128
);
CREATE FUNCTION development_scope_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE feedback "FeatureFeedback"; confirmation "FeatureFeedbackEvent"; owner "WorkItem";
BEGIN
 SELECT * INTO feedback FROM "FeatureFeedback" WHERE id=NEW."feedbackId";
 SELECT * INTO confirmation FROM "FeatureFeedbackEvent" WHERE id=NEW."confirmationEventId";
 SELECT * INTO owner FROM "WorkItem" WHERE id=NEW."featureId" FOR KEY SHARE;
 IF feedback.id IS NULL OR confirmation.id IS NULL OR owner.id IS NULL OR owner.type::text<>'FEATURE'
 OR owner."productId"<>NEW."productId" OR feedback."productId"<>NEW."productId" OR feedback."featureId"<>NEW."featureId"
 OR confirmation."feedbackId"<>feedback.id OR confirmation.type<>'CONFIRMED' OR confirmation."actorKind"<>'LOCAL_OPERATOR' THEN
  RAISE EXCEPTION 'Development scope requires this feature and confirmed feedback in this product' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "DevelopmentScope_source_guard" BEFORE INSERT ON "DevelopmentScope" FOR EACH ROW EXECUTE FUNCTION development_scope_source_guard();
CREATE FUNCTION development_scope_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "DevelopmentScope"; latest integer;
BEGIN
 SELECT * INTO parent FROM "DevelopmentScope" WHERE id=NEW."scopeId" FOR UPDATE;
 SELECT COALESCE(max(version),0) INTO latest FROM "DevelopmentScopeRevision" WHERE "scopeId"=NEW."scopeId";
 IF parent.id IS NULL OR NEW.version<>latest+1 OR NOT COALESCE(
 NEW.manifest->>'kind'='DEVELOPMENT_SCOPE_MANIFEST' AND NEW.manifest->>'formatVersion'='1'
 AND NEW.manifest->>'scopeId'=parent.id AND NEW.manifest->>'version'=NEW.version::text
 AND NEW.manifest->>'productId'=parent."productId" AND NEW.manifest->>'featureId'=parent."featureId"
 AND NEW.manifest->>'feedbackId'=parent."feedbackId" AND NEW.manifest->'source'->>'confirmationEventId'=parent."confirmationEventId",false) THEN
  RAISE EXCEPTION 'Development scope revision sequence or source is invalid' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "DevelopmentScopeRevision_guard" BEFORE INSERT ON "DevelopmentScopeRevision" FOR EACH ROW EXECUTE FUNCTION development_scope_revision_guard();
CREATE FUNCTION development_scope_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "DevelopmentScope"; revision "DevelopmentScopeRevision"; authority "Approval"; latest integer;
BEGIN
 SELECT * INTO parent FROM "DevelopmentScope" WHERE id=NEW."scopeId" FOR UPDATE;
 SELECT * INTO revision FROM "DevelopmentScopeRevision" WHERE id=NEW."revisionId";
 SELECT max(version) INTO latest FROM "DevelopmentScopeRevision" WHERE "scopeId"=NEW."scopeId";
 SELECT * INTO authority FROM "Approval" WHERE id=NEW."approvalId";
 IF parent.id IS NULL OR revision.id IS NULL OR revision."scopeId"<>parent.id OR revision.version<>latest OR revision.digest<>NEW."scopeDigest"
 OR authority.id IS NULL OR authority."approvalType"<>'DEVELOPMENT_SCOPE' OR authority.status::text<>NEW.type
 OR authority."productId"<>parent."productId" OR authority."workItemId" IS DISTINCT FROM parent."featureId"
 OR authority."approvedBy" IS DISTINCT FROM NEW."actorName" OR authority."resolvedAt" IS NULL THEN
  RAISE EXCEPTION 'Development scope decision requires exact current revision and human approval' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "DevelopmentScopeEvent_guard" BEFORE INSERT ON "DevelopmentScopeEvent" FOR EACH ROW EXECUTE FUNCTION development_scope_decision_guard();
