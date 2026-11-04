# The Plan stage (design, not built)

Status: draft for the owner's review. Nothing here is implemented. Written 2026-11-04.

## What it replaces

Today a product goes through Explore, then Define, then the start of Build before any code is written. The guidance engine walks
the person through roughly 12 to 15 separate decisions in that stretch: start discovery, answer questions, approve the brief,
move to Define, draft and confirm the definition, confirm the slice, answer definition questions, approve the definition, move
to Build, choose the development context, review and approve the design, clear findings, approve the engineering review,
approve the coding rules, and approve each task. Each has its own page and its own button, and the person has to know the order.

The owner's flow (`simplified-flow-sole-builder.md`) is three decisions per feature. The first is **approve what gets built**.
This document is how that decision is reached.

## The Plan stage in one paragraph

The person describes the product, or brings requirements they already have. The AI interviews them until it has enough. It then
drafts everything that has to exist before coding, in order, without being asked for each piece: the brief, the outcome, the
features with their acceptance criteria, the design and architecture, the tasks with a risk level on each, and the coding rules.
The person reads **one page** and makes **one decision**: approve the plan. Nothing is built before that decision.

## What the person sees

One screen, "Your plan", with plain sections:

| Section | What it holds | Comes from (already exists) |
|---------|---------------|-----------------------------|
| What this is | The brief: problem, users, value | Product brief |
| What it will do | Features, each with acceptance criteria and the first slice | Definition, outcomes, capabilities, slice, backlog |
| How it will be built | Screens and the architecture in plain words | Design, solution architecture |
| The work | Tasks with a risk level each, in the order they will run | Implementation plan, risk assessments |
| The rules | What the Builder may touch and the checks it must pass | Engineering review, coding policy |
| Open points | Questions, assumptions and risks, each with the AI's best answer | Questions, assumptions, review findings |

Every section has "Ask for changes". A change re-drafts what depends on it and nothing else. The detail pages stay as "details" for
anyone who wants them.

## The one decision

**Approve plan** is signed once over the whole page (a single digest of everything shown). In the same step the framework records
the underlying approvals the later stages rely on, attributed to the person, each saying "approved as part of plan approval
<id>": the brief, the definition, the design, the architecture, the delivery plan, the engineering review and the coding rules.
It is the same pattern as accepting a feature with one signature. These are the person's approvals, because the person read the
combined content and signed it. It is not delegated authority.

A second button on the same page, **Approve and start building**, does the same and also grants the Builder its run authority, so a
plan can go straight into a run.

If one of the underlying approvals is refused (for example an unanswered question the definition still needs), the page says which
section blocks the decision and nothing is approved.

## Stages the person sees

Plan, Build, Ship. This needs no database change:

- **Plan** covers what the database still calls EXPLORE and DEFINE.
- **Build** covers BUILD and PROVE (verification is part of building).
- **Ship** is SHIP. Learn is dropped from the interface for now.

The system moves the stored stage itself when the plan is approved. The "Move to Define" and "Move to Build" buttons go away.

## How it is built, in order

The single pause is part of P2: the prepare-the-plan run stops after the features and acceptance criteria, shows them for confirmation, and carries on when they are confirmed.

- **P1. The Plan page, read-only.** One page assembled from the records that already exist, with the three-stage navigation. No new
  approval. Immediately useful, and it makes the rest testable.
- **P2. Prepare the plan.** A background run, like the Builder's, that drafts each section in order from the interview, shows
  progress, and stops with "Needs you" when the AI needs an answer. It reuses the existing agents and services.
- **P3. The single approval.** The signed bundle and the recorded underlying approvals, with its tests and a golden-path run from
  an idea to an approved plan on a real product.
- **P4. Retire the old buttons and wording.** The per-step buttons and stage moves move into "details", and the guidance engine's
  steps for this stretch collapse into "Your plan".

Each part keeps the existing pages and data working, and each must pass its tests before the next starts.

## Honest limits

- The AI drafts a lot here without being asked step by step. The quality of the plan depends on the quality of those drafts, so
  every section can be sent back, and the page shows the AI's own open questions rather than hiding them.
- The underlying approvals are recorded one after another, because they live in different modules. If the server stops partway,
  some are recorded and the page shows exactly which. The person's single signature is only recorded once all of them succeed, so
  a half-approved plan is never shown as approved.
- This touches the most guidance logic of anything so far. The guidance tests are the safety net.

## Decisions made by the owner (2026-11-04)

1. **One signature** records all the underlying approvals as the owner's, each saying it was part of the plan approval.
2. **Two buttons** on the plan page: "Approve plan" and "Approve and start building".
3. **The AI pauses once.** After the interview it drafts the brief and the features with their acceptance criteria, and waits for
   the owner to confirm them. Then it drafts the architecture, tasks and rules. The confirmation is a checkpoint, not one of the
   recorded approvals: the single signature at the end is still the only approval. The owner can send any section back at any time.
4. **Only the display changes.** The stored stage names stay, and the app shows Plan, Build and Ship. No database change.

Nothing is open. The next step is P1, the read-only Plan page.

## What building P2 showed (2026-11-04)

The framework only lets each part be drafted after the part before it is **approved**. The definition needs an approved brief.
The design needs an approved definition, an approved first slice and the product to be in Build. The delivery plan needs an
approved design. The engineering review needs an approved plan, and the coding rules need an approved review. So "draft everything,
then sign once" cannot work as first described, and two decisions above are refined:

- **The first signature approves the brief only.** The brief is the one part that has to be approved before the next can be
  drafted at all. It is signed when the interview ends ("this is right, go on"). The system then moves the product on itself.
- **The pause to confirm the features stays an unrecorded checkpoint**, as first designed. It is not an approval.
- **The second signature covers everything else:** the definition and first slice, the design, the delivery plan, the engineering
  review and the coding rules. To make that possible, drafting is allowed ahead of approval for that chain. Concretely: the checks
  that say "the previous part must be approved" (and "the product must be in Build" for the design) are relaxed for **drafting
  only**, in the design and review modules. The approval checks before coding are untouched. The signed bundle records the
  approvals in order, and each one still has to pass its own existing check at that moment.

Build order for P2: **P2a** automate the brief to definition drafting (no gate changes, the system moves the stage and commits
the drafts); **P2b** draft ahead for the technical chain with the relaxed drafting checks; **P2c** the progress and the pause on the
Plan page.
