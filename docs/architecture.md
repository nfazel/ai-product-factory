# Architecture

AI Product Factory is a modular monolith. One Next.js application owns the product development domain. Modules are separated so a later service split can move a module's repository and service without rewriting the model the rest of the factory depends on.

## Boundaries

```
Browser
  → App Router pages and server actions
  → HTTP route handlers under /api
      → module services
          → repositories
              → PostgreSQL via Prisma
```

Rules:

- React components do not import Prisma and do not encode hierarchy or approval rules.
- Repositories map database rows into plain domain objects.
- Services enforce rules: parent placement, dependency cycles, approval resolution, and the activity log.
- Server actions and route handlers validate with the same Zod schemas, then call services.
- The activity log is written inside services, so a new interface cannot forget an important action.

## Modules

| Module | Responsibility |
| --- | --- |
| Identity | `getCurrentActor()`. The only place a future session is read. |
| Product | Product definition, status, and current stage. |
| Discovery | Discovery sessions, messages, product briefs, and assumptions. |
| AI | Provider interface. The OpenAI implementation is server-side only. |
| Work item | Backlog items, hierarchy, and dependencies. |
| Acceptance | Criteria on a work item, including pass and fail. |
| Decision | Human decisions, optionally tied to a work item. |
| Approval | Pending, approved, and rejected gates, including product discovery. |
| Activity | Append-only audit history and filters. |
| Agent | Catalogue, run records, runner registry, and run lifecycle. |
| Dashboard | Read model composed from the modules above. |

Public imports go through each module's `index.ts`. Pages may also import a focused read function such as `getProductOverview` when that keeps a service from depending on the UI.

## Pipeline

The stage order is fixed:

`EXPLORE → DEFINE → BUILD → PROVE → SHIP → LEARN`

A stage before the product's current stage is completed. The current stage is highlighted. Later stages stay inactive. Only a person moves `currentStage`. Creating a product sets status to `ACTIVE` and stage to `EXPLORE`.

Work item hierarchy:

- An epic has no parent.
- A feature belongs to an epic.
- A story belongs to a feature.
- A task or defect may sit under an epic, feature, story, or, for a defect, a task.

## Activity

These actions write an activity record:

- Product created or updated
- Discovery started, brief updated or edited, assumption updated, ready for review, or approved
- Agent run completed or failed
- Work item created or updated
- Acceptance criterion added or updated
- Approval requested, approved, or rejected
- Decision recorded
- Dependency added

The log stores the actor name. Until authentication exists, that name is **Local user**, unless a person types a decision maker or approver.

## Authentication, later

`src/proxy.ts` runs before the request and currently continues it. `getCurrentActor()` returns a local actor. A future login replaces those two pieces. Services already accept the actor name when they write history, so they do not need to know the provider.

## Agents

The catalogue in `src/domain/constants.ts` names the agents:

- Product Discovery — implemented
- Requirements, Architecture, Security, Planning, Coding, Testing, and Review — not configured

Product Discovery is **CONFIGURED** only when `OPENAI_API_KEY` is set on the server, or when a test supplies a provider. Every other agent stays **NOT CONFIGURED**. The control centre reads run counts, completed runs, failed runs, and average duration from `AgentRun`. Token counts are stored when the provider returns them. Cost is left empty rather than guessed.

A runner implements:

```ts
type AgentRunner = {
  agentType: AgentType
  isConfigured(): boolean
  execute(request: AgentExecutionRequest): Promise<{
    output: Record<string, unknown>
    estimatedCost?: string | null
  }>
}
```

`ensureAgentsRegistered()` adds the Product Discovery runner. `executeAgent` looks up that runner. If it is missing or not configured, it throws `AgentNotConfiguredError` before inserting an `AgentRun`. `POST /api/agent-runs` returns that refusal and does not fabricate output.

When a configured runner executes:

1. Create an `AgentRun` with status `RUNNING` and the structured input.
2. Call the provider through `AIProvider.generate`. The key never leaves the server.
3. Validate the response with Zod. On failure, store a redacted error, set status `FAILED`, and leave the product brief unchanged.
4. On success, store the structured output, duration, and token usage. `estimatedCost` stays null.
5. Append an activity record.

The discovery runner may update the product brief and assumptions. It cannot approve them, change `currentStage`, or delete a human confirmation. See [product-discovery-agent.md](product-discovery-agent.md).

## Product brief storage

Assumptions are their own table. Each one has impact, confidence, and a status a person can change (`UNVALIDATED`, `VALIDATED`, `INVALIDATED`). That lifecycle does not fit a JSON blob.

The other multi-value brief sections are ordered notes without their own workflow. They are JSON arrays of `{ id, text, origin }`. Prose fields keep their origin in `fieldOrigins`. Origin is `AI_PROPOSAL`, `HUMAN_CONFIRMED`, or `UNRESOLVED`. Confirmed prose and validated or invalidated assumptions are kept when a later agent turn arrives.

## What this application does not do

- No Requirements, Architecture, Coding, or Testing agent
- No GitHub integration
- No autonomous coding
- No automated test execution of the product under construction
- No authentication requirement for local use
- No invented model response when `OPENAI_API_KEY` is missing
