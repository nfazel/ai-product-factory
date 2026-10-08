# Metrics catalogue

Every metric is calculated in `src/modules/analytics`. The definition, formula, source, interpretation, and data-quality rule below are the same text the product uses. A missing timestamp is insufficient data. It is not stored as zero.

## Idea to deployment

- Key: `idea_to_deployment_lead_time`
- Category: FLOW
- Unit: duration
- Audience: leadership

### Definition

Discovery session createdAt, or the product createdAt when no discovery session exists, through the earliest non-demo deployment whose status is SUCCEEDED and completedAt is set.

### Formula

Discovery session createdAt, or the product createdAt when no discovery session exists, through the earliest non-demo deployment whose status is SUCCEEDED and completedAt is set.

### Source data

Both the start timestamp and a successful non-demo deployment completedAt. Demo deployments are excluded.

### Interpretation

How long the idea took to reach a recorded successful production deployment. One product contributes one sample.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Explore elapsed

- Key: `stage_elapsed_explore`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Time from discovery start to brief approval or definition start. Stage history is not stored. Elapsed time is the gap between recorded milestones, not the time currentStage spent in that stage. Missing either milestone is insufficient data, not zero.

### Formula

Time from discovery start to brief approval or definition start. Stage history is not stored. Elapsed time is the gap between recorded milestones, not the time currentStage spent in that stage. Missing either milestone is insufficient data, not zero.

### Source data

Both milestone timestamps.

### Interpretation

Where calendar time sat in Explore.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Define elapsed

- Key: `stage_elapsed_define`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Time from definition creation to definition approval. Stage history is not stored. Elapsed time is the gap between recorded milestones, not the time currentStage spent in that stage. Missing either milestone is insufficient data, not zero.

### Formula

Time from definition creation to definition approval. Stage history is not stored. Elapsed time is the gap between recorded milestones, not the time currentStage spent in that stage. Missing either milestone is insufficient data, not zero.

### Source data

Both milestone timestamps.

### Interpretation

Where calendar time sat in Define.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Build elapsed

- Key: `stage_elapsed_build`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Time from architecture start, or definition approval, to coding completion or verification start. Stage history is not stored. Elapsed time is the gap between recorded milestones, not the time currentStage spent in that stage. Missing either milestone is insufficient data, not zero.

### Formula

Time from architecture start, or definition approval, to coding completion or verification start. Stage history is not stored. Elapsed time is the gap between recorded milestones, not the time currentStage spent in that stage. Missing either milestone is insufficient data, not zero.

### Source data

Both milestone timestamps.

### Interpretation

Where calendar time sat in Build.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Prove elapsed

- Key: `stage_elapsed_prove`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Time from verification start to verification approval or a merged pull request. Stage history is not stored. Elapsed time is the gap between recorded milestones, not the time currentStage spent in that stage. Missing either milestone is insufficient data, not zero.

### Formula

Time from verification start to verification approval or a merged pull request. Stage history is not stored. Elapsed time is the gap between recorded milestones, not the time currentStage spent in that stage. Missing either milestone is insufficient data, not zero.

### Source data

Both milestone timestamps.

### Interpretation

Where calendar time sat in Prove.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Ship elapsed

- Key: `stage_elapsed_ship`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Time from release-candidate creation to a successful production deployment. Stage history is not stored. Elapsed time is the gap between recorded milestones, not the time currentStage spent in that stage. Missing either milestone is insufficient data, not zero.

### Formula

Time from release-candidate creation to a successful production deployment. Stage history is not stored. Elapsed time is the gap between recorded milestones, not the time currentStage spent in that stage. Missing either milestone is insufficient data, not zero.

### Source data

Both milestone timestamps. Demo candidates are excluded.

### Interpretation

Where calendar time sat in Ship.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Learn elapsed

- Key: `stage_elapsed_learn`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Time from a successful production deployment to the next learning decision or real outcome observation. Stage history is not stored. Elapsed time is the gap between recorded milestones, not the time currentStage spent in that stage. Missing either milestone is insufficient data, not zero.

### Formula

Time from a successful production deployment to the next learning decision or real outcome observation. Stage history is not stored. Elapsed time is the gap between recorded milestones, not the time currentStage spent in that stage. Missing either milestone is insufficient data, not zero.

### Source data

Both milestone timestamps.

### Interpretation

Where calendar time sat in Learn.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Explore active

- Key: `stage_active_explore`
- Category: FLOW
- Unit: duration
- Audience: engineering

### Definition

Sum of agent-run and verification-execution spans that fall inside the Explore elapsed interval.

### Formula

Sum of agent-run and verification-execution spans that fall inside the Explore elapsed interval.

### Source data

At least one span with a start and a finish inside the interval. Otherwise not available.

### Interpretation

Recorded execution inside Explore. This is not inferred human work.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Define active

- Key: `stage_active_define`
- Category: FLOW
- Unit: duration
- Audience: engineering

### Definition

