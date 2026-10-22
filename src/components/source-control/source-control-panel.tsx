import Link from "next/link";

import {
  AnalyseFeedbackButton,
  CiExceptionForm,
  CreatePullRequestForm,
  InitializeRemoteMainForm,
  PublishBranchButton,
  RefreshPullRequestButton,
  SendToCodingButton,
  UpdateBranchButton,
} from "@/components/source-control/source-control-controls";
import type { getSourceControlView } from "@/modules/source-control/service";
import { currentChecks } from "@/modules/source-control/ci-state";

type View = NonNullable<Awaited<ReturnType<typeof getSourceControlView>>>;

export function SourceControlPanel({ productId, view }: { productId: string; view: View }) {
  const destination =
    view.productRepository?.owner && view.productRepository.repositoryName
      ? `${view.productRepository.owner}/${view.productRepository.repositoryName}`
      : view.connection.owner && view.connection.repositoryName
        ? `${view.connection.owner}/${view.connection.repositoryName}`
        : "";
  return (
    <section className="space-y-4">
      <div id="task-publishing" className="rounded-2xl border bg-card p-5">
        <p className="text-xs font-medium tracking-wide text-indigo-700">TASK BRANCH PUBLISHING</p>
        <h2 className="mt-1 text-lg font-semibold">Publish one approved task branch</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Publish Branch pushes the approved branch. It does not create a pull request, merge, or deploy. The sequence is Publish Branch, then Create Pull Request, then human review, then merge in GitHub.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          GitHub connection {view.connection.status}. {view.connection.message}{" "}
          {destination ? `Destination ${destination}.` : "No GitHub repository is configured."}{" "}
          <Link className="font-medium text-indigo-800" href="/settings#github">
            Open Settings
          </Link>
        </p>
        {view.bootstrap && view.bootstrap.status !== "hidden" && view.bootstrap.message ? (
          <p className="mt-3 text-sm text-muted-foreground">{view.bootstrap.message}</p>
        ) : null}
        {view.bootstrap?.status === "offer" ? (
          <InitializeRemoteMainForm
            productId={productId}
            repository={view.bootstrap.repository}
            baselineSha={view.bootstrap.baselineSha}
            defaultBranch={view.bootstrap.defaultBranch}
          />
        ) : null}
      </div>
      {view.tasks.map((task) => (
        <article key={task.id} className="rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-indigo-700">TASK BRANCH</p>
              <h3 className="text-lg font-semibold">{task.title}</h3>
            </div>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium">
              {task.publication.inProgress
                ? "Publication in progress"
                : task.publication.remoteCommitSha
                  ? "Published"
                  : task.blockers.length === 0
                    ? "Eligible to publish"
                    : "Not eligible to publish"}
            </span>
          </div>
          {task.publication.demo || task.pullRequest?.demo ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
              DEMO DATA. This publication was seeded for the sample product. It was not retrieved from GitHub.
            </p>
          ) : null}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Implementation</dt>
              <dd className="font-medium">{task.status === "COMPLETED" ? "Completed" : task.status}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Approved commit</dt>
              <dd className="font-medium">{task.commitSha || "None"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Code approval</dt>
              <dd className="font-medium">{task.codeApprovalLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Independent Verification</dt>
              <dd className="font-medium">{task.verificationLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Source branch</dt>
              <dd className="font-medium">{task.branchName || "None"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Publication destination</dt>
              <dd className="font-medium">{destination || "Not configured"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Latest publication attempt</dt>
              <dd className="font-medium">{task.publication.latestStatusLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Latest publication error</dt>
              <dd className="font-medium">{task.publication.latestError || "None"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Published remote branch</dt>
              <dd className="font-medium">{task.publication.publishedBranch || "Not published"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Remote commit SHA</dt>
              <dd className="font-medium">{task.publication.remoteCommitSha || "None"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pull request</dt>
              <dd className="font-medium">{task.pullRequest ? `#${task.pullRequest.number} ${task.pullRequest.state}` : "None"}</dd>
            </div>
          </dl>
          {task.publication.remoteCommitSha && !task.pullRequest ? (
            <p className="mt-4 text-sm text-muted-foreground">
              The approved branch is published. A pull request has not been created. That does not undo the publication.
            </p>
          ) : null}
          {task.publication.evidence.length > 0 ? (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">Publication evidence</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {task.publication.evidence.map((item) => (
                  <li key={item.id}>{item.description}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {task.publication.inProgress ? (
            <p className="mt-4 rounded-xl bg-stone-100 px-3 py-2 text-sm">
              Publication is in progress. Another publication cannot be submitted until this attempt finishes.
            </p>
          ) : null}
          <div className="mt-4">
            <h4 className="text-sm font-semibold">CI</h4>
            {task.pullRequest && task.pullRequest.checks.length > 0 ? (
              <RecordedChecks checks={task.pullRequest.checks} />
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No CI checks have been synchronised.</p>
            )}
            {task.pullRequest && !task.pullRequest.demo ? (
              <div className="mt-3 space-y-1 text-sm">
                <p>CI state: {task.pullRequest.ciState}</p>
                {task.pullRequest.ciDetail ? <p className="text-muted-foreground">{task.pullRequest.ciDetail}</p> : null}
                <p>CI requirement: {view.ciRequirement?.requirement === "EXCEPTION" ? "Exception" : "Required"}</p>
                {view.ciRequirement?.requirement === "EXCEPTION" ? (
                  <p className="text-muted-foreground">
                    Exception recorded by {view.ciRequirement.actor}
                    {view.ciRequirement.updatedAt ? ` at ${view.ciRequirement.updatedAt}` : ""}. {view.ciRequirement.rationale} This is not a passing CI result.
                  </p>
                ) : null}
                <p>
                  {task.pullRequest.state === "MERGED"
                    ? "Mergeability does not apply after GitHub has merged the pull request."
                    : `Mergeability: ${task.pullRequest.protectionAccess
                      ? `${task.pullRequest.mergeableState || "unknown"}${task.pullRequest.mergeable === null ? " (GitHub has not confirmed it)" : ""}`
                      : "not yet read"}`}
                </p>
                {task.pullRequest.ciState === "NOT_CONFIGURED" && view.ciRequirement?.requirement !== "EXCEPTION" ? (
                  <CiExceptionForm productId={productId} />
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="mt-4">
            <h4 className="text-sm font-semibold">Review</h4>
            {task.pullRequest && task.pullRequest.reviews.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {task.pullRequest.reviews.map((review) => (
                  <li key={review.id}>
                    {review.reviewer}: {review.state}
                    {task.pullRequest?.demo ? " · DEMO DATA" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No reviews have been synchronised.</p>
            )}
            {task.pullRequest?.comments.map((comment) => (
              <div key={comment.id} className="mt-3 rounded-xl border p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {comment.author}
                  {comment.path ? ` · ${comment.path}` : ""}
                  {comment.classification ? ` · ${comment.classification}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
                {comment.summary ? <p className="mt-2 text-muted-foreground">{comment.summary}</p> : null}
                {task.pullRequest && !task.pullRequest.demo ? <SendToCodingButton productId={productId} commentId={comment.id} /> : null}
              </div>
            ))}
          </div>
          <div className="mt-4">
            <h4 className="text-sm font-semibold">Traceability</h4>
            <p className="mt-2 text-sm text-muted-foreground">
              {[task.trace.outcome, task.trace.capability, task.trace.story, task.trace.task].filter(Boolean).join(" → ") || "Not linked."}
            </p>
          </div>
          <div className="mt-4">
            <h4 className="text-sm font-semibold">Publish eligibility</h4>
            {task.blockers.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">This task can be published. Other slice tasks do not have to be finished or merged.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {task.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-4">
            <h4 className="text-sm font-semibold">Pull request readiness</h4>
            <p className="mt-2 text-sm text-muted-foreground">
              {task.readiness.label}
              {task.pullRequest?.state === "MERGED"
                ? ". GitHub completed the merge. AI Product Builder did not merge it."
                : ". A merged pull request is not required before publishing."}
            </p>
            {task.pullRequest?.state === "MERGED" ? (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Merge commit</dt>
                  <dd className="font-medium">{task.pullRequest.mergeCommitSha || "Not recorded"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Merged by</dt>
                  <dd className="font-medium">{task.pullRequest.mergedBy || "Not recorded"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Merged at</dt>
                  <dd className="font-medium">{mergeInstant(task.pullRequest.mergedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Approved head</dt>
                  <dd className="font-medium">{task.pullRequest.headSha}</dd>
                </div>
              </dl>
            ) : null}
            {"approvals" in task.readiness && task.readiness.approvals ? (
              <p className="mt-2 text-sm">
                Human GitHub approvals: {task.readiness.approvals.valid} of {task.readiness.approvals.required} are valid.
              </p>
            ) : null}
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {task.readiness.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {task.publication.offerForm ? (
              <PublishBranchButton
                productId={productId}
                taskId={task.id}
                destination={destination}
                branch={task.branchName}
                commitSha={task.commitSha}
              />
            ) : null}
            {task.publication.remoteCommitSha && !task.publication.demo && !task.pullRequest && (!view.bootstrap || view.bootstrap.status === "ready" || view.bootstrap.status === "hidden") ? (
              <CreatePullRequestForm productId={productId} taskId={task.id} />
            ) : null}
            {task.pullRequest && !task.pullRequest.demo ? (
              <>
                <RefreshPullRequestButton productId={productId} pullRequestId={task.pullRequest.id} />
                <AnalyseFeedbackButton productId={productId} pullRequestId={task.pullRequest.id} />
                <UpdateBranchButton productId={productId} taskId={task.id} />
                {task.pullRequest.url ? (
                  <a className="inline-flex h-9 items-center text-sm font-medium text-indigo-800" href={task.pullRequest.url}>
                    Open Pull Request in GitHub
                  </a>
                ) : null}
              </>
            ) : null}
          </div>
        </article>
      ))}
      <div id="release-readiness" className="rounded-2xl border bg-card p-5">
        <p className="text-xs font-medium tracking-wide text-indigo-700">PRODUCT RELEASE READINESS</p>
        <h2 className="mt-1 text-lg font-semibold">{view.release.label}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This is the whole-slice release candidate. It does not decide whether one approved task branch can be published.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {view.release.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RecordedChecks({ checks }: { checks: NonNullable<View["tasks"][number]["pullRequest"]>["checks"] }) {
  const current = currentRecordedChecks(checks);
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {checks.map((check) => (
        <li key={check.id}>
          {check.name}: {check.status} {check.conclusion}
          {check.source === "DEMO" ? " · DEMO DATA" : " · GITHUB"}
          {current.has(check.id) ? "" : " · earlier attempt"}
        </li>
      ))}
    </ul>
  );
}

function currentRecordedChecks(checks: NonNullable<View["tasks"][number]["pullRequest"]>["checks"]) {
  return new Set(
    currentChecks(
      checks.map((check) => ({
        id: check.id,
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        startedAt: instant(check.startedAt),
        completedAt: instant(check.completedAt),
        app: check.source,
      })),
    )
      .map((check) => check.id)
      .filter((id): id is string => Boolean(id)),
  );
}

function instant(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mergeInstant(value: Date | string | null | undefined) {
  const formatted = instant(value);
  if (!formatted || Number.isNaN(Date.parse(formatted))) return "Not recorded";
  return formatted;
}
