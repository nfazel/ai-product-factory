# F1a checkpoint — 2026-10-31

Initial requirements baseline and criterion-lineage foundation implemented. See `docs/requirements-baseline-foundation.md` and `.tmp/integration-review/task-f1a-20261031/RESULT.md`.

Four immutable models capture exact criterion membership, secure product/owner lineage, provenance and an initial effective selection. Explicit protected operator initialisation is deterministic, transactional and idempotent, creates no Approval, and never modifies existing criteria/status/ownership or historical references. Existing readers are unchanged. No startup/read-time initialisation, amendments, baseline advancement, work creation, coding, verification or acceptance authority is introduced.

31 focused tests pass (28 guarded disposable PostgreSQL, 3 pure digest). TypeScript, affected lint and Prisma validation pass. All 114 development-table fingerprints match; test database/role removed. Task 4 remains FAILED/FAIL, stale=false; container verification disabled. Migration reviewed additive and tested only in disposable databases; not applied to development/production. No commit/push/deploy or production migration.

Ready for F1b after review: integrate explicit current/historical resolution and baseline binding, with fail-closed drift/partial/unavailable handling and no historical/current union. F1c approval/application remains disabled. Membership capture is not historical approval; legacy approval observations remain separately attributed provenance. Persistent use requires the approved identity/backup migration procedure.
