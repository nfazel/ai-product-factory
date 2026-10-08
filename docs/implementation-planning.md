# Implementation planning

Implementation planning is part of Build. It starts only after a person has approved the solution architecture.

The Architecture Agent proposes the plan. A person reviews, edits, and approves it. The agent cannot approve the plan.

## Plan model

`ImplementationPlan` belongs to a product, a product slice, and a solution architecture. Status is `DRAFT`, `READY_FOR_REVIEW`, `APPROVED`, or `SUPERSEDED`.

`ImplementationTask` is a coherent technical change. It stores:

- objective
- the related story or feature (`workItemId`)
- the vertical slice name
- components affected
- files or modules likely affected, when known
- guidance
- validation expectations
- risks
- sequence
- whether it can run in parallel
- complexity: `SMALL`, `MEDIUM`, `LARGE`, or `UNKNOWN`

The plan does not estimate hours and does not invent a delivery duration. It does not contain production code.

Status moves through `PROPOSED`, `APPROVED`, `IN_PROGRESS`, `COMPLETED`, and `BLOCKED`. A generated task starts as `PROPOSED`.

## Vertical slices

The system prompt tells the agent to prefer end-to-end slices.

Prefer:

1. Submit a basic claim end to end
2. Upload evidence end to end
3. Track a claim end to end

Avoid a plan shaped as all of the database, then all of the backend, then all of the middleware, then all of the frontend, then a single test pass.

A task title or slice name that says "build all of the database" or "build all of the backend" is rejected. A task that says "build the claims management system" is too large. A task that changes one file for its own sake is too small. Each task should be one change a future coding agent can attempt with bounded context.

## Dependencies

`ImplementationTaskDependency` records that one task is blocked by another. The plan says which tasks are sequential, which are parallel, and which are blocked.

Cycles are detected before the tasks are kept. A cycle throws, and the transaction rolls back, so an invalid plan is not stored.

The Build page shows the sequence, **BLOCKED BY**, and **ENABLES**.

## Approval

The plan proposal is separate from the architecture proposal. Commit saves a draft plan. A person marks it ready for review and then approves it. The approval type is `IMPLEMENTATION_PLAN`.

Generating or approving a plan requires an approved solution architecture. The Architecture Agent is refused if it is named as the approver.

## Human edits

A person can edit a task's objective, guidance, validation, and dependencies. A human-locked task is kept when a later proposal is committed. Regenerating "implementation tasks for Feature X" replaces only the unlocked tasks that match that feature.

## Change impact

Editing an approved architecture, or accepting an architecture decision on an approved architecture, flags **Implementation Plan review required** when a plan is already approved. The plan approval is not deleted.

## Coding readiness

Coding readiness stays **NOT READY** until the brief, the definition, the first slice, the solution architecture, the implementation plan, engineering governance, and the coding policy are approved, and no deterministic governance blocker remains. The Build page does not offer a coding action. A future Coding Agent will have to see those gates before it can run.
