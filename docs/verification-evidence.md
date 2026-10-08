# Verification evidence

Verification evidence is the record that lets a person answer: show me the evidence that this acceptance criterion passed. A green command is not that answer by itself.

## Chain

```
Acceptance criterion
  → VerificationCondition
  → VerificationTestCase
  → VerificationExecution
  → VerificationEvidence
  → VerificationCoverage
  → overall verdict
```

Every criterion in the session has one coverage status:

| Status | Meaning |
| --- | --- |
| `VERIFIED` | An independent automated test demonstrated it, or a person recorded a manual pass |
| `FAILED` | A linked verification execution failed |
| `NOT_TESTED` | No demonstrating result exists |
| `BLOCKED` | The check could not be run |
| `NOT_APPLICABLE` | A person confirmed it does not apply |

`NOT_APPLICABLE` without `humanConfirmed` does not count.

## Evidence rows

`VerificationEvidence` stores type, source, description, result, command, exit code, and optional links to a test case and an acceptance criterion.

Types that this version actually writes:

- `TEST_RESULT` from `COMMAND_RUNNER` when a test command ran
- `TYPECHECK_RESULT` and `BUILD_RESULT` when those allowlisted commands ran
- `MANUAL_CONFIRMATION` from `HUMAN` when a person records a result
- `AI_ANALYSIS` from `AI_ANALYSIS` for the model's interpretation

`STATIC_ANALYSIS` is reserved. `SCREENSHOT_FUTURE`, `PERFORMANCE_RESULT_FUTURE`, and `SECURITY_SCAN_FUTURE` are not written. The agent does not claim a screenshot, a browser result, a performance number, or a security scan unless that tool ran. No scanner and no performance tool are installed.

Demo seed evidence is `MANUAL_CONFIRMATION` with result `DEMO PASS` and no exit code. The description says no command was executed.

## Oracle

`TEST EXECUTION SUCCESS` and `REQUIREMENT VERIFICATION` are separate.

A new verification command that exits 0 stores result `EXECUTED` unless the test body was written by the Verification Agent and contains both `// verifies:<criterionId>` and an assertion. Only then is the result `DEMONSTRATED` and the coverage `VERIFIED`.

An existing test that passes, including one written by the Coding Agent, does not move a criterion to `VERIFIED`.

## Provenance

| Provenance | Meaning |
| --- | --- |
| `HUMAN_EXISTING` | A test already in the repository, inspected only |
| `CODING_AGENT` | A test whose body contains the Coding Agent task marker |
| `VERIFICATION_AGENT` | A test proposed and, when automated, written in the verification worktree |

Final automated coverage prefers `VERIFICATION_AGENT` evidence. The same agent that wrote the implementation is not the source of the demonstrating test.

## Regression

`npm test` is recorded as `EXISTING_REGRESSION`, separate from `NEW_VERIFICATION`. A new test can pass and the verdict can still be `FAIL` when regression fails. Regression that does not produce a pass, and no failure, leaves the verdict `INCONCLUSIVE`.

## Non-functional and security behaviour

Only confirmed non-functional requirements are assessed. Each one is stored as `NOT_TESTED` with the note that it requires manual verification, because no accessibility or performance tool is installed. The system does not invent those results.

Security verification uses governance findings as conditions. Tests may check behaviours such as authorisation, invalid input, or unsafe file types when a real test can express them. That is not penetration testing and not a vulnerability scan. The security readiness area counts as evidenced when a security test passed, or when the contract has no security-finding condition.

## Readiness areas

Prove shows how many of these seven areas have evidence. It does not show a percentage.

1. Acceptance criteria
2. Functional behaviour
3. Negative paths
4. Regression
5. Security-relevant behaviour
6. NFRs
7. Evidence completeness

Zero to two areas is `LOW`. Three to five is `MEDIUM`. Six or seven is `HIGH`. NFR evidence counts only when an NFR result is `VERIFIED`. This version does not auto-verify NFRs, so that area stays open until a person can produce real evidence later.

## Defects

A failed verification test creates a `DEFECT` work item. A person can also record one. The defect stores title, description, severity (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), the condition, expected behaviour, actual behaviour, the story, the acceptance criterion, the implementation task, the commit SHA, and the session. Severity defaults to `MEDIUM` unless the structured proposal says otherwise. A failed test is not automatically high.

The Coding Agent is not started. Traceability is the defect link. A later critical or high defect recomputes the session to `FAIL`.

## History

Evidence rows are append-only. Re-running a failed test adds an execution. A new commit starts a new session and flags the old one `RE-VERIFICATION REQUIRED`. Previous evidence stays.

## Approval fingerprint

A verification approval stores a hash of execution ids, exit codes, statuses, and coverage statuses, plus the commit SHA. If that evidence changes, the stored approval no longer matches a fresh review. A changed implementation commit marks the approval stale.
