import {
  CODING_EXECUTION_LABEL,
  CODING_RISK_LABEL,
  EVIDENCE_TYPE_LABEL,
  FINDING_CATEGORY_LABEL,
  GOVERNANCE_ASSESSMENT_LABEL,
  SIGNAL_LEVEL_LABEL,
  THREAT_STATUS_LABEL,
  type SignalLevel,
} from "@/domain/constants";
import {
  CodingPolicyEditor,
  CodingRiskOverrideForm,
  FindingActions,
  GovernanceApprovalControls,
  GovernanceProposalActions,
  GovernanceRunControls,
  QuestionAnswerForm,
} from "@/components/build/governance-controls";
import type { CodingReadiness } from "@/modules/governance/coding-readiness";
import {
  findingBlocksProgression,
  findingStatusMeaning,
  findingTraceLines,
  progressionCopy,
  severityLabel,
  summarizeGovernanceChecks,
  whyItMatters,
} from "@/modules/governance/finding-presentation";
import type { getGovernanceWorkspace } from "@/modules/governance/service";

const LEVEL_TONE: Record<SignalLevel, string> = {
  LOW: "bg-stone-100 text-stone-700",
  MEDIUM: "bg-amber-50 text-amber-900",
  HIGH: "bg-emerald-50 text-emerald-800",
};

type Workspace = Awaited<ReturnType<typeof getGovernanceWorkspace>>;

function textList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function GovernanceSummary({ review }: { review: NonNullable<Workspace["review"]> }) {
  const summary = summarizeGovernanceChecks(review);
  const settled = summary.complete && review.status === "APPROVED" && !review.reviewRequired;
  return (
    <div className="rounded-xl border p-3">
      <h3 className="text-sm font-semibold">Governance review</h3>
      <p className="mt-1 text-sm">
        {summary.total} {summary.total === 1 ? "check" : "checks"} performed
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Count label="Passed" value={summary.passed} />
        <Count label="Risks accepted" value={summary.riskAccepted} />
        <Count label="Open" value={summary.open} />
        <Count label="Blocking" value={summary.blocking} />
      </dl>
      <p className="mt-3 text-sm leading-6">
        {settled
          ? "Governance review complete. No open or blocking checks remain."
          : summary.blocking > 0
            ? "Blocking checks must be resolved, or the residual risk accepted where the rules allow it, before Build can progress."
            : summary.complete
              ? "No open or blocking checks remain. Approving the engineering review is still a separate decision."
              : "Open checks still need a decision. They do not block progression."}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Review v{review.version}. Design v{review.architecture.version}. Delivery plan v{review.plan.version}.
      </p>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function when(value: Date) {
  return value.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function BuildReadiness({ coding }: { coding: CodingReadiness }) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">Build readiness</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Check label="Architecture" value={coding.architectureApproved ? "✓ Approved" : "○ Not approved"} />
        <Check label="Delivery plan" value={coding.planApproved ? "✓ Approved" : "○ Not approved"} />
        <Check
          label="Engineering review"
          value={
            coding.governanceReviewRequired
              ? "● Needs attention"
              : coding.governanceApproved
                ? "✓ Approved"
                : "○ Not approved"
          }
        />
        <Check
          label="Coding rules"
          value={
            coding.policyReapprovalRequired
              ? "● Needs approval again"
              : coding.policyApproved
                ? "✓ Approved"
                : "○ Not approved"
          }
        />
        <Check label="Coding readiness" value={coding.label} />
      </dl>
      {coding.governanceReviewRequired ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          Engineering review needs attention. {coding.governanceReviewReason}
          {coding.governanceReviewFlaggedAt ? ` Flagged ${coding.governanceReviewFlaggedAt}.` : ""}
        </p>
      ) : null}
      {coding.policyReapprovalRequired ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          Coding rules need approval again. {coding.policyReapprovalReason}
          {coding.policyReapprovalFlaggedAt ? ` Flagged ${coding.policyReapprovalFlaggedAt}.` : ""}
        </p>
      ) : null}
      {coding.blockers.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm leading-6 text-amber-950">
          {coding.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-emerald-800">
          Coding readiness is clear. A person still approves the task and the change.
        </p>
      )}
    </section>
  );
}

