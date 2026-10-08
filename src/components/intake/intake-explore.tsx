import {
  ApproveBriefButton,
  MoveToDefineButton,
} from "@/components/discovery/composer";
import { BriefPanel } from "@/components/discovery/brief-panel";
import { NextActionPanel } from "@/components/guidance/guidance-ui";
import {
  AcknowledgeChangeForm,
  AddressFindingForm,
  AnalyseButton,
  AnswerForm,
  ConfirmRequirementForm,
  DispositionForm,
  DraftBriefButton,
  PasteRequirementsForm,
  PrepareBriefButton,
  UploadRequirementsForm,
} from "@/components/intake/intake-forms";
import { STAGE_META } from "@/domain/constants";
import type { ProductGuidance } from "@/modules/guidance/types";
import { getIntakeWorkspace } from "@/modules/intake/service";
import type { ProductBriefRecord } from "@/modules/discovery/types";

const TYPE_LABEL: Record<string, string> = {
  BUSINESS: "Business",
  FUNCTIONAL: "Functional",
  NON_FUNCTIONAL: "Non-functional",
  SECURITY: "Security",
  REGULATORY: "Regulatory",
  DATA: "Data",
  INTEGRATION: "Integration",
  TECHNICAL_CONSTRAINT: "Technical constraint",
  USER_EXPERIENCE: "User experience",
  OPERATIONAL: "Operational",
  UNKNOWN: "Unknown",
};

const CONFIRM_LABEL: Record<string, string> = {
  UNREVIEWED: "Unreviewed",
  CONFIRMED: "Confirmed",
  NEEDS_CHANGE: "Needs change",
  REJECTED: "Rejected",
};

const READY_LABEL = {
  NOT_READY: "Not ready",
  NEEDS_ATTENTION: "Needs attention",
  READY_FOR_DEFINITION: "Ready for definition",
} as const;

const DISPOSITION_LABEL: Record<string, string> = {
  UNSET: "Not set",
  IN_SCOPE: "In scope",
  OUT_OF_SCOPE: "Out of scope",
  DEFERRED: "Deferred",
  DUPLICATE: "Duplicate",
  SUPERSEDED: "Superseded",
  NOT_A_REQUIREMENT: "Not a requirement",
};