Sum of recorded execution spans inside the Define elapsed interval.

### Formula

Sum of recorded execution spans inside the Define elapsed interval.

### Source data

A measured span inside the interval. Otherwise not available.

### Interpretation

Recorded execution inside Define.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Build active

- Key: `stage_active_build`
- Category: FLOW
- Unit: duration
- Audience: engineering

### Definition

Sum of recorded execution spans inside the Build elapsed interval.

### Formula

Sum of recorded execution spans inside the Build elapsed interval.

### Source data

A measured span inside the interval. Otherwise not available.

### Interpretation

Recorded execution inside Build.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Prove active

- Key: `stage_active_prove`
- Category: FLOW
- Unit: duration
- Audience: engineering

### Definition

Sum of recorded execution spans inside the Prove elapsed interval.

### Formula

Sum of recorded execution spans inside the Prove elapsed interval.

### Source data

A measured span inside the interval. Otherwise not available.

### Interpretation

Recorded execution inside Prove.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Ship active

- Key: `stage_active_ship`
- Category: FLOW
- Unit: duration
- Audience: engineering

### Definition

Sum of recorded execution spans inside the Ship elapsed interval.

### Formula

Sum of recorded execution spans inside the Ship elapsed interval.

### Source data

A measured span inside the interval. Otherwise not available.

### Interpretation

Recorded execution inside Ship.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Learn active

- Key: `stage_active_learn`
- Category: FLOW
- Unit: duration
- Audience: engineering

### Definition

Sum of recorded execution spans inside the Learn elapsed interval.

### Formula

Sum of recorded execution spans inside the Learn elapsed interval.

### Source data

A measured span inside the interval. Otherwise not available.

### Interpretation

Recorded execution inside Learn.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Flow efficiency

- Key: `flow_efficiency`
- Category: FLOW
- Unit: ratio
- Audience: leadership

### Definition

Recorded active execution time divided by total elapsed milestone time.

### Formula

Recorded active execution time divided by total elapsed milestone time.

### Source data

Active spans for each elapsed stage. Missing active time is not treated as zero.

### Interpretation

Only shown when every stage that has an elapsed duration also has at least one recorded execution span. Otherwise not available. A higher value is not a target.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Product Brief approval wait

- Key: `approval_wait_brief`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Median of resolved Product Discovery approvals, from requestedAt to resolvedAt.

### Formula

Median of resolved Product Discovery approvals, from requestedAt to resolvedAt.

### Source data

A resolved approval with both timestamps.

### Interpretation

How long the brief waited for a person. Pending approvals are listed and are not given a duration of zero.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Definition approval wait

- Key: `approval_wait_definition`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Median of resolved Product Definition approvals, from requestedAt to resolvedAt.

### Formula

Median of resolved Product Definition approvals, from requestedAt to resolvedAt.

### Source data

A resolved approval with both timestamps.

### Interpretation

How long the definition waited for a person.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Architecture approval wait

- Key: `approval_wait_architecture`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Median of resolved solution-architecture approvals, from requestedAt to resolvedAt.

### Formula

Median of resolved solution-architecture approvals, from requestedAt to resolvedAt.

### Source data

A resolved approval with both timestamps.

### Interpretation

How long architecture waited for a person.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Implementation plan approval wait

- Key: `approval_wait_plan`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Median of resolved implementation-plan approvals, from requestedAt to resolvedAt.

### Formula

Median of resolved implementation-plan approvals, from requestedAt to resolvedAt.

### Source data

A resolved approval with both timestamps.

### Interpretation

How long the plan waited for a person.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Governance approval wait

- Key: `approval_wait_governance`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Median of resolved engineering-governance approvals, from requestedAt to resolvedAt.

### Formula

Median of resolved engineering-governance approvals, from requestedAt to resolvedAt.

### Source data

A resolved approval with both timestamps.

### Interpretation

How long governance waited for a person.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Coding policy approval wait

- Key: `approval_wait_coding_policy`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Median of resolved coding-policy approvals, from requestedAt to resolvedAt.

### Formula

Median of resolved coding-policy approvals, from requestedAt to resolvedAt.

### Source data

A resolved approval with both timestamps.

### Interpretation

How long the coding policy waited for a person.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Execution plan approval wait

- Key: `approval_wait_execution_plan`
- Category: FLOW
- Unit: duration
- Audience: engineering

### Definition

Would be the wait from an execution-plan request to human approval.

### Formula

Would be the wait from an execution-plan request to human approval.

### Source data

An approval row with requestedAt and resolvedAt. Activity alone is not enough.

### Interpretation

The coding execution plan does not store a request timestamp and a resolution timestamp, so this wait is not available.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Code review wait

- Key: `approval_wait_code_change`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Median of resolved code-change approvals, from requestedAt to resolvedAt.

### Formula

Median of resolved code-change approvals, from requestedAt to resolvedAt.

### Source data

A resolved CODE_CHANGE approval with both timestamps.

### Interpretation

