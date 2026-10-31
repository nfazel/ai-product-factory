# F1b-2b-2a checkpoint — 2026-10-31

Base: `8f8e751cf60423919d609daeaeb2d13d5bdb9651`.

Added immutable PlanningGeneration/PlanningPublication records, protected generation-input pins, strict initial-definition UNBOUND_BOOTSTRAP, server-allocated artifact identities/versions and private reservation-bound final v2 sealing. Publication is a signed immutable snapshot only; no existing proposal/graph is persisted or selected. No generation entry point, approval action or execution authority changed. V1 proof bytes remain unchanged.

Migration `20261031210000_planning_generation_foundation` reviewed: additive tables/guards and atomic pin-format extensions, no existing data rewrites. Source only for development; applied only to disposable test databases.

Validation: 85 focused tests passed (23 generation, 28 receipt, 31 context/guard/proof, 3 manifest); TypeScript, Prisma validation, affected-file lint and diff checks passed. All 114 development table fingerprints unchanged, all disposable resources removed. Task 4 remains officially FAILED/FAIL, stale=false; container verification disabled.

No staging/commit, push, deployment, persistent migration, broad suite/build or official Task 4 verification. Contracts and integration boundaries: `docs/planning-generation-foundation.md`. Evidence: `.tmp/integration-review/f1b2b2a-20261031/` (excluded). Next: workflow integration and validated canonical output publication; candidate materialisation/selection and protected approvals remain separate checkpoints. Bootstrap is deliberately initial-only and supports one publication per product.
