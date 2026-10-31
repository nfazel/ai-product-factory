# Read-only definition candidate inspection

F1b-2b-2c-1 exposes published immutable definition candidates without materialisation, selection, editing, review decisions or approval.

## Paths

- Define links to `/definition-candidates/[productId]`, a verified candidate list.
- `/definition-candidates/[productId]/[publicationId]` loads one verified candidate.
- `listDefinitionCandidateInspections` and `loadDefinitionCandidateInspection` provide the server-side presentation contracts.

These pages deliberately sit outside `(app)` and the product layout: the existing app shell/product guidance path can invoke approval recovery. The inspection pages use only the static root layout and dedicated readers. All navigation links disable prefetch, including return links into the legacy workspace. Existing legacy selectors, guidance, recovery and definition actions are unchanged.

## Integrity and provenance

Every item is loaded through the existing PlanningPublication and PlanningGeneration verifiers. Their signatures, identities, input/output digests, purpose, baseline proof and reservation-bound final pin are checked. The inspection reader additionally validates the supported AI-generation input contract, exact product/problem ownership, canonical complete proposal, original successful AgentRun and its reservation/output association. Unsupported or partial state is rejected; mutable proposals are never substituted and corrupt publications are never silently omitted from a list.

UNBOUND_BOOTSTRAP records remain explicitly unbound initial-generation history. Viewing them does not reinitialise a baseline or repin them. A newly established baseline makes their requirements context STALE while preserving their original content.

Requirements applicability is a read-only presentation envelope: CURRENT when captured requirements membership matches, STALE on changed context/drift, UNPROVEN when current context cannot be established. It does not certify broader workflow eligibility or authorise selection/approval. Invalid original publication/generation proof blocks content loading; current-authority unavailability does not permanently invalidate authentic history. No current model/prompt configuration is substituted for historical provenance.

The complete proposal validator was moved unchanged to the existing pure requirements validation module and re-exported from the generation module for compatibility. Inspection does not load the provider/agent orchestration module to validate content. Legacy serializers and proof formats are unchanged.

## Presentation

List and detail pages identify candidate, generation/publication time, AI provider/model/run provenance and baseline/bootstrap status. Detail shows the captured product problem and every proposed section, including parent/child links and dependency traceability. Proposed item IDs remain distinct from real backlog IDs. Readiness observations are labelled AI commentary. Technical digests and source identities are available in expandable provenance details.

All model content is rendered as escaped text. There are no forms, editable controls, selection or approval actions. Unexpected physical DefinitionProposal rows using a candidate artifact ID are rejected until the later materialisation/selection ledger supports proving their state.

## Read-only boundary and prerequisites

Readers use PostgreSQL-enforced READ ONLY, REPEATABLE READ transactions. They do not call generation, guidance, recovery, backfill, persistent diff or invalidation services. Missing prerequisites fail closed with a content-free unavailable state.

No migration is introduced. Existing prerequisite baseline/pin/generation migrations and the existing protected proof configuration must be installed deliberately before runtime inspection against a persistent database is available. They remain unapplied to development in this checkpoint.

Later checkpoints must add materialisation, explicit selection/review ledgers and successor editing. They must extend the reader with verified managed-state/provenance support instead of replacing the immutable snapshot with a mutable selected proposal. Formal protected approvals, effective requirements application and coding authority remain separate work.
