# Security & Engineering Governance Agent

The Security & Engineering Governance Agent is an independent reviewer inside **Build**. It does not add a pipeline stage. The pipeline stays Explore → Define → Build → Prove → Ship → Learn.

The Architecture Agent proposes how to build. This agent did not create that design. It asks whether the approved definition, the approved solution architecture, the approved implementation plan, the non-functional requirements, the known risks and assumptions, and the codebase context are safe, supportable, and ready to build.

It challenges, assesses, identifies risk, and recommends. A person gates the result. The agent does not redesign the solution unless a material issue requires a change. It does not write production code, modify a repository, create a branch, open a pull request, deploy, approve its own review, or silently change requirements, architecture, or the plan.

## Independence

The review is a separate agent (`SECURITY` in the catalogue), registered on the existing `AgentRunner` and `AIProvider`. It is not a mode of the Architecture Agent. The system prompt tells the model that it did not create the architecture, that it must not defend the design, and that it must not mark something safe merely because the Architecture Agent proposed it.

The control centre shows **CONFIGURED** only when `OPENAI_API_KEY` is set, or when a test supplies a provider. It shows Runs, Completed, Failed, and Average duration from real `AgentRun` rows. Otherwise it shows **NOT CONFIGURED**.

## Entry conditions

A run starts only when all of these are true:

- `Product.currentStage` is `BUILD`
- the current Product Brief is `APPROVED`
- the Product Definition is `APPROVED`
- a Product Slice is `APPROVED`
- the Solution Architecture is `APPROVED`
- the Implementation Plan is `APPROVED`

If any gate is missing, the agent does not run and no `AgentRun` is created. The Build page lists each missing gate.

## What the review contains

The model returns one Zod object. A malformed response is refused and does not create a partial review. References to components, decisions, tasks, non-functional requirements, work items, and assumptions must be real identifiers from the context. The commit runs in a transaction.

`EngineeringGovernanceReview` stores the proposed overall assessment (`PASS`, `PASS_WITH_ACTIONS`, or `BLOCKED`), the summary, and the security, privacy, engineering, implementation-plan, and dependency narratives. Status moves `DRAFT` → `READY_FOR_REVIEW` → `APPROVED`. The model may propose the assessment. Only a person can approve the review.

Findings use a category, a severity, evidence, a recommendation, a status, an owner, and whether the finding is due before coding. `HIGH` and `CRITICAL` are for material concerns. Each finding can link to an architecture component, an architecture decision, an implementation task, a non-functional requirement, a work item, and an assumption, so a person can see what caused the concern.

A lightweight `Threat` records title, description, affected component, attack surface, likelihood, impact, mitigation, and status. It is proportionate to the first slice. It is not an enterprise threat-modelling process and it is not a penetration test.

Privacy is a written assessment. If jurisdiction, regulation, retention, or classification is unknown, the review asks an open `GovernanceQuestion`. The agent must not claim that a design is GDPR compliant. Prefer “GDPR applicability requires confirmation.”

The engineering narrative covers complexity, coupling, failure handling, observability, deployment, rollback, configuration, and testability. It does not recommend microservices, Kubernetes, queues, or caches unless the slice needs them.

The plan narrative challenges task size, dependency cycles, vertical slicing, validation, and a backend-then-middleware-then-UI-then-QA sequence when one vertical slice would do.

## AI coding risk

Each implementation task receives a `CodingRiskAssessment`:

- risk `LOW`, `MEDIUM`, `HIGH`, or `PROHIBITED`
- recommended mode `AUTONOMOUS`, `SUPERVISED`, or `HUMAN_ONLY`
- a reason
- whether human review is required

The agent recommends. A person can override the risk and the mode. An override requires a rationale and is written to Activity, including who changed it and why. A `PROHIBITED` task blocks coding readiness until a person records that resolution.

## Coding boundaries

The review proposes a `CodingPolicy`: allowed paths, restricted paths, prohibited actions, required checks, whether tests are required, whether human review is required, and an optional maximum number of files per task. The policy is human-approved. See [coding-policy.md](coding-policy.md).

## Evidence

`GovernanceEvidence` records the type, source, description, and result. Model output may only use `AI_ANALYSIS` with source `AI_REVIEW`. Human actions record `HUMAN_CONFIRMATION`. The application rejects evidence that claims `TOOL VERIFIED`, a dependency scan, a security scan, or static analysis unless a real tool recorded it. No scanner is connected yet. Dependency comments stay labelled **AI REVIEW**.

## Deterministic blocking

Coding readiness does not trust the model’s `PASS`. Coding stays blocked when any of these is true:

- a `CRITICAL` finding is `OPEN`
- a `HIGH` finding marked due before coding is `OPEN`
- a `PROHIBITED` coding task has no human resolution
- a governance question marked blocking is `OPEN`
- the coding policy is not approved, or it needs reapproval
- the governance review is not approved, or it needs another review

A medium finding does not block by itself. A high finding that is not due before coding does not block by itself.

## Governance readiness

Ten areas are rated `LOW`, `MEDIUM`, or `HIGH` from the stored review: security, privacy, architecture quality, reliability, observability, data protection, implementation plan quality, testability, AI coding suitability, and open governance questions. The page says “N of 10 areas sufficiently understood.” Only `HIGH` counts. Low and medium ratings include an explanation. There is no percentage.

## Human approval

Workflow:

1. Approved architecture and approved implementation plan.
2. Run the governance review. The result is a proposal.
3. A person accepts and commits a draft.
4. The person resolves, accepts, mitigates, or closes findings. Accepting a high or critical risk requires a rationale.
5. The person reviews coding-risk recommendations and may override them.
6. The person approves the coding policy (`CODING_POLICY`).
7. The person approves the governance review (`ENGINEERING_GOVERNANCE`).

The agent cannot approve either one. Approving the review does not move the product stage and does not start coding.

Selective re-review can target security, privacy, the plan, the architecture, or one implementation task. Accepted and edited proposal items are kept. Human-locked findings and coding-risk overrides are kept. A selective commit after approval flags **GOVERNANCE REVIEW REQUIRED** and does not delete the approval.

## Change impact

An edit to an approved solution architecture, or to an approved implementation plan, after governance approval sets `reviewRequired`, a reason, and `reviewFlaggedAt`. An edit to an approved coding policy sets `reapprovalRequired`, a reason, and `reapprovalFlaggedAt`. Approvals stay in place. Nothing is silently reapproved.

## Coding readiness

**CODING READY** requires:

- an approved Product Brief
- an approved Product Definition
- an approved first Product Slice
- an approved Solution Architecture
- an approved Implementation Plan
- an approved Engineering Governance review that is not flagged
- an approved Coding Policy that does not need reapproval
- no deterministic blocker above

Otherwise the label is **NOT READY**, and every missing or blocking condition is listed. The product also needs to be in Build.

## Coding Agent

The Coding Agent reads the approved coding policy, stays inside the allowed paths, refuses prohibited actions, and follows each task’s effective coding-risk mode. A model `PASS` is not permission to code. See [coding-agent.md](coding-agent.md).
