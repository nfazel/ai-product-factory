import { AchieveForm, AssumptionForm, ConfirmProposalButton, LearningForm, ObservationForm } from "@/components/release/release-controls";
import type { getLearnView } from "@/modules/release/service";

type View = NonNullable<Awaited<ReturnType<typeof getLearnView>>>;

export function LearnPanel({ productId, view }: { productId: string; view: View }) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-5">
        <p className="text-xs font-medium tracking-wide text-indigo-700">LEARN</p>
        <h2 className="mt-1 text-lg font-semibold">{view.readyToLearn.label}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {view.readyToLearn.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">The product is in {view.stage}. A person moves it to Learn when this gate is open.</p>
        {view.releaseOutcome ? <p className="mt-2 text-sm">{view.releaseOutcome.summary}</p> : null}
      </section>
      {view.outcomes.map((outcome) => (
        <section key={outcome.id} className="space-y-3 rounded-2xl border bg-card p-5 text-sm">
          <p className="text-xs font-medium tracking-wide text-indigo-700">PRODUCT OUTCOME</p>
          <h2 className="text-lg font-semibold">{outcome.title}</h2>
          <p>{outcome.description}</p>
          <p>Status: {outcome.status}. Deployment does not mark this achieved.</p>
          <p>Success measure: {outcome.successMeasure || "Not recorded"}</p>
          <p>Target: {outcome.targetValue || "Not recorded"}</p>
          <div>
            <p className="font-medium">Current observations</p>
            {outcome.observations.length === 0 ? <p className="text-muted-foreground">No observation has been entered.</p> : null}
            <ul className="mt-2 space-y-2">
              {outcome.observations.map((observation) => (
                <li key={observation.id}>
                  {observation.demo ? "DEMO / SAMPLE. " : ""}
                  {observation.measure}: {observation.value} {observation.unit} · {observation.source} · {observation.recordedBy}
                  {observation.notes ? <span className="block text-muted-foreground">{observation.notes}</span> : null}
                </li>
              ))}
            </ul>
          </div>
          <ObservationForm productId={productId} outcomeId={outcome.id} />
          {outcome.status !== "ACHIEVED" ? <AchieveForm productId={productId} outcomeId={outcome.id} /> : null}
        </section>
      ))}
      <section className="space-y-3 rounded-2xl border bg-card p-5 text-sm">
        <p className="text-xs font-medium tracking-wide text-indigo-700">ASSUMPTIONS</p>
        <h2 className="text-lg font-semibold">What we still believe</h2>
        {view.assumptions.length === 0 ? <p className="text-muted-foreground">No assumptions are recorded.</p> : null}
        {view.assumptions.map((assumption) => (
          <div key={assumption.id} className="rounded-xl border p-3">
            <p className="font-medium">{assumption.status}</p>
            <p>{assumption.description}</p>
            <AssumptionForm productId={productId} assumptionId={assumption.id} scope={assumption.scope} />
          </div>
        ))}
      </section>
      <section className="space-y-3 rounded-2xl border bg-card p-5 text-sm">
        <p className="text-xs font-medium tracking-wide text-indigo-700">WHAT WE LEARNED</p>
        <h2 className="text-lg font-semibold">Next decision</h2>
        {view.records.map((record) => (
          <article key={record.id} className="rounded-xl border p-3">
            <p className="font-medium">{record.decision}</p>
            <p>{record.observation}</p>
            {record.interpretation ? <p className="text-muted-foreground">{record.interpretation}</p> : null}
            <p className="text-muted-foreground">Recorded by {record.createdBy}</p>
            {record.proposals.map((proposal) => (
              <div key={proposal.id} className="mt-2">
                <p>{proposal.status} {proposal.kind}: {proposal.title}</p>
                {proposal.status === "PROPOSED" ? <ConfirmProposalButton productId={productId} proposalId={proposal.id} /> : <p className="text-muted-foreground">Confirmed as unapproved scope.</p>}
              </div>
            ))}
          </article>
        ))}
        <LearningForm productId={productId} outcomeId={view.outcomes[0]?.id} />
      </section>
    </div>
  );
}