How long a completed change waited for human code review.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Verification approval wait

- Key: `approval_wait_verification`
- Category: FLOW
- Unit: duration
- Audience: both

### Definition

Median of resolved verification approvals, from requestedAt to resolvedAt.

### Formula

Median of resolved verification approvals, from requestedAt to resolvedAt.

### Source data

A resolved VERIFICATION approval with both timestamps.

### Interpretation

How long a verification result waited for a person. This is separate from test execution.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Release approval wait

- Key: `approval_wait_release`
- Category: FLOW
- Unit: duration
- Audience: leadership

### Definition

Median of resolved release approvals, from requestedAt to resolvedAt.

### Formula

Median of resolved release approvals, from requestedAt to resolvedAt.

### Source data

A resolved RELEASE approval with both timestamps. Demo candidates are excluded.

### Interpretation

How long a release candidate waited for a person.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Implementation cycle time

- Key: `implementation_cycle_median`
- Category: DELIVERY
- Unit: duration
- Audience: both

### Definition

Median from coding-workspace creation to completion for tasks whose status is COMPLETED. Completion is the code-change approval time when that approval exists, otherwise the workspace completedAt, otherwise the task updatedAt.

### Formula

Median from coding-workspace creation to completion for tasks whose status is COMPLETED. Completion is the code-change approval time when that approval exists, otherwise the workspace completedAt, otherwise the task updatedAt.

### Source data

A completed task and a workspace createdAt. A missing end timestamp drops the sample.

### Interpretation

How long an implementation task took once a workspace existed. Tasks do not store an IN_PROGRESS timestamp, so this is partial.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Implementation cycle average

- Key: `implementation_cycle_average`
- Category: DELIVERY
- Unit: duration
- Audience: engineering

### Definition

Average of the same implementation-cycle samples as the median.

### Formula

Average of the same implementation-cycle samples as the median.

### Source data

Same samples as the implementation median.

### Interpretation

The average can be pulled by one long task. Read it with the median and the sample size.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Implementation cycle P85

- Key: `implementation_cycle_p85`
- Category: DELIVERY
- Unit: duration
- Audience: engineering

### Definition

85th percentile of implementation-cycle samples.

### Formula

85th percentile of implementation-cycle samples.

### Source data

At least 20 implementation-cycle samples.

### Interpretation

Hidden below 20 samples because a small percentile is misleading.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Verification cycle time

- Key: `verification_cycle`
- Category: DELIVERY
- Unit: duration
- Audience: both

### Definition

Median from verification startedAt to the human verification approval resolvedAt. Demo sessions are excluded.

### Formula

Median from verification startedAt to the human verification approval resolvedAt. Demo sessions are excluded.

### Source data

startedAt and a resolved verification approval.

### Interpretation

The full prove cycle, including time spent waiting for a person.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Verification execution

- Key: `verification_execution`
- Category: DELIVERY
- Unit: duration
- Audience: engineering

### Definition

Median of summed verification-command spans (startedAt to completedAt) per non-demo session.

### Formula

Median of summed verification-command spans (startedAt to completedAt) per non-demo session.

### Source data

Command spans with both timestamps. A missing timestamp is not zero.

### Interpretation

Testing time, separate from the wait for human approval.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Pull request cycle time

- Key: `pr_cycle`
- Category: DELIVERY
- Unit: duration
- Audience: leadership

### Definition

Median from pull request createdAt to mergedAt. Demo pull requests are excluded.

### Formula

Median from pull request createdAt to mergedAt. Demo pull requests are excluded.

### Source data

A non-demo merged pull request with mergedAt.

### Interpretation

How long a change waited in review and checks before a person merged it.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Time to first review

- Key: `pr_time_to_first_review`
- Category: DELIVERY
- Unit: duration
- Audience: engineering

### Definition

Median from pull request createdAt to the earliest review submittedAt.

### Formula

Median from pull request createdAt to the earliest review submittedAt.

### Source data

A review with submittedAt. Demo pull requests are excluded.

### Interpretation

How long a pull request waited for the first human review.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## CI time

- Key: `pr_ci_wait`
- Category: DELIVERY
- Unit: duration
- Audience: engineering

### Definition

Median, per pull request, from the earliest check startedAt to the latest check completedAt.

### Formula

Median, per pull request, from the earliest check startedAt to the latest check completedAt.

### Source data

Every contributing check has startedAt and completedAt.

### Interpretation

Measured CI time. Checks without timestamps are excluded rather than treated as instant.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Time in changes requested

- Key: `pr_changes_requested`
- Category: DELIVERY
- Unit: duration
- Audience: engineering

### Definition

Median from a CHANGES_REQUESTED review submittedAt to the next APPROVED review or the merge.

### Formula

Median from a CHANGES_REQUESTED review submittedAt to the next APPROVED review or the merge.

### Source data

A changes-requested review and a later approval or merge timestamp.

### Interpretation

How long a pull request stayed in a changes-requested state. Open requests are not given a duration.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Ready to merge

