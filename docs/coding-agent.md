# Coding Agent

The Coding Agent executes one approved implementation task during Build. It is the first agent allowed to change source code. It is not a general software engineer.

The pipeline stays Explore, Define, Build, Prove, Ship, Learn. Coding does not add a stage.

## Authority

The agent may inspect and modify only what the coding execution contract allows. It must not decide product scope, invent requirements, change acceptance criteria, or redesign approved architecture. If the task cannot be finished inside the contract, it stops and escalates.

Repository actions go through typed tools. A model instruction cannot override a path check, a command check, or a failed exit code.

## Entry

Execution starts only when all of these are true:

- the product stage is Build
- the product brief, product definition, first slice, solution architecture, implementation plan, engineering governance review, and coding policy are approved
- coding readiness is `CODING READY`
- the selected task is `APPROVED`
- the effective execution mode is not `HUMAN_ONLY`
- no dependency is still unresolved
- no other workspace for that product is still open
- the AI connection is configured, or a test provider is installed
- the product has a local Git repository, or `PRODUCT_REPOSITORY_ROOT` is set as a legacy fallback for a product with no repository of its own

If any condition fails, the page lists every blocking reason and no `AgentRun` is created.

A person presses **Generate Execution Plan**. That creates the plan and does not approve it. There is no background scheduler. An autonomous low-risk task still continues into implementation after that start, and it still needs a later human code approval. Every other task waits for an explicit **Approve Execution Plan** on the current version, then **Start Coding**.

## Workflow

1. Create an isolated Git worktree and record the base commit.
2. Build the execution contract from approved artifacts.
3. Inspect a bounded set of files.
4. Write an execution plan and leave it unapproved. **Request Changes** keeps that version in history and requires a new version. Approval of an earlier version does not cover the new one.
5. For a supervised task, or any task that is not low risk, wait for **Approve Execution Plan**. Opening or editing the plan does not approve it. Approval records the reviewer, the time, and the version, and does not start implementation.
6. After **Start Coding**, apply typed file operations that pass policy and stay inside the files named by the approved plan. A file outside that plan is escalated and is not written.
7. Run every required check. Pass means the process exited 0.
8. Store the diff, evidence, and an AI self-review.
9. Move the workspace to `READY_FOR_REVIEW` only when the deterministic result allows it.
10. A person approves, requests changes, rejects, or abandons. After approval they may **Create Approved Commit**, which locks the approved snapshot as a local commit. Independent Verification starts from that commit.

The task moves to `IN_PROGRESS` when the workspace starts, `CODE_REVIEW` when the diff is ready for a person, and `COMPLETED` only after the checks passed, a person approved the code, and a commit exists.

Coding runs inside the request that starts it. File writes, commands, and check results are saved as they happen. Build shows those saved events after a refresh. It does not estimate progress, and it does not keep a separate job queue. A finished coding run is not code approval and not independent verification.

A greenfield plan may create the parent directory of an approved file. That directory is not a separate scope expansion. Commands run only when the approved plan names them and they are in the closed setup or validation catalog. `npm install`, `npx prisma generate`, and `npx prisma validate` are catalog entries; wildcards are not. A check with no script in the repository is recorded as not applicable, not as a pass. Before coding starts, a pre-flight check refuses a plan whose files or commands the contract cannot execute. Revising that plan creates the next version and leaves the earlier version, its approval, and the failed run in place. The next version still needs a person's approval.

## Model output

Reasoning is validated with Zod before it is stored. Separate schemas cover repository analysis, the execution plan, the change request, the self-review, the completion proposal, and an escalation. Prose does not trigger file or command tools. The change request carries typed operations.

The self-review is `AGENT_ANALYSIS` from `AI_ANALYSIS`. It is not a test result and it is not verification. The Testing & Verification Agent starts from the approved acceptance criteria and does not treat this review, the tests written here, or a passing check as proof. See [verification-agent.md](verification-agent.md). A completion proposal of `COMPLETED` is ignored when a required check failed, a tool was denied, or an escalation is open.

## Escalation

An open `CodingEscalation` blocks completion. Types include requirement ambiguity, architecture conflict, missing dependency, policy conflict, scope expansion, test failure, security concern, unexpected codebase, and other. Deleting a test, skipping a test, removing expectations, or disabling a lint or type check is treated as a test or security escalation and the write is refused.

## Failure

A failed run keeps the workspace, the diff, the evidence, the tool log, and the agent run. A person can retry, resume, or abandon. Abandon does not delete the worktree. Retry continues in the same workspace and skips a write whose content is already on disk.

## What it does not do

The agent does not push, open a pull request, merge, deploy, or reach production credentials. A person publishes an approved commit through the GitHub integration. See [github-integration.md](github-integration.md) and [pull-request-lifecycle.md](pull-request-lifecycle.md). A later commit on the same task flags existing verification `RE-VERIFICATION REQUIRED` and replaces the commit recorded on the code approval. The Coding Agent does not approve that verification and does not rewrite it.
