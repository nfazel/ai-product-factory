# Pull request lifecycle

A pull request starts from an approved local commit. GitHub remains the source of truth for pull request state. The factory synchronises that state when a person chooses **Refresh Pull Request**.

```
Local approved commit
  → published branch
  → pull request
  → CI checks
  → human review
  → ready for a person to merge
```

No agent creates the pull request in the background. **Create Pull Request** is a human action after the branch is published. The title may be suggested by the model. The body is built from factory traceability: outcome, capability, story, acceptance criteria, task, architecture, files, verification, governance, human approvals, and the product, story, task, verification session, and commit identifiers. Secrets and model prompts are not included.

## CI and reviews

Checks are stored as GitHub reported them. A failing conclusion stays a failure. Reviews and comments are synchronised. Comment text is untrusted external content. It cannot run commands, repository tools, or grant credentials. When a person chooses **Analyse Review Feedback**, the comment is wrapped as `UNTRUSTED EXTERNAL CONTENT` and classified with a Zod schema. The classification cannot start the Coding Agent by itself.

**Send to Coding Agent** records a `CodingRevision` only when the request is a code change inside the current execution contract. A requirement change, architecture concern, security concern, or path outside the contract becomes an escalation. The Coding Agent is not started, and its authority is not expanded.

## Readiness

**READY FOR HUMAN MERGE** requires all of the following:

- the pull request is open
- the head SHA matches the current code approval
- verification is approved for that same SHA and is not stale
- every required GitHub check succeeded
- no reviewer still has changes requested
- human approvals meet the higher of the factory minimum and branch protection
- engineering governance and coding policy are current
- no critical or high defect is open

Anything else is **NOT READY**, with every blocker shown. A verification session for a different commit shows **VERIFICATION STALE**. Coding Agent, Testing Agent, Architecture Agent, Security Agent, bot, and service-account reviews do not count as human approval.

Branch protection is read and displayed. The factory does not change it. If protection cannot be read, CI is unknown and readiness stays closed.

## Merge

The factory does not merge. When readiness is satisfied it shows **Open Pull Request in GitHub**. A person merges there. The next refresh records `MERGED`, the merge commit, who merged it, and when. Historical workspaces, evidence, verification, and approvals stay.

A new commit after review needs a new code approval and a new verification before **Update Published Branch**. That update is another normal commit, not a force push.

## After merge

A merged pull request can be included in a release candidate. The candidate also requires an approved slice, current verification, current governance and coding policy, and an integrated verification session. A person approves the release and records the deployment. The factory does not deploy. See [release-governance.md](release-governance.md) and [deployment-governance.md](deployment-governance.md).

The earlier **RELEASE CANDIDATE READY FOR REVIEW** signal on Prove means every task is completed, independently verified, and has a merged non-demo pull request, with no blocking defect and an integrated verification session recorded. Creating the candidate also requires current Engineering Governance and Coding Policy. The product stage does not move.

## Demo data

The Claims Management Platform seed includes a demo branch, pull request, build check, and review. They are labelled **DEMO DATA** and use evidence source `DEMO`. They do not make the connection **CONNECTED** and they do not satisfy release-candidate rules.
