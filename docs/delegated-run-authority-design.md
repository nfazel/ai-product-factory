# Delegated run authority (slice B design, not built)

Status: draft for the owner's review. Nothing here is implemented, and nothing touches the main database until the owner
approves it and a verified backup exists. Written 2026-11-04.

## What problem this solves

Slice A already runs the procedural steps by itself (draft the plan, start coding, record the snapshot). What is left per task
is five human actions: approve the task, approve the plan, approve the code, sign the runtime review, approve the
verification. Across a product's tasks that is still dozens of clicks, and most are not real judgements. The owner's flow
needs three decisions per feature (see `simplified-flow-sole-builder.md`). Getting there means the Builder must be able to
make the routine approvals itself, **without ever looking like the owner made them**.

## What is true today (read from the code)

- The "human" is the local operator. `getCurrentActor()` always returns "Local user", and "human" is enforced by refusing an
  agent's name (`assertHuman`). There is no sign-in yet, so every approval is as strong as a click in the local app.
- Approvals are rows in `Approval` (type, `approvedBy`), linked to `CodeChangeApproval`, `VerificationApproval` and others.
  Two things are cryptographic: the runtime review (a signed manifest) and the rework chain (triggers bind approvals to
  digests). Most other approvals are only a row.
- A person-signed grant already exists in narrow form: the rework chain's execution authority.

## The design: a signed run authority

When the owner approves a plan (decision 1) they also sign a **run authority** for that feature. It is the only thing that
lets the Builder act on the owner's behalf, and it is recorded as an authority, never as the owner's own approval.

**It names exactly what it covers.** The task list and plan digests it was signed over; the coding policy (allowed and
restricted paths, file limit); the maximum number of automatic retries per step (default 2); an expiry (default 7 days); and
the six routine steps it may take: approve a task, approve its plan, approve the code, record the snapshot, sign the runtime
review, start verification.

**It never covers.** Accepting a feature, shipping or merging, changing requirements or scope, anything marked MEDIUM or HIGH risk,
renewing itself, or approving a verification that did not pass.

**Records show the truth.** Anything done under authority is stored as an `Approval` whose approver reads "Builder, under
authority A granted by the owner at T", with a new `authorityId` pointing at the signed grant. It cannot be mistaken for a
click by the owner. The existing `assertHuman` check stays; delegated approvals go through a separate, narrower function
that checks the authority. A caller can never pass a name to get the same effect.

**The owner can stop it.** A Stop button revokes the authority. The run halts before its next step.

## Guardrails: when the Builder must hand back to the owner ("Needs you")

Automatic code approval is the biggest shift in trust, so it is conditional. The Builder approves code itself only when all of
these hold; otherwise the task shows **Needs you**, with the reason:

1. Every required check passed (build, type check, tests where the project has them).
2. The change touches only files in the approved plan and the policy's allowed paths. No preservation or security issues.
3. No open escalation, and the diff is within the policy's size limit.
4. The task's risk is LOW. MEDIUM and HIGH always need the owner.
5. For the runtime review: the commands are only those from the standard catalogue, and no extra runtime is declared.

The retry rule is the same everywhere: a failed step is retried up to the authority's limit, then it becomes Needs you.

## Verification and the third decision

Task-level verification approval goes away. The Builder runs verification and records the result. At **Accept** (decision 2)
the owner signs once over the evidence for the whole feature, and the framework records the per-task verification approvals
from that single signature, with the owner as the approver. A FAIL or an unresolved concern cannot be accepted without a
written reason. The code diff is one click away and is never required.

## What changes in the system

| Area | Change | Risk |
|------|--------|------|
| Database | Two new tables: `RunAuthority` and `RunAuthorityEvent` (append-only, with the same style of guard triggers as the rework chain). One new nullable column `Approval.authorityId`. Additive only, no existing row is rewritten. | Needs your approval and a verified backup. Rehearsed on a clone first, as for the rework migration. |
| Services | `approveUnderAuthority(...)` for the six steps, each re-checking the authority, the guardrails and the digests. | Security-sensitive, so reviewed and tested hardest. |
| Orchestrator | A small state machine that takes the next step, applies guardrails and retries, and sets Needs you or Done. It builds on slice A. | Moderate. |
| Interface | "Start building" at plan approval, a run progress card, Stop, Needs you with the reason, and the per-task buttons moved into "details". | Low. |
| Release gating | Code that reads per-task verification approvals must accept ones created at Accept. | Moderate; needs a careful read. |

## Build order

- **B1** Schema and the authority record, `approveUnderAuthority`, guardrail evaluation. No interface. Unit and database
  tests, and a rehearsal on a clone.
- **B2** The orchestrator, extending the golden-path test so a whole feature runs from one signed authority to a verified
  result with no clicks, plus failing cases (a guardrail trips, retries run out, the authority is revoked or expires).
- **B3** The interface.
- **B4** Accept records the per-task verification approvals. Retire the per-task buttons into details.

Each step must pass the golden-path test before the next starts.

## Honest limits

- With no real sign-in, the authority is signed by "the local operator". It is only as strong as that. Real identity is
  separate work and is needed before this goes anywhere shared.
- Automatic code approval relies on the checks and the independent verification being good. They are the safety net, so the
  golden-path tests matter more, not less.
- A fast-moving Builder can do more damage in a few minutes than a slow one. Hence the file limit, the retry limit, the
  expiry, MEDIUM and HIGH risk always needing the owner, and Stop.

## Decisions made by the owner (2026-11-04)

1. **Only LOW risk tasks** may have their code approved by the Builder. MEDIUM and HIGH always come back to the owner.
2. An authority lasts **7 days** and allows **2 automatic retries** per step.
3. Per-task verification approval is **replaced by one signature at Accept**, over the whole feature's evidence.
4. The approval history reads **"Builder, under authority granted by the owner"**.

Nothing is open. The next step is B1, which needs the owner's approval and a verified backup before the main database changes.
