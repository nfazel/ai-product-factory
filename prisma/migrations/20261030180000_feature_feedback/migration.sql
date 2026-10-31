-- CreateTable
CREATE TABLE "FeatureFeedback" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "contextDigest" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFeedbackEvent" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "contextDigest" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "signature" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureFeedbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureFeedback_productId_featureId_createdAt_idx" ON "FeatureFeedback"("productId", "featureId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFeedback_productId_featureId_idempotencyKey_key" ON "FeatureFeedback"("productId", "featureId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFeedbackEvent_feedbackId_revision_key" ON "FeatureFeedbackEvent"("feedbackId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFeedbackEvent_feedbackId_idempotencyKey_key" ON "FeatureFeedbackEvent"("feedbackId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "FeatureFeedback" ADD CONSTRAINT "FeatureFeedback_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FeatureFeedback" ADD CONSTRAINT "FeatureFeedback_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "WorkItem"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FeatureFeedbackEvent" ADD CONSTRAINT "FeatureFeedbackEvent_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "FeatureFeedback"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Retain intent and conversation history; no existing approval/evidence tables are modified.
CREATE FUNCTION feature_feedback_no_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Feature feedback history is append-only; cancel rather than delete' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER "FeatureFeedback_no_rewrite" BEFORE UPDATE OR DELETE ON "FeatureFeedback" FOR EACH ROW EXECUTE FUNCTION feature_feedback_no_rewrite();
CREATE TRIGGER "FeatureFeedback_no_truncate" BEFORE TRUNCATE ON "FeatureFeedback" FOR EACH STATEMENT EXECUTE FUNCTION feature_feedback_no_rewrite();
CREATE TRIGGER "FeatureFeedbackEvent_no_rewrite" BEFORE UPDATE OR DELETE ON "FeatureFeedbackEvent" FOR EACH ROW EXECUTE FUNCTION feature_feedback_no_rewrite();
CREATE TRIGGER "FeatureFeedbackEvent_no_truncate" BEFORE TRUNCATE ON "FeatureFeedbackEvent" FOR EACH STATEMENT EXECUTE FUNCTION feature_feedback_no_rewrite();
ALTER TABLE "FeatureFeedback" ADD CONSTRAINT "FeatureFeedback_content_check" CHECK (
 length("originalText") BETWEEN 1 AND 20000 AND length("idempotencyKey") BETWEEN 8 AND 128
 AND "contextDigest" ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND COALESCE("context"->>'kind'='FEATURE_FEEDBACK_CONTEXT' AND "context"->>'productId'="productId" AND "context"->>'featureId'="featureId" AND "context"->>'version'='1',false)
);
ALTER TABLE "FeatureFeedbackEvent" ADD CONSTRAINT "FeatureFeedbackEvent_proof_check" CHECK (
 "revision">0 AND length("idempotencyKey") BETWEEN 8 AND 128 AND "contextDigest" ~ '^[a-f0-9]{64}$' AND "digest" ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND (("type"='AI_ANALYSIS' AND "actorKind"='AI' AND "signature"='')
 OR ("type" IN ('RESPONSE','REVISION_REQUESTED','CONFIRMED','REJECTED','CANCELLED') AND "actorKind"='LOCAL_OPERATOR' AND "signature" ~ '^[a-f0-9]{64}$'))
);
CREATE FUNCTION feature_feedback_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_product text; owner_type text;
BEGIN
 SELECT "productId","type"::text INTO owner_product,owner_type FROM "WorkItem" WHERE id=NEW."featureId" FOR KEY SHARE;
 IF owner_product IS DISTINCT FROM NEW."productId" OR owner_type IS DISTINCT FROM 'FEATURE' THEN
  RAISE EXCEPTION 'Feedback must belong to a FEATURE in this product' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "FeatureFeedback_scope_guard" BEFORE INSERT ON "FeatureFeedback" FOR EACH ROW EXECUTE FUNCTION feature_feedback_scope_guard();
CREATE FUNCTION feature_feedback_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE thread "FeatureFeedback"; previous_revision integer;
BEGIN
 SELECT * INTO thread FROM "FeatureFeedback" WHERE id=NEW."feedbackId" FOR UPDATE;
 SELECT COALESCE(max(revision),0) INTO previous_revision FROM "FeatureFeedbackEvent" WHERE "feedbackId"=NEW."feedbackId";
 IF thread.id IS NULL OR NEW.revision<>previous_revision+1
 OR NOT COALESCE(NEW.context->>'kind'='FEATURE_FEEDBACK_CONTEXT' AND NEW.context->>'version'='1' AND NEW.context->>'productId'=thread."productId" AND NEW.context->>'featureId'=thread."featureId",false) THEN
  RAISE EXCEPTION 'Feedback event scope or sequence is invalid' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "FeatureFeedbackEvent_scope_guard" BEFORE INSERT ON "FeatureFeedbackEvent" FOR EACH ROW EXECUTE FUNCTION feature_feedback_event_guard();
