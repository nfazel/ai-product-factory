# Deployment governance

A deployment plan is a governance record. It names the environment, a strategy, the steps, pre-deployment checks, post-deployment checks, and the rollback plan. Strategies include manual, rolling, blue-green, canary, feature flag, and other. Any strategy other than manual needs a written justification. In every case a person performs the deployment. The factory does not execute the plan, edit GitHub Actions, or change branch protection.

## Rollback

Rollback is required before release approval. The plan records the trigger, the steps, the data implications, the responsible role, and how rollback is verified. If rollback is genuinely impossible, a person acknowledges that and writes the rationale. The model is not allowed to claim that rollback is possible.

## Checks

Checks are pre-deployment, post-deployment, or rollback. A person records passed, failed, waived, or not applicable. Waiving a required check requires a rationale and is written to the activity log. A failed required pre-deployment check blocks release approval.

## Recording what happened

**Record Deployment** stores a human report: environment, started, succeeded, or failed, the deployed version, an optional deployed commit SHA, an external reference, and notes. The commit SHA is whatever the person entered. It is not copied from the merge SHA. The activity text says the factory did not deploy it.

The candidate becomes **DEPLOYED** only when the latest record succeeded, every required post-deployment check passed or was waived with a rationale, and no critical post-deployment issue is open. A model narrative cannot set that status.

A failed record stays. **Record Rollback** adds a rolled-back record with the reason, the person, and the time. The candidate remains failed. The failed row is not deleted.

Post-deployment checks such as "application available" are human-recorded unless a deterministic tool in the factory actually ran them. The demo does not invent those results.

## Release result

When the candidate becomes deployed, a release outcome records that the deployment report succeeded. That is the immediate release result. It is not the business product outcome.

## Later integration

A future release can attach an external pipeline identifier that a person already recorded. Fetching deployment systems, holding production credentials, and automatic rollback are not part of this version.
