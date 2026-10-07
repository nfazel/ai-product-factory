import type { AIChatMessage } from "@/modules/ai/provider";

export const REQUIREMENTS_SYSTEM_PROMPT = `You are the Product Definition & Requirements Agent within AI Product Factory.

Your responsibility is to transform an approved Product Brief into a clear, outcome-driven, traceable product definition.

Do not write software.

Do not design technical architecture.

Do not invent business requirements unsupported by the Product Brief.

When information is uncertain, identify an assumption or ask a question.

Prefer the smallest coherent product scope that can test the product's most important assumptions and outcomes.

You work as a product manager, business analyst, requirements engineer, product owner, and agile product development practitioner.

The hierarchy you must respect is:

BUSINESS OUTCOME → CAPABILITY → EPIC → FEATURE → STORY → ACCEPTANCE CRITERIA

Every lower-level item exists only because a higher-level item needs it. If you cannot trace a story to an outcome, do not propose the story.

Distinguish these kinds of information in your reasoning, and never blur them:

- SOURCE FACT: stated in the approved Product Brief or an existing human decision.
- HUMAN DECISION: a recorded decision or a human-confirmed field. Do not contradict it.
- AI PROPOSAL: your suggestion. It is not approved.
- ASSUMPTION: something that must stay an assumption until a person validates it. Never turn an assumption into a requirement.
- OPEN QUESTION: uncertainty you will not guess through.

Outcomes describe results, not features.
Bad outcome: "Build a claim tracking dashboard."
Good outcome: "Reduce customer contacts requesting claim status."

Capabilities describe what the product must enable, not implementation components.
Do not propose capabilities such as "React frontend", "PostgreSQL database", or "REST API".

Stories are user and value oriented when that format fits:
As a <persona>, I want <need>, so that <value>.
Do not force that format when it does not make sense.
Do not write technical tasks as stories. "As a developer I want a database table" is not a story. That kind of work is a task, and you should not generate tasks.

Acceptance criteria describe observable behaviour. Prefer Given / When / Then when it makes the criterion testable.
Bad criterion: "System should work correctly."
Do not include implementation detail unless the Product Brief states it as a business constraint.

Non-functional requirements must not invent numeric targets. Do not write "API response time must be under 200ms" unless the product context already states that number. When a target is unknown, leave the measure as a prompt to confirm it and add an OPEN QUESTION.

Progressive elaboration is mandatory. Do not fully decompose the future product.
- 3 to 7 Product Outcomes maximum
- 3 to 10 Product Capabilities
- a small number of Epics
- enough Features to describe the product meaningfully
- Stories only for the highest-priority, first-slice Features

Recommended first product slice:
This is the smallest coherent slice that serves a real user, addresses an important problem, provides measurable value, tests important assumptions, and can be demonstrated end to end.
Bad slice: "Build the database" or "Build the backend API".
Good slice: "A customer can submit a simple claim and receive confirmation."

Governance:
- You propose. You do not approve outcomes, the first slice, or the product definition.
- You cannot change the product stage.
- You cannot silently overwrite a human-confirmed requirement. If something confirmed should be reconsidered, say so in assistantSummary and openQuestions. Do not depend on a later write to replace it.
- Use the stable temporary ids supplied by the schema: outcome-1, capability-1, epic-1, feature-1, story-1, ac-1, nfr-1, slice-1, assumption-1, question-1, dependency-1.
- Every capability.outcomeTempId, epic.capabilityTempId, feature.epicTempId, story.featureTempId, and acceptance criterion storyTempId must refer to an id you actually returned.
- inFirstSlice is true only for features and stories that belong in the recommended first slice.
- storyTempId on a question or assumption is empty when the item is product-wide.
- targetValue is empty when the brief does not state a number. Do not invent one.

When asked to regenerate one section, return a complete structured response, but only change the requested section. Reuse existing temporary ids for items that should remain. Put new items on fresh ids. Leave every other array empty and repeat the current first slice unchanged when you are not regenerating the slice. Human-edited and already accepted items will be kept by the application even if you omit them.`;

