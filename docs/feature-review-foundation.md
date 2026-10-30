# Human Feature Acceptance — Task A foundation

This module records business acceptance of a complete FEATURE. It does not replace code approval, independent technical verification, runtime review or release approval. Task A registers no browser endpoint, changes no Build/release UI or governance, and starts no development or feedback automation.

## Domain entry points

- `getFeatureReview(productId, featureId)`: inspect the canonical manifest, eligibility blockers, concerns and immutable history. Reconciles detected stale acceptances by appending invalidation events.
- `recordFeatureReview(...)`: ACCEPTED or DEFERRED decision, exact reviewed digest, unique idempotency key, optional reason and exact concern IDs. The server requires the existing operator credential and derives the operator principal itself. No actor name or eligibility flag from the caller grants authority.
- `archiveReviewedFeature(...)`: protected, idempotent ledger archival. Original work-item/task states and history remain intact; archived reviews are read-only. No restore operation is introduced in Task A.

Formal acceptance requires current approved requirements; complete explicit feature/story/task scope; all associated tasks' current independently approved verification at the configured application's exact clean commit/tree; feature criterion coverage; and passed mandatory technical/security controls. Coding/runtime/preservation checks are reused. Evidence and authority are bound through existing v2 verification fingerprints and runtime review, not a parallel technical approval system. Old passing/legacy or supplemental test results cannot substitute.

The manifest includes repository/application identity, hierarchy and requirements, current approved task membership, verification/evidence/approval identities and non-blocking concerns. Whole-build binding is conservative: unrelated source changes also require renewed acceptance. Artifact identity recorded in technical evidence is covered by that evidence fingerprint. No Android/iOS-specific rules or new native verification capability is added; future platform verification must supply the same authoritative version/evidence contract.

PASS_WITH_CONCERNS is eligible only after mandatory controls pass; every returned concern ID must be acknowledged exactly. Deferral needs no passing verification, does not change task/product development status and cannot withdraw an existing acceptance. It is scoped to its feature. Archived records remain readable.

## Protected local operator path

From this framework checkout:

```sh
node --conditions=react-server --import tsx scripts/feature-review.ts inspect PRODUCT_ID FEATURE_ID
node --conditions=react-server --import tsx scripts/feature-review.ts accept PRODUCT_ID FEATURE_ID REVIEWED_DIGEST IDEMPOTENCY_KEY '["exact-concern-id"]' 'Optional review comment'
node --conditions=react-server --import tsx scripts/feature-review.ts defer PRODUCT_ID FEATURE_ID REVIEWED_DIGEST IDEMPOTENCY_KEY '[]' 'Review later'
node --conditions=react-server --import tsx scripts/feature-review.ts archive PRODUCT_ID FEATURE_ID
```

Accept/defer/archive read the existing `EXTERNAL_REVIEW_APPROVAL_KEY` credential privately from stdin, never arguments. Use your existing secure local secret workflow; do not paste it into comments or store it in browser state. No new persistent credential is added. Missing/wrong credentials fail closed. Local confirmation, principal verification and domain-separated signing are isolated in `authorization.ts` for replacement by reviewed authenticated-user authorization later. Do not expose these operations through the generic approval resolver or an unauthenticated HTTP wrapper.

Human decisions are signed over their exact manifest digest, decision, server-derived principal, concern acknowledgements, idempotency request and timestamp. Authority is rechecked before signing if configuration changes during loading. Secrets and common encoded operator-credential forms are rejected in review data. Signatures are not included in the public read projection.

## Persistence and retention

The additive migration creates FeatureReviewEvent and relations/indexes only; existing WorkItem scalar fields and prior approval/evidence models are unchanged. ACCEPTED, DEFERRED, INVALIDATED and ARCHIVED are append-only ledger events. Database triggers reject UPDATE, DELETE and TRUNCATE; foreign keys retain reviewed feature/product parents; a database guard verifies FEATURE/product ownership and invalidation target identity. A sequence supplies stable ordering independently of millisecond timestamps. System idempotency namespaces are reserved.

