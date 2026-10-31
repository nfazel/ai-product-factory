# Task F Phase 1 checkpoint — 2026-10-31

Base: `6200b20592d14174af940b05a41ab6f01d417b21`. Uncommitted activation-with-coding-blocked implementation.

Added narrow immutable rework amendment and decision/activation events plus a typed task-binding relation. Existing scope, feature/story, plan, task and Approval structures are reused. No general candidate/planning integration. No effective requirements writes or completed-task reopening.

Durable managed identity is blocked at legacy approval, coding entry, runner execution, tools, retry/repair/resume/recovery, contract/code approval, external import and workspace insertion. SQL rejects managed approval/workspaces and partial activation. Activation creates fresh PROPOSED tasks only and records the exact authorised membership delta. New approval and activation require protected operator confirmation.

Migration `20261101000000_controlled_rework_activation` is additive, source-only for development. Tests applied it only to guarded disposable databases with restricted roles. No development/production migration, commit, push or deploy.

79 distinct focused tests passed: 20 rework integration, 27 guard-boundary, 32 scope regressions. TypeScript, Prisma validation, affected-file lint and diff checks passed. All 114 development-table fingerprints unchanged; temporary databases/roles removed. Task 4 FAILED/FAIL, stale=false; container verification disabled. Logs/manifest: `.tmp/integration-review/task-f-phase1-20261031/`.

Remaining blocker: protected positive rework coding integration is deliberately absent. Managed tasks report ACTIVATED_CODING_BLOCKED; do not claim they are runnable or completed. Existing coding/recovery paths fail closed until the unapplied migration is installed under identity/backup safeguards. See `docs/controlled-rework-phase1.md` for contracts and guard inventory.
