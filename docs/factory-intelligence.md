# Factory Intelligence

Factory Intelligence answers whether delivery is getting faster, more predictable, and safer, and whether a released capability is producing its outcome. It is not an agent. It does not approve work, move a stage, change scope, or set a target.

## Where it lives

`src/modules/analytics` owns the calculations. Pages only render them.

1. `load.ts` reads operational tables in a fixed set of queries and builds one `AnalyticsInput` per product. Tokens are read only when the stored run output has numeric `usage` fields. Patches, prompts, and secrets are not copied into the snapshot.
2. `engine.ts` calculates a product from that snapshot. The same function runs in tests with hand-built snapshots, so a metric does not depend on the page.
3. `portfolio.ts` pools product samples. Rates add the numerator and the denominator. Durations pool the millisecond samples and take a median. Sums are used only for agent execution time and human approval time.
4. The dashboard and `/products/[id]/intelligence` render the result. CSV and JSON export use the same objects.

There is no metric table and no warehouse. A historical trend is the previous window of the same operational records. When that window has no completed sample, the comparison says so.

## Clocks that are honest

Several lifecycle clocks were never stored as status history.

- Idea to deployment starts at `DiscoverySession.createdAt`, or the product `createdAt` when discovery does not exist. It ends at the earliest successful non-demo `DeploymentRecord.completedAt`. Either missing end is **INSUFFICIENT DATA**.
- Stage elapsed time is the gap between recorded milestones. It is marked partial because `currentStage` has no history. Active time is the sum of agent-run and verification-command spans inside that gap. If a span is missing, active time is **NOT AVAILABLE**. It is not copied from the elapsed time.
- Flow efficiency is recorded active time divided by elapsed time, and only when every elapsed stage has at least one span. Otherwise it is **NOT AVAILABLE**.
- Implementation cycle time starts when the coding workspace is created and ends at the code-change approval, or the workspace completion, or the task update. Tasks do not store `IN_PROGRESS`, so the metric stays partial. P85 is hidden below 20 samples.
- Lead time for changes starts at the earliest coding workspace for the released tasks. Commit author time is not stored, and the metric says so.
- Mean time to restore is the average from a failed deployment, rollback, or critical issue to a later recorded restoration. With no pair, it is **INSUFFICIENT DATA**.

Demo deployments, demo pull requests, and demo observations are excluded from production rates. They can still appear on the timeline with a Demo label.

## Waits, rework, and bottlenecks

A wait is a request timestamp and a decision timestamp. A pending approval stays open and is not given a duration of zero. Execution-plan approval has no request and resolution pair, so that wait is **NOT AVAILABLE**.

A coding revision is rework only after a human code approval or a changes-requested pull-request review. A later verification is rework only when the previous session is stale or the commit changed. Defect-driven coding is a workspace whose work item is a defect.

Bottlenecks are rules: code-review wait, pull-request review wait, release wait, requirement churn, verification rework, and governance blockers. The model does not invent them.

## Change failure and outcomes

A production deployment counts as a failed change when its status is `FAILED` or `ROLLED_BACK`, or a high or critical release issue is linked to that deployment. A low issue does not fail the change. Zero production deployments do not become a 0% rate.

An outcome shows its measure, target, and real observations. The baseline is not a stored field, so the page says it is not recorded. **Delivery complete, outcome pending** means a successful production deployment exists and the outcome is not `ACHIEVED`. Learning is still required.

## Factory Insights

**Explain these metrics** sends the calculated metric payload to `AIProvider.generate`. The response is Zod-validated: summary, observations, risks, opportunities, and questions. Each item must cite a real metric key. A statement that introduces a number the evidence does not contain, or that claims savings, ROI, or productivity, is dropped. The calculator's value is compared before and after the call and the call throws if a metric changed. There is no `AgentRun`.

## Leadership and engineering

Leadership uses business language: delivery, flow, quality, risk, AI contribution, release, and outcome. Engineering adds the sample list, agent table, revisions, and the rest of the catalogue. Both readings use the same numbers. Evidence is the drill-down on each card: the records, timestamps, and sample size.

## Manual check

1. Open the dashboard. Confirm stage counts, blocked and ready products, and that missing lead time says insufficient rather than zero.
2. Change the window between 7 days, 30 days, 90 days, and all time. Counts that depend on the window should move only when records sit in that window. Deployment frequency keeps its own 7, 30, and 90 day clocks.
3. Open a product, choose Intelligence, and switch Leadership and Engineering. Expand Evidence on a metric and confirm the timestamps belong to a record.
4. Confirm the flow timeline is empty or labelled, and that a demo deployment is not counted in deployment frequency.
5. Export CSV and JSON. The file has metric, value, unit, period, sample size, data quality, and calculation time. It does not contain a patch.
6. Choose **Explain these metrics**. With no API key, the page says AI is not configured and the numbers stay put.
