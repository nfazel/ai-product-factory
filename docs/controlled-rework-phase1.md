# Controlled rework Phase 1 — activation with coding blocked

This is the narrow connection from a confirmed proposal and approved DevelopmentScope revision to explicitly authorised new tasks. It introduces no candidate workflow, requirements amendment, plan regeneration or automatic coding.

## Reused structures

DevelopmentScope/Revision/Event and protected scope approval remain the source of intent. FeatureFeedback and its signed confirmation remain the original source. The existing ImplementationPlan is retained, WorkItem identities are reused, fresh ImplementationTask rows are appended, and genuine human decisions use existing Approval rows. The existing configured AI provider may draft task specifications; it never approves them. No AgentRun is invented.

## Minimal persistence

- ReworkAmendment: immutable product/plan/scope-revision binding, complete original plan/task snapshot, original feedback/build/requirements context, server-reserved new task IDs/specifications and digest, idempotency information.
- ReworkEvent: append-only APPROVED/REJECTED amendment decisions and ACTIVATED receipts, protected operator provenance, existing Approval reference, purpose-separated signature, exact task IDs and authorised before/after context. At most one decision per amendment and one activation per scope revision.
- ReworkTaskBinding: small immutable task-to-amendment FK relation. It gives durable identity without adding scalar fields to existing signed task objects. This is a relationship table, not another lifecycle/ledger.

No legacy records are backfilled or re-signed. The original plan row, original task rows and their evidence are not updated. The historical approved membership is frozen in the amendment; appended tasks never inherit that approval.

## Services

`src/modules/rework/service.ts` provides internal server-only functions:

- draftReworkAmendment: exact approved scope revision plus plan, manual specifications or optional provider draft; reserves fresh IDs without creating tasks.
- decideReworkAmendment: separate protected human approval/rejection of the reviewed amendment digest; explicit unchanged-requirements acknowledgement.
- activateReworkAmendment: separate protected human operation and acceptance-impact acknowledgement; atomically creates only the approved PROPOSED tasks, dependencies/component links, immutable bindings and activation receipt.
- inspectReworkActivation: verifies original scope/feedback/decision proofs, exact actual tasks and authorised current context; returns ACTIVATED_CODING_BLOCKED, never runnable/completed.

No public endpoint, UI action, coding workspace or verification operation is introduced.

Phase 1 rejects requirement-change/new-feature classification, separate-feature scope, additional acceptance criteria, requirements requiring approval and unresolved questions. Tasks reference only existing approved-feature requirements/work items and existing same-plan dependencies/components. Human confirmation of unchanged requirements is mandatory; natural-language semantic equivalence is a human review responsibility, not an AI approval.

## Baseline transition and concurrency

Per-product advisory locking, serializable transactions, bounded serialization retries and unique keys protect concurrent decisions/activation. Identical retries return the same records; different inputs under the same key reject. Activation revalidates scope approval, original confirmation, build, feature, requirements, plan membership and task content.

Feedback/scope baselines include task IDs. Activation records exact before/after contexts and permits only the reserved task-ID addition. It does not rewrite old confirmations or relax their normal stale checks. Historical scope approval is consumed by this explicit transition; activation authority is separately verified against the authorised after-state. Unrelated changes reject. A post-creation failure rolls back tasks, links, approval and activation event together.

## Reject-only authority boundary

Managed identity comes from immutable reserved IDs and task-binding rows, never titles, client flags or mutable task metadata. Missing isolation schema/guards fails closed; broken or unavailable approval proof cannot turn a managed task into legacy work.

The shared guard covers legacy task approval/correction/start, coding readiness, execution-plan/code approval and changes, retry/repair/resume, validation-result recovery, contract regeneration, repository tools, external review/import, workspace insertion, and both runner preflight/direct execution. Product-wide recovery checks each workspace before mutation. Direct workspace and managed-task status mutations are also blocked by database triggers. No filesystem/provider execution occurs after a managed guard rejection.

Database constraints enforce exact task specifications and atomic task/binding/activation completion; managed tasks cannot be approved, deleted or rewritten through legacy paths. Existing legacy tasks remain compatible with installed guards. Original tasks are never reopened.

## Migration and validation

`20261101000000_controlled_rework_activation` creates three tables, indexes, restrictive FKs, immutable/binding triggers and reject-only task/workspace guards. It rewrites no existing data or proof bytes. Applied only to guarded disposable test databases. Development and production remain unapplied. Once this source is running, guarded coding/recovery intentionally refuses when the migration/guards are unavailable; do not use a missing-schema legacy fallback.

Validation: 79 distinct focused tests: 20 activation integration, 27 coding-boundary and 32 existing scope regression tests. Final activation checks rerun after proof/ownership hardening. TypeScript, Prisma validation, affected-file lint and diff checks passed. All 114 development-table fingerprints match; disposable databases/roles removed. Tests use restricted roles and providers imported only after isolation. Initial fixture/trigger issues were corrected; no development fixtures were created and no safeguard weakened.

Task 4 remains officially FAILED/FAIL; container verification remains disabled. No commit, push, deployment, production build or broad suite.

## Next boundary

These tasks are not runnable. Protected rework coding integration must replace the reject-only phase boundary atomically with positive validation of scope/amendment/activation/task content, bind existing human task/risk/execution-plan/code-review decisions, and enforce the same authority across execution, tools, retry and resumption. Existing verification must still pass before completion and renewed human acceptance. Membership changes can make prior acceptance no longer applicable under existing rules; no acceptance history is rewritten or bypassed.
