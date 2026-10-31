# Immutable definition candidates

F1b-2b-2b connects definition generation to PlanningGeneration and PlanningPublication. It publishes **unselected snapshots**, not DefinitionProposal rows. Publication does not approve requirements or confer planning, coding, verification, acceptance or release authority.

## Entry points

`generateProductDefinition`, `regenerateDefinitionSection` and non-commentary REQUIREMENTS requests through `/api/agent-runs` use `generateDefinitionCandidate`. Direct runner execution requires a verified server reservation before an AgentRun is written. Commentary review retains its existing behaviour and does not publish candidates.

The domain/API accepts `productId`, `mode` (generate/regenerate), optional `section`, `sourceProposalId` and `idempotencyKey`. Regeneration requires an explicit source identity: an existing same-product open proposal or a sealed candidate's reserved artifact ID. Existing UI regeneration captures the current open proposal once; the selector itself is unchanged. A supplied key must be retained for retries; omission requests a fresh operation. Programmatic prepare/run/publish operations permit exact recovery; candidate selection and UI resumption remain future work.

## Captured input

The server records a versioned, signed input capture: product/problem context, approved brief and assumptions, existing brief approval references, definition state, outcomes, capabilities, slices, work-item hierarchy/dependencies, NFRs, questions, assumptions and decisions. It includes effective criterion IDs/owners/descriptions and the exact baseline proof, or positively established initial bootstrap context. Source intake analysis identities, hashes, confirmations/dispositions and clarification facts are captured; only confirmed in-scope interpretations are presented as usable requirements. Inconsistent/cross-product relationships and stale intake fail closed.

Regeneration captures full source content and its identity/digest reference. Legacy source content is not assigned historical pins or new approval. Sealed sources are independently authenticated. Previous-run summaries are a frozen bounded advisory snapshot; this operation's own AgentRun cannot leak back into its prompt.

The capture binds provider/model identity, temperature, prompt/instruction/schema digest and contract version. The runner renders only from that capture. Live queries are rejection/applicability checks, not additional AI context. Credentials remain in the existing provider adapter and are not captured. Captured JSON is explicitly untrusted data.

## Validation and publication

The existing strict response schema is applied to the complete model output. Server-owned defaults produce PENDING, uncommitted candidate content. Complete hierarchy/reference/uniqueness validation and dependency cycle rejection run before publication; regeneration validates both complete response and complete merged result. Unchanged required arrays must be returned in full. Copied human decisions are not carried as new candidate authority. Structural validity does not establish semantic approval or verified acceptance coverage.

The orchestrator uses the actual successful persisted AgentRun identity. Final canonical content includes summary, full proposal payload, seededDemo=false and AgentRun ID. It seals the exact reserved artifact identity/digest through the existing reservation-bound final pin factory. A transaction-local validator rechecks applicable source facts and the exact run; the foundation revalidates baseline applicability under its existing product lock. Validated publication uses a serializable transaction. The model call occurs outside that transaction.

Failures leave genuine failed attempts or unconsumed reservations, never a fabricated successful publication. Exact completed attempts can be recovered without another model call. Exact publication retries return the existing record; conflicting content/identity is rejected. Concurrent attempts cannot overwrite a winning seal. Serialization conflicts may be retried with the same operation key.

No proposal insert/supersession, singleton definition-status update, effective criterion change, selection, approval or coding operation is performed. Legacy serializers and V1 proof bytes are unchanged.

## Bootstrap and dependencies

UNBOUND_BOOTSTRAP remains initial-definition-only, with one publication per genuinely unversioned initial product and no bound pin/approval. Subsequent unbound generation/regeneration fails. Missing schema, partial state and unavailable proof never imply legacy eligibility. There is no automatic baseline initialisation.

No new migration is required. Previously prepared reservation/pin/baseline migrations must be explicitly installed in a verified, backed-up target before these workflows can operate there. They remain unapplied to development in this checkpoint; unavailable prerequisites fail closed.

Future work must separately implement materialisation with the same artifact ID/digest, explicit candidate selection, immutable successor editing, initial-definition/baseline setup ordering and protected formal approval. Existing mutable proposal-edit/commit paths cannot be reused for sealed candidates without that integration.
