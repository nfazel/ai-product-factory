# Read-only requirements context integration — F1b-2a

This increment changes presentation readers only. It creates no pins or approvals and changes no execution, verification, acceptance or release authority. Existing canonical serializers and signed artifacts remain unchanged.

## Updated readers

- `requirements-baseline/presentation.ts`: coherent, read-only mode selection. Installed schema/guards and positive absence of all versioned markers are required for LEGACY. Otherwise CURRENT must validate exact product, baseline proof, membership and live integrity. Database errors are never legacy evidence. Projection uses exact selected IDs, owners and captured descriptions, never a union with historical rows.
- Acceptance criterion lists and WorkItem detail consumers: project the current owner selection. The shared `findCriterion`/status mutation boundary is unchanged.
- Definition workspace/story traceability: current projection supplies readiness and summaries. `definitionSnapshot` has an explicit presentation-context argument; its existing approval caller retains its original default behaviour. Viewing no longer initialises ProductDefinition. The page displays a local Not started state if no definition exists, without creating an ID or persistent record.
- Intake workspace: current mapping counts ignore historical-only criterion traces. Original analysis and trace records remain intact; shared approval/mutation functions, including `listMaterialUnmapped` and `assertTarget`, remain unchanged for F1b-2b.
- Build workspace: current criteria are projected in the presentation graph. Architecture, plan, proposals and coding workspaces have separate current/historical/applicability envelopes. Unsupported or missing historical pins are explicitly UNPROVEN, not inferred from live criteria.
- Coding view/preview: current task criteria and independent historical workspace context are separate from stored contracts, plans and evidence. Legacy fingerprints are not regenerated on stored artifacts. View loading no longer runs plan recovery, evidence backfill, persistent diff refresh or policy-evidence writes. Fresh diffs remain in memory; diff observation does not repair worktree links. Safe recovery still exists at its pre-existing explicit execution entry points; F1b-2c must integrate their authority checks.
- Build/Define pages use a small shared context-status component. It labels current baseline identity/digest, captured context where provable, stale/unavailable/unproven context, and explicitly states that this information grants no authority.

## Historical applicability

`artifactRequirementsForView` looks up the exact operation kind/ID, rejects another product's pin, verifies the signed historical snapshot, and compares it with the separately resolved current baseline. CURRENT means membership applicability only; STALE does not append invalidation. Missing pins yield UNPROVEN; unreadable/invalid historical proof yields UNAVAILABLE. Neither creates authority. The captured criterion selection is retained in the presentation envelope. No old artifact is retrospectively pinned.

Canonical contracts, proposal JSON, approval events and verification/acceptance fingerprints do not receive these presentation fields. A current criteria projection is not represented as the requirements originally approved for an unpinned artifact.

## Deliberate boundaries

Shared AI execution contexts, planning approvals/gates, criterion mutation authority, coding dispatch/runner/tools/import authority and release/verification readers are not migrated. The approved new pin kinds and protected approval receipts belong to F1b-2b, not this increment. Operation identity and execution-proof work belong to F1b-2b/c. The untouched legacy code paths are not certified as baseline-bound authority.

The focused no-write guarantee covers the modified presentation loaders. Full pages also call existing guidance, verification, clarification and source-control loaders outside this checkpoint; this work does not certify every such existing loader as read-only. Their authority integration remains in the reviewed later inventory. No persistent environment was exercised through browser/UI requests.

No migration is added or applied. The existing pending foundation/pin migrations must be deployed together through the separately authorised identity/backup procedure before persistent views can resolve context; missing schema deliberately fails closed. No automatic initialisation or raw-query fallback is provided.

## Focused validation

51 distinct tests passed: 17 presentation tests, 31 resolver/guard/legacy-proof tests and 3 manifest tests. The view harness uses a disposable PostgreSQL database, a NOSUPERUSER/NOCREATEDB/NOCREATEROLE restricted role with six-connection limit, and a four-connection Prisma pool. Connection identity is checked before database client import; AI execution is prohibited. View reads reject Prisma mutation operations. Populated-workspace checks compare original contract, execution plan, approval and evidence records after reading.

Initial presentation testing exposed test-pool exhaustion (three failures); capping the isolated test pool resolved it without increasing role privileges or the connection limit. Final presentation tests, TypeScript, affected-file lint, Prisma validation and diff checks passed. No broad suite, production build or official Task 4 verification was run.

Pre/post development audit compared all 114 table fingerprints: unchanged, including original approvals, official verification and preserved incident history. All disposable databases/roles were removed. Task 4 remains FAILED/FAIL, stale=false; container verification remains disabled. Evidence is under `.tmp/integration-review/f1b2a-20261031/`, excluded from source.