export async function IntakeExplore({
  productId,
  guidance,
  brief,
  sessionStatus,
  stage,
}: {
  productId: string;
  guidance: ProductGuidance;
  brief: ProductBriefRecord | null;
  sessionStatus: string | null;
  stage: keyof typeof STAGE_META;
}) {
  const workspace = await getIntakeWorkspace(productId);
  if (!workspace) return null;
  const historical = Boolean(workspace.analysis) && !workspace.current;
  const openFindings = workspace.findings.filter((finding) => finding.status === "OPEN");

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border bg-card p-4 sm:p-5">
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Explore · Existing requirements</p>
        <h2 className="mt-1 text-xl font-semibold">Requirements intake</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          The customer already had requirements, so this product does not start from a blank sheet. What was supplied stays as source material. The reading, the gaps, and the Product Brief stay separate until a person confirms them.
        </p>
      </header>
      {guidance.stage === "EXPLORE" || guidance.action?.stage === "EXPLORE" ? <NextActionPanel guidance={guidance} /> : null}

      {workspace.product.requirementsReviewRequired ? (
        <section id="sources" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
          <h3 className="font-semibold">Requirements changed after definition approval</h3>
          <p className="mt-1">The approved Product Definition was not changed. Review the new source before treating the definition as current.</p>
          <AcknowledgeChangeForm productId={productId} />
        </section>
      ) : null}

      {!workspace.configured ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          Requirements analysis is not configured. Add OPENAI_API_KEY on the server. No analysis will be invented.
        </p>
      ) : null}

      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold">Readiness</h3>
        <p className="mt-2 text-sm font-medium">{READY_LABEL[workspace.readiness.status]}</p>
        {workspace.readiness.reasons.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
            {workspace.readiness.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">The intake is ready for a person to draft and approve the Product Brief. Approval is still required.</p>
        )}
      </section>

      {workspace.current ? (
        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <h3 className="text-sm font-semibold">Analysis summary</h3>
          <p className="mt-1 text-xs text-muted-foreground">These counts come from the saved requirements and findings.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            <Count label="Requirements identified" value={workspace.summary.requirements} />
            <Count label="Capabilities suggested" value={workspace.summary.capabilities} />
            <Count label="Need clearer acceptance criteria" value={workspace.summary.acceptanceGaps} />
            <Count label="Possible conflicts" value={workspace.summary.conflicts} />
            <Count label="Assumptions to confirm" value={workspace.summary.assumptions} />
            <Count label="Non-functional requirements" value={workspace.summary.nonFunctional} />
            <Count label="Not connected to an outcome" value={workspace.summary.missingOutcomes} />
            <Count label="Security questions" value={workspace.summary.securityQuestions} />
          </ul>
        </section>
      ) : null}

      <section id="add" className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <h3 className="text-sm font-semibold">Paste requirements</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Plain text or Markdown. The paste is stored as the source.</p>
          <div className="mt-4">
            <PasteRequirementsForm productId={productId} />
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <h3 className="text-sm font-semibold">Upload a document</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">.txt, .md, .docx, or a PDF that contains text. Limit 2 MB. Scanned PDFs are not read.</p>
          <div className="mt-4">
            <UploadRequirementsForm productId={productId} />
          </div>
        </div>
      </section>

      <section id="sources" className="rounded-2xl border bg-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold">Source documents</h3>
        {workspace.sources.length === 0 ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Nothing has been added yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {workspace.sources.map((source) => (
              <li key={source.id} className="rounded-xl border p-3">
                <p className="text-sm font-medium">{source.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {source.kind === "PASTED_TEXT" ? "Pasted text" : "Uploaded document"}
                  {source.originalFilename ? ` · ${source.originalFilename}` : ""}
                  {" · "}
                  {source.status === "EXTRACTION_FAILED" ? "Readable text was not extracted" : source.status === "SUPERSEDED" ? "Superseded" : "Stored"}
                  {" · "}
                  {source.sourceHash.slice(0, 12)}
                </p>
                {source.extractionNote ? <p className="mt-2 text-sm leading-6 text-amber-900">{source.extractionNote}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="analyse" className="rounded-2xl border bg-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold">Analyse</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Analysis quotes the source. It does not replace it, approve it, or start coding.
        </p>
        {historical ? (
          <p className="mt-3 text-sm leading-6 text-amber-900">
            The source changed. The previous analysis is historical and is not applied to the new text.
          </p>
        ) : null}
        <div className="mt-4">
          <AnalyseButton productId={productId} />
        </div>
      </section>

      {workspace.analysis ? (
        <>
          <section id="findings" className="space-y-3">
            <h3 className="text-lg font-semibold">Findings</h3>
            {openFindings.length === 0 ? (
              <p className="text-sm leading-6 text-muted-foreground">No open findings on this analysis.</p>
            ) : (
              <ul className="space-y-3">
                {openFindings.map((finding) => {
                  const linked = workspace.requirements.filter((item) => finding.links.some((link) => link.sourceRequirementId === item.id));
                  return (
                    <li key={finding.id} className="rounded-2xl border bg-card p-4">
                      <p className="text-xs text-muted-foreground">{finding.severity} · {finding.findingType.replaceAll("_", " ").toLowerCase()}</p>
                      <h4 className="mt-1 text-sm font-semibold">{finding.title}</h4>
                      <p className="mt-2 text-sm leading-6">{finding.explanation}</p>
                      {finding.gapNote ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{finding.gapNote}</p> : null}
                      {linked.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-sm">
                          {linked.map((item) => (
                            <li key={item.id}>{item.identifier}: {item.sourceText}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">Source-level gap. It is not tied to one extracted line.</p>
                      )}
                      {workspace.current ? <AddressFindingForm productId={productId} findingId={finding.id} /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section id="questions" className="space-y-3">
            <h3 className="text-lg font-semibold">Clarification questions</h3>
            <ul className="space-y-3">
              {workspace.questions.map((question) => (
                <li key={question.id} className="rounded-2xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">{question.priority} · {question.status === "ANSWERED" ? "Answered" : "Open"}</p>
                  <p className="mt-1 text-sm font-medium">{question.question}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{question.reason}</p>
                  {question.answer ? (
                    <p className="mt-2 text-sm leading-6">Answer: {question.answer}{question.answeredBy ? ` · ${question.answeredBy}` : ""}</p>
                  ) : workspace.current ? (
                    <AnswerForm productId={productId} questionId={question.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section id="requirements" className="space-y-3">
            <h3 className="text-lg font-semibold">Extracted requirements</h3>
            <ul className="space-y-3">
              {workspace.requirements.map((item) => (
                <li key={item.id} className="rounded-2xl border bg-card p-4">
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold">
                      {item.identifier} · {TYPE_LABEL[item.requirementType] ?? item.requirementType} · {CONFIRM_LABEL[item.confirmation]}
                    </summary>
                    <div className="mt-3 space-y-3 text-sm leading-6">
                      <div>
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Source</p>
                        <p className="mt-1 whitespace-pre-wrap">{item.sourceText}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.sectionHeading || "No section heading"}
                          {item.pageNumber ? ` · page ${item.pageNumber}` : ""}
                          {` · block ${item.blockIndex}`}
                          {item.source?.title ? ` · ${item.source.title}` : ""}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">AI interpretation</p>
                        <p className="mt-1">{item.interpretation}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Human-confirmed interpretation</p>
                        <p className="mt-1">{item.confirmedInterpretation || "Not confirmed."}</p>
                        {item.confirmedBy ? <p className="text-xs text-muted-foreground">{item.confirmedBy}</p> : null}
                      </div>
                      <p>Disposition: {DISPOSITION_LABEL[item.disposition] ?? item.disposition}{item.dispositionReason ? ` — ${item.dispositionReason}` : ""}</p>
                      {item.traces.length > 0 ? (
                        <ul className="space-y-1">
                          {item.traces.map((trace) => (
                            <li key={trace.id}>{trace.targetKind.replaceAll("_", " ").toLowerCase()} · {trace.provenance === "HUMAN_CONFIRMED" ? "Confirmed by a person" : "Proposed"}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground">Not linked to the Product Definition yet.</p>
                      )}
                      {workspace.current ? (
                        <>
                          <ConfirmRequirementForm productId={productId} requirementId={item.id} interpretation={item.confirmedInterpretation || item.interpretation} />
                          <DispositionForm productId={productId} requirementId={item.id} />
                        </>
                      ) : null}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      <section id="brief" className="space-y-4">
        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <h3 className="text-lg font-semibold">{brief?.fromRequirements ? "Drafted from your requirements" : "Product Brief"}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            The brief is a proposal. A person reviews, edits, and approves it. Missing problem, user, or outcome text is asked for, not invented.
          </p>
          {workspace.current && brief?.status !== "APPROVED" ? (
            <div className="mt-4 flex flex-wrap gap-3">
              {!brief ? <DraftBriefButton productId={productId} /> : null}
              {brief?.fromRequirements && brief.status === "DRAFT" ? <PrepareBriefButton productId={productId} /> : null}
            </div>
          ) : null}
          {sessionStatus === "READY_FOR_REVIEW" && brief?.status === "READY_FOR_REVIEW" ? (
            <div className="mt-4">
              <ApproveBriefButton productId={productId} />
            </div>
          ) : null}
          {sessionStatus === "APPROVED" && brief?.status === "APPROVED" ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm leading-6 text-emerald-950">The Product Brief is approved. Approval did not move the stage.</p>
              {stage === "EXPLORE" ? (
                <div className="mt-3">
                  <MoveToDefineButton productId={productId} />
                </div>
              ) : (
                <p className="mt-2 text-sm text-emerald-950">This product is already in {STAGE_META[stage].label}.</p>
              )}
            </div>
          ) : null}
        </div>
        {brief ? <BriefPanel productId={productId} brief={brief} editable={brief.status !== "APPROVED"} /> : null}
      </section>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded-xl border px-3 py-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </li>
  );
}
