# F1b-2a checkpoint — 2026-10-31

Base commit: `9b0638d9f347e8ac24f6d149c3817a16853159ca`.

Implemented read-only current/legacy requirements projections and independent historical artifact envelopes across criterion lists, definition/traceability/readiness, intake mapping, planning and coding views. Removed read-triggered coding recovery/evidence/diff writes; fresh diffs are in-memory observations. Existing approval/execution defaults, canonical artifacts and proof serializers are unchanged. Missing historical context is labelled unproven, never backfilled.

Details and bounded dependencies: `docs/requirements-context-readers.md`.

Validation: 51 distinct focused tests passed (17 view, 31 context/guard/proof, 3 manifest), TypeScript/affected-file lint/Prisma validation/diff check passed. Initial harness connection-limit failures were resolved by capping the test pool, without increasing role privileges/limits. All 114 development table fingerprints unchanged, zero disposable resources remain. Task 4 officially FAILED/FAIL, stale=false. Container verification disabled.

No migration/schema changes, development fixtures, commit/staging, push, deployment, production build or broad suite. Existing pending migrations remain unapplied. Read-only guards fail closed against missing schema; persistent rollout still requires the authorised identity/backup process.

F1b-2b remains: supported prospective kinds for DefinitionProposal/SolutionArchitecture/approval decisions, protected exact-target approval receipts and immutable identity handling. F1b-2c remains: complete coding preparation/runner/recovery/tool/import authority integration. No authority-bearing reader defaults were migrated here. Later verification/acceptance/release integration remains pending; this checkpoint does not certify the entire composed Build page's other loaders as read-only.

Evidence retained in `.tmp/integration-review/f1b2a-20261031/`; original evidence/history untouched.
