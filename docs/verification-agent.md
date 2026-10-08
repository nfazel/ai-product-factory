# Testing & Verification Agent

The Testing & Verification Agent answers one question: does the implemented software satisfy the approved requirements and acceptance criteria, and what evidence proves that?

It is independent of the Coding Agent. It did not implement the code. A coding self-review, tests written during coding, a green build, a green lint, or a passing existing suite are inputs. None of them is the verdict.

The pipeline stays Explore, Define, Build, Prove, Ship, Learn. Task-level verification can start while the product is still in Build, against a completed implementation. Build means implementation and task-level verification are happening. Prove means the approved product slice is being proven as a whole. One verified task does not move the product into Prove. A person moves the stage.

## Responsibilities

- Requirements Agent: what the product must do.
- Architecture Agent: how it should be built.
- Coding Agent: implement the approved task.
- Verification Agent: independently verify that implementation.

The approved acceptance criteria are the source of truth. The agent cannot redefine them.

```
Acceptance criteria
  → test conditions
  → test cases
  → test execution
  → evidence
  → verdict
```

## Entry

Verification starts only when all of these are true:

- the implementation task status is `COMPLETED`
- a human `CODE_CHANGE` approval exists and is not stale
- the coding workspace has a 40-character commit SHA
- that repository workspace still exists
- the coding execution contract is not stale
- every required coding check has evidence with result `PASS` and exit code 0

An empty required-check list fails closed. If any condition fails, the page lists every blocker and no `AgentRun` is created. A missing model key or a missing `PRODUCT_REPOSITORY_ROOT` also stops before a run.

The agent is the existing `TESTING` type, registered on the same `AgentRunner` and `AIProvider` as the other agents. On `/agents` it is **CONFIGURED** only when the model is configured and a repository is configured. The control centre shows runs, completed runs, failed runs, blocked sessions, and average duration from stored rows. Blocked is the count of non-demo verification sessions in status `BLOCKED`.

## Verification contract

`buildVerificationContract` writes the contract from approved upstream artifacts before the model is asked anything:

- implementation task objective
- related story
- acceptance criteria, copied with their ids
- confirmed non-functional requirements
- architecture summary
- open governance findings linked to the task
- coding execution contract summary
- commit SHA
- changed files
- the seven required verification areas

A source fingerprint covers that content. The model cannot replace the criteria.

## Conditions and cases

Before tests are stored, the runner derives conditions from the approved criteria. It also records a security condition when the contract contains security constraints. The model may propose additional conditions and cases. Unknown acceptance-criterion ids are dropped. The runner does not invent hundreds of scenarios. The model schema allows at most twelve conditions and eight cases.

Each case records title, purpose, preconditions, steps, expected result, test type, priority, source, and provenance. Test types include unit, integration, API, UI, end to end, security, performance, accessibility, manual, and other. The system does not pretend every type can run automatically. Automated execution today is `node --test` against a verification test file, plus the allowlisted regression command `npm test`.

Existing repository tests are inspected and recorded as `HUMAN_EXISTING` or `CODING_AGENT` when the file contains `AI Product Factory Task`. They are not executed as proof, and a filename is not treated as coverage.

## Workspace

Each session gets a `VerificationWorkspace`: a Git worktree on branch `ai-factory/verify-task-…`, based on the approved coding commit. The coding workspace and the repository's main working tree are not modified. The approved commit is not amended.

The agent may read non-secret application code and existing tests. It may create files only under `verification/…/*.test.mjs` and `verification/…/fixtures/…`. A write to production implementation code is denied, recorded, and escalated as `IMPLEMENTATION_CHANGE`. The agent records a defect. It does not fix the code.

Commands reuse the coding allowlist (`npm test`, `npm run test`, `npm run typecheck`, `npm run build`) plus exactly `node --test <verification test path>`. Shell chaining, secret dumps, network bootstrap, `git push`, merge, and deploy are rejected.

## Verdict

The model may propose `PASS`, `PASS_WITH_CONCERNS`, `FAIL`, or `INCONCLUSIVE`. `decideVerdict` overrides that proposal.

`PASS` requires every acceptance criterion to be `VERIFIED` or human-confirmed `NOT_APPLICABLE`, at least one criterion `VERIFIED`, no required verification test failed, existing regression passed, no open critical or high defect, and no open blocking escalation.

`PASS_WITH_CONCERNS` is that same bar with an open low or medium defect.

`FAIL` is a failed criterion, a failed required test, a failed regression, an open critical or high defect, or a blocking escalation.

`INCONCLUSIVE` is missing criteria, a regression that did not pass, or criteria that are not yet accounted for.

A command that exits 0 is execution success. It becomes acceptance verification only when the executed test is from the Verification Agent and its body contains `// verifies:<criterionId>` together with an assertion. Coding-agent tests do not satisfy that rule.

## Human review

When a session completes, Prove shows the verdict, coverage, cases, results, regression, defects, evidence, untested areas, and the model analysis labelled as analysis. A person can approve verification, request more testing, reject verification, or record a manual result (`PASS`, `FAIL`, or `BLOCKED`) with a comment, tester, and timestamp. Manual results are `MANUAL_CONFIRMATION` from `HUMAN`. They are not command results.

`NOT_APPLICABLE` requires a person. The model schema has no status field that can set it. Confirming every criterion not applicable, with nothing verified, stays inconclusive.

Approval type `VERIFICATION` stores the session, the task, the commit SHA, and a fingerprint of executions and coverage. Only a person can approve. The names Testing & Verification Agent, Testing Agent, Verification Agent, and Coding Agent are refused.

## Re-verification and change impact

Historical sessions and evidence are kept. Re-running failed tests appends executions. Starting verification again creates a new session.

These changes flag `RE-VERIFICATION REQUIRED` and do not delete history:

- an acceptance criterion is added or its status changes
- requirement text changes
- architecture relevant to the task changes
- governance review is required again
- coding policy needs reapproval
- the implementation commit changes

A later commit also marks the verification approval stale. Approval is not carried forward.

## Integrated slice and product readiness

`IntegratedVerificationSession` plans verification of the approved product slice from its tasks, commits, task-level results, and known defects. There is no browser or deployment environment, so the plan records that end-to-end behaviour was not executed. The integrated verdict is `INCONCLUSIVE` and the status is `BLOCKED`.

Product Prove Readiness does not move the stage. For the approved slice it checks that every task is completed, each has a non-demo, non-stale session with `PASS` or `PASS_WITH_CONCERNS` and a non-stale verification approval, and no critical or high defect is open. That state is labelled **PRODUCT SLICE VERIFIED**. While the product is in Build the reason is **Ready to move to PROVE**. If the product is already in Prove, the reason is **Ready for Release Review**.

## What it does not do

The agent does not push, merge, deploy, scan for vulnerabilities, run a performance harness, drive a browser, or ask the Coding Agent to fix a defect. Those steps come later. A future feedback loop is defect, human triage, a coding task, a fix, then a new independent verification.
