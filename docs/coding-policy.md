# Coding policy

A coding policy is the boundary for a future Coding Agent. The Security & Engineering Governance Agent may propose one. A person edits it and approves it. The agent cannot approve it.

The policy belongs to one engineering governance review and one product.

## Fields

- Allowed paths. The future agent may change these.
- Restricted paths. Changes here need a person even when the task is otherwise suitable for autonomous work.
- Prohibited actions. Examples: modify production credentials, disable security controls, force push, merge one’s own pull request, delete production data, modify CI security controls without approval, commit secrets, and bypass failing tests.
- Required checks. Examples: typecheck, lint, and unit tests.
- Tests required.
- Human review required.
- Optional maximum files per task. Empty means no limit is recorded.

## Approval

Approval type `CODING_POLICY` is a human approval. The approver name cannot be the Security & Engineering Governance Agent.

If a person edits the policy after that approval, the policy is marked **CODING POLICY REAPPROVAL REQUIRED**, with a reason and a timestamp. The existing approval is kept. Coding readiness stays **NOT READY** until a person approves the policy again.

## How it relates to coding risk

The policy is product-wide. `CodingRiskAssessment` is per implementation task. A task can be `LOW` / `AUTONOMOUS`, `MEDIUM` or `HIGH` / `SUPERVISED`, or `PROHIBITED` / `HUMAN_ONLY`. A prohibited task blocks coding readiness until a person records an override and a rationale, even when the policy is approved.

The future Coding Agent should refuse work that breaks the policy, and it should follow the effective risk and mode after any human override. This application does not run that agent, open pull requests, or deploy.