- Key: `pr_ready_to_merge`
- Category: DELIVERY
- Unit: duration
- Audience: engineering

### Definition

Median from the earliest PULL_REQUEST_READY activity that names the pull request number to mergedAt.

### Formula

Median from the earliest PULL_REQUEST_READY activity that names the pull request number to mergedAt.

### Source data

A readiness activity whose text contains the pull request number, and mergedAt.

### Interpretation

How long a pull request that the factory had already marked ready waited for a person to merge it.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Release cycle time

- Key: `release_cycle`
- Category: RELEASE
- Unit: duration
- Audience: leadership

### Definition

Median from non-demo release-candidate createdAt to the successful production deployment completedAt.

### Formula

Median from non-demo release-candidate createdAt to the successful production deployment completedAt.

### Source data

Candidate createdAt and a successful non-demo deployment completedAt.

### Interpretation

How long a candidate took to become a recorded successful deployment.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Candidate to release approval

- Key: `release_to_approval`
- Category: RELEASE
- Unit: duration
- Audience: both

### Definition

Median from release-candidate createdAt to the first approved release approval resolvedAt.

### Formula

Median from release-candidate createdAt to the first approved release approval resolvedAt.

### Source data

An approved, non-demo release approval with resolvedAt.

### Interpretation

The human release decision, separate from deployment.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Approval to deployment

- Key: `release_approval_to_deployment`
- Category: RELEASE
- Unit: duration
- Audience: both

### Definition

Median from release approval resolvedAt to deployment startedAt.

### Formula

Median from release approval resolvedAt to deployment startedAt.

### Source data

Approval resolvedAt and deployment startedAt.

### Interpretation

How long a decision waited before deployment began.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Deployment duration

- Key: `deployment_to_completion`
- Category: RELEASE
- Unit: duration
- Audience: engineering

### Definition

Median from deployment startedAt to completedAt for successful production deployments.

### Formula

Median from deployment startedAt to completedAt for successful production deployments.

### Source data

startedAt and completedAt on a successful non-demo deployment.

### Interpretation

How long the recorded deployment itself took. Post-check time is separate and is not invented when checks have no completedAt.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Delivery predictability

- Key: `delivery_predictability`
- Category: DELIVERY
- Unit: count
- Audience: leadership

### Definition

Completed work items on an approved product slice, compared with the items on that slice. Items created after the SLICE_APPROVED activity are counted as added. Removals are not inferred.

### Formula

Completed work items on an approved product slice, compared with the items on that slice. Items created after the SLICE_APPROVED activity are counted as added. Removals are not inferred.

### Source data

A slice in APPROVED, IN_PROGRESS, or COMPLETED. Added-after counts also need a SLICE_APPROVED activity.

### Interpretation

Whether the approved slice content was finished. This is not velocity. Without an approved slice the result is insufficient commitment data.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Scope changes after approval

- Key: `scope_change_count`
- Category: DELIVERY
- Unit: count
- Audience: both

### Definition

Count of requirement, architecture, implementation, and release changes recorded after the relevant approval.

### Formula

Count of requirement, architecture, implementation, and release changes recorded after the relevant approval.

### Source data

A recorded review-required flag, a stale contract, a stale release approval, or a proposal created after approval.

### Interpretation

When approved scope moved. Each event names the downstream rework that started afterwards.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Task rework rate

- Key: `rework_rate_tasks`
- Category: QUALITY
- Unit: ratio
- Audience: both

### Definition

Implementation tasks with a coding revision after human review or pull-request review, divided by implementation tasks that had a workspace.

### Formula

Implementation tasks with a coding revision after human review or pull-request review, divided by implementation tasks that had a workspace.

### Source data

At least one executed task. Numerator and denominator are both shown.

### Interpretation

Share of executed tasks that needed a revision after review. A revision before any review is not counted.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Pull request rework rate

- Key: `rework_rate_pull_requests`
- Category: QUALITY
- Unit: ratio
- Audience: engineering

### Definition

Non-demo pull requests with a CHANGES_REQUESTED review, divided by non-demo pull requests created.

### Formula

Non-demo pull requests with a CHANGES_REQUESTED review, divided by non-demo pull requests created.

### Source data

At least one non-demo pull request.

### Interpretation

Share of pull requests that came back for code changes.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Verification repeat rate

- Key: `rework_rate_verification`
- Category: QUALITY
- Unit: ratio
- Audience: engineering

### Definition

Non-demo tasks verified again after a stale session or a new commit, divided by tasks that have a non-demo verification session.

### Formula

Non-demo tasks verified again after a stale session or a new commit, divided by tasks that have a non-demo verification session.

### Source data

At least one non-demo verification session.

### Interpretation

Repeat verification caused by an implementation change. An extra session without that evidence is not rework.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Defects found in verification

- Key: `defects_found_in_verification`
- Category: QUALITY
- Unit: count
- Audience: both

### Definition

Defect work items linked from a verification session.

