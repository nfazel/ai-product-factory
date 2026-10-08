# Coding execution contract

The coding execution contract is the Coding Agent's authority for one implementation task. The application builds it from approved records. The model does not invent it.

## Sources

The contract combines:

- the implementation task objective, validation notes, and title
- the story's acceptance criteria
- linked architecture component responsibilities and the architecture summary
- the approved coding policy: allowed paths, restricted paths, prohibited actions, required checks, and the file limit
- the task's effective coding risk and execution mode, including a human override
- task dependencies

A null file limit becomes 8. Deletion is allowed only when the task title or objective says remove or delete. A fingerprint of these inputs is stored so a later regeneration can be compared.

The Build page shows the preview before start: task, objective, related story, acceptance criteria, allowed and restricted paths, architecture constraints, required checks, execution mode, file limit, and dependencies.

## Plan

The agent writes a `CodingExecutionPlan` after inspection and before edits. If the plan names a forbidden path or too many files, the run escalates and does not edit.

A low-risk autonomous task whose plan stays inside the contract may continue without a second click. Every other mode waits for **Approve Execution Plan**. Autonomous does not mean unattended: the task itself was approved by a person, and the code still needs a person.

## Stale contract

While a workspace is open, a change to the product definition, architecture, implementation plan, coding policy, or governance review sets `EXECUTION CONTRACT STALE` on the workspace and the contract. Further writes and plan approval stop. The previous approvals are kept.

A person can review the flag, **Regenerate Contract**, then resume, or abandon the workspace. Regeneration rewrites the contract from the current approved artifacts. If the fingerprint changed, the plan returns to `PROPOSED`.

## Evidence and diff

`CodingEvidence` records file changes, check results, and analysis. Check rows use source `COMMAND_RUNNER` and store the command, start, finish, and exit code. `PASS` is written only when the exit code is 0. AI text is never stored as a `TEST_RESULT`.

The diff stores file names, additions, deletions, and a capped patch. The code-approval hash uses the full patch so a later edit makes the approval stale without deleting it.

## Human review

When the workspace is `READY_FOR_REVIEW`, a person can:

- **Approve Code Changes**, which creates an approval of type `CODE_CHANGE` bound to the task, workspace, base commit, current head, and diff hash
- **Request Changes**, which keeps the same workspace and the same contract
- **Reject Changes**
- **Abandon Workspace**

Requesting a path outside the contract escalates instead of widening the contract. The Coding Agent cannot approve code. A commit is refused until a non-stale approval matches the current diff.

## Security choices

A few controls are stricter than a loose reading of the policy, because a bad policy must not open them:

- the factory repository is refused unless an operator sets `PRODUCT_REPOSITORY_ALLOW_FACTORY=true`
- CI workflows, ESLint config, and secret files are denied even when the allow list is `**`
- metadata reads do not grant metadata writes
- an autonomous task that is not low risk still needs plan approval
- a failed workspace keeps the one-workspace slot until a person abandons it or it completes
- factory Git commands disable commit signing and filesystem monitoring so a machine-wide `commit.gpgsign` or `core.fsmonitor` setting cannot stall or sign the work
