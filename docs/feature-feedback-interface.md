# Conversational feature review (Task D)

Implemented 2026-10-31. Request Changes is available from the existing Build feature cards, including when technical verification has failed or cannot be observed. Archived feature histories are read-only. This is intent review, not implementation, technical approval or feature acceptance.

The client uses one protected server action and the existing Task C domain services/provider. It supports saved history with pagination, clarification, revision, exact-version confirmation with explicit acknowledgement, rejection/cancellation, and retry after provider failure without resubmitting the original feedback. The server derives operator identity; caller actor names are ignored. Credentials are password inputs, cleared immediately on submission, omitted from client state/history/DTOs, and never logged. Provider diagnostics are not returned to the browser.

Read-only domain additions provide scoped conversation lists and current/stale/unavailable proposal context. Existing signed decisions, version checks, isolation, serializable locks and idempotency remain authoritative. Confirmation never invokes coding, modifies approved requirements, creates backlog features or grants acceptance. Separate-feature proposals explain that a backlog item has not been created. New feedback does not reconcile or invalidate acceptance.

Build now handles the existing typed AuthorityUnavailableError as an unavailable technical observation, preserving access to feedback while existing acceptance checks continue to fail closed. Other errors still surface. No verification execution or release policy is changed.

The additive feedback migration was applied **only to the verified local development database** after Docker-aware identity checks and a fresh recoverable custom-format backup. Historical migration rows and all existing data/audit tables were preserved. Production was not migrated. See `.tmp/integration-review/task-d-20261031/RESULT.md` for receipts, backup reference and validation.

Validation: 31 guarded disposable-database domain tests and 40 focused rendering/action/availability tests passed. TypeScript, affected-file ESLint, Prisma validation and diff checks passed. A read-only browser smoke exercised Task 4's feedback panel and history reload/close; Accept Feature remained disabled. No live-provider generation or protected decision was submitted to persistent development data. The development server needed a restart to reload its pre-migration Prisma client; initial Build loading was slow while existing technical authority could not be observed.

Task 4 remains officially FAILED/FAIL. Container verification remains disabled. Task D is ready for Increment 3 planning; automated rework and Coding Agent integration are not implemented or authorised by proposal confirmation. Live-model quality evaluation remains separate from deterministic provider-double tests.