### Formula

Defect work items linked from a verification session.

### Source data

Verification defect links. Unlinked defects are not added to this count.

### Interpretation

Defects the factory traced to verification.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Defects found after deployment

- Key: `defects_found_after_deployment`
- Category: QUALITY
- Unit: count
- Audience: both

### Definition

Release issues on non-demo release candidates.

### Formula

Release issues on non-demo release candidates.

### Source data

Release issue rows. Zero is a real count when a production deployment exists. With no production deployment the count is insufficient.

### Interpretation

Issues recorded after a candidate existed. Low severity is still an issue and does not by itself fail the deployment.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Open critical and high defects

- Key: `defects_open_critical_high`
- Category: QUALITY
- Unit: count
- Audience: leadership

### Definition

Open defect work items at CRITICAL or HIGH priority, plus open release issues at HIGH or CRITICAL.

### Formula

Open defect work items at CRITICAL or HIGH priority, plus open release issues at HIGH or CRITICAL.

### Source data

Current open records. This is a snapshot, not a windowed rate.

### Interpretation

What still needs attention. Low and medium issues are excluded from this count.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Open defect age

- Key: `open_defect_age`
- Category: QUALITY
- Unit: duration
- Audience: engineering

### Definition

Median age of open defect work items, from createdAt to the calculation time.

### Formula

Median age of open defect work items, from createdAt to the calculation time.

### Source data

At least one open defect. Done defects are excluded.

### Interpretation

How long known defects have stayed open.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Defect escape rate

- Key: `defect_escape_rate`
- Category: QUALITY
- Unit: ratio
- Audience: leadership

### Definition

Post-deployment release issues linked to a successfully deployed non-demo candidate, divided by those issues plus verification defects on the released tasks.

### Formula

Post-deployment release issues linked to a successfully deployed non-demo candidate, divided by those issues plus verification defects on the released tasks.

### Source data

A successful production deployment and traceable defects on that scope. Zero divided by zero is insufficient.

### Interpretation

Of the defects the factory can trace to released scope, how many were found after deployment. Low-severity issues stay in the numerator as escapes, not as failed changes.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Acceptance criteria verified

- Key: `acceptance_verified`
- Category: QUALITY
- Unit: count
- Audience: engineering

### Definition

Verification coverage rows whose status is VERIFIED, excluding demo sessions.

### Formula

Verification coverage rows whose status is VERIFIED, excluding demo sessions.

### Source data

Coverage rows. No coverage rows is insufficient, not a pass rate of zero.

### Interpretation

Criteria a verification session marked verified.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Acceptance criteria failed

- Key: `acceptance_failed`
- Category: QUALITY
- Unit: count
- Audience: engineering

### Definition

Verification coverage rows whose status is FAILED, excluding demo sessions.

### Formula

Verification coverage rows whose status is FAILED, excluding demo sessions.

### Source data

Coverage rows.

### Interpretation

Criteria a verification session marked failed.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Acceptance criteria checked manually

- Key: `acceptance_manual`
- Category: QUALITY
- Unit: count
- Audience: engineering

### Definition

Verification coverage rows a person confirmed.

### Formula

Verification coverage rows a person confirmed.

### Source data

Coverage rows with humanConfirmed.

### Interpretation

Criteria that needed a person to confirm the result.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Regression failures

- Key: `regression_failures`
- Category: QUALITY
- Unit: count
- Audience: engineering

### Definition

Verification executions whose kind is EXISTING_REGRESSION and whose status is FAILED.

### Formula

Verification executions whose kind is EXISTING_REGRESSION and whose status is FAILED.

### Source data

Regression executions. No regression execution is insufficient, not a claim of zero failures.

### Interpretation

Existing tests that failed while verifying a change.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Re-verification rate

- Key: `reverification_rate`
- Category: QUALITY
- Unit: ratio
- Audience: both

### Definition

Same numerator and denominator as the verification repeat rate.

### Formula

Same numerator and denominator as the verification repeat rate.

### Source data

Same evidence as the verification repeat rate.

### Interpretation

How often verification had to run again because the implementation changed.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Agent runs

- Key: `agent_runs`
- Category: AI
- Unit: count
- Audience: leadership

### Definition

Agent runs whose completion or creation falls in the window, counted by status.

### Formula

Agent runs whose completion or creation falls in the window, counted by status.

### Source data

AgentRun rows.

### Interpretation

How often agents ran, and how those runs finished. This is not a productivity score.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Agent execution time

- Key: `ai_execution_time`
- Category: AI
- Unit: duration
- Audience: leadership

### Definition

Sum of AgentRun duration values, which are stored in milliseconds.

### Formula

Sum of AgentRun duration values, which are stored in milliseconds.

### Source data

Runs with a duration. Missing durations are omitted, not treated as zero.

### Interpretation

Time the agents actually ran. This is not hours saved.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Human approval time

- Key: `human_approval_time`
- Category: AI
- Unit: duration
- Audience: leadership

