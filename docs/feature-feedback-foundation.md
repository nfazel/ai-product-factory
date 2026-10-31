# Feature feedback and proposal foundation (Task C)

Status: **Task C foundation validated; ready for Task D implementation.** The approved incident remediation is complete. All 26 focused Task C tests passed with guarded disposable-database isolation. No Build UI, coding integration or container capability was added.

The original failed-run evidence remains intact. Current remediation/validation receipts are in `.tmp/integration-review/feedback-remediation-20261030-1753/RESULT.md`. The prepared feedback migration is still unapplied to persistent development/production; apply it through the approved local migration process before a UI uses these tables.

## Domain API

`src/modules/feature-feedback` exports server-only operations:

- `submitFeedback({productId,featureId,originalText,credential,idempotencyKey})`: preserve the exact original text and initial feature/requirements/build snapshot.
- `getFeedback({productId,featureId,feedbackId})`: ordered immutable history and current proposal/confirmation state. Signed proof is excluded from the public projection. `confirmed` means currently authorised intent only; it grants no implementation, technical approval, verification or feature acceptance.
- `analyseFeedback({...scope,credential,idempotencyKey,expectedRevision,reviewedDigest})`: existing configured AI provider returns a structured interpretation, clarification or actionable proposal. It records provider/model/usage and exact current context. No new agent executor or tools are registered.
- `decideFeedback({...request,decision,text?})`: CONFIRM, REVISE, REJECT, CANCEL or RESPOND. REVISE/RESPOND preserve human text; analysis is a subsequent explicit operation. Confirmed/rejected/cancelled conversations are terminal; a follow-up starts a new feedback record.

All mutations reuse the protected local operator adapter and existing credential. Decisions use a separate HMAC purpose and never trust an actor supplied by the caller. Context/digest/revision checks and per-conversation advisory locks with serializable retries reject stale/conflicting operations; request keys support safe retries. AI runs outside database transactions and its output is committed only if both conversation and context remain current. Confirmation signs the exact proposal target and current feature context. Unknown/dirty configured implementation snapshots cannot be confirmed. A feature with no implementation repository can still receive an explicitly unimplemented intent proposal.

## Persistence and boundaries

Two additive tables, FeatureFeedback and FeatureFeedbackEvent, preserve the original submission, questions/responses, interpretations, proposal versions, requests for revision and human decisions. PostgreSQL guards reject update/delete/truncate, out-of-order events and cross-product/non-feature parents; reviewed parents are retained. No existing models/relationships or prior migrations are replaced. The prepared migration has **not** been applied to the persistent development database or any production database.

Requirements, feature scope, definition identity and application commit/tree/availability are captured separately from technical acceptance. Context reads reuse the raw feature manifest loader, never acceptance reconciliation. Submitting feedback therefore does not invalidate acceptance. Confirmed intent can become stale when its context changes; history is retained. Missing confirmation proof fails closed without rewriting it.

The fixed system prompt treats all supplied feedback, feature metadata and prior conversation as untrusted user data. Only scoped requirement IDs are permitted. NEW_FEATURE must recommend separate backlog scope. No proposal creates a WorkItem, execution plan, Coding Agent run, verification, acceptance or release event. Existing audit Activity records describe intent without changing work-item state. Task D must use protected server transport and display freshly loaded domain state after operations; a historical idempotent receipt alone is not current confirmation authority.

## Initial validation checkpoint (historical; superseded above)

Prisma validation, TypeScript and affected-file lint passed before checkpoint. Functional tests have **not passed**: the initial 26-test run used an accidentally early-initialised development Prisma client. It created 26 synthetic products, 26 synthetic feature work items and one synthetic FeatureReviewEvent, then failed because the new feedback tables correctly existed only in the disposable test database. The disposable database was removed.

The corrected harness now gates both Prisma and provider imports before module evaluation, rejects existing cached clients, and checks the exact disposable database and restricted role before every fixture write. The provider loads only after SQL identity verification. The 26 tests have now passed, and the disposable database and role were removed. The incident manifest confirms original data fingerprints match the previous audit when the exact new synthetic IDs are excluded; Task 4 remains FAILED/FAIL. The synthetic review event does not match the configured operator identity. Append-only protections remain enabled and no history was deleted.

Approved remediation archived only the 26 synthetic products and added 26 remediation audit entries. All work items and the original ACCEPTED event/actor were retained exactly. Original record fingerprints remained unchanged; all 112 development-table fingerprints matched before and after the isolated test run. TypeScript, Prisma validation and affected-file lint pass. AI behaviour tests use a deterministic provider double; live-model quality requires later evaluation. No conversational Build UI, previews, coding integration, rework automation or additional verification capability is included.

## Task D update — 2026-10-31

The earlier unapplied-development-migration statements describe the Task C checkpoint. The approved additive migration has now been applied only to the identity-verified local development database, following a recoverable backup and preservation checks. Production remains unmigrated. Task D's interface and protected transport are implemented; see `docs/feature-feedback-interface.md`. The focused domain set now has 31 passing tests, using the same guarded disposable isolation. Original incident receipts and immutable review history remain intact.
