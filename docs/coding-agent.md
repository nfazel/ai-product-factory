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
- `OPENAI_API_KEY` is set, or a test provider is installed
- `PRODUCT_REPOSITORY_ROOT` is a configured local Git repository

If any condition fails, the page lists every blocking reason and no `AgentRun` is created.

A person presses **Start Coding Task**. There is no background scheduler. An autonomous low-risk task still needs that human start, and it still needs a later human code approval.

## Workflow

1. Create an isolated Git worktree and record the base commit.
2. Build the execution contract from approved artifacts.
3. Inspect a bounded set of files.
4. Write an execution plan.
5. For a supervised task, or any task that is not low risk, wait for **Approve Execution Plan**.
6. Apply typed file operations that pass policy.
7. Run every required check. Pass means the process exited 0.
8. Store the diff, evidence, and an AI self-review.
9. Move the workspace to `READY_FOR_REVIEW` only when the deterministic result allows it.
10. A person approves, requests changes, rejects, or abandons. After approval they may **Create Commit**.

The task moves to `IN_PROGRESS` when the workspace starts, `CODE_REVIEW` when the diff is ready for a person, and `COMPLETED` only after the checks passed, a person approved the code, and a commit exists.

## Model output

Reasoning is validated with Zod before it is stored. Separate schemas cover repository analysis, the execution plan, the change request, the self-review, the completion proposal, and an escalation. Prose does not trigger file or command tools. The change request carries typed operations.

The self-review is `AGENT_ANALYSIS` from `AI_ANALYSIS`. It is not a test result and it is not verification. The Testing & Verification Agent starts from the approved acceptance criteria and does not treat this review, the tests written here, or a passing check as proof. See [verification-agent.md](verification-agent.md). A completion proposal of `COMPLETED` is ignored when a required check failed, a tool was denied, or an escalation is open.

## Escalation

An open `CodingEscalation` blocks completion. Types include requirement ambiguity, architecture conflict, missing dependency, policy conflict, scope expansion, test failure, security concern, unexpected codebase, and other. Deleting a test, skipping a test, removing expectations, or disabling a lint or type check is treated as a test or security escalation and the write is refused.

## Failure

A failed run keeps the workspace, the diff, the evidence, the tool log, and the agent run. A person can retry, resume, or abandon. Abandon does not delete the worktree. Retry continues in the same workspace and skips a write whose content is already on disk.

## What it does not do

The agent does not push, open a pull request, merge, deploy, or reach production credentials. A person publishes an approved commit through the GitHub integration. See [github-integration.md](github-integration.md) and [pull-request-lifecycle.md](pull-request-lifecycle.md). A later commit on the same task flags existing verification `RE-VERIFICATION REQUIRED` and replaces the commit recorded on the code approval. The Coding Agent does not approve that verification and does not rewrite it.
