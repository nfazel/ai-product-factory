# Release governance

Ship is where an approved product slice becomes a versioned release candidate. Readiness is calculated from records. A person approves the release. A person performs production deployment and records what happened. AI Product Builder does not deploy.

Build remains the stage where individual tasks are coded and independently verified. Prove is where the slice is considered as an integrated release candidate. Ship is the human-controlled release. Learn is where product and operational outcomes are observed afterwards. AI Product Builder does not move the stage.

## Release candidate

A candidate is created only when all of these hold:

- the product slice is approved
- every implementation task in that slice is completed
- each task has current approved verification
- each task has a merged, non-demo pull request
- no critical or high defect is open
- Engineering Governance is current
- Coding Policy is current
- an integrated verification session exists

The integrated session does not have to pass. Its gaps stay visible. If any entry condition fails, every blocker is shown and no candidate is created.

Each candidate has its own version, such as `0.1.0`, `2026.10.08`, or `R5.1`. The factory may suggest `R1`, `R2`, and so on. A person confirms the version. There is no mutable "latest" release.

The candidate lists the stories, tasks, pull requests, and verification sessions it includes. For each pull request it stores the number, head SHA, merge SHA, who merged it, and when. That is the source state. The deployed commit SHA is recorded later, only when a person records the deployment.

## Evidence pack

Evidence is copied from records that already exist: product and architecture approval, requirement traceability, governance, code approval, verification, GitHub CI, pull request review, merge, defect status, and integrated verification. A missing record is stored as missing. A failing check stays a failure. A check named `build` proves only that check. Demo rows use source `DEMO` and are labelled demo data.

The Ship page groups this into scope, product value, requirements, technical approvals, code, verification, quality, risk, and approval.

## Risk

Risk factors are calculated from defects, unverified criteria, stale verification, unmerged pull requests, CI results, integrated gaps, the deployment plan, rollback, and failed pre-deployment checks. Overall risk is the highest open factor. A narrative from the model is stored separately and cannot clear a blocker, approve the release, or create an `AgentRun`.

A critical open risk blocks approval. A blocking high risk blocks approval until a person accepts it with a rationale. Medium integrated-verification gaps stay visible and do not by themselves block approval.

Release questions can be blocking. An open blocking question blocks approval.

## Readiness

Nine areas are rated low, medium, or high: scope, verification, CI, defects, security and governance, operational readiness, deployment plan, rollback, and evidence completeness. The page shows how many of the nine are sufficiently understood. It does not show a percentage.

Operational readiness uses the same scale across monitoring, logging, alerting, support, runbook, rollback, dependencies, data migration, configuration, feature flags, and incident response.

## Approval

Release approval uses the existing approval record with type `RELEASE`. Only a person can approve or reject. The approval stores the evidence fingerprint, the deployment plan version, and the risk level. If the slice, merged pull requests, commits, verification, governance, deployment plan, or risk state changes, the approval is marked stale and kept. The candidate returns to ready for review until a person approves it again.

## What this does not do

The factory does not deploy, roll back, or move the product stage. It does not hold production credentials or call a cloud provider. It does not mark a product outcome achieved because software was deployed.