### Definition

Sum of resolved approval waits in the window.

### Formula

Sum of resolved approval waits in the window.

### Source data

Resolved approvals with both timestamps.

### Interpretation

Time people spent waiting at gates, shown beside agent execution. The two numbers are not subtracted.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Automated execution rate

- Key: `automation_rate`
- Category: AI
- Unit: ratio
- Audience: leadership

### Definition

Eligible low-risk coding tasks completed in AUTONOMOUS mode, divided by eligible low-risk coding tasks that were executed. Supervised and human-only counts are shown beside the rate.

### Formula

Eligible low-risk coding tasks completed in AUTONOMOUS mode, divided by eligible low-risk coding tasks that were executed. Supervised and human-only counts are shown beside the rate.

### Source data

A coding contract whose effective risk is LOW and a workspace. An override replaces the original mode.

### Interpretation

How often low-risk work ran without a person in the loop. A higher rate is not a target.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Coding first pass

- Key: `first_pass_coding`
- Category: AI
- Unit: ratio
- Audience: leadership

### Definition

Completed coding runs whose workspace has no coding revision and did not escalate, divided by completed coding runs.

### Formula

Completed coding runs whose workspace has no coding revision and did not escalate, divided by completed coding runs.

### Source data

A completed CODING run that can be tied to a workspace.

### Interpretation

The coding agent finished without a later revision. It is not combined with other agents.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Verification first pass

- Key: `first_pass_verification`
- Category: AI
- Unit: ratio
- Audience: leadership

### Definition

Tasks whose only non-demo verification session completed without a later session, divided by tasks with a completed non-demo session.

### Formula

Tasks whose only non-demo verification session completed without a later session, divided by tasks with a completed non-demo session.

### Source data

A non-demo session with a verdict.

### Interpretation

The verification agent reached a result without a repeat. It is not combined with coding first pass.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Architecture first pass

- Key: `first_pass_architecture`
- Category: AI
- Unit: ratio
- Audience: engineering

### Definition

Cases with exactly one architecture proposal and that proposal committed, divided by cases with at least one architecture proposal.

### Formula

Cases with exactly one architecture proposal and that proposal committed, divided by cases with at least one architecture proposal.

### Source data

Architecture proposal rows.

### Interpretation

The architecture proposal was accepted without a regeneration.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Requirements first pass

- Key: `first_pass_requirements`
- Category: AI
- Unit: ratio
- Audience: engineering

### Definition

Cases with exactly one definition proposal and that proposal committed, divided by cases with at least one definition proposal.

### Formula

Cases with exactly one definition proposal and that proposal committed, divided by cases with at least one definition proposal.

### Source data

Definition proposal rows.

### Interpretation

The requirements proposal was accepted without a regeneration.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Escalations

- Key: `escalation_count`
- Category: AI
- Unit: count
- Audience: leadership

### Definition

Coding and verification escalations in the window, grouped by category.

### Formula

Coding and verification escalations in the window, grouped by category.

### Source data

Escalation rows.

### Interpretation

Where an agent stopped and asked a person. The category is the recorded escalation type.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Escalation resolution time

- Key: `escalation_resolution`
- Category: AI
- Unit: duration
- Audience: engineering

### Definition

Median from escalation createdAt to resolvedAt.

### Formula

Median from escalation createdAt to resolvedAt.

### Source data

resolvedAt on the escalation.

### Interpretation

How long an escalation stayed open. Unresolved escalations are listed without a duration.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Human interventions

- Key: `human_intervention_count`
- Category: AI
- Unit: count
- Audience: leadership

### Definition

Recorded edits, risk overrides, code-change requests, manual verification, pull-request change requests, accepted risks, answered release questions, and manually recorded deployments.

### Formula

Recorded edits, risk overrides, code-change requests, manual verification, pull-request change requests, accepted risks, answered release questions, and manually recorded deployments.

### Source data

Activity rows and the matching operational records.

### Interpretation

Where people steered the factory. A higher count is a control signal, not a failure.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Token usage

- Key: `token_usage`
- Category: AI
- Unit: count
- Audience: engineering

### Definition

Sum of input and output token counts stored on agent-run output.

### Formula

Sum of input and output token counts stored on agent-run output.

### Source data

Numeric token fields on the run output. Missing fields are not guessed.

### Interpretation

Provider usage when the provider returned it.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Agent cost

- Key: `agent_cost`
- Category: AI
- Unit: currency
- Audience: engineering

### Definition

Sum of AgentRun estimatedCost.

### Formula

Sum of AgentRun estimatedCost.

### Source data

A non-null estimatedCost. The factory does not invent a price.

### Interpretation

Shown only when a cost was stored. Otherwise cost is not available.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Governance findings

- Key: `governance_findings`
- Category: GOVERNANCE
- Unit: count
- Audience: both

### Definition

Governance findings in the window, grouped by severity.

### Formula

Governance findings in the window, grouped by severity.

### Source data

