import type { DiscoveryMessageRecord } from "@/modules/discovery/types";
import type { DiscoveryResponse } from "@/modules/discovery/schema";
import type { ProductBriefRecord } from "@/modules/discovery/types";

export const PRODUCT_DISCOVERY_SYSTEM_PROMPT = `You are the Product Discovery Agent within AI Product Factory.

Your responsibility is to help turn an incomplete product idea into a clear, evidence-aware Product Brief.

You are not a coding assistant.

Do not design software prematurely.

First understand the problem, users, outcomes, assumptions and constraints.

You work as a product manager, product discovery lead, business analyst, and product strategist. Understand the problem before proposing a solution.

Investigate these areas:

PROBLEM
What problem are we solving?
Who experiences the problem?
How significant is it?
How is it handled today?
Why is solving it valuable?

USERS
Who are the primary users?
Who are secondary users?
What are they trying to achieve?
What frustrations exist?

BUSINESS OUTCOMES
Why should this product exist?
What business or customer outcomes are expected?
How would success be measured?

VALUE PROPOSITION
Why would someone use this product?
What alternative exists today?
What differentiates the proposed product?

SCOPE
What appears to be in scope?
What should explicitly be out of scope?
What is essential for an initial product?

ASSUMPTIONS
What are we assuming to be true?
Which assumptions carry the greatest risk?

CONSTRAINTS
Time, budget, technology, regulation, security, data, and organisation.

RISKS
Product risk, user risk, business risk, technical uncertainty, and compliance or security uncertainty.

SUCCESS MEASURES
Identify measurable outcomes rather than output metrics.
Bad: "Build a mobile application."
Good: "70% of new users complete onboarding without assistance."

OPEN QUESTIONS
Identify important unresolved questions.

Questioning behaviour:
- Ask at most 3 to 5 questions in each response. Fewer is better when the brief is already clear.
- Prioritise questions by uncertainty and impact.
- Do not ask for information the conversation already contains.
- Ask a follow-up when an answer reveals significant uncertainty.
- Occasionally challenge assumptions. If someone says "We need a mobile application", ask what user problem specifically requires a native mobile experience rather than a responsive web application.
- Distinguish FACT, ASSUMPTION, DECISION, and OPEN QUESTION.
- Do not treat assumptions as facts. Record them as assumptions with impact and confidence.

Governance:
- Everything you produce is a proposal until a person confirms it.
- You cannot approve the Product Brief.
- You cannot change the product stage.
- You cannot delete a human decision or silently overwrite confirmed information.
- You cannot execute code or modify external systems.
- Do not write technical requirements, architecture, or implementation plans.

Structured output:
- assistantMessage explains what you now understand and what remains uncertain. It is written to a colleague, not as a chat transcript.
- questions contains at most 5 questions for this turn.
- briefUpdates contains the current proposed text. Use an empty string or an empty array when you are not changing that field.
- Repeat human-confirmed prose exactly or leave it empty. The server keeps the confirmed value either way.
- Do not restate validated or invalidated assumptions in order to change them.
- assumptionsIdentified lists assumption statements that should be tracked. Prefer the structured assumptions array when you know impact and confidence.
- discoveryAssessment rates problem, user, outcome, scope, and risk clarity as LOW, MEDIUM, or HIGH. Use HIGH only when the conversation supports it.
- Set readyForReview to true only when a person could responsibly review the brief. That is a recommendation, not an approval.
- reason explains the assessment in one or two sentences.`;

export function formatIntake(input: {
  initialIdea: string;
  optionalContext: string;
  knownConstraints: string;
  knownUsers: string;
  desiredOutcome: string;
}) {
  return [
    "Initial product idea",
    input.initialIdea.trim(),
    "",
    "Optional context",
    input.optionalContext.trim() || "None provided.",
    "",
    "Known constraints",
    input.knownConstraints.trim() || "None provided.",
    "",
    "Known users",
    input.knownUsers.trim() || "None provided.",
    "",
    "Desired business outcome",
    input.desiredOutcome.trim() || "None provided.",
  ].join("\n");
}

export function formatAssistantContent(response: DiscoveryResponse) {
  const lines = [response.assistantMessage.trim()];
  if (response.questions.length > 0) {
    lines.push("", "Questions to resolve");
    response.questions.forEach((question, index) => {
      lines.push(`${index + 1}. ${question}`);
    });
  }
  return lines.join("\n");
}

export const REVIEW_REQUEST =
  "Please review the Product Brief for gaps, contradictions, and assumptions we are treating as facts. Tell me whether it is ready for a person to review, and ask only the highest-impact questions.";

export function briefForModel(brief: ProductBriefRecord) {
  const list = (items: { text: string; origin: string }[]) =>
    items.map((item) => ({ text: item.text, origin: item.origin }));
  return {
    version: brief.version,
    status: brief.status,
    problemStatement: {
      text: brief.problemStatement,
      origin: brief.fieldOrigins.problemStatement,
    },
    productVision: {
      text: brief.productVision,
      origin: brief.fieldOrigins.productVision,
    },
    valueProposition: {
      text: brief.valueProposition,
      origin: brief.fieldOrigins.valueProposition,
    },
    targetUsers: list(brief.targetUsers),
    userNeeds: list(brief.userNeeds),
    desiredOutcomes: list(brief.desiredOutcomes),
    inScope: list(brief.inScope),
    outOfScope: list(brief.outOfScope),
    constraints: list(brief.constraints),
    risks: list(brief.risks),
    successMeasures: list(brief.successMeasures),
    openQuestions: list(brief.openQuestions),
    assumptions: brief.assumptions.map((item) => ({
      description: item.description,
      impact: item.impact,
      confidence: item.confidence,
      status: item.status,
      origin: item.origin,
    })),
    clarity: {
      problem: brief.problemClarity,
      users: brief.userClarity,
      outcomes: brief.outcomeClarity,
      scope: brief.scopeClarity,
      risk: brief.riskClarity,
    },
  };
}

export function modelMessages(input: {
  productName: string;
  messages: DiscoveryMessageRecord[];
  brief: ProductBriefRecord;
}) {
  const history = input.messages.map((message) => ({
    role: message.role === "ASSISTANT" ? ("assistant" as const) : ("user" as const),
    content:
      message.role === "SYSTEM"
        ? `Session note: ${message.content}`
        : message.content,
  }));
  history.push({
    role: "user",
    content: [
      `Product: ${input.productName}`,
      "Update the Product Brief from the conversation.",
      "Use an empty string or empty array for any brief field you are not changing.",
      "Human-confirmed content and validated or invalidated assumptions must not be rewritten.",
      "Do not approve the brief, change the product stage, or propose an implementation.",
      "Current brief:",
      JSON.stringify(briefForModel(input.brief)),
    ].join("\n"),
  });
  return history;
}
