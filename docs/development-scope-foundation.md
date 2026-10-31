# Development Scope Foundation — Task E

Implemented as detached intent planning. No Build interface, work activation, plan amendment, requirements mutation, coding or verification execution is provided.

## Persistence and authority

Three additive models retain scope identity, immutable versioned manifests and signed human decision events. A scope belongs to one product/FEATURE and one immutable confirmed-feedback event. Each revision binds the proposal event/revision/content digest, confirmation event/digest/proof digest, current confirmed human principal, and the original requirements/definition and application commit/tree context. Actual confirmation signatures remain in the existing append-only feedback history; the scope stores secure references and revalidates the existing proof.

The canonical manifest includes changes, preserved behaviour, exclusions, affected behaviour, additional criteria, scoped requirement IDs, separately required requirements approvals, assumptions, unresolved questions, proposed behavioural tests, dependencies, classification and architecture/authentication/data/security/platform-permission risks. Empty risk lists indicate no identified risks; they grant no clearance. Human regeneration instructions are retained in each immutable revision and its presentation history. Final manual content and regeneration instructions are mutually exclusive. AI drafting uses the existing provider with an untrusted-data system policy and no implementation tools.

Human approval/rejection uses the existing protected operator adapter/key, with a separate HMAC purpose. A resolved `Approval` row of type `DEVELOPMENT_SCOPE` is created atomically with the signed immutable event and audit Activity. The generic legacy approval resolver is not used: it accepts actor names and does not share this transaction. Product/feature, source proof, current revision, baseline and content digest are validated in the scope domain. The signature binds the complete associated Approval row; changes to that authority fail closed. Scope approval grants no coding, technical, requirements, verification, acceptance or release authority.

Database guards prevent scope/revision/event update, delete and truncate; enforce source ownership, sequential revisions, current-revision decisions and Approval association; and retain all parents through restrictive foreign keys. No prior approval or verification row is rewritten. One confirmed proposal has one scope; revisions are appended to that scope. Each revision has at most one human decision. A rejected or approved revision may be superseded by an explicitly prepared new revision, which requires fresh approval.

## Server-only API

`src/modules/development-scope` exports:

- `prepareDevelopmentScope({productId,featureId,feedbackId,confirmationEventId,proposalDigest,credential,idempotencyKey,content?,instructions?})`: manual structured content or AI drafting from the exact confirmed source. Returns scope ID and a revision receipt.
- `reviseDevelopmentScope({productId,featureId,scopeId,expectedVersion,reviewedDigest,credential,idempotencyKey,content?,instructions?})`: append a human revision or regenerate through the existing provider; never update an older revision.
- `decideDevelopmentScope({...headRequest,decision:'APPROVED'|'REJECTED',reason?})`: protected exact-version decision. Unresolved questions, unapproved requirements or missing clean commit/tree block approval. Requirements needing additional approval remain proposals, even after scope approval.
- `getDevelopmentScope({productId,featureId,scopeId})`: current DRAFT/APPROVED/REJECTED/STALE/UNAVAILABLE state with immutable revision and decision history. Current authority is recomputed, not permanently invalidated during an observation failure.
- `developmentScopeView(state)`: minimal future UI DTO; excludes credentials, signatures, operator IDs and full proof/context data.

These are internal server-only services, not newly exposed HTTP endpoints or Server Actions. Future Task G must provide protected transport and sanitise provider diagnostics, as the existing feedback transport does. Task F must re-read and enforce current APPROVED state and exact revision/digest, source and baseline at activation. A historical operation receipt is not current authority. No Task F API is implemented here.

Per-scope serializable/advisory locking, uniqueness and request digests protect retries and conflicting decisions. AI calls run outside transactions. Source and revision are revalidated before persistence. Revisions have new version-bound digests even when their content is identical. Source/context changes require a fresh human-confirmed proposal; historical confirmations and scope decisions remain intact. Operator key/principal changes make affected authority unavailable and require fresh human review rather than rewriting history.

Independent technical PASS is not required to review a detached scope. A failed verification result remains failed; technical availability does not confer acceptance. If the source, application baseline or operator authority cannot be established, decisions fail closed. Scope preparation/approval does not reconcile feature acceptance and never reserves a coding workspace.

## Migration and validation

`20261031120000_development_scope` creates only three new tables, indexes, foreign keys, checks and append-only/ownership/sequence guards. No existing table data or prior migration is rewritten. It has been applied **only to guarded disposable test databases**, not to persistent development or production. A verified identity check and recoverable backup remain required before any future development application of this migration; reload the development Prisma client afterward. The generated client was refreshed locally and remains ignored.

Validation: 32 scope integration tests plus 31 feedback regression tests pass. TypeScript, affected-file ESLint, Prisma validation and diff checks pass. The existing guarded harness pattern prevents Prisma/provider imports before isolated database/role identity is verified; all fixture writes use randomly named disposable databases and temporary restricted roles. Provider behaviour uses a deterministic double and feature manifests are controlled fixtures, not official independent verification evidence. The harness deliberately pins the approved local PostgreSQL instance and is not silently portable to another environment.

Before/after fingerprints of all 114 development tables match. No disposable database or role remains. Task 4 remains officially FAILED/FAIL and container verification stays disabled. Evidence: `.tmp/integration-review/task-e-20261031/`.
