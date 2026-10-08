import {
  AcceptRiskForm,
  AnswerQuestionForm,
  ApprovePlanButton,
  ApproveReleaseButton,
  AreaForm,
  CheckForm,
  CreateReleaseForm,
  DeploymentForm,
  DeploymentPlanForm,
  IssueForm,
  NotesForm,
  QuestionForm,
  RejectReleaseForm,
  ResolveIssueForm,
  ReviewReleaseButton,
  RollbackForm,
} from "@/components/release/release-controls";
import type { getShipView } from "@/modules/release/service";

type View = NonNullable<Awaited<ReturnType<typeof getShipView>>>;

function Section({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <p className="text-xs font-medium tracking-wide text-indigo-700">{kicker}</p>
      <h2 className="mt-1 text-lg font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </section>
  );
}

export function ShipPanel({ productId, view }: { productId: string; view: View }) {
  const candidate = view.candidate;
  const realCandidate = candidate && !candidate.demo ? candidate : null;
  return (
    <div className="space-y-4">
      <Section kicker="RELEASE STATUS" title={candidate ? `${candidate.version} · ${candidate.status}` : "No release candidate"}>
        <p>Release readiness: {candidate && !candidate.demo ? `${candidate.readiness.sufficient} of ${candidate.readiness.total} areas sufficiently understood.` : "Not assessed."}</p>
        {candidate?.demo ? <p className="font-medium text-amber-800">DEMO DATA. This seeded candidate is not a release approval and not a production deployment.</p> : null}
        <p>Risk: {candidate?.risk?.overall ?? "Not assessed"}</p>
        <p>{candidate?.risk?.summary}</p>
        {candidate?.approval ? (
          <p>
            Release approval: {candidate.approval.status}
            {candidate.approval.stale ? ` · STALE. ${candidate.approval.staleReason}` : ""} by {candidate.approval.approvedBy || "a person"} {candidate.approval.resolvedAt}
          </p>
        ) : (
          <p>Release approval: none</p>
        )}
        {view.entryBlockers.length > 0 ? (
          <div>
            <p className="font-medium">A new release candidate stays closed until every entry condition holds.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {view.entryBlockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : (
          <CreateReleaseForm productId={productId} suggestedVersion={view.suggestedVersion} />
        )}
        <p className="text-muted-foreground">Stage: {view.stage}. A person moves the stage. The factory does not.</p>
        <p className="text-muted-foreground">{view.readyToLearn.label}. {view.readyToLearn.reasons.join(" ")}</p>
      </Section>

      {candidate ? (
        <>
          <Section kicker="SCOPE" title="What is being released">
            <p>{candidate.name}</p>
            <p>{candidate.description || view.outcome?.title}</p>
            <ul className="list-disc space-y-1 pl-5">
              {candidate.items.map((item) => (
                <li key={item.id}>{item.type}: {item.title}</li>
              ))}
            </ul>
            <div>
              <p className="font-medium">Source commits</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {candidate.sourceCommits.map((commit) => (
                  <li key={`${commit.number}-${commit.mergeSha}`}>
                    PR #{commit.number} head {commit.headSha || "unrecorded"} merge {commit.mergeSha || "unrecorded"} by {commit.mergedBy || "unrecorded"}
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <Section kicker="PRODUCT VALUE" title={view.outcome?.title || "No confirmed outcome"}>
            <p>Capability: {view.capability?.name || "Not linked"}</p>
            <p>Success measure: {view.outcome?.successMeasure || "Not recorded"}</p>
            <p>Target: {view.outcome?.target || "Not recorded"}</p>
          </Section>

          <Section kicker="TRACEABILITY" title="Outcome to merge">
            <p>Outcome: {candidate.trace.outcome || "Not linked"}</p>
            <p>Capability: {candidate.trace.capability || "Not linked"}</p>
            <p>Epic: {candidate.trace.epic || "Not linked"}</p>
            <p>Feature: {candidate.trace.feature || "Not linked"}</p>
            <p>Story: {candidate.trace.story || "Not linked"}</p>
            <ul className="list-disc pl-5">{candidate.trace.criteria.map((item) => <li key={item}>{item}</li>)}</ul>
            <p>Tasks: {candidate.trace.tasks.join(", ") || "None"}</p>
            <p>Commits: {candidate.trace.commits.join(", ") || "None"}</p>
            <p>Verification: {candidate.trace.verification.join(", ") || "None"}</p>
            <p>Pull requests: {candidate.trace.pullRequests.join(", ") || "None"}</p>
            <p>CI results: {candidate.trace.ci.join(", ") || "None"}</p>
            <p>Merge SHAs: {candidate.trace.merges.join(", ") || "None"}</p>
          </Section>

          <Section kicker="EVIDENCE" title="Evidence pack">
            <ul className="space-y-2">
              {candidate.evidence.map((row) => (
                <li key={row.id}>
                  <span className="font-medium">{row.type}</span> · {row.source} · {row.result}
                  <span className="block text-muted-foreground">{row.description}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section kicker="RISK" title={candidate.risk?.overall ?? "Not assessed"}>
            {candidate.risk?.narrative ? <p className="whitespace-pre-wrap text-muted-foreground">{candidate.risk.narrative}</p> : <p className="text-muted-foreground">No narrative is stored. Deterministic factors still apply.</p>}
            <ul className="space-y-3">
              {candidate.risk?.factors.map((factor) => (
                <li key={factor.id} className="rounded-xl border p-3">
                  <p className="font-medium">{factor.severity} {factor.category} · {factor.status}{factor.blocking ? " · blocking" : ""}</p>
                  <p>{factor.description}</p>
                  <p className="text-muted-foreground">{factor.evidence}</p>
                  {factor.acceptedRationale ? <p>Accepted: {factor.acceptedRationale}</p> : null}
                  {realCandidate && (factor.severity === "HIGH" || factor.severity === "CRITICAL") && factor.status === "OPEN" ? (
                    <AcceptRiskForm productId={productId} factorId={factor.id} />
                  ) : null}
                </li>
              ))}
            </ul>
            {realCandidate ? <ReviewReleaseButton productId={productId} candidateId={candidate.id} /> : null}
          </Section>

          <Section kicker="QUESTIONS" title="Release questions">
            {candidate.questions.length === 0 ? <p className="text-muted-foreground">No release questions.</p> : null}
            {candidate.questions.map((question) => (
              <div key={question.id} className="rounded-xl border p-3">
                <p className="font-medium">{question.status}{question.blocking ? " · blocking" : ""}</p>
                <p>{question.question}</p>
                {question.answer ? <p>Answer: {question.answer} — {question.answeredBy}</p> : null}
                {realCandidate && question.status === "OPEN" ? <AnswerQuestionForm productId={productId} questionId={question.id} /> : null}
              </div>
            ))}
            {realCandidate ? <QuestionForm productId={productId} candidateId={candidate.id} /> : null}
          </Section>

          <Section kicker="OPERATIONAL READINESS" title={`${candidate.operational.sufficient} of ${candidate.operational.relevant} relevant areas sufficiently understood`}>
            <ul className="space-y-3">
              {candidate.operational.areas.map((area) => (
                <li key={area.id}>
                  <p className="font-medium">{area.label} · {area.rating}{area.relevant ? "" : " · not relevant"}</p>
                  {area.notes ? <p className="text-muted-foreground">{area.notes}</p> : null}
                  {realCandidate ? <AreaForm productId={productId} areaId={area.id} rating={area.rating} relevant={area.relevant} /> : null}
                </li>
              ))}
            </ul>
          </Section>

          <Section kicker="DEPLOYMENT PLAN" title={candidate.plan ? `Version ${candidate.plan.version} · ${candidate.plan.status}` : "No plan"}>
            {candidate.plan ? (
              <>
                <p>{candidate.plan.strategy} · {candidate.plan.summary}</p>
                <p>Window: {candidate.plan.plannedWindow || "Not set"}</p>
                <p>Steps: {candidate.plan.steps.join(" · ") || "None recorded"}</p>
                <p>Rollback trigger: {candidate.plan.rollbackTrigger || "Not recorded"}</p>
                <p>Rollback steps: {candidate.plan.rollbackSteps || "Not recorded"}</p>
                <p>Data: {candidate.plan.rollbackDataImplications || "Not recorded"}</p>
                <p>Role: {candidate.plan.rollbackRole || "Not recorded"}</p>
                <p>Verification after rollback: {candidate.plan.rollbackVerification || "Not recorded"}</p>
                {candidate.plan.rollbackUnavailable ? <p>Rollback unavailable. Acknowledgement: {candidate.plan.rollbackAcknowledgement}</p> : null}
                <ul className="space-y-2">
                  {candidate.plan.checks.map((check) => (
                    <li key={check.id} className="rounded-xl border p-3">
                      <p className="font-medium">{check.phase} · {check.name} · {check.status}</p>
                      {realCandidate && check.status === "PENDING" ? <CheckForm productId={productId} checkId={check.id} /> : null}
                    </li>
                  ))}
                </ul>
                {realCandidate && candidate.plan.status !== "APPROVED" ? <ApprovePlanButton productId={productId} candidateId={candidate.id} /> : null}
              </>
            ) : (
              <p className="text-muted-foreground">A deployment plan is a governance record. The factory does not execute it.</p>
            )}
            {realCandidate ? <DeploymentPlanForm productId={productId} candidateId={candidate.id} /> : null}
          </Section>

          <Section kicker="APPROVAL" title={candidate.blockers.length === 0 && !candidate.demo ? "No deterministic release blocker" : "Not ready for release approval"}>
            <ul className="list-disc space-y-1 pl-5">
              {candidate.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
            {candidate.readiness.areas.map((area) => (
              <p key={area.key}>{area.label}: {area.level}. {area.explanation}</p>
            ))}
            {realCandidate ? (
              <div className="grid gap-4 md:grid-cols-2">
                <ApproveReleaseButton productId={productId} candidateId={candidate.id} />
                <RejectReleaseForm productId={productId} candidateId={candidate.id} />
              </div>
            ) : null}
          </Section>

          <Section kicker="RELEASE NOTES" title={candidate.releaseNotesStatus}>
            <pre className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-xs">{candidate.releaseNotes || "No draft yet."}</pre>
            {realCandidate ? <NotesForm productId={productId} candidateId={candidate.id} notes={candidate.releaseNotes} /> : null}
          </Section>

          <Section kicker="DEPLOYMENT RECORD" title={candidate.deployments[0]?.status ?? "Not deployed"}>
            {candidate.deployments.length === 0 ? <p>Not deployed. A person deploys outside the factory and records what happened.</p> : null}
            <ul className="space-y-2">
              {candidate.deployments.map((record) => (
                <li key={record.id} className="rounded-xl border p-3">
                  <p className="font-medium">{record.status}{record.demo ? " · DEMO DATA" : ""}</p>
                  <p>Version {record.deployedVersion || "unrecorded"} · commit {record.deployedCommitSha || "unrecorded"}</p>
                  <p>By {record.performedBy || "unrecorded"} · {record.externalReference}</p>
                  <p className="text-muted-foreground">{record.notes}</p>
                </li>
              ))}
            </ul>
            {candidate.releaseOutcome ? <p>Release result: {candidate.releaseOutcome.summary}</p> : null}
            {realCandidate && (candidate.status === "APPROVED" || candidate.status === "FAILED") ? (
              <DeploymentForm productId={productId} candidateId={candidate.id} version={candidate.version} />
            ) : null}
            {realCandidate && candidate.deployments.some((record) => record.status === "FAILED" || record.status === "SUCCEEDED") ? (
              <RollbackForm productId={productId} candidateId={candidate.id} />
            ) : null}
            <div className="space-y-3">
              {candidate.issues.map((issue) => (
                <div key={issue.id} className="rounded-xl border p-3">
                  <p className="font-medium">{issue.severity} {issue.category} · {issue.status}</p>
                  <p>{issue.description}</p>
                  {realCandidate && issue.status === "OPEN" ? <ResolveIssueForm productId={productId} issueId={issue.id} /> : null}
                </div>
              ))}
              {realCandidate ? <IssueForm productId={productId} candidateId={candidate.id} /> : null}
            </div>
          </Section>
        </>
      ) : null}
    </div>
  );
}
