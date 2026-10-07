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
| Work item | Backlog items, hierarchy, and dependencies. |
| Acceptance | Criteria on a work item, including pass and fail. |
| Decision | Human decisions, optionally tied to a work item. |
| Approval | Pending, approved, and rejected gates. |
| Activity | Append-only audit history and filters. |
| Agent | Catalogue, run records, and the runner registry. |
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
- Work item created or updated
- Acceptance criterion added or updated
- Approval requested, approved, or rejected
- Decision recorded
- Dependency added

The log stores the actor name. Until authentication exists, that name is **Local user**, unless a person types a decision maker or approver.

## Authentication, later

`src/proxy.ts` runs before the request and currently continues it. `getCurrentActor()` returns a local actor. A future login replaces those two pieces. Services already accept the actor name when they write history, so they do not need to know the provider.

## How future agents will interact

Agents are not connected to a model in this foundation.

The catalogue in `src/domain/constants.ts` names the agents that will exist:

- Product Discovery
- Requirements
- Architecture
- Security
- Planning
- Coding
- Testing
- Review

Each one is **Not configured**. The control centre reads run counts from `AgentRun`. There are no seeded runs and no generated responses.

A future runner implements:

```ts
type AgentRunner = {
  agentType: AgentType
  execute(request: AgentExecutionRequest): Promise<{ output: Record<string, unknown> }>
}
```

and is added with `registerAgentRunner`. `executeAgent` looks up that runner. If none is registered it throws `AgentNotConfiguredError` before inserting an `AgentRun`. `POST /api/agent-runs` returns that refusal. It does not fabricate output.

When a runner does exist, the intended path is:

1. Create an `AgentRun` with the input, status, and timestamps.
2. Call domain services to propose work items, criteria, or decisions. Do not write SQL from the agent.
3. Where the change is a gate (stage, requirements, architecture, security, release), create an `Approval` in `PENDING`.
4. Stop. A person approves or rejects in the approval centre.
5. Store the real output on the `AgentRun` and append an activity record.

That keeps the domain model stable if an agent later moves to its own process: it would call the same HTTP API the UI already uses.

## What this foundation does not do

- No model provider and no fake agent replies
- No GitHub integration
- No autonomous coding
- No automated test execution
- No authentication requirement for local use
