# F1b-2b-2c-1 checkpoint — 2026-10-31

Base: `e1726ceaf03e9d3d669f43003a5eddcefd13e668`. Uncommitted read-only definition candidate inspection only.

Added standalone candidate list/detail server pages and complete read-only presentation with verified generation/publication/AgentRun provenance. Pages avoid the existing recovery-capable app shell/product layout. Define receives one navigation link; existing legacy selectors/actions remain unchanged. PostgreSQL enforces read-only snapshot transactions. No schema/migration, materialisation, selection, review/approval decision or new execution authority.

The existing complete proposal validator was moved to the pure validation module and re-exported without changing validation semantics, legacy serializers or proof bytes.

Validation: 76 distinct focused tests passed: 17 inspection/presentation tests, 25 generation regression tests, 31 context/guard/legacy compatibility tests and 3 manifest tests. TypeScript, Prisma validation, affected-file lint and diff checks passed. Tests used guarded disposable databases and restricted roles; all resources removed. Initial test-only import/fault-injection/fingerprint SQL issues were corrected; the isolation guard prevented connection before setup. Failure and final logs retained; safeguards unchanged.

All 114 development-table fingerprints match before/after. Original approval/incident history unchanged. Task 4 remains officially FAILED/FAIL, stale=false. Container verification disabled. No persistent migrations, commit, push, deployment, production build or broad regression suite.

Runtime prerequisite migrations remain unapplied to development. Materialisation/selection/review ledgers, protected successors and formal approval/application remain later checkpoints. Contracts: `docs/definition-candidate-inspection.md`. Exact manifest/hashes and evidence: `.tmp/integration-review/f1b2b2c1-20261031/`.
