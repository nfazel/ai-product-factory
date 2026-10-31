# F1a — Initial requirements baseline foundation

This checkpoint captures criterion membership only. Existing requirements readers, approval gates, coding, verification, acceptance and release behaviour are unchanged. No initialisation is called on startup or ordinary reads. No amendment, successor-criterion creation service, baseline advance, public endpoint or UI is enabled.

## Persistence

- `RequirementsBaseline`: deterministic identity, product, version, canonical membership manifest/digest, creation time and immutable provenance.
- `RequirementsBaselineMember`: exact criterion ID, owner WorkItem ID and description snapshot. Restrictive references retain the original criterion IDs used by verification. Descriptions are never copied over existing criterion rows.
- `CriterionLineage`: immutable criterion/root/predecessor identity and generation. Roots refer to themselves. A successor must follow the immediately preceding generation within the same product and owner. Uniqueness prevents forks and duplicate generations; strict generation ordering prevents cycles. No service creates successors in F1a. Direct database tests of lineage metadata do not authorise its membership.
- `RequirementsBaselineSelection`: immutable, signed selection/initialisation event. The latest selection represents the effective baseline; a historical lookup selects its exact baseline ID. In F1a, database fences allow only baseline version one and selection sequence one. There is no advance operation. Future activation requires a separately reviewed migration and application authority, rather than editing this history.

All four tables reject update/delete/truncate. Membership inserts must exactly match the unsealed manifest, live owned criterion and root lineage. Sealing checks exact, duplicate-free, complete membership of the existing product criterion set. Membership cannot be appended after selection. Composite/foreign keys protect product association and referenced history. The migration creates no approval and does not backfill any product.

## Explicit existing-data capture

Server-only API: `src/modules/requirements-baseline`.

1. `previewRequirementsInitialisation(productId)` computes the exact deterministic membership digest and reports inconsistent existing records. It performs no writes.
2. `initialiseRequirementsBaseline({productId,expectedDigest,credential,idempotencyKey})` requires existing protected operator confirmation. Under serializable/per-product advisory locking it revalidates the digest, captures roots/membership/provenance, seals the selection and appends one audit Activity atomically. Duplicate/concurrent requests return the same result without another audit event. Partial or unsealed records are rejected, never automatically repaired.
3. `inspectRequirementsBaseline(productId)` provides diagnostic UNINITIALISED/INITIALISED/DRIFTED/INCONSISTENT/UNAVAILABLE state. It is not an authoritative current-requirements resolver or a fallback for legacy readers.
4. `getHistoricalRequirementsBaseline(productId,baselineId)` returns only the exact immutable captured snapshot, never a union with live criteria.

Initialisation leaves all existing criterion IDs, values, statuses, owners, approvals and verification references untouched. Test-result status and timestamps are captured as provenance, excluded from membership content/digest, and remain usable by existing status-update services. Record order does not affect the digest. Empty or inconsistent criterion content, ownership, unsealed fragments and a definition claiming approval without recorded authority fail closed.

Provenance preserves observed definition and original approval records/actors as **unversioned legacy evidence**. These JSON observations are not new Approval rows or human decisions. The capture is explicitly `grantsApproval:false`; its separate signing purpose attests to the capture, not approval of the membership or historical requirements. It does not claim that an old approval bound an exact historical criterion version. Products without recorded approval can be captured without creating or asserting one; inconsistent APPROVED flags are rejected.

A live description/ownership/membership change results in DRIFTED diagnostics; it does not silently replace or approve the captured snapshot. Test-status changes alone do not change membership. Observation or configured-operator-proof failure returns unavailable without rewriting history. Operator key rotation/re-attestation needs a future controlled process; F1a never silently re-signs an existing capture.

## Compatibility and F1b prerequisites

No existing reader imports this module. Legacy reads behave as before, including while a product has no capture. New registration is explicit only. Capture snapshots are immutable even if legacy live data later drifts; F1b must use the snapshot for historical resolution and detect drift before trusting a current baseline.

F1b must introduce coordinated current/historical resolution across requirements/feature views, planning, coding preparation, verification/runtime review, feature acceptance and release. Legacy fallback is safe only where there is no initialised or partial versioned state and existing authority checks remain satisfied. DRIFTED/INCONSISTENT/UNAVAILABLE or unsupported versioned state must fail closed; never union current and historical criteria or select an older baseline as an implicit fallback. Recorded initialisation does not replace requirements approval. Future verification operations need explicit baseline binding; no historical session was retroactively pinned or approved here.

F1c remains disabled. It must introduce separately approved successor baselines, immutable application events and fresh requirements/proposal/scope authority before any advance is enabled. F1a version/sequence fences must not be removed independently of those controls and reader integration.

## Validation and migration

31 focused cases pass: 28 PostgreSQL integration tests and 3 canonical-manifest tests. Coverage includes exact snapshots, digest stability, original approval attribution, unapproved/inconsistent data, protected identity, concurrent/retried capture, stale expectations, independent test status, immutable and incomplete records, lineage ownership/forks/generations, injected rollback, historical references and unchanged existing authority rows. TypeScript, affected-file ESLint, Prisma validation and diff checks pass.

The test harness gates Prisma before module evaluation, verifies a uniquely named disposable database and restricted role before fixtures, and rejects any AI-provider import. Only maintenance administration creates/drops the random test database/role on the pinned approved local PostgreSQL instance; application queries and migrations receive the restricted role. All resources were removed. Controlled feature-review fixtures are test data, not official independent verification evidence.

Migration `20261031160000_requirements_baseline_foundation` is additive and tested only in disposable databases. It remains unapplied to persistent development/production. Future development application requires verified database identity and a recoverable backup. Generated Prisma client changes remain ignored. All 114 development-table fingerprints match before/after tests; original audit history and Task 4 FAILED/FAIL are unchanged. Container verification stays disabled.

Receipts: `.tmp/integration-review/task-f1a-20261031/`. No commits, deployment, production migration or F1b/F1c/F2/F3/G implementation occurred.