Governance finding rows.

### Interpretation

What the governance review recorded. Severity comes from the finding, not from a narrative.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Findings resolved before coding

- Key: `findings_resolved_before_coding`
- Category: GOVERNANCE
- Unit: count
- Audience: engineering

### Definition

Findings that are not open and were last updated before the first coding workspace, or before any workspace exists.

### Formula

Findings that are not open and were last updated before the first coding workspace, or before any workspace exists.

### Source data

Finding status and the first workspace createdAt.

### Interpretation

Findings closed before implementation started.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Risks accepted

- Key: `risks_accepted`
- Category: GOVERNANCE
- Unit: count
- Audience: leadership

### Definition

Governance findings with status RISK_ACCEPTED, plus release risk factors a person accepted.

### Formula

Governance findings with status RISK_ACCEPTED, plus release risk factors a person accepted.

### Source data

Finding status or a release risk acceptance.

### Interpretation

Risks a person explicitly accepted. Acceptance is not treated as resolution by the model.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Coding risk distribution

- Key: `coding_risk_distribution`
- Category: GOVERNANCE
- Unit: count
- Audience: engineering

### Definition

Coding risk assessments grouped by the effective risk after any human override.

### Formula

Coding risk assessments grouped by the effective risk after any human override.

### Source data

Coding risk assessment rows.

### Interpretation

How implementation tasks were classified before coding.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Governance review cycle

- Key: `governance_cycle`
- Category: GOVERNANCE
- Unit: duration
- Audience: both

### Definition

Median engineering-governance approval wait.

### Formula

Median engineering-governance approval wait.

### Source data

A resolved ENGINEERING_GOVERNANCE approval.

### Interpretation

How long the governance gate took once it was requested.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Governance re-review rate

- Key: `governance_rereview_rate`
- Category: GOVERNANCE
- Unit: ratio
- Audience: engineering

### Definition

Governance reviews that are a later version or are flagged review-required, divided by governance reviews.

### Formula

Governance reviews that are a later version or are flagged review-required, divided by governance reviews.

### Source data

At least one governance review.

### Interpretation

How often governance had to be looked at again.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Policy overrides

- Key: `policy_overrides`
- Category: GOVERNANCE
- Unit: count
- Audience: engineering

### Definition

Coding risk rows with an override timestamp.

### Formula

Coding risk rows with an override timestamp.

### Source data

overriddenAt on a coding risk assessment.

### Interpretation

Times a person changed the recommended coding risk or execution mode.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Release candidates

- Key: `release_candidates`
- Category: RELEASE
- Unit: count
- Audience: leadership

### Definition

Non-demo release candidates created in the window.

### Formula

Non-demo release candidates created in the window.

### Source data

Release candidate rows with demo false.

### Interpretation

Candidates a person created. Demo candidates are excluded from this count and labelled on the timeline.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Approved releases

- Key: `approved_releases`
- Category: RELEASE
- Unit: count
- Audience: leadership

### Definition

Non-demo candidates with an approved release approval that is not stale.

### Formula

Non-demo candidates with an approved release approval that is not stale.

### Source data

A RELEASE approval with status APPROVED and stale false.

### Interpretation

Releases a person approved on the current evidence.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Successful deployments

- Key: `successful_deployments`
- Category: RELEASE
- Unit: count
- Audience: leadership

### Definition

Non-demo deployments in a non-demo environment whose status is SUCCEEDED.

### Formula

Non-demo deployments in a non-demo environment whose status is SUCCEEDED.

### Source data

Deployment records. Demo records are excluded.

### Interpretation

Deployments a person recorded as successful.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Failed deployments

- Key: `failed_deployments`
- Category: RELEASE
- Unit: count
- Audience: leadership

### Definition

Non-demo production deployments whose status is FAILED.

### Formula

Non-demo production deployments whose status is FAILED.

### Source data

Deployment status FAILED.

### Interpretation

Deployments a person recorded as failed. A later rollback is counted separately.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Rollbacks

- Key: `rollbacks`
- Category: RELEASE
- Unit: count
- Audience: leadership

### Definition

Non-demo production deployments whose status is ROLLED_BACK.

### Formula

Non-demo production deployments whose status is ROLLED_BACK.

### Source data

Deployment status ROLLED_BACK.

### Interpretation

Rollbacks a person recorded. The original deployment row is kept.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Deployment frequency, 7 days

- Key: `deployment_frequency_7d`
- Category: RELEASE
- Unit: count
- Audience: leadership

### Definition

Successful production deployments whose completedAt is in the last 7 days.

### Formula

Successful production deployments whose completedAt is in the last 7 days.

### Source data

Deployment completedAt. Demo records are excluded.

### Interpretation

How often production changed this week. The window is fixed, not the page filter.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Deployment frequency, 30 days

- Key: `deployment_frequency_30d`
- Category: RELEASE
- Unit: count
- Audience: leadership

### Definition

Successful production deployments whose completedAt is in the last 30 days.

