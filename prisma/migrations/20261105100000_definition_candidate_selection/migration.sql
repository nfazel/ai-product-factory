-- Definition candidate selection. Additive only: one new append-only table and one guard on proposal inserts. No existing row is
-- rewritten. A sealed definition candidate can only become a reviewable proposal through a selection record that names it.
BEGIN;

CREATE TABLE "DefinitionCandidateSelection" (
 id TEXT PRIMARY KEY,
 "productId" TEXT NOT NULL REFERENCES "Product"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "publicationId" TEXT NOT NULL UNIQUE REFERENCES "PlanningPublication"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "proposalId" TEXT NOT NULL UNIQUE,
 "contentDigest" TEXT NOT NULL,
 "selectedBy" TEXT NOT NULL CHECK (length(btrim("selectedBy")) > 0),
 "selectedByKind" TEXT NOT NULL CHECK ("selectedByKind" IN ('PERSON','PLAN_RUN')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER "DefinitionCandidateSelection_immutable" BEFORE UPDATE OR DELETE ON "DefinitionCandidateSelection" FOR EACH ROW EXECUTE FUNCTION development_scope_no_rewrite();
CREATE TRIGGER "DefinitionCandidateSelection_no_truncate" BEFORE TRUNCATE ON "DefinitionCandidateSelection" FOR EACH STATEMENT EXECUTE FUNCTION development_scope_no_rewrite();

-- A selection must name a real definition candidate of the same product, the proposal it becomes, and the digest the candidate was sealed with.
CREATE FUNCTION definition_candidate_selection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p RECORD;
BEGIN
 SELECT * INTO p FROM "PlanningPublication" WHERE id = NEW."publicationId";
 IF p.id IS NULL OR p."productId" <> NEW."productId" OR p.purpose <> 'DEFINITION_PROPOSAL' OR p."artifactKind" <> 'DEFINITION_PROPOSAL'
    OR p."artifactId" <> NEW."proposalId" OR p."contentDigest" <> NEW."contentDigest" THEN
  RAISE EXCEPTION 'A selection must name a sealed definition candidate of the same product, the proposal it becomes, and its sealed digest';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "DefinitionCandidateSelection_guard" BEFORE INSERT ON "DefinitionCandidateSelection" FOR EACH ROW EXECUTE FUNCTION definition_candidate_selection_guard();

-- A proposal that carries a sealed candidate's identity can only be inserted once that candidate has been selected.
CREATE FUNCTION definition_candidate_proposal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "PlanningPublication" p WHERE p."artifactId" = NEW.id AND p.purpose = 'DEFINITION_PROPOSAL')
    AND NOT EXISTS (SELECT 1 FROM "DefinitionCandidateSelection" s WHERE s."proposalId" = NEW.id AND s."productId" = NEW."productId") THEN
  RAISE EXCEPTION 'A sealed definition candidate can only become a proposal through its selection record';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "DefinitionProposal_candidate_guard" BEFORE INSERT ON "DefinitionProposal" FOR EACH ROW EXECUTE FUNCTION definition_candidate_proposal_guard();

COMMIT;
