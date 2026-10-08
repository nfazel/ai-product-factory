import {
  ConfirmRequirementForm,
  DispositionForm,
  TraceForm,
} from "@/components/intake/intake-forms";
import { getIntakeWorkspace } from "@/modules/intake/service";

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

export async function RequirementsPanel({
  productId,
  targets,
}: {
  productId: string;
  targets: { value: string; label: string }[];
}) {
  const workspace = await getIntakeWorkspace(productId);
  if (!workspace || workspace.product.startMode !== "EXISTING_REQUIREMENTS") return null;
  const unmapped = workspace.requirements.filter(
    (item) => item.confirmation === "CONFIRMED" && ["UNSET", "IN_SCOPE"].includes(item.disposition) && item.traces.length === 0,
  );

  return (
    <section id="requirements" className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Requirements source</h2>
        <p className="text-sm text-muted-foreground">Supplied requirements stay linked to the definition. This is a summary, not the whole source.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Supplied" value={workspace.counts.supplied} />
        <Stat label="Confirmed" value={workspace.counts.confirmed} />
        <Stat label="Needs attention" value={workspace.counts.needsAttention} />
        <Stat label="Mapped" value={workspace.counts.mapped} />
        <Stat label="Deferred or out of scope" value={workspace.counts.deferred} />
      </ul>
      {!workspace.current && workspace.analysis ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
          Requirements changed after this analysis. The previous reading is historical.
        </p>
      ) : null}
      {unmapped.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-950">
          <p className="font-medium">Confirmed requirements not yet in the Product Definition</p>
          <ul className="mt-2 list-disc pl-5">
            {unmapped.map((item) => (
              <li key={item.id}>{item.identifier}: {item.sourceText}</li>
            ))}
          </ul>
          <p className="mt-2">Map each one, or record a disposition with a reason. Approval stays blocked until then.</p>
        </div>
      ) : null}
      <ul className="space-y-3">
        {workspace.requirements.map((item) => (
          <li key={item.id} className="rounded-2xl border bg-card p-4">
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                {item.identifier} · {TYPE_LABEL[item.requirementType] ?? item.requirementType}
              </summary>
              <div className="mt-3 space-y-3 text-sm leading-6">
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Source wording</p>
                  <p className="mt-1 whitespace-pre-wrap">{item.sourceText}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.sectionHeading || "No section heading"}
                    {item.pageNumber ? ` · page ${item.pageNumber}` : " · page not available"}
                    {` · block ${item.blockIndex}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">AI interpretation</p>
                  <p className="mt-1">{item.interpretation}</p>
                </div>
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Human-confirmed interpretation</p>
                  <p className="mt-1">{item.confirmedInterpretation || "Not confirmed."}</p>
                </div>
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Findings and questions</p>
                  <ul className="mt-1 space-y-1">
                    {workspace.findings
                      .filter((finding) => finding.links.some((link) => link.sourceRequirementId === item.id))
                      .map((finding) => (
                        <li key={finding.id}>{finding.title}</li>
                      ))}
                    {workspace.questions
                      .filter((question) => question.links.some((link) => link.sourceRequirementId === item.id))
                      .map((question) => (
                        <li key={question.id}>{question.question}{question.answer ? ` — ${question.answer}` : ""}</li>
                      ))}
                  </ul>
                </div>
                <p>Disposition: {item.disposition === "UNSET" ? "Not set" : item.disposition.replaceAll("_", " ").toLowerCase()}{item.dispositionReason ? ` — ${item.dispositionReason}` : ""}</p>
                {item.traces.length > 0 ? (
                  <ul>
                    {item.traces.map((trace) => (
                      <li key={trace.id}>
                        {trace.targetKind.replaceAll("_", " ").toLowerCase()} · {trace.provenance === "HUMAN_CONFIRMED" ? "Confirmed by a person" : "Proposed by analysis"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No definition link yet.</p>
                )}
                {workspace.current ? (
                  <>
                    <ConfirmRequirementForm productId={productId} requirementId={item.id} interpretation={item.confirmedInterpretation || item.interpretation} />
                    <DispositionForm productId={productId} requirementId={item.id} />
                    <TraceForm productId={productId} requirementId={item.id} targets={targets} />
                  </>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded-xl border bg-card px-3 py-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </li>
  );
}
