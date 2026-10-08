# Architecture Agent

The Architecture Agent works at the start of **Build**. It does not add an Architecture stage. The pipeline stays Explore → Define → Build → Prove → Ship → Learn.

It turns an approved product definition, an approved first product slice, and any available codebase context into a proposed solution architecture and a proposed implementation plan.

It behaves as a solution architect and technical lead. It designs the approach. It does not write production code, create branches or pull requests, deploy, approve its own architecture, approve its own plan, or change product requirements.

The Security & Engineering Governance Agent is a separate reviewer. It does not ask this agent whether its own design is safe. Governance runs only after a person has approved the architecture and the implementation plan. See [security-governance-agent.md](security-governance-agent.md).

## Entry conditions

A real run starts only when all of these are true:

- `Product.currentStage` is `BUILD`
- the current Product Brief is `APPROVED`
- the Product Definition is `APPROVED`, with an approved `PRODUCT_DEFINITION` approval
- a Product Slice is `APPROVED`

If any condition is missing, the agent does not run. The Build page lists what is blocking it. Seeded demo architecture can still be reviewed. The seed does not create an `AgentRun` and does not bypass the gate.

The agent is registered on the existing `AgentRunner` and calls `AIProvider.generate`. It does not add a second model integration. It is **CONFIGURED** only when the AI connection is configured, or when a test supplies a provider. Otherwise the control centre shows **NOT CONFIGURED** and no run is stored.

## Workflow

1. Generate architecture. The model returns a Zod object named `solution_architecture`.
2. The runner validates references, relationships, task dependencies, and vertical slices.
3. A valid response is stored as an `ArchitectureProposal`. It is not an approved architecture.
4. A person reviews the summary, components, relationships, technology choices, decisions, data design, integrations, security assessment, questions, and non-functional coverage.
5. The person edits, accepts, or rejects items. Human edits are kept when a section is regenerated.
6. Commit writes a draft `SolutionArchitecture` and its related rows in one transaction. A malformed response or an invalid relationship rolls back.
7. A person marks it ready for review and then approves it. Approval type: `SOLUTION_ARCHITECTURE`.
8. Only then can an implementation plan be generated. That plan has its own proposal, commit, and approval.

An approved architecture is not overwritten. A later commit is refused while an approved version exists.

## Structured model

The architecture is not one text blob.

- `SolutionArchitecture` holds the style, summary, rationale, and the frontend, backend, data, integration, security, deployment, and observability approaches.
- `ArchitectureComponent` holds each part, its type, responsibilities, technology, and rationale.
- `ArchitectureRelationship` connects two components. The type is one of calls, reads, writes, publishes, subscribes, authenticates, or integrates. A relationship must point at two different components that belong to the same architecture.
- `TechnologyChoice` records the choice, the reason, the alternatives, the trade-offs, and the constraint.
- `DataEntity` is a logical entity: owner, classification, retention, and relationships. It is not production SQL.
- `IntegrationDesign` records purpose, direction, protocol, the authentication assumption, the data exchanged, and failure behaviour.
- `ComponentTrace` links a component to a capability, a work item, a non-functional requirement, or an architecture decision by foreign key.

Temporary ids in the model response (`component-1`, `relationship-1`, and so on) are resolved only after those references check out.

`systemKind` is `GREENFIELD` or `EXISTING_SYSTEM`. A greenfield product may receive a new technical approach. An existing system should evolve in place. A recommendation to replace or migrate must state the reason, benefit, cost, risk, migration implications, and an alternative. Complexity must be justified. Microservices are not the default.

## Architecture decisions

`ArchitectureDecisionRecord` stores the title, context, decision, rationale, alternatives, and consequences. The agent may propose one. Its status stays `PROPOSED` until a person accepts it. The agent cannot set `ACCEPTED`.

## Non-functional traceability

Confirmed non-functional requirements stay on the existing `NonFunctionalRequirement` model. `NfrCoverage` links a requirement to a component, a decision, or a written mechanism. The agent does not invent a numeric target. If a decision needs a missing target, it asks an `ArchitectureQuestion`.

## Security assessment

There is no Security Agent yet. The architecture includes an **Initial Architecture Security Assessment** as `SecurityFinding` rows. Areas include authentication, authorisation, sensitive data, encryption, secrets, auditability, external integrations, retention, privacy, threats, and compliance. Each finding is `INFORMATION`, `CONCERN`, `DECISION_REQUIRED`, or `BLOCKER`. The Build page says this is not a full security review.

## Codebase context

`CodebaseContext` stores the repository name, an optional URL and branch, languages, frameworks, databases, infrastructure, deployment platform, a summary, key directories and components, known integrations, constraints, and observations.

`source` is `MANUAL`, `DEMO`, `LOCAL_ANALYSIS`, or `FUTURE_GITHUB`. A person can type the context. The seed writes a demo context. If `CODEBASE_CONTEXT_ROOT` is set, Build can read that directory's `package.json` and its top-level folder names. The browser cannot supply a path. The application does not clone a repository and does not walk an arbitrary filesystem. `FUTURE_GITHUB` is reserved for a later integration.

## Technical readiness

Readiness is computed from the stored architecture and plan. It is not copied from the model. Ten areas are scored `LOW`, `MEDIUM`, or `HIGH`:

1. Architecture clarity
2. Technology decisions
3. Data design
4. Integration design
5. Security considerations
6. NFR coverage
7. Open architecture questions
8. Implementation task quality
9. Task dependencies
10. Validation strategy

The page shows "N of 10 areas sufficiently understood." Only `HIGH` counts. `LOW` and `MEDIUM` include an explanation. There is no percentage.

## Change impact

If an approved requirement changes after the architecture is approved, the architecture row sets `reviewRequired` and records why. The approval stays. The architecture is not rewritten.

If the architecture changes after the implementation plan is approved, the plan sets `reviewRequired` and records why. That approval also stays.

## Diagram

The component diagram is generated from `ArchitectureComponent` and `ArchitectureRelationship`. The structured rows are the source of truth. The page also lists every relationship in words, so the architecture can be read without the diagram. Selecting a component shows its purpose, technology, responsibilities, capabilities, related requirements, and related decisions.

## Future coding agent

Coding readiness is **NOT READY** until the brief, the definition, the first slice, the solution architecture, the implementation plan, engineering governance, and the coding policy are approved, and no deterministic governance blocker remains. The label is then **CODING READY**. The Coding Agent honours those gates, the coding policy, and each task's coding-risk recommendation. See [coding-agent.md](coding-agent.md).
