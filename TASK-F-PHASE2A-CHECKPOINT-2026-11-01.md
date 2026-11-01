# Task F Phase 2a — Protected task coding decision

Base: `e5975ae6369778ea3bdd8136999b9d39987fc104`. Uncommitted foundation only; managed tasks are not executable.

## Contract

`getReworkTaskCodingReview(productId, taskId)` supplies the exact immutable review target and digest. It verifies the activated task specification, approved scope and amendment, source feedback authority, activation and current requirements/build context, including only the authorised membership delta.

`approveImplementationTask(productId, taskId, { reworkApproval: { credential, idempotencyKey, reviewedDigest, amendmentId, scopeRevisionId } })` delegates to the protected managed-task service. Actor names and caller-supplied Approval references do not establish authority. The existing local operator adapter derives identity. A genuine existing-model `Approval` and signed, append-only, task-specific `ReworkEvent` record the decision atomically; exact retries are idempotent and concurrent decisions serialize.

`inspectReworkTaskCodingApproval` re-establishes current validity and returns `CODING_APPROVED_EXECUTION_BLOCKED`. Stale/unavailable authority throws without rewriting history. Both the signed decision and inspection explicitly deny execution authority.

**The task remains PROPOSED and byte-for-byte unchanged.** No workspace, execution plan, AgentRun, code review, verification or acceptance is created. The existing generic server action cannot supply this protected decision and continues to reject managed tasks. Ordinary-task approval follows its unchanged path.

## Persistence

Source migration: `20261102000000_rework_task_coding_decision`.

Adds only an optional exact task FK on ReworkEvent and the inverse Prisma relation. Extends the event CHECK for a version-2 TASK_CODING_APPROVED decision, preserves version-1 amendment/activation proof bytes and decisions, retains original uniqueness through a partial index and adds task-specific uniqueness. An insert guard verifies product, task/specification, scope, amendment approval, activation, context and Approval linkage. Existing immutable-history and task/workspace rejection guards remain unchanged.

Migration review found no record updates/deletes, table drops or destructive data changes. Constraint/index replacement preserves restrictions for existing events. The migration remains unapplied to development and production. Schema setup was exercised only in the guarded disposable test database.

## Validation

66 focused tests passed: 39 rework integration tests (20 existing, 19 Phase 2a) plus 27 guard-boundary tests. Coverage includes protected identity, forged references/signatures, exact scope/task/amendment/digest binding, stale requirements/build/authority, concurrency/retries, task isolation, immutable history, V1 compatibility, unchanged legacy approval and continued service/database execution denial.

The first focused run exposed two fixture assertions requiring scoped counts/deterministic ordering, and TypeScript caught a JSON fixture type; these were corrected. Final focused tests, TypeScript, Prisma validation, affected-file lint and diff checks passed. No broad regression suite or production build was run.

Tests connected only to a uniquely named disposable database as a restricted non-superuser/non-CREATEDB role. Provider and Prisma initialisation remain guarded until isolation is verified. Read-only before/after audits matched all 114 development-table fingerprints exactly. No disposable test databases or roles remain; incident records/history are preserved. Task 4 remains FAILED/FAIL, stale=false; container verification remains disabled.

Evidence and file hashes: `.tmp/integration-review/task-f-phase2a-20261101/`. Audit snapshots: `.tmp/integration-review/f1b2b2a-20261031/task-f-phase2a-before.json` and `task-f-phase2a-after.json`.

## Remaining boundary

No positive execution gate is implemented. A later checkpoint must consume the protected decision together with existing coding governance, bind workspace/base and permitted task transitions, and coordinate database/service guards before permitting execution. Managed execution-plan self-approval/autoContinue must not be exposed: exact protected execution-plan approval is still required before implementation. Tools, retries, recovery and resumption stay reject-only until individually covered. Existing code-review, independent verification, acceptance and release controls remain required; this checkpoint grants none of them.

No development migration, commit, push, deployment or container enablement was performed.
