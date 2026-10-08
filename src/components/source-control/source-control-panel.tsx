import {
  AnalyseFeedbackButton,
  CreatePullRequestForm,
  PublishBranchButton,
  RefreshPullRequestButton,
  SendToCodingButton,
  UpdateBranchButton,
} from "@/components/source-control/source-control-controls";
import type { getSourceControlView } from "@/modules/source-control/service";

type View = NonNullable<Awaited<ReturnType<typeof getSourceControlView>>>;

export function SourceControlPanel({ productId, view }: { productId: string; view: View }) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-card p-5">
        <p className="text-xs font-medium tracking-wide text-indigo-700">SOURCE CONTROL</p>
        <h2 className="mt-1 text-lg font-semibold">{view.release.label}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {view.release.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          {view.connection.owner && view.connection.repositoryName
            ? `${view.connection.owner}/${view.connection.repositoryName}`
            : "No GitHub repository is configured."}{" "}
          Connection {view.connection.status}. {view.connection.message}
        </p>
      </div>
      {view.tasks.map((task) => (
        <article key={task.id} className="rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-indigo-700">PULL REQUEST</p>
              <h3 className="text-lg font-semibold">{task.title}</h3>
            </div>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium">{task.readiness.label}</span>
          </div>
          {task.published?.demo || task.pullRequest?.demo ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
              DEMO DATA. This publication was seeded for the sample product. It was not retrieved from GitHub.
            </p>
          ) : null}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Code commit</dt>
              <dd className="font-medium">{task.commitSha ? task.commitSha.slice(0, 12) : "None"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Published branch</dt>
              <dd className="font-medium">{task.published?.remoteBranch || "Not published"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pull request</dt>
              <dd className="font-medium">{task.pullRequest ? `#${task.pullRequest.number} ${task.pullRequest.state}` : "None"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Head SHA</dt>
              <dd className="font-medium">{task.pullRequest?.headSha ? task.pullRequest.headSha.slice(0, 12) : "None"}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <h4 className="text-sm font-semibold">CI</h4>
            {task.pullRequest && task.pullRequest.checks.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {task.pullRequest.checks.map((check) => (
                  <li key={check.id}>
                    {check.name}: {check.status} {check.conclusion}
                    {check.source === "DEMO" ? " · DEMO DATA" : " · GITHUB"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No CI checks have been synchronised.</p>
            )}
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
            <h4 className="text-sm font-semibold">Readiness</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {task.readiness.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
          {task.blockers.length > 0 ? (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {task.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {task.blockers.length === 0 && !task.published ? <PublishBranchButton productId={productId} taskId={task.id} /> : null}
            {task.published && !task.published.demo && task.published.status === "PUBLISHED" && !task.pullRequest ? (
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
    </section>
  );
}
