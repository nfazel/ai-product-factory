# Architecture

AI Product Builder is a modular monolith. One Next.js application owns the product development domain. Modules are separated so a later service split can move a module's repository and service without rewriting the model the rest of the product depends on. The visible experience is described in [product-experience.md](product-experience.md).

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
| Requirements | Outcomes, capabilities, proposals, the first slice, readiness, and the requirements runner. |
| AI | `AIProvider`, the provider registry, and the Gemini, Ollama, and OpenAI adapters. Server-side only. See [ai-providers.md](ai-providers.md). |
| Work item | Backlog items, hierarchy, and dependencies. |
| Acceptance | Criteria on a work item, including pass and fail. |
| Decision | Human decisions, optionally tied to a work item. |
| Approval | Pending, approved, and rejected gates, including product discovery. |
| Activity | Append-only audit history and filters. |
| Agent | Catalogue, run records, runner registry, and run lifecycle. |
| Dashboard | Read model composed from the modules above. |
| Analytics | Flow, delivery, quality, AI, governance, release, outcome, and portfolio metrics. Calculated from operational records. Factory Insights may explain those numbers and cannot change them. |

Public imports go through each module's `index.ts`. Pages may also import a focused read function such as `getProductOverview` when that keeps a service from depending on the UI.

## Pipeline

The stage order is fixed:

`EXPLORE → DEFINE → BUILD → PROVE → SHIP → LEARN`

A stage before the product's current stage is completed. The current stage is highlighted. Later stages stay inactive. Only a person moves `currentStage`. Creating a product sets status to `ACTIVE` and stage to `EXPLORE`.

Work item hierarchy:

- An epic has no parent. It can point at a product capability.
- A feature belongs to an epic.
- A story belongs to a feature.
- A task or defect may sit under an epic, feature, story, or, for a defect, a task.
- A capability belongs to an outcome. An outcome can point at the product brief that justified it.

Moving the product to Build is refused until the current brief is approved, a product-definition approval is approved, and a first product slice is approved. That check lives in the product update path as well as the Definition page.

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

The log stores the actor name supplied to the service. Until authentication exists, the interface does not present that placeholder as a business role. A person can still type a decision maker where a form asks for one.

## Authentication, later

`src/proxy.ts` runs before the request and currently continues it. `getCurrentActor()` returns a local actor. A future login replaces those two pieces. Services already accept the actor name when they write history, so they do not need to know the provider.

## Agents

The catalogue in `src/domain/constants.ts` names the agents:

- Product Discovery — implemented
- Requirements — implemented
- Architecture — implemented, inside Build
- Security & Engineering Governance — implemented, inside Build, as the existing `SECURITY` agent type
- Planning and Review — not configured
- Coding — implemented, inside Build. **CONFIGURED** only when the AI connection is configured and `PRODUCT_REPOSITORY_ROOT` is a Git repository outside this application, unless `PRODUCT_REPOSITORY_ALLOW_FACTORY=true`
- Testing & Verification — implemented, as the existing `TESTING` agent type. It verifies one completed task and can run while the product is still in Build. **CONFIGURED** only when the model and a repository are both configured

Product Discovery, the Requirements Agent, the Architecture Agent, and the Security & Engineering Governance Agent are **CONFIGURED** only when the active provider and model are set and that provider can be called, or when a test supplies a provider. Google Gemini and OpenAI need their server credential. Ollama needs a reachable endpoint and an installed model. The Coding Agent and the Testing & Verification Agent also need a repository. The control centre reads run counts, completed runs, failed runs, and average duration from `AgentRun`. The Coding Agent also shows how many completed runs escalated. The Testing & Verification Agent also shows how many non-demo sessions are `BLOCKED`. Token counts are stored when the provider returns them. Cost is left empty rather than guessed. A later configuration may give the Coding Agent and the Verification Agent different models. Different models do not prove correctness.

Build is where implementation and task-level verification happen. Prove is where the approved product slice is assessed as a whole. AI Product Builder does not move the product into Prove because one task was verified.

The governance agent is not a mode of the Architecture Agent. The Architecture Agent proposes how to build. The governance agent independently asks whether that proposal is safe, supportable, and ready to build. See [security-governance-agent.md](security-governance-agent.md).

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

