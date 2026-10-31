# Requirements planning authority primitives — F1b-2b-1

This checkpoint adds dormant server-side primitives only. Generation, recommits, approval actions, generic approval resolution, existing readiness gates and coding/verification/acceptance/release authority are unchanged. There are no new endpoints or agent tools. No development migration or automatic baseline initialisation is performed.

## Purpose-specific v2 pins

`capturePlanningArtifactPin` supports DefinitionProposal, SolutionArchitecture and ImplementationPlan creation. It allocates a new operation identity, captures the explicitly initialised current requirements baseline and complete membership, and binds a canonical proposed artifact snapshot, revision and digest. It creates no artifact or Approval. The input cannot select an existing operation ID. The creation-purpose pin is not an approval-purpose pin.

`capturePlanningApprovalPin` captures today's exact ProductDefinition, SolutionArchitecture or ImplementationPlan content as a **fresh review operation**. Its allocated operation ID is for a future Approval, not a generation backfill on the existing target. DefinitionProposal item selection is not introduced as a separate formal approval type. Capture requires the expected baseline ID/digest and target revision/digest; mismatch fails closed.

V2 manifests bind exact product, operation kind/ID, target kind/ID/revision/content, intended purpose, baseline identity/digest/selection, member IDs/owners/descriptions, and immutable server creation provenance. `grantsApproval` remains false. V2 uses a separate HMAC purpose. The v1 serializer/proof code remains byte-identical; its reader only gains explicit v2 dispatch. A v1 membership pin cannot satisfy the new approval-receipt API.

`planningSnapshot` is an explicit new-format semantic projection. Root workflow status/approval time, database timestamps/reference codes and operational task status are excluded; existing workflow status remains an independent control. Typed relation ordering is deterministic. User JSON payload fields remain exact, including keys resembling timestamps. Owned child identities/content are included; redundant child references to the not-yet-allocated root are omitted because the outer manifest binds that root and the loader selects children through its ownership relation. Upstream IDs and task/dependency membership remain captured. Future publication must preallocate child IDs and create exactly the captured content using the returned root identity.

`readPlanningPin` authenticates the immutable capture. `inspectPlanningPin` separately checks current baseline and actual artifact revision: CURRENT, STALE, UNCONSUMED or UNAVAILABLE. None grants approval. The older generic membership-only probe must not be used as full artifact or approval eligibility.

## Protected receipts within the existing approval workflow

`RequirementsApprovalReceipt` is an append-only sidecar of an existing Approval and its prospective approval-purpose pin. It is not a parallel approval status system. Receipts retain an explicit versioned snapshot of the exact target and pin, decision/time, server-derived protected operator identity, existing Approval identity/type/status/actor/timestamps/comments, digests and idempotency provenance. The proof purpose is distinct from pin, feature-review, scope and legacy signatures.

`appendRequirementsApprovalReceipt(input, transaction)` requires protected operator confirmation through the established adapter, an explicit **Serializable** transaction and an already resolved matching Approval created in that same transaction. The primitive neither creates nor resolves Approval and never transitions an artifact. It checks prospective pin identity/purpose, exact current baseline and target content, protected principal and decision. Database transaction identity plus fresh request time prevent attaching receipts to previously committed decisions, even if those decisions had prospective pins. The future workflow must explicitly set request/resolution timestamps using the same fresh operation and roll back everything on failure.

The receipt requires the allocated Approval ID, so existing historical approval IDs cannot be selected or retroactively certified. Names supplied by callers are rejected, not treated as authority. Credentials and encoded variants are prohibited in captured data; no credential is stored, logged or returned.

Idempotent retries with identical content/principal return the original authenticated receipt without rewriting it. Conflicting nonce reuse is rejected. Unique constraints prevent multiple receipts for one pin/Approval and conflicting decisions for the same exact product/target revision/baseline. This is deliberately conservative: reconsideration of an unchanged version is not an implicit override operation in this foundation. Future workflow integration must check existing receipts before attempting to recreate their Approval rows.

`readRequirementsApprovalReceipt` verifies historical authenticity independently of today's target. `inspectRequirementsApprovalReceipt` reports CURRENT, STALE or UNAVAILABLE without writes. CURRENT means the captured decision/content binding still matches; callers must inspect the decision (APPROVED versus REJECTED) and all existing eligibility controls. It grants no coding authority. Changes make current use stale; temporary key/schema/authority failure never appends invalidation or rewrites history.

## Persistence and integrity

Migration `20261031193000_requirements_approval_receipts` adds one receipt table, restrictive pin/Approval foreign keys, unique conflict/idempotency constraints, format/binding checks and update/delete/truncate rejection triggers. Insert guards enforce same-product pin/Approval/target/purpose/baseline bindings and fresh same-transaction Approval provenance. Application verification additionally authenticates HMACs, exact normalized content and protected principal.

The migration atomically extends the existing pin CHECK and capture trigger inside BEGIN/COMMIT, preserving the exact v1 CHECK branch and occupied-operation rejection. It does not update/delete existing data, change existing signed scalar fields or alter baseline/lineage initial-only fences. New inverse Prisma relations add no columns to existing Approval/pin records. No historical approvals or proofs are migrated/re-signed. The migration was applied only to disposable databases and remains unapplied to development.

## Validation and limits

62 distinct focused tests passed: 28 receipt/pin tests, 31 existing context/guard/legacy-proof tests and 3 manifest tests. Coverage includes purpose/target/version/product isolation; explicit initialisation; all supported target families; protected confirmation/spoof rejection; stale content; proof-key loss; immutable history; same-transaction freshness; insufficient isolation rejection; concurrent conflict/rollback and safe retries; non-empty prospective graphs; preserved exact user JSON; and an existing signed v1 row surviving the CHECK extension in an isolated temporary-table fixture. No workflow, coding workspace or implementation task is created by pin capture; tests simulate the original Approval write only in disposable transactions.

The new harness retains connection/provider-before-isolation guards, a disposable named database, NOSUPERUSER/NOCREATEDB/NOCREATEROLE role with six-connection limit and four-connection client pool, bounded migration execution and unconditional resource cleanup. TypeScript, affected-file lint, Prisma validation and diff checks passed. Initial migration CASE syntax and the first upgrade-test fixture were corrected during validation; final tests pass with no skips. No broad suite, production build or official Task 4 verification was run.

Read-only pre/post audit: all 114 development table fingerprints unchanged; original approval/verification/incident records preserved; zero disposable databases/roles remain. Task 4 is officially FAILED/FAIL, stale=false. Container verification remains disabled. Evidence is under `.tmp/integration-review/f1b2b1-20261031/` and excluded from source.

## Prerequisites for subsequent checkpoints

F1b-2b-2 must publish new artifacts using the allocated root and preallocated child IDs, exact normalized snapshots, atomic pin/artifact creation and post-AI baseline/upstream-context revalidation. Graph-replacing recommits need fresh identities and retained original graphs/tasks; approved overwrite fences remain. No requirements amendments are enabled.

F1b-2b-3 must add protected exact-target review actions and the original Approval resolution plus receipt append in one Serializable transaction; reject generic status/actor-name bypasses; consume exact decision/purpose/context and all original planning gates. Upstream authority and domain graph eligibility remain separate from snapshot authenticity. There is no automatic activation of these primitives. A current receipt snapshot is not an execution lease: later consequential operations must revalidate their own authority atomically.

Coding runners/recovery/tools/import, verification and release consumers remain later checkpoints. The current foundation alone must not be advertised as integrated requirements-bound approval or execution.