function Check({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}

export function GovernancePanel({
  productId,
  governance,
}: {
  productId: string;
  governance: Workspace;
}) {
  const review = governance.review;
  const policy = review?.policy ?? null;
  return (
    <section id="review" tabIndex={-1} className="scroll-mt-20 space-y-4 rounded-2xl border bg-card p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">Engineering review</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Independent review of the approved definition, design, and delivery plan.
          This is not a penetration test. Dependency comments are an AI review until a scanner is connected.
          The agent cannot approve its own review.
        </p>
      </div>
      {governance.entryReasons.length > 0 ? (
        <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          {governance.entryReasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      ) : null}
      {review ? <GovernanceSummary review={review} /> : null}
      <GovernanceRunControls productId={productId} />
      {governance.proposal ? (
        <div className="rounded-xl border p-3">
          <p className="text-sm font-medium">Open governance proposal</p>
          <p className="mt-1 text-sm leading-6">{governance.proposal.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Proposed assessment: {GOVERNANCE_ASSESSMENT_LABEL[governance.proposal.payload.overallAssessment]}. A person accepts and commits it. Nothing is approved yet.
          </p>
          <div className="mt-3">
            <GovernanceProposalActions productId={productId} proposalId={governance.proposal.id} />
          </div>
        </div>
      ) : null}
      {review?.seededDemo ? (
        <p className="text-sm leading-6 text-amber-900">
          Demo data. This engineering review, threat model, coding-risk assessments, and coding rules were prepared for the sample product. They were not produced by an agent run.
        </p>
      ) : null}
      <div>
        <h3 className="text-sm font-semibold">Overall assessment</h3>
        <p className="mt-1 text-sm leading-6">
          {review
            ? `${GOVERNANCE_ASSESSMENT_LABEL[review.overallAssessment]}. ${review.summary}`
            : "No governance review has been committed."}
        </p>
        {review ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Status {review.status}. The assessment is a proposal until a person approves the review.
          </p>
        ) : null}
      </div>
      <div>
        <h3 className="text-sm font-semibold">Governance readiness</h3>
        <p className="mt-1 text-sm">{governance.readiness.summary}</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {governance.readiness.areas.map((area) => (
            <li key={area.key} className="rounded-xl border p-3 text-sm leading-6">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_TONE[area.level]}`}>
                {SIGNAL_LEVEL_LABEL[area.level]}
              </span>
              <p className="mt-2 font-medium">{area.label}</p>
              <p className="text-muted-foreground">{area.explanation}</p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Findings</h3>
        <ul className="mt-3 space-y-3">
          {(review?.findings ?? []).map((finding) => {
            const progression = progressionCopy(finding);
            const history = (review?.evidence ?? []).filter((item) => item.findingId === finding.id);
            const trace = findingTraceLines(finding.links, finding.title);
            return (
              <li key={finding.id} className="rounded-xl border p-3 text-sm leading-6">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-medium">{finding.title}</h4>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium">{severityLabel(finding.severity)}</span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium">{FINDING_CATEGORY_LABEL[finding.category]}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${progression.blocks ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-800"}`}>
                    {progression.label}
                  </span>
                </div>
                <p className="mt-2">
                  <span className="font-medium">Status. </span>
                  {findingStatusMeaning(finding.status)}
                </p>
                <p className="mt-2">
                  <span className="font-medium">Issue. </span>
                  {finding.description}
                </p>
                <p className="mt-2">
                  <span className="font-medium">Why it matters. </span>
                  {whyItMatters(finding)}
                </p>
                <div className="mt-2">
                  <p className="font-medium">Source</p>
                  <ol className="mt-1 space-y-1 text-muted-foreground">
                    {trace.map((line, index) => (
                      <li key={`${finding.id}-${line}`}>
                        {index > 0 ? "↓ " : ""}
                        {line}
                      </li>
                    ))}
                  </ol>
                </div>
                <p className="mt-2">
                  <span className="font-medium">Recommended action. </span>
                  {finding.recommendation}
                </p>
                <p className="mt-2 text-muted-foreground">{progression.text}</p>
                {finding.rationale ? (
                  <p className="mt-2">
                    <span className="font-medium">Recorded rationale. </span>
                    {finding.rationale}
                    {finding.owner ? ` Recorded by ${finding.owner}.` : ""}
                    {` Updated ${when(finding.updatedAt)}.`}
                  </p>
                ) : null}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">Decision history</summary>
                  <ol className="mt-2 space-y-2 text-muted-foreground">
                    <li>Raised {when(finding.createdAt)} on governance review v{review?.version}. Design v{review?.architecture.version}.</li>
                    {history.map((item) => (
                      <li key={item.id}>
                        {when(item.createdAt)}. {item.source}. {item.description}
                        {item.result && item.result !== "Human confirmation" ? ` Rationale: ${item.result}` : ""}
                      </li>
                    ))}
                    {history.length === 0 ? <li>No human decision has been recorded yet.</li> : null}
                  </ol>
                </details>
                <FindingActions
                  productId={productId}
                  findingId={finding.id}
                  open={finding.status === "OPEN" || finding.status === "ACCEPTED"}
                  blocks={findingBlocksProgression(finding)}
                  acceptRisk={{
                    title: finding.title,
                    severity: severityLabel(finding.severity),
                    impact: whyItMatters(finding),
                    recommendation: finding.recommendation,
                  }}
                />
              </li>
            );
          })}
          {review && review.findings.length === 0 ? (
            <li className="text-sm text-muted-foreground">No findings recorded.</li>
          ) : null}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Threats</h3>
        <ul className="mt-3 space-y-3">
          {(review?.threats ?? []).map((threat) => (
            <li key={threat.id} className="rounded-xl border p-3 text-sm leading-6">
              <p className="font-medium">{threat.title}</p>
              <p>{threat.description}</p>
              <p className="text-muted-foreground">
                Affected component: {threat.component?.name ?? "Not linked"}. Attack surface: {threat.attackSurface}.
              </p>
              <p className="text-muted-foreground">
                Likelihood {threat.likelihood}. Impact {threat.impact}. Status {THREAT_STATUS_LABEL[threat.status]}.
              </p>
              <p>Mitigation: {threat.mitigation}</p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Coding risk by implementation task</h3>
        <ul className="mt-3 space-y-3">
          {(review?.codingRisks ?? []).map((risk) => {
            const level = risk.overrideRiskLevel ?? risk.riskLevel;
            const mode = risk.overrideExecutionMode ?? risk.recommendedExecutionMode;
            return (
              <li key={risk.id} id={`coding-risk-${risk.implementationTaskId}`} className="rounded-xl border p-3 text-sm leading-6">
                <p className="font-medium">{risk.task.title}</p>
                <p>
                  AI coding risk {CODING_RISK_LABEL[level]}. Recommended mode {CODING_EXECUTION_LABEL[mode]}.
                </p>
                <p className="text-muted-foreground">{risk.reason}</p>
                {risk.overriddenBy ? (
                  <p>
                    Human override by {risk.overriddenBy}
                    {risk.overriddenAt ? ` at ${risk.overriddenAt.toISOString()}` : ""}. {risk.overrideReason}
                  </p>
                ) : (
                  <p className="text-muted-foreground">No human override.</p>
                )}
                <CodingRiskOverrideForm productId={productId} assessmentId={risk.id} />
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Coding rules</h3>
        {policy ? (
          <>
            <ul className="mt-2 space-y-1 text-sm leading-6">
              <li>Allowed paths: {textList(policy.allowedPaths).join(", ") || "None"}</li>
              <li>Restricted paths: {textList(policy.restrictedPaths).join(", ") || "None"}</li>
              <li>Prohibited actions: {textList(policy.prohibitedActions).join("; ") || "None"}</li>
              <li>Required checks: {textList(policy.requiredChecks).join(", ") || "None"}</li>
              <li>Tests required: {policy.requireTests ? "Yes" : "No"}</li>
              <li>Human review required: {policy.requireHumanReview ? "Yes" : "No"}</li>
              <li>Maximum files per task: {policy.maxFilesPerTask ?? "No limit"}</li>
            </ul>
            <CodingPolicyEditor
              productId={productId}
              policyId={policy.id}
              allowedPaths={textList(policy.allowedPaths).join("\n")}
              restrictedPaths={textList(policy.restrictedPaths).join("\n")}
              prohibitedActions={textList(policy.prohibitedActions).join("\n")}
              requiredChecks={textList(policy.requiredChecks).join("\n")}
              maxFilesPerTask={policy.maxFilesPerTask?.toString() ?? ""}
              requireTests={policy.requireTests}
              requireHumanReview={policy.requireHumanReview}
            />
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No coding rules have been committed.</p>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold">Questions</h3>
        <ul className="mt-3 space-y-3">
          {(review?.questions ?? []).map((question) => (
            <li key={question.id} className="rounded-xl border p-3 text-sm leading-6">
              <p className="font-medium">{question.question}</p>
              <p className="text-muted-foreground">{question.reason}</p>
              <p>
                Impact {question.impact}. Status {question.status}. Blocking: {question.blocking ? "Yes" : "No"}.
              </p>
              {question.answer ? <p>Answer: {question.answer}</p> : <QuestionAnswerForm productId={productId} questionId={question.id} />}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Evidence</h3>
        <ul className="mt-3 space-y-2">
          {(review?.evidence ?? []).map((item) => (
            <li key={item.id} className="rounded-xl border p-3 text-sm leading-6">
              <p className="font-medium">{EVIDENCE_TYPE_LABEL[item.type]} · {item.source}</p>
              <p>{item.description}</p>
              <p className="text-muted-foreground">{item.result}</p>
            </li>
          ))}
        </ul>
        {review ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Dependency review: {review.dependencyReview || "Not recorded."} Security notes: {review.securityAssessment} Privacy: {review.privacyAssessment}
          </p>
        ) : null}
      </div>
      {review ? <GovernanceApprovalControls productId={productId} /> : null}
    </section>
  );
}
