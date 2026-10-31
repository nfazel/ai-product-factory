# Requirements context foundation (F1b-1)

This increment adds context resolution, prospective capture and write protection. It does not migrate downstream readers or grant technical, coding, acceptance or release authority. F1a's initial-only version/selection fences remain in force; requirements amendments remain disabled.

## Resolution

`resolveRequirementsContext(input, transaction?)` requires an explicit product and mode. Without a supplied transaction it uses a coherent Repeatable Read snapshot; with one, it uses only that transaction. Callers must preserve transactional consistency and revalidate applicability before writes.

- `CURRENT`: requires the exact effective baseline, signed F1a capture, stored membership, valid same-product lineage and exact live criterion IDs, owners and descriptions. Partial/conflicting/unsupported selections and drift fail closed.
- `HISTORICAL`: requires an exact immutable pin in the same product. It authenticates the original baseline membership and explicit criterion selection, independently of today's effective selection. Historical authenticity does not establish current applicability.
- `LEGACY`: positively establishes absence of all baseline, selection, lineage and pin markers before reading existing criteria. Missing tables, disabled integrity guards, unavailable keys and database failures never establish legacy status.

The resolver requires the full F1b-1 schema and enabled integrity guards, including origin replication mode. Reads do not initialise products. Unsupported future baseline versions fail closed until explicitly supported.

## Prospective pins and proof compatibility

`RequirementsContextPin` stores immutable product/baseline references, an allocated operation kind/ID, complete captured membership, explicit selected criterion IDs, a content digest and a server-signed proof. Its manifest is `REQUIREMENTS_CONTEXT_CAPTURE` version 1; its HMAC purpose is separate from human baseline approval. `grantsApproval` is always false. Explicit field selection preserves this format if unrelated schema fields are added later. Existing serializers, signatures and acceptance fingerprints are unchanged.

Capture accepts an expected baseline ID/digest and idempotency key. It allocates a new operation ID; callers cannot supply an existing operation ID. It creates no operation, work item or workspace. Database checks also reject backfilling an existing operation. Safe retries return the same receipt; conflicting key reuse is rejected.

`inspectRequirementsPin` separately reports CURRENT, STALE or UNAVAILABLE membership applicability. None is approval or permission to proceed. A temporary inability to establish authority writes no permanent invalidation.

F1b-2 must consume the allocated ID when creating the corresponding operation, atomically capture/revalidate the context, and check product, operation kind, exact ID and criterion selection on reads and authority decisions. No existing operation is retrospectively certified. Pins alone must never substitute for protected approvals. Products without a reliably provable historical context require fresh review.

## Write guards and concurrency

The additive migration installs database guards covering ordinary criterion INSERT/DELETE, identity/owner/description UPDATE and TRUNCATE. Versioned or partial product state blocks these writes. Criterion status/timestamp changes that preserve meaning remain possible. Criterion-owning work items and their ancestors are protected against identity, product, hierarchy, type and requirement-meaning changes; operational fields such as status/reference code retain existing behaviour. Other requirement-type amendment semantics are not introduced.

The existing criterion insertion and requirements proposal-commit services also perform an early authoritative preflight. Existing human/accepted/locked replacement protections remain intact. Database guards cover direct and other server writers. These guards intentionally restrict initialised products until F1c; truly legacy products retain existing semantics once schema availability is established.

Initialisation, metadata/pin insertion and membership-changing ordinary writes use the same per-product transactional advisory lock. Initialisation uses Read Committed so observations made after waiting for that lock see committed writes. It first verifies installation of all guards. There is no mutation bypass or future-amendment switch.

## Deployment and validation boundary

The migration is source only: one additive pin table plus integrity functions/triggers and no data rewrite. Apply the complete migration sequence only through the separately authorised identity-checked, recoverable-backup process. No development migration was performed for this increment. Guarded writer services deliberately fail closed against an incomplete schema, rather than silently falling back to legacy reads.

Focused tests use separately named disposable databases and restricted roles, with connection/provider import guards before fixtures. They cover resolution, partial schema/state, proof/lineage integrity, cross-product rejection, exact prospective capture, immutable history, concurrent retries and initialisation/writer locking, safe legacy/status writes, protected meaning and unchanged legacy signatures/fingerprints. No downstream reader integration or new verification authority is enabled.
