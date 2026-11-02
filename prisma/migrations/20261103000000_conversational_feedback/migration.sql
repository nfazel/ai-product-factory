-- Preserve signed historical decisions; only non-approval conversation input may be unverified.
BEGIN;
ALTER TABLE "FeatureFeedbackEvent" DROP CONSTRAINT "FeatureFeedbackEvent_proof_check";
ALTER TABLE "FeatureFeedbackEvent" ADD CONSTRAINT "FeatureFeedbackEvent_proof_check" CHECK (
 "revision">0 AND length("idempotencyKey") BETWEEN 8 AND 128 AND "contextDigest" ~ '^[a-f0-9]{64}$' AND "digest" ~ '^[a-f0-9]{64}$' AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND (("type"='AI_ANALYSIS' AND "actorKind"='AI' AND "signature"='')
 OR ("type" IN ('RESPONSE','REVISION_REQUESTED','CONFIRMED','REJECTED','CANCELLED') AND "actorKind"='LOCAL_OPERATOR' AND "signature" ~ '^[a-f0-9]{64}$')
 OR ("type" IN ('RESPONSE','REVISION_REQUESTED') AND "actorKind"='LOCAL_PARTICIPANT' AND "actorId"='local-feedback-participant' AND "actorName"='Local participant (unverified)' AND "signature"=''))
);
COMMIT;