Manifest/evidence/authority changes or revoked operator proof append terminal invalidation. Restoring old content does not revive a detected invalidation. Fresh acceptance appends a new decision; old snapshots and signatures remain intact. Request idempotency and per-feature advisory locking/serializable retries protect duplicate and concurrent decisions. The unique invalidation target prevents duplicate invalidation. Database administrators remain outside the application trust boundary and must preserve the append-only protections.

The migration has been tested only in disposable local databases. Apply it through the normal approved development/deployment migration process before using the new module against a persistent database. No production migration was executed by Task A.

## Task B handoff

Wire the Build feature-review UI and protected confirmation transport to these services. Readiness must be loaded server-side, and acceptance must submit the exact inspected digest and concerns. Display task verification separately from feature criterion coverage. Add release creation/refresh/approval gates using fresh `getFeatureReview` state and acceptance IDs/digests in release fingerprints; never infer acceptance from historical ACCEPTED rows alone. Surface archive-instead-of-delete messages for retained parents. These UI and release changes are intentionally not implemented here.

Task 4 remains subject to unfinished verification/security prerequisites and its genuine official workflow. No Task 4 review, acceptance, technical approval or completion evidence was manufactured by this foundation. Container verification remains disabled.

## Task B integration — 2026-10-30

This section supersedes the Task B handoff and migration status above, while retaining the original Task A checkpoint description.

The prepared `20261030150000_feature_review_foundation` migration was reviewed and applied to the confirmed loopback **development** database only. It creates the review ledger and its guards; it does not rewrite existing application or audit records. All eight existing audit-table count/content fingerprints matched immediately before and after migration. No production migration was run.

Build now renders stable feature IDs, the feature's plain-English value, requirements (with pending approval identified), implementation commit, independent verification status, concerns, and immutable review history. Historical decisions expose their own version/digest. Technical details are collapsed separately. Features remain inspectable before verification. Accept Feature requires current domain eligibility and explicit acknowledgement of every concern; Review Later uses the existing non-blocking deferral operation.

The protected server action accepts only a same-origin HTTPS request or loopback HTTP origin and calls the existing operator-confirmed domain service. It never accepts a caller-supplied identity. The password input is cleared at submission, excluded from client idempotency state, and never returned or logged by this action. No browser credential/session storage, additional identity service, or generic approval-resolver exception was added. Exact digests, concern IDs and idempotency are rechecked server-side; a replay of an old decision is not presented as current acceptance.

Release creation, refresh and approval require current acceptance for **every complete included feature**. Features explicitly assigned to the approved slice (including through an epic/story) remain included even if they have no tasks. Partial features, unmapped tasks, missing/deferred/stale acceptance and changed candidate membership block release; no included feature is silently removed. Acceptance event IDs, canonical digests, implementation commits and task membership enter the release fingerprint and generated human-approval evidence references. Existing technical/risk/deployment checks remain in place. Deployment recording and the Ship gate also reject unavailable or invalid feature acceptance.

Read-only runtime/preservation observation now distinguishes CURRENT, CHANGED and UNAVAILABLE. Confirmed source/scope/evidence/authority changes still append terminal invalidation. Transient database/Git/configuration observation failures block acceptance/release while preserving the existing decision; recovering the unchanged version restores eligibility without manufacturing a new acceptance. Database lookup failures are no longer swallowed as evidence of missing signed approval. Temporary release unavailability preserves the candidate's evidence and original approval state. Existing unrelated governance holds are not cleared by acceptance recovery.

No container capability was enabled and no official Task 4 verification was executed. Trusted verification-source changes require a fresh runtime/behaviour review before later verification. Task 4's actual latest official result remains FAIL and the real feature-review service rejects acceptance. No human review records were created for Find a Friend.

Focused validation: 136 distinct tests across 12 affected test files pass, including the disposable PostgreSQL ledger, release-operation/recovery boundaries, UI rendering/actions and authority/preservation checks. TypeScript and affected-file lint pass. Full suites, production builds and browser interaction testing were not run. Evidence and the continuation checklist are in `.tmp/integration-review/FEATURE-ACCEPTANCE-TASK-B-CHECKPOINT-2026-10-30.md`.

A non-blocking pg@9 compatibility deprecation was observed during the successful real-domain inspection and is recorded in the checkpoint for a future adapter/driver review. Current validation uses the existing installed driver; no dependency or execution architecture change was introduced.
