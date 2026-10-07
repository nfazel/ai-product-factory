# Product Discovery Agent

Product Discovery is the first agent in AI Product Factory. It works in the Explore stage. A person starts with an incomplete idea. The agent helps turn that idea into a Product Brief. It does not write code, technical requirements, or an architecture.

The agent behaves as a product manager, discovery lead, business analyst, and strategist. It tries to understand the problem, users, outcomes, assumptions, and constraints before a solution is proposed.

## Workflow

1. A person opens the Discovery tab and enters an initial idea, plus any context, constraints, users, and desired outcome.
2. The server creates one `DiscoverySession` for the product, a version 1 `ProductBrief`, and the intake message.
3. The Product Discovery Agent runs. Its reply is stored as a discovery message. Structured brief updates are merged into the brief.
4. The person answers a few questions, edits sections, and marks assumptions validated or invalidated.
5. When the agent believes the brief is sufficiently understood, the session becomes **Ready for review**. That is a recommendation, not approval.
6. A person reviews, edits, continues, requests another AI review, or approves the brief.
7. Approval writes a `PRODUCT_DISCOVERY` approval through the existing approval service, then sets the session and the current brief to **Approved**.
8. The product stage stays where it is. If the product is in Explore, the person can choose **Move to Define**.

A product has one discovery session. Earlier briefs are kept. A significant revision after approval — another agent turn, a human edit, or an assumption status change — copies the approved brief into a new version and marks the previous version **Superseded**.

## System prompt

The server sends `PRODUCT_DISCOVERY_SYSTEM_PROMPT` from `src/modules/discovery/prompt.ts`.

```
You are the Product Discovery Agent within AI Product Factory.

Your responsibility is to help turn an incomplete product idea into a clear, evidence-aware Product Brief.

You are not a coding assistant.

Do not design software prematurely.

First understand the problem, users, outcomes, assumptions and constraints.

You work as a product manager, product discovery lead, business analyst, and product strategist. Understand the problem before proposing a solution.
```

The rest of the prompt tells the agent to investigate the problem, users, business outcomes, value proposition, scope, assumptions, constraints, risks, success measures, and open questions. It may ask at most five questions, and only the ones that reduce high-impact uncertainty. It must challenge solution-shaped statements, such as a request for a mobile application that has no user problem behind it. It must label fact, assumption, decision, and open question separately.

The prompt also states the governance rules: the agent cannot approve the brief, change the product stage, overwrite confirmed information, execute code, or modify external systems.

## Structured output

The model does not return free-form prose for the brief. `AIProvider.generate` requests a Zod schema named `product_discovery_turn`. The OpenAI provider uses the official SDK structured parse helper. The runner parses the payload again before any brief write.

The response contains:

- `assistantMessage` — the note shown in the conversation
- `briefUpdates` — proposed brief fields; an empty string or empty array means "no change"
- `questions` — at most five questions for this turn
- `assumptionsIdentified` and `risksIdentified`
- `discoveryAssessment` — `problemClarity`, `userClarity`, `outcomeClarity`, `scopeClarity`, and `riskClarity`, each `LOW`, `MEDIUM`, or `HIGH`, plus `readyForReview` and `reason`

Unknown keys are rejected. A field such as `currentStage` fails validation. The brief is not updated.

Readiness is shown as "N of 5 areas sufficiently understood." Medium and high count as sufficient. The interface does not invent a completion percentage.

## Data model

`DiscoverySession` belongs to one product. Status is `NOT_STARTED`, `IN_PROGRESS`, `READY_FOR_REVIEW`, or `APPROVED`. A missing session is what the interface treats as not started. Intake text and a `seededDemo` flag are stored on the session so demo data can be labelled.

`DiscoveryMessage` stores `USER`, `ASSISTANT`, and `SYSTEM` notes, including questions and answers. Failed turns add a system note. Messages are not deleted when a new brief version is created.

`ProductBrief` is versioned per product. Prose fields are `problemStatement`, `productVision`, and `valueProposition`, with origins in `fieldOrigins`. List sections are JSON arrays of `{ id, text, origin }`. Origin is `AI_PROPOSAL`, `HUMAN_CONFIRMED`, or `UNRESOLVED`.

Assumptions are a separate `Assumption` entity, not JSON. Each assumption has a description, impact, confidence, status (`UNVALIDATED`, `VALIDATED`, `INVALIDATED`), and origin. Status changes are a human workflow, so a row can be updated without rewriting the rest of the brief. The other list sections do not have that lifecycle, so JSON keeps them ordered without extra tables.

Clarity ratings live on the brief because they are the agent's latest assessment of the whole discovery, not independent records.

## Human approval

AI output is a proposal.

- Proposed content is labelled **Proposed**.
- A saved human edit is labelled **Confirmed** and is not replaced by a later agent turn.
- Validated and invalidated assumptions are locked. The agent may question them in the conversation. It cannot silently change them.
- The agent never sets a brief or session to **Approved**.
- **Approve Product Brief** calls `requestApproval` and `resolveApproval` with type `PRODUCT_DISCOVERY`, then marks the session and brief approved, and writes activity.
- **Move to Define** is a separate action. It uses the normal product update, and only when the brief is approved and the product is in Explore.

## Agent execution lifecycle

1. Refuse, before creating a run, when `OPENAI_API_KEY` is missing and no test provider is installed.
2. Insert `AgentRun` with status `RUNNING`, the product id, and input `{ sessionId, mode }`. The input does not contain the API key.
3. Load the session, messages, and current brief on the server.
4. Call `AIProvider.generate` with the system prompt, the conversation, and the Zod schema. Temperature is 0.3. The model defaults to `gpt-4.1-mini` unless `OPENAI_MODEL` is set.
5. Validate. Merge updates that are allowed. Write the assistant message.
6. Set the run to `COMPLETED`, store the response plus `usage.inputTokens` and `usage.outputTokens`, and store duration in milliseconds.
7. Leave `estimatedCost` null. The provider does not return a reliable price, and the app does not invent one.
8. Write activity for the brief update and, when readiness newly flips on, for ready for review. The run itself also writes an activity.

## Failure handling

Validation errors and provider errors set the run to `FAILED`. The stored error is passed through `safeErrorMessage`, which strips key-shaped secrets and limits the length. Stack traces are not stored.

The product brief is updated only after validation succeeds, inside the same database transaction as the assistant message. A failed turn leaves the previous brief in place and adds a system message so the person can retry.

If the key is missing, Discovery shows that AI is not configured. Start, reply, review, and retry are refused. Human edits, assumption status, and approval still work on an existing brief, including the seeded demo. No response is fabricated.
