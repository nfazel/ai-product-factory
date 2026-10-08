# Product Definition & Requirements Agent

The Requirements Agent supports the **Define** stage. It turns an **approved Product Brief** into a structured, traceable product definition and a small delivery backlog.

It does not write software, design technical architecture, approve its own output, or move the product stage.

## Entry conditions

A real run starts only when both are true:

- `Product.currentStage` is `DEFINE`
- the current Product Brief status is `APPROVED`

If either is missing, the agent does not run. The Definition page states what is missing. Seeded demo content can still be reviewed. The seed does not create an `AgentRun` and does not bypass the gate.

The agent also refuses, before an `AgentRun` row is inserted, when the AI connection is not configured and no test provider is installed.

## System prompt

The prompt begins:

> You are the Product Definition & Requirements Agent within AI Product Factory.
>
> Your responsibility is to transform an approved Product Brief into a clear, outcome-driven, traceable product definition.
>
> Do not write software.
>
> Do not design technical architecture.
>
> Do not invent business requirements unsupported by the Product Brief.
>
> When information is uncertain, identify an assumption or ask a question.
>
> Prefer the smallest coherent product scope that can test the product's most important assumptions and outcomes.

The full prompt is `REQUIREMENTS_SYSTEM_PROMPT` in `src/modules/requirements/prompt.ts`. It tells the model to separate source facts, human decisions, AI proposals, assumptions, and open questions, and it forbids turning an assumption into a requirement.

## Progressive elaboration

One brief must not become hundreds of stories. The prompt and the Zod schema cap the proposal at:

- 3–7 outcomes
- 3–10 capabilities
- a small set of epics and features
- stories only for the highest-priority, first-slice features

The objective is the smallest coherent slice that can be demonstrated, not a full future-state decomposition.

## Structured output

The model must return JSON that matches `requirementsResponseSchema`. The server parses it with Zod again. Prose is never split into database rows.

Temporary ids (`outcome-1`, `capability-1`, `epic-1`, `feature-1`, `story-1`, and the same pattern for criteria, NFRs, the slice, assumptions, questions, and dependencies) express relationships. `assertProposalReferences` checks those ids before any write. A broken reference fails the `AgentRun` and leaves the definition and backlog unchanged.

A new proposal is inserted in one transaction. Committing accepted items is also one transaction. A failure inside that transaction rolls back the whole commit.

The response carries an advisory `readinessAssessment`. The readiness shown in the product is computed by rules in `src/modules/requirements/readiness.ts`, not copied from the model.

## Proposal, then commit

```
Approved Product Brief
  → Generate Product Definition
  → AI proposal
  → human review (edit, accept, reject, regenerate one section)
  → commit accepted items
  → product definition and backlog
```

Accepted work items are normal `WorkItem` rows with provenance `AI_ACCEPTED`. There is no second backlog to synchronise. Manually created items stay `HUMAN_CREATED`.

Regenerating one section replaces only pending, unedited items in that section. Accepted, rejected, and edited items stay.

## Human authority

A person confirms outcomes and capabilities, confirms or rejects non-functional requirements, and approves the first product slice. Once a record is human-confirmed or human-created, a later proposal that points at it with `replacesId` does not change it. The commit reports that the confirmed item was left unchanged.

The agent cannot approve the product definition. Approval creates a `PRODUCT_DEFINITION` approval resolved by the current person. The product stage stays where it was.

## First product slice

`ProductSlice` is the smallest end-to-end journey that serves a real user, tests an important assumption, and can be demonstrated. Commit leaves it `PROPOSED`. Only a person can set it to `APPROVED`.

## Definition of Ready

A story is **READY** only when all of these rules pass:

- a user, a need, and a value are stated, and the story is not a technical task
- acceptance criteria exist and describe observable behaviour
- dependencies are identified, including an explicit "none"
- no high-impact question linked to the story, or to the whole product, is still open
- assumptions are marked visible on the story
- the story traces to a feature, epic, capability, outcome, and product brief
- priority was explicitly assigned

Filling in fields is not enough. A vague criterion such as "the system should work correctly" keeps the story **NOT READY**.

## Requirements readiness

Ten areas are scored Low, Medium, or High: outcome clarity, capability coverage, scope clarity, story quality, acceptance criteria, dependencies, open questions, assumptions, non-functional requirements, and first-slice coherence. Medium and High count as sufficiently understood. The page shows "N of 10 areas sufficiently understood" and the reason for each Low or Medium area.

## Approval and Build

When the definition is marked ready for review, or when at least seven areas are sufficiently understood and a slice exists, the page offers **Approve Product Definition**.

After approval the page says: "Product Definition approved. Product is ready for architecture and delivery planning."

**Move to Build** is a separate action. It is refused unless all of these are true:

- the product is in Define
- the current Product Brief is approved
- a `PRODUCT_DEFINITION` approval is approved
- a first product slice is approved

The message lists every missing gate. The pipeline stays Explore → Define → Build → Prove → Ship → Learn. Architecture is not a stage.

## Failure handling

| Situation | What is stored |
| --- | --- |
| Stage is not Define, or the brief is not approved | No `AgentRun`. The reason is returned. |
| API key missing | No `AgentRun`. The agent is NOT CONFIGURED. |
| Provider or Zod failure | `AgentRun` status `FAILED`, redacted error, no proposal and no backlog rows |
| Reference check fails | Same as a failed run. Nothing is committed |
| Commit fails mid-transaction | The transaction rolls back |

Token usage is stored when the provider returns it. `estimatedCost` stays null.