`ensureAgentsRegistered()` adds the Product Discovery, Requirements, Architecture, Governance, Coding, and Testing & Verification runners. `executeAgent` looks up the runner for the requested type. If it is missing or not configured, it throws `AgentNotConfiguredError` before inserting an `AgentRun`. A runner may also refuse in `assertCanRun` before that insert. `POST /api/agent-runs` returns that refusal and does not fabricate output.

When a configured runner executes:

1. Create an `AgentRun` with status `RUNNING` and the structured input.
2. Call the provider through `AIProvider.generate`. The registry selects the configured Gemini, Ollama, or OpenAI adapter. The credential never leaves the server. Another provider is not substituted when the selected one fails.
3. Validate the response with Zod. On failure, store a redacted error, set status `FAILED`, and leave the product brief unchanged.
4. On success, store the structured output, duration, and token usage. `estimatedCost` stays null.
5. Append an activity record.

The discovery runner may update the product brief and assumptions. It cannot approve them, change `currentStage`, or delete a human confirmation. See [product-discovery-agent.md](product-discovery-agent.md).

The requirements runner writes an uncommitted proposal. It does not approve outcomes, the first slice, or the product definition, and it does not change `currentStage`. Human-confirmed records are not overwritten. See [requirements-agent.md](requirements-agent.md) and [traceability.md](traceability.md).

The architecture runner also writes an uncommitted proposal. It does not approve the solution architecture, an architecture decision, or the implementation plan, and it does not change `currentStage`. An approved architecture is not overwritten by a later proposal. See [architecture-agent.md](architecture-agent.md) and [implementation-planning.md](implementation-planning.md).

The coding runner executes one approved implementation task in a Git worktree. Repository tools enforce the execution contract. The agent cannot approve its own diff, push, or merge. See [coding-agent.md](coding-agent.md), [repository-workspace.md](repository-workspace.md), and [coding-execution-contract.md](coding-execution-contract.md).

The verification runner is a separate agent. It reads the approved acceptance criteria, builds a deterministic verification contract, and executes in its own worktree based on the approved coding commit. It cannot change production code, approve itself, or treat the Coding Agent's self-review as the verdict. See [verification-agent.md](verification-agent.md) and [verification-evidence.md](verification-evidence.md).

GitHub is not an agent. `SourceControlProvider` publishes an approved branch and reads pull request state. No provider method can merge. See [github-integration.md](github-integration.md) and [pull-request-lifecycle.md](pull-request-lifecycle.md).

Release and deployment are not an agent. A release candidate is created from an approved slice, merged pull requests, and current verification. A person approves the release and records the deployment. AI Product Builder does not deploy or mark a product outcome achieved. See [release-governance.md](release-governance.md), [deployment-governance.md](deployment-governance.md), and [learn-loop.md](learn-loop.md).

Factory Intelligence is not an agent. `src/modules/analytics` reads operational rows into one snapshot and calculates metrics in pure functions. The dashboard and the product Intelligence tab render those results. Factory Insights calls the model with the calculated metrics only. See [factory-intelligence.md](factory-intelligence.md) and [metrics-catalogue.md](metrics-catalogue.md).

## Product brief storage

Assumptions are their own table. Each one has impact, confidence, and a status a person can change (`UNVALIDATED`, `VALIDATED`, `INVALIDATED`). That lifecycle does not fit a JSON blob.

The other multi-value brief sections are ordered notes without their own workflow. They are JSON arrays of `{ id, text, origin }`. Prose fields keep their origin in `fieldOrigins`. Origin is `AI_PROPOSAL`, `HUMAN_CONFIRMED`, or `UNRESOLVED`. Confirmed prose and validated or invalidated assumptions are kept when a later agent turn arrives.

## What this application does not do

- No independent Review or Release agent
- No automatic merge, autonomous deployment, automatic rollback, or background GitHub polling
- No background scheduler that starts coding without a person
- No production credentials or cloud deployment integration
- No automatic stage movement or automatic outcome achievement
- No authentication requirement for local use
- No invented model response when the AI connection is missing, and no silent fallback to another provider or model
- No data warehouse, external BI feed, automatic performance target, or invented ROI
- No analytics that treat a missing timestamp as zero or a demo deployment as production