### Formula

Successful production deployments whose completedAt is in the last 30 days.

### Source data

Deployment completedAt. Demo records are excluded.

### Interpretation

How often production changed this month.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Deployment frequency, 90 days

- Key: `deployment_frequency_90d`
- Category: RELEASE
- Unit: count
- Audience: leadership

### Definition

Successful production deployments whose completedAt is in the last 90 days.

### Formula

Successful production deployments whose completedAt is in the last 90 days.

### Source data

Deployment completedAt. Demo records are excluded.

### Interpretation

How often production changed this quarter.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Change failure rate

- Key: `change_failure_rate`
- Category: RELEASE
- Unit: ratio
- Audience: leadership

### Definition

Production deployments that failed, were rolled back, or have a linked HIGH or CRITICAL release issue, divided by all production deployments.

### Formula

Production deployments that failed, were rolled back, or have a linked HIGH or CRITICAL release issue, divided by all production deployments.

### Source data

At least one non-demo production deployment. Zero deployments is insufficient, not 0%.

### Interpretation

A DORA-style change failure rate. A low or medium issue does not mark the deployment as failed.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Lead time for changes

- Key: `lead_time_for_changes`
- Category: RELEASE
- Unit: duration
- Audience: leadership

### Definition

Earliest coding workspace createdAt for the tasks on a release, through that release's successful production deployment completedAt. Commit author time is not stored, so the workspace clock is the definition.

### Formula

Earliest coding workspace createdAt for the tasks on a release, through that release's successful production deployment completedAt. Commit author time is not stored, so the workspace clock is the definition.

### Source data

A workspace for a released task and a successful production deployment completedAt.

### Interpretation

How long released work took from the start of coding to production. This is not the idea-to-deployment lead time.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Time to restore

- Key: `mttr`
- Category: RELEASE
- Unit: duration
- Audience: leadership

### Definition

From a failed deployment, a rollback, or an open critical release issue to a later successful deployment or the issue resolvedAt.

### Formula

From a failed deployment, a rollback, or an open critical release issue to a later successful deployment or the issue resolvedAt.

### Source data

A failure event and a later restoration event.

### Interpretation

Shown only when both the failure and the restoration are recorded. Otherwise insufficient.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Outcomes achieved

- Key: `outcomes_achieved`
- Category: OUTCOME
- Unit: count
- Audience: leadership

### Definition

Product outcomes whose status is ACHIEVED.

### Formula

Product outcomes whose status is ACHIEVED.

### Source data

Outcome status.

### Interpretation

Outcomes a person marked achieved. An observation does not do this.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Outcomes awaiting evidence

- Key: `outcomes_awaiting_evidence`
- Category: OUTCOME
- Unit: count
- Audience: leadership

### Definition

Outcomes that are not achieved and have no non-demo observation.

### Formula

Outcomes that are not achieved and have no non-demo observation.

### Source data

Outcome status and observation rows.

### Interpretation

Outcomes that still need a real measurement. Demo observations do not count.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Delivery complete, outcome pending

- Key: `delivery_complete_outcome_pending`
- Category: OUTCOME
- Unit: count
- Audience: leadership

### Definition

Outcomes that are not ACHIEVED while the product has a successful non-demo deployment.

### Formula

Outcomes that are not ACHIEVED while the product has a successful non-demo deployment.

### Source data

A successful production deployment and an outcome that is not achieved.

### Interpretation

The software is in production and the outcome is still open. That means learning is still required. It is not an automatic failure.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Products blocked

- Key: `products_blocked`
- Category: PORTFOLIO
- Unit: count
- Audience: leadership

### Definition

Products with a blocked work item, an open high or critical release issue, or a governance review that is flagged for another look.

### Formula

Products with a blocked work item, an open high or critical release issue, or a governance review that is flagged for another look.

### Source data

Those operational records.

### Interpretation

Where a product cannot move cleanly.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Products ready for a person

- Key: `products_ready_for_action`
- Category: PORTFOLIO
- Unit: count
- Audience: leadership

### Definition

Products with at least one pending approval.

### Formula

Products with at least one pending approval.

### Source data

Approval rows with status PENDING.

### Interpretation

Where a person is the next step.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.

## Products in view

- Key: `portfolio_products`
- Category: PORTFOLIO
- Unit: count
- Audience: leadership

### Definition

Products included in the portfolio calculation.

### Formula

Products included in the portfolio calculation.

### Source data

Product rows.

### Interpretation

The sample behind every portfolio aggregate.

### Limitations and data quality

GOOD means the required records and timestamps were present. PARTIAL means a real duration was calculated from the best recorded clock, and the limitation is named on the metric. INSUFFICIENT means an endpoint, commitment, sample, or traceability link was missing. The display is then INSUFFICIENT DATA, NOT AVAILABLE, COST NOT AVAILABLE, or INSUFFICIENT COMMITMENT DATA. Demo deployments, demo pull requests, and demo observations are excluded from production rates.
