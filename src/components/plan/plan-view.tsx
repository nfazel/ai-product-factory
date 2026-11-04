import Link from "next/link";

import { StatusPill } from "@/components/build/status-pill";
import { PlanPrepareCard } from "@/components/plan/plan-prepare-card";
import { buttonVariants } from "@/components/ui/button";
import { planHeadline, SECTION_STATE_LABEL, type SectionState } from "@/modules/plan/presentation";
import type { PlanSection, PlanView } from "@/modules/plan/view";

const TONE: Record<SectionState, "success" | "attention" | "neutral"> = { APPROVED: "success", WAITING: "attention", NOT_STARTED: "neutral" };

function Section({ section, children }: { section: PlanSection; children: React.ReactNode }) {
  return (
    <section id={section.key} aria-label={section.title} className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{section.title}</h2>
          {section.approvedBy ? <p className="text-xs text-muted-foreground">Approved by {section.approvedBy}</p> : null}
        </div>
        <StatusPill label={SECTION_STATE_LABEL[section.state]} tone={TONE[section.state]} />
      </div>
      {children}
      <Link href={section.detailsHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
        {section.detailsLabel}
      </Link>
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="text-sm text-muted-foreground">{text}</p>;

/** The whole plan on one page, read from the records that already exist. Nothing here approves anything yet. */
export function PlanPage({ plan }: { plan: PlanView }) {
  const by = (key: string) => plan.sections.find((section) => section.key === key)!;
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Your plan</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{planHeadline(plan.sections)}</p>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Everything that has to be settled before building, on one page. For now each part is still approved on its own page, which each
          section links to. Approving the whole plan in one step is the next piece of work.
        </p>
      </header>

      <PlanPrepareCard plan={plan} />

      <Section section={by("brief")}>
        {plan.brief ? (
          <dl className="space-y-2 text-sm leading-6">
            <div>
              <dt className="font-medium">The problem</dt>
              <dd>{plan.brief.problem || "Not stated yet."}</dd>
            </div>
            <div>
              <dt className="font-medium">The idea</dt>
              <dd>{plan.brief.vision || "Not stated yet."}</dd>
            </div>
            <div>
              <dt className="font-medium">Why it is worth it</dt>
              <dd>{plan.brief.value || "Not stated yet."}</dd>
            </div>
            {plan.brief.users ? (
              <div>
                <dt className="font-medium">Who it is for</dt>
                <dd>{plan.brief.users}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <Empty text="No brief yet. Start by describing the product." />
        )}
      </Section>

      <Section section={by("features")}>
        {plan.outcomes.length > 0 ? (
          <div>
            <h3 className="text-sm font-medium">What success looks like</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6">
              {plan.outcomes.map((outcome) => (
                <li key={outcome.title}>
                  {outcome.title}
                  {outcome.measure ? ` — measured by ${outcome.measure}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {plan.features.length > 0 ? (
          <ul className="space-y-3">
            {plan.features.map((feature) => (
              <li key={feature.id} className="rounded-xl border p-3">
                <p className="font-medium">{feature.title}</p>
                {feature.stories.map((story) => (
                  <div key={story.id} className="mt-2 text-sm leading-6">
                    <p>{story.title}</p>
                    {story.criteria.length > 0 ? (
                      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                        {story.criteria.map((criterion) => (
                          <li key={criterion}>{criterion}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="No features yet." />
        )}
      </Section>

      <Section section={by("architecture")}>
        {plan.architecture ? (
          <div className="space-y-2 text-sm leading-6">
            <p>{plan.architecture.summary}</p>
            {plan.architecture.style ? <p className="text-muted-foreground">Style: {plan.architecture.style}</p> : null}
            {plan.architecture.components.length > 0 ? <p className="text-muted-foreground">Parts: {plan.architecture.components.join(", ")}</p> : null}
          </div>
        ) : (
          <Empty text="No design yet." />
        )}
      </Section>

      <Section section={by("work")}>
        {plan.tasks.length > 0 ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-6">
            {plan.tasks.map((task) => (
              <li key={task.id}>
                {task.title}
                {task.risk ? <span className="text-muted-foreground"> · {task.risk.toLowerCase()} risk</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <Empty text="No tasks yet." />
        )}
      </Section>

      <Section section={by("rules")}>
        {plan.rules ? (
          <dl className="space-y-2 text-sm leading-6">
            <div>
              <dt className="font-medium">The Builder may change</dt>
              <dd>{plan.rules.allowed.length ? plan.rules.allowed.join(", ") : "Nothing is listed."}</dd>
            </div>
            <div>
              <dt className="font-medium">It may not touch</dt>
              <dd>{plan.rules.restricted.length ? plan.rules.restricted.join(", ") : "Nothing is listed."}</dd>
            </div>
            <div>
              <dt className="font-medium">Checks that must pass</dt>
              <dd>{plan.rules.checks.length ? plan.rules.checks.join(", ") : "None are listed."}</dd>
            </div>
            {plan.rules.maxFiles ? (
              <div>
                <dt className="font-medium">Most files in one task</dt>
                <dd>{plan.rules.maxFiles}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <Empty text="No coding rules yet." />
        )}
      </Section>

      <section id="open-points" aria-label="Open points" className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Open points</h2>
        {plan.openPoints.length > 0 ? (
          <ul className="space-y-2 text-sm leading-6">
            {plan.openPoints.map((point) => (
              <li key={`${point.kind}:${point.text}`}>
                <span className="font-medium">{point.kind}:</span> {point.text}
                {point.why ? <span className="text-muted-foreground"> {point.why}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="Nothing is open." />
        )}
      </section>
    </div>
  );
}
