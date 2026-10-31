# Generation reservation and sealing foundation — F1b-2b-2a

This is a dormant server-side foundation. No existing generation entry point, draft persistence method, candidate selector, approval action, coding or verification workflow calls it. Publication means an immutable **snapshot seal** in the new ledger, not a live proposal/graph, selected draft, approved plan or completed feature. It does not attest that an AI provider actually executed. Later orchestration must associate real generation/run evidence.

## Contracts

`reservePlanningGeneration` accepts exact product/purpose, mode, input identity, JSON input snapshot/digest and idempotency key. BASELINE_BOUND also requires expected current baseline ID/digest. Identity is allocated server-side: operation UUID, fresh artifact UUID, and monotonically reserved root version for SolutionArchitecture/ImplementationPlan. Root allocation considers both existing artifacts and prior reservations; failed operations can leave version gaps. Callers cannot supply or repin an operation/artifact ID.

Purposes cover definition proposals, architecture proposals, plan proposals, architecture materialisation and plan materialisation. The two proposal purposes mapping to ArchitectureProposal retain their ARCHITECTURE versus IMPLEMENTATION_PLAN subtype distinction. Purpose is not permission to generate, commit or approve: existing workflow gates are not integrated here.

BASELINE_BOUND reservation uses the authoritative CURRENT resolver, then creates a purpose-specific v3 generation-input pin and PlanningGeneration atomically. The pin binds the original exact baseline/membership, operation, reserved artifact identity/version, input identity/digest and generation purpose. The signed immutable generation manifest retains the input snapshot and pin digest. Creation provenance is server-HMAC protected, not caller-supplied human identity or a human approval.

`readPlanningGeneration` authenticates the original input and pin without replacing it with today's criteria. `readGenerationInputPin` integrates with the existing HISTORICAL resolver through explicit v3 dispatch. V1 algorithms/bytes and existing serializers are unchanged; v2 gains finite ArchitectureProposal creation support. ArchitectureProposal and generation-input pins cannot be used as formal protected approval decisions.

## UNBOUND_BOOTSTRAP

The mode is permitted only for initial DefinitionProposal generation. It first positively establishes LEGACY through the existing resolver and verifies the full foundation schema/guards. The product must not be archived, must be in DEFINE, and have no materialised definition/backlog/architecture/plan records or approved definition authority. A ProductDefinition record may exist only in NOT_STARTED. Supplied intake/brief input is allowed.

No baseline, requirements-context pin, approval or effective requirements are created. The generation/publication have null baseline/pin fields and explicit immutable UNBOUND_BOOTSTRAP provenance. Multiple prospective attempts may be retained, but only one initial bootstrap publication is permitted per product. This conservative foundation does not authorise a subsequent unbound editing/regeneration lifecycle after publication.

Eligibility is rechecked at publication: baseline establishment, partial versioned state, changed initial definition state or another bootstrap publication blocks it. Matching retries must still satisfy current applicability. Historical read APIs retain the original unbound evidence after baseline initialisation, without converting or backfilling it. No empty baseline is automatically initialised.

## Final sealing

`publishPlanningGeneration` requires the exact generation ID/digest, purpose, artifact identity, original input identity/digest, final JSON snapshot and expected normalized content revision/digest. It rejects identity substitutions, reserved-version changes and proposal subtype confusion. It verifies the signed reservation/input context and re-resolves current applicability under the same per-product transactional lock used by baseline initialisation and protected membership writes.

The private final-pin factory consumes only that authenticated reservation and its reserved artifact ID. It rejects an already-existing artifact/version and creates a v2 **creation-purpose** artifact pin for BASELINE_BOUND publication. There is no public arbitrary-ID/repin option. Final pin and PlanningPublication are inserted in one transaction; a failure rolls back both. Bootstrap publication has no final pin.

Publication retains the complete normalized immutable artifact snapshot, revision/digest, generation/input identities, baseline/pin references, signed creation time and explicit `grantsApproval:false`. Exact retries return the existing verified seal; changed content/input/identity or conflicting keys are rejected. Concurrent seals use product locks and unique operation/artifact/pin constraints. Independent operations do not become selected by publication.

`readPlanningPublication` verifies the original seal, generation and final pin independently of present applicability. No read appends invalidation or rewrites history. A key/schema/proof failure fails closed. Capture is not source-domain validation: future integration must construct validated, sanitised inputs and complete canonical artifact snapshots, including defaults/child IDs, and verify upstream domain ownership/authority.

## Persistence / migration

`PlanningGeneration` and `PlanningPublication` are additive immutable models with restrictive product/baseline/pin/generation foreign keys, operation/artifact/nonce uniqueness and reserved root-version constraints. A partial unique index permits one initial bootstrap publication. Database INSERT guards bind mode, purpose, product, identity, input context and final pin; UPDATE/DELETE/TRUNCATE guards preserve records. Server verification additionally authenticates HMACs and canonical digests.

Migration `20261031210000_planning_generation_foundation` atomically creates the tables and guards and extends the pin CHECK/capture function for v3 input pins and finite v2 ArchitectureProposal creation. Existing v1/v2 branches remain supported; no existing rows, signed scalar fields or proof bytes are rewritten. Only inverse relations are added to existing Prisma models.

Migration reviewed and applied **only to guarded disposable databases**. It remains unapplied to development. No startup/read-time initialisation or backfill is added. Existing artifact table writers do not yet honour reservations; future materialisation must recheck occupied IDs/versions and fail closed, not silently renumber or replace work.

## Validation

85 focused tests passed: 23 generation/sealing tests, 28 protected pin/receipt tests, 31 context/guard/legacy-proof tests and 3 manifest tests. They cover supported purposes, positive legacy/schema checks, strict bootstrap eligibility and races, input/content/identity mismatches, immutable records, root version allocation, retries/concurrent conflicting seals, cross-product rejection, purpose isolation from approvals, key loss and legacy serializers. A controlled successor-context double tests baseline-bound staleness because F1c's baseline amendments remain disabled; no real approval/baseline history was fabricated or changed. Actual bootstrap-to-initial-baseline transition is also tested in the disposable database.

The first generation run failed closed because the new migration initially omitted replacement of the existing pin capture function. The corrected migration and final focused run pass. The harness establishes database identity before client/provider access, uses restricted disposable roles/databases and cleans all resources. TypeScript, Prisma validation, affected-file lint and diff checks passed. No broad suite, production build, provider execution or official Task 4 verification ran.

Pre/post read-only audit: all 114 development table fingerprints unchanged, original approvals/verification/incident history preserved, zero disposable databases/roles remaining. Task 4 is officially FAILED/FAIL, stale=false. Container verification remains disabled. Evidence: `.tmp/integration-review/f1b2b2a-20261031/` (excluded from source).

## Next integration boundaries

F1b-2b-2b must reserve before provider calls, generate only from the authenticated saved input, use fresh revision identities, validate real outputs, build complete canonical snapshots and publish against the exact returned AgentRun/context with post-provider revalidation. Input/pin capture alone is not proof of model execution or approved source-domain authority.

Later graph persistence must materialise exactly the sealed IDs/content and retain old graphs/tasks, enforce reservation-aware versions and immutable candidate ownership, and implement candidate isolation. None of that occurs here. Protected approval actions/receipts remain F1b-2b-3; no automatic approvals, coding, verification or release follow sealing. If bootstrap review needs further unbound revisions, that lifecycle must be explicitly designed rather than bypassing this initial-only guard.
