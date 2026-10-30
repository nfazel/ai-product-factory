-- CreateEnum
CREATE TYPE "FeatureReviewEventType" AS ENUM ('ACCEPTED', 'DEFERRED', 'INVALIDATED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "FeatureReviewEvent" (
    "sequence" SERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "type" "FeatureReviewEventType" NOT NULL,
    "manifestVersion" INTEGER NOT NULL DEFAULT 1,
    "manifest" JSONB NOT NULL,
    "manifestDigest" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "acknowledgedConcerns" JSONB NOT NULL DEFAULT '[]',
    "idempotencyKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "signature" TEXT NOT NULL DEFAULT '',
    "invalidatesEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureReviewEvent_invalidatesEventId_key" ON "FeatureReviewEvent"("invalidatesEventId");

-- CreateIndex
CREATE INDEX "FeatureReviewEvent_productId_featureId_createdAt_idx" ON "FeatureReviewEvent"("productId", "featureId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureReviewEvent_featureId_idempotencyKey_key" ON "FeatureReviewEvent"("featureId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "FeatureReviewEvent" ADD CONSTRAINT "FeatureReviewEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureReviewEvent" ADD CONSTRAINT "FeatureReviewEvent_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "WorkItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureReviewEvent" ADD CONSTRAINT "FeatureReviewEvent_invalidatesEventId_fkey" FOREIGN KEY ("invalidatesEventId") REFERENCES "FeatureReviewEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Review decisions are retained, not rewritten. Parent FKs deliberately restrict deletion.
ALTER TABLE "FeatureReviewEvent" ADD CONSTRAINT "FeatureReviewEvent_digests_check" CHECK (
 "manifestVersion" = 1 AND "manifestDigest" ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND length("idempotencyKey") BETWEEN 8 AND 128
 AND (("type" = 'INVALIDATED' AND "actorKind" = 'SYSTEM' AND "invalidatesEventId" IS NOT NULL AND "idempotencyKey" = 'invalidate:' || "invalidatesEventId")
 OR ("type" IN ('ACCEPTED','DEFERRED','ARCHIVED') AND "actorKind" = 'LOCAL_OPERATOR' AND "invalidatesEventId" IS NULL AND "idempotencyKey" NOT LIKE 'invalidate:%' AND "signature" ~ '^[a-f0-9]{64}$'))
);
CREATE FUNCTION feature_review_no_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Feature review history is append-only; archive parent records instead' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER "FeatureReviewEvent_no_update_delete" BEFORE UPDATE OR DELETE ON "FeatureReviewEvent"
 FOR EACH ROW EXECUTE FUNCTION feature_review_no_rewrite();
CREATE TRIGGER "FeatureReviewEvent_no_truncate" BEFORE TRUNCATE ON "FeatureReviewEvent"
 FOR EACH STATEMENT EXECUTE FUNCTION feature_review_no_rewrite();
CREATE FUNCTION feature_review_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE feature_product text; feature_type text; target "FeatureReviewEvent";
BEGIN
 SELECT "productId", "type"::text INTO feature_product,feature_type FROM "WorkItem" WHERE "id"=NEW."featureId" FOR KEY SHARE;
 IF feature_product IS DISTINCT FROM NEW."productId" OR feature_type IS DISTINCT FROM 'FEATURE' THEN
  RAISE EXCEPTION 'Review must reference a FEATURE in the same product' USING ERRCODE='23514';
 END IF;
 IF NEW."invalidatesEventId" IS NOT NULL THEN
  SELECT * INTO target FROM "FeatureReviewEvent" WHERE "id"=NEW."invalidatesEventId";
  IF target."productId" IS DISTINCT FROM NEW."productId" OR target."featureId" IS DISTINCT FROM NEW."featureId" OR target."type" IS DISTINCT FROM 'ACCEPTED' THEN
   RAISE EXCEPTION 'Invalidation must reference an acceptance of this feature' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "FeatureReviewEvent_scope_guard" BEFORE INSERT ON "FeatureReviewEvent"
 FOR EACH ROW EXECUTE FUNCTION feature_review_scope_guard();

CREATE UNIQUE INDEX "FeatureReviewEvent_sequence_key" ON "FeatureReviewEvent"("sequence");

ALTER TABLE "FeatureReviewEvent" ADD CONSTRAINT "FeatureReviewEvent_manifest_target_check" CHECK (
 COALESCE(jsonb_typeof("manifest") = 'object'
 AND "manifest"->>'kind' = 'FEATURE_REVIEW_MANIFEST'
 AND "manifest"->>'productId' = "productId"
 AND "manifest"->>'featureId' = "featureId"
 AND "manifest"->>'version' = '1', false)
);

ALTER TABLE "FeatureReviewEvent" ADD CONSTRAINT "FeatureReviewEvent_archive_key_check" CHECK (
 ("type" = 'ARCHIVED' AND "idempotencyKey" = 'archive:' || "featureId")
 OR ("type" <> 'ARCHIVED' AND "idempotencyKey" NOT LIKE 'archive:%')
);