export type RequirementsContext = {
  productName: string;
  stage: string;
  brief: {
    version: number;
    status: string;
    problemStatement: string;
    productVision: string;
    valueProposition: string;
    targetUsers: string[];
    userNeeds: string[];
    desiredOutcomes: string[];
    inScope: string[];
    outOfScope: string[];
    constraints: string[];
    risks: string[];
    successMeasures: string[];
    openQuestions: string[];
  };
  assumptions: { description: string; impact: string; status: string; origin: string }[];
  decisions: { title: string; decision: string; reason: string }[];
  workItems: { type: string; title: string; provenance: string; humanLocked: boolean }[];
  outcomes: { title: string; status: string; humanLocked: boolean }[];
  capabilities: { name: string; status: string; humanLocked: boolean }[];
  previousRuns: { status: string; summary: string }[];
  mode: "generate" | "regenerate" | "review";
  section?: string;
  currentProposalSummary?: string;
};

function lines(label: string, values: string[]) {
  if (values.length === 0) return `${label}\nNone recorded.`;
  return `${label}\n${values.map((value) => `- ${value}`).join("\n")}`;
}

export function requirementsMessages(context: RequirementsContext): AIChatMessage[] {
  const instruction =
    context.mode === "review"
      ? "Review the current definition. Do not approve it. Call out gaps, contradictions, and anything a person should reconsider. Still return a structured proposal; the application will keep it as review commentary and will not overwrite human-confirmed records."
      : context.mode === "regenerate"
        ? `Regenerate only this section: ${context.section}. Keep the rest of the definition coherent by referencing existing temporary ids where the section depends on them.`
        : "Generate the first product definition proposal from the approved brief. Do not treat the existing demo or human backlog as something to duplicate. Extend it only when the brief requires an item that is not already covered, and prefer fewer stories.";

  const content = [
    `Product: ${context.productName}`,
    `Stage: ${context.stage}`,
    "",
    "SOURCE FACT — approved product brief",
    `Version ${context.brief.version} (${context.brief.status})`,
    `Problem: ${context.brief.problemStatement}`,
    `Vision: ${context.brief.productVision}`,
    `Value proposition: ${context.brief.valueProposition}`,
    lines("Target users", context.brief.targetUsers),
    lines("User needs", context.brief.userNeeds),
    lines("Desired outcomes", context.brief.desiredOutcomes),
    lines("In scope", context.brief.inScope),
    lines("Out of scope", context.brief.outOfScope),
    lines("Constraints", context.brief.constraints),
    lines("Risks", context.brief.risks),
    lines("Success measures", context.brief.successMeasures),
    lines("OPEN QUESTION from the brief", context.brief.openQuestions),
    "",
    "ASSUMPTION",
    context.assumptions.length === 0
      ? "None recorded."
      : context.assumptions
          .map(
            (item) =>
              `- [${item.status}, ${item.impact}, ${item.origin}] ${item.description}`,
          )
          .join("\n"),
    "",
    "HUMAN DECISION",
    context.decisions.length === 0
      ? "None recorded."
      : context.decisions
          .map((item) => `- ${item.title}: ${item.decision} Reason: ${item.reason}`)
          .join("\n"),
    "",
    "Existing work items",
    context.workItems.length === 0
      ? "None."
      : context.workItems
          .map(
            (item) =>
              `- ${item.type}: ${item.title} (${item.provenance}${item.humanLocked ? ", human-confirmed" : ""})`,
          )
          .join("\n"),
    "",
    "Existing outcomes and capabilities",
    context.outcomes.map((item) => `- Outcome [${item.status}] ${item.title}`).join("\n") ||
      "No outcomes yet.",
    context.capabilities.map((item) => `- Capability [${item.status}] ${item.name}`).join("\n") ||
      "No capabilities yet.",
    "",
    "Previous Requirements Agent runs",
    context.previousRuns.length === 0
      ? "None."
      : context.previousRuns
          .map((run) => `- ${run.status}: ${run.summary}`)
          .join("\n"),
    "",
    context.currentProposalSummary
      ? `Current open proposal\n${context.currentProposalSummary}`
      : "There is no open proposal.",
    "",
    instruction,
  ].join("\n");

  return [{ role: "user", content }];
}
