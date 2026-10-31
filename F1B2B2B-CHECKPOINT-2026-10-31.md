# F1b-2b-2b checkpoint — 2026-10-31

Base: `709c056897e0aac86c5bed195fe3c80b7968dfcf`. Uncommitted implementation of immutable definition candidate generation only.

Generate/regenerate services and the generic REQUIREMENTS API now capture complete inputs, reserve server identities, execute the existing agent/provider workflow against the frozen snapshot, validate the complete proposal and publish an immutable unselected snapshot. Direct runner generation requires a verified reservation. Regeneration supports existing proposal sources and sealed candidate artifact IDs, always creating a fresh candidate. Commentary review remains outside publication.

No DefinitionProposal rows or selectors, ProductDefinition status, effective criteria, approvals, coding/verification/release authority are changed by candidate publication. No schema or migration changes. Previous migrations remain unapplied to development. Bootstrap remains initial-only. Container verification disabled; Task 4 FAILED/FAIL, stale=false.

Validation: 82 distinct focused tests passed: 25 final candidate integration tests, 23 sealing/reservation tests, 31 context/guard/legacy compatibility tests and 3 manifest tests. Candidate tests were rerun after final changes; unaffected foundation checks reused their successful focused run. TypeScript, Prisma validation, affected-file lint and diff checks passed. Model calls in tests use deterministic provider doubles through the normal agent workflow; no paid/live-provider quality assessment or formal feature verification is claimed.

Guarded disposable PostgreSQL databases used restricted temporary roles. All removed. All 114 development-table fingerprints match before/after; original incident records, approvals and Task 4 evidence unchanged. A non-blocking pg query-queue deprecation warning occurred in the existing adapter/test environment.

Documentation: `docs/immutable-definition-candidates.md`. Evidence and exact file hashes: `.tmp/integration-review/f1b2b2b-20261031/`. No commit, push, deployment, development/production migration, production build or broad suite.
