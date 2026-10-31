# F1b-2b-1 checkpoint — 2026-10-31

Base commit: `1b37f9832193fddeb6b79ff9a89769a4b833c937`.

Added purpose-separated v2 planning pins and immutable protected Approval receipts. New APIs are dormant: no generation, recommit, approval action, gate or execution flow calls them. Existing Approval records, serializers and historical proofs are untouched. A receipt only appends inside a Serializable transaction with fresh prospective Approval identity; it cannot retrospectively sign a committed decision.

Source migration `20261031193000_requirements_approval_receipts` adds the receipt table and guards and atomically extends the pin format fence. No development migration or backfill performed. New baseline initialisation remains explicit and separate.

Validation: 62 distinct focused tests passed (28 new receipt/pin, 31 context/guard/proof, 3 manifest); TypeScript, affected-file lint, Prisma validation and diff check passed. All 114 development table fingerprints unchanged; original history preserved; no disposable resources remain. Task 4 officially FAILED/FAIL, stale=false. Container verification disabled. No broad suite/build/official verification, staging, commit, push or deployment.

Contracts, limitations, migration review and next-checkpoint prerequisites: `docs/requirements-planning-authority-primitives.md`. Evidence: `.tmp/integration-review/f1b2b1-20261031/` (untracked/excluded). F1b-2b-2/3 and all later checkpoints remain unimplemented.
