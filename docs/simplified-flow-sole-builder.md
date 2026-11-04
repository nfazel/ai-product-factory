# Simplified flow for a sole builder (proposal, not built)

Status: draft for review. Nothing here is implemented. Written 2026-11-04.

## Why

The current flow asks for roughly 8 to 10 human actions per task (approve task, generate plan, approve plan, start coding,
approve code, save version, sign runtime review, start verification, approve verification). A product with 8 tasks needs 60
to 80 clicks before any feature is accepted, and most are procedural, not judgements. Several records (database, git working
copies, containers, GitHub) must agree, so one drifting record produces "missing" or "stale" states. Verification rebuilds CI
inside a hardened sandbox, so each product shape needs special handling.

The audience is one person building their own products. They need speed and trust, not audit-grade evidence at every step.

## The flow: three decisions

| # | Decision | What the person sees | What the AI does around it |
|---|----------|----------------------|----------------------------|
| 1 | **Approve what gets built** | One page: the brief, the features with their acceptance criteria, and the plan | Interviews the person, drafts the brief and features, proposes the plan |
| 2 | **Accept the feature** | One page per feature: live preview, what changed in plain words, check results, the AI's concerns, the diff on request | Breaks the feature into tasks, writes the code, runs the checks, retries on failure |
| 3 | **Ship** | One button, and a release note | Opens the pull request, waits for green checks, merges it when the owner presses Ship, records the release |

Everything else is automatic and has no button: generate plan, start coding, save the approved version, restore a missing
working copy, run checks, run independent verification, retry after a failure. The person is only pulled in when the AI is
stuck ("Needs you") or when a decision above is due.

The product stages are therefore **Plan, Build, Ship**. Feature status is one line: Planned, Building, Needs you, Ready for review, Accepted, Shipped. Task states stay internal.

## Authority, not clicks

Approving the plan (decision 1) grants the Builder authority to carry out that plan: its tasks, code and checks, within its
stated scope and limits. This already exists in a narrow form: the controlled rework chain grants execution authority with
one signed approval. The proposal generalises it to normal features. Nothing merges and nothing ships without decisions 2
and 3.

## Verification

- **Checks** (build, type check, lint, tests): run the same way GitHub's checks would, in one standard container recipe or by
  reading the real CI result. A failing check blocks Accept. The person can override with a written reason.
- **Independent tests**: kept, because they are the valuable new idea. They become evidence on the review page (Pass, Pass
  with concerns, Fail) and not a separate approval workflow.
- A failure caused by the environment is never shown as a product failure. Every failed or stuck state shows a button that works.

## What stays, what goes

Keep: the AI-proposes, person-decides rule; a permanent log of who approved what and when (including a fingerprint of what they
approved); traceability from outcome to feature to code; the interview-style Explore and Define.

Drop or shrink: per-step signed manifests, the coupling between approvals and the framework's own code fingerprint, most of the
61 database triggers, separate approvals for task, plan, code and verification, the stale-flag machinery, and the task-level
journey screens.

## How to get there (build beside the old flow, same data)

0. **Freeze new features.** Build an automated end-to-end test of one real task through verification on a Next.js and Prisma
   product, and make it pass.
1. **Automatic runs.** After decision 1, a feature run does the tasks, plan, code, snapshot and checks without clicks, with
   retries and a "Needs you" state.
2. **One review page** for decision 2, with the old task pages kept as "details".
3. **Standard checks** replace the custom verification runner; independent tests attach as evidence.
4. **Delete** the dead states, screens and triggers once nothing uses them.

BetMyFriend is the test product throughout, and each phase must pass the end-to-end test before the next starts.

## Decisions made by the owner (2026-11-04)

- **Code reading is on request.** The review page shows a plain-words summary and the check results. The diff is one click away
  and is never required to accept.
- **The Learn stage is dropped for now.** The stages become Plan, Build, Ship.
- **Explore and Define become one stage, Plan.** One conversation that ends in decision 1. The AI interviews the owner, then
  presents the brief, the features with acceptance criteria, and the plan for a single approval.
- **Ship merges by itself.** When the owner presses Ship and the checks are green, the Builder merges the pull request into
  the main branch and records the release. The merge happens only after that press, never automatically on a green check, and
  never when a check is red or an override is missing its written reason.

## Still open

Nothing. The next step is the build plan below, starting with phase 0.
