import { createHash } from "node:crypto";

import type { PrismaClient } from "../src/generated/prisma/client";

export const CLAIMS_REQUIREMENTS_SAMPLE = "Claims Requirements Sample";

const SOURCE = `R-01 Customer can create a claim.
R-02 Customer must provide policy number and incident date.
R-03 Claims over the approval threshold require supervisor approval.
R-04 Customer can edit a submitted claim.
R-05 Submitted claims cannot be changed.
R-06 Claims must retain an audit trail.`;

function sourceHash(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function ensureClaimsRequirementsSample(prisma: PrismaClient) {
  const existing = await prisma.product.findFirst({ where: { name: CLAIMS_REQUIREMENTS_SAMPLE } });
  if (existing) return existing.id;

  const product = await prisma.product.create({
    data: {
      name: CLAIMS_REQUIREMENTS_SAMPLE,
      description:
        "Sample. The customer already had requirements, so this product did not start again from a blank sheet. The conflict and the missing threshold are still open.",
      vision: "",
      problemStatement: "",
      targetUsers: "",
      status: "ACTIVE",
      currentStage: "EXPLORE",
      startMode: "EXISTING_REQUIREMENTS",
    },
  });

  const source = await prisma.requirementSource.create({
    data: {
      productId: product.id,
      kind: "PASTED_TEXT",
      title: "Sample claims requirements",
      sourceText: SOURCE,
      sourceHash: sourceHash(SOURCE),
      createdBy: "Sample",
    },
  });

  const run = await prisma.agentRun.create({
    data: {
      productId: product.id,
      agentType: "REQUIREMENTS",
      status: "COMPLETED",
      input: {
        purpose: "existing-requirements-analysis",
        sample: true,
        sourceIds: [source.id],
        sourceHashes: [source.sourceHash],
      },
      output: {
        purpose: "existing-requirements-analysis",
        sample: true,
        note: "Sample analysis. A live model did not produce it, and the open questions were not resolved.",
      },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    },
  });

  const analysis = await prisma.requirementsAnalysis.create({
    data: {
      productId: product.id,
      version: 1,
      status: "CURRENT",
      agentRunId: run.id,
      problem: "",
      value: "",
      users: ["Customer"],
      needs: ["Create a claim"],
      outcomes: [],
      assumptions: [],
      constraints: [],
      risks: [],
      scope: ["Claim registration"],
      successMeasures: [],
      suggestedCapabilities: ["Submit a claim"],
      missingProblem: true,
      missingOutcome: true,
      sources: { create: [{ sourceId: source.id, sourceHash: source.sourceHash }] },
    },
  });

  const lines = [
    {
      identifier: "R-01",
      sourceText: "Customer can create a claim.",
      requirementType: "FUNCTIONAL" as const,
      interpretation: "A customer can start a new claim.",
      confidence: "HIGH" as const,
      confirmation: "CONFIRMED" as const,
      confirmedInterpretation: "A customer can start a new claim.",
      suggestedCapability: "Submit a claim",
      blockIndex: 0,
    },
    {
      identifier: "R-02",
      sourceText: "Customer must provide policy number and incident date.",
      requirementType: "FUNCTIONAL" as const,
      interpretation: "A new claim needs a policy number and an incident date.",
      confidence: "HIGH" as const,
      confirmation: "UNREVIEWED" as const,
      confirmedInterpretation: "",
      suggestedCapability: "Submit a claim",
      blockIndex: 1,
    },
    {
      identifier: "R-03",
      sourceText: "Claims over the approval threshold require supervisor approval.",
      requirementType: "BUSINESS" as const,
      interpretation: "Some claims need supervisor approval. The threshold is not stated.",
      confidence: "LOW" as const,
      confirmation: "UNREVIEWED" as const,
      confirmedInterpretation: "",
      suggestedCapability: "",
      blockIndex: 2,
    },
    {
      identifier: "R-04",
      sourceText: "Customer can edit a submitted claim.",
      requirementType: "FUNCTIONAL" as const,
      interpretation: "A submitted claim can be edited by the customer.",
      confidence: "MEDIUM" as const,
      confirmation: "UNREVIEWED" as const,
      confirmedInterpretation: "",
      suggestedCapability: "",
      blockIndex: 3,
    },
    {
      identifier: "R-05",
      sourceText: "Submitted claims cannot be changed.",
      requirementType: "FUNCTIONAL" as const,
      interpretation: "A submitted claim stays as it was submitted.",
      confidence: "MEDIUM" as const,
      confirmation: "UNREVIEWED" as const,
      confirmedInterpretation: "",
      suggestedCapability: "",
      blockIndex: 4,
    },
    {
      identifier: "R-06",
      sourceText: "Claims must retain an audit trail.",
      requirementType: "SECURITY" as const,
      interpretation: "Claim activity keeps an audit trail.",
      confidence: "HIGH" as const,
      confirmation: "UNREVIEWED" as const,
      confirmedInterpretation: "",
      suggestedCapability: "",
      blockIndex: 5,
    },
  ];

  const created = [];
  for (const line of lines) {
    const row = await prisma.sourceRequirement.create({
      data: {
        productId: product.id,
        sourceId: source.id,
        analysisId: analysis.id,
        identifier: line.identifier,
        sourceText: line.sourceText,
        sectionHeading: "Claims",
        blockIndex: line.blockIndex,
        requirementType: line.requirementType,
        interpretation: line.interpretation,
        confirmedInterpretation: line.confirmedInterpretation,
        confidence: line.confidence,
        confirmation: line.confirmation,
        confirmedBy: line.confirmation === "CONFIRMED" ? "A person" : "",
        confirmedAt: line.confirmation === "CONFIRMED" ? new Date() : null,
        suggestedCapability: line.suggestedCapability,
      },
    });
    created.push(row);
  }

  const byId = Object.fromEntries(created.map((row) => [row.identifier, row.id]));
  await prisma.requirementFinding.create({
    data: {
      productId: product.id,
      analysisId: analysis.id,
      findingType: "CONFLICT",
      severity: "HIGH",
      title: "Possible conflict: a submitted claim can be edited and cannot be changed",
      explanation: "R-04 says a customer can edit a submitted claim. R-05 says submitted claims cannot be changed. A person needs to decide which rule holds.",
      links: { create: [{ sourceRequirementId: byId["R-04"] }, { sourceRequirementId: byId["R-05"] }] },
    },
  });
  await prisma.requirementFinding.create({
    data: {
      productId: product.id,
      analysisId: analysis.id,
      findingType: "AMBIGUOUS",
      severity: "HIGH",
      title: "The approval threshold is not defined",
      explanation: "R-03 requires supervisor approval over a threshold, and the source does not say what the threshold is or who may configure it.",
      links: { create: [{ sourceRequirementId: byId["R-03"] }] },
    },
  });
  await prisma.requirementFinding.create({
    data: {
      productId: product.id,
      analysisId: analysis.id,
      findingType: "MISSING_OUTCOME",
      severity: "HIGH",
      title: "No business outcome is stated",
      explanation: "The supplied requirements describe claim behaviour and do not state the outcome this change is intended to achieve.",
      gapNote: "The supplied requirements do not state an outcome.",
    },
  });
  await prisma.intakeQuestion.create({
    data: {
      productId: product.id,
      analysisId: analysis.id,
      question: "What is the approval threshold, and who may configure it?",
      reason: "R-03 cannot be tested until the threshold is known.",
      priority: "HIGH",
      links: { create: [{ sourceRequirementId: byId["R-03"] }] },
    },
  });
  await prisma.intakeQuestion.create({
    data: {
      productId: product.id,
      analysisId: analysis.id,
      question: "Can a customer change a claim after it has been submitted?",
      reason: "R-04 and R-05 cannot both be applied until a person clarifies the rule.",
      priority: "HIGH",
      links: { create: [{ sourceRequirementId: byId["R-04"] }, { sourceRequirementId: byId["R-05"] }] },
    },
  });
  await prisma.intakeQuestion.create({
    data: {
      productId: product.id,
      analysisId: analysis.id,
      question: "Who submits the claim?",
      reason: "The source says customer and does not name the actor more precisely.",
      priority: "MEDIUM",
      status: "ANSWERED",
      answer: "The policyholder.",
      answeredBy: "A person",
      answeredAt: new Date(),
      links: { create: [{ sourceRequirementId: byId["R-01"] }] },
    },
  });
  await prisma.intakeQuestion.create({
    data: {
      productId: product.id,
      analysisId: analysis.id,
      question: "The supplied requirements describe claim processing behaviour but do not state the business outcome this change is intended to achieve. What outcome matters?",
      reason: "An outcome was not present in the source, so none was invented.",
      priority: "HIGH",
    },
  });

  const session = await prisma.discoverySession.create({
    data: {
      productId: product.id,
      status: "IN_PROGRESS",
      initialIdea: "Existing requirements were supplied. Blank-sheet discovery was not used.",
      seededDemo: true,
    },
  });
  const brief = await prisma.productBrief.create({
    data: {
      productId: product.id,
      sessionId: session.id,
      version: 1,
      status: "DRAFT",
      fromRequirements: true,
      problemStatement: "",
      valueProposition: "",
      targetUsers: [{ id: "sample-user", text: "Customer", origin: "AI_PROPOSAL" }],
      userNeeds: [{ id: "sample-need", text: "Create a claim", origin: "AI_PROPOSAL" }],
      inScope: [{ id: "sample-scope", text: "Claim registration", origin: "AI_PROPOSAL" }],
      fieldOrigins: { problemStatement: "UNRESOLVED", productVision: "UNRESOLVED", valueProposition: "UNRESOLVED" },
    },
  });

  const outcome = await prisma.productOutcome.create({
    data: {
      productId: product.id,
      sourceBriefId: brief.id,
      title: "Sample outcome, not taken from the source",
      description: "Sample only. The supplied requirements did not state this outcome, so it is not approved.",
      successMeasure: "Not stated in the source.",
      status: "PROPOSED",
      origin: "AI_PROPOSAL",
    },
  });
  const capability = await prisma.productCapability.create({
    data: {
      productId: product.id,
      outcomeId: outcome.id,
      name: "Submit a claim",
      description: "Sample capability proposed from R-01.",
      status: "PROPOSED",
      origin: "AI_PROPOSAL",
    },
  });
  const epic = await prisma.workItem.create({
    data: { productId: product.id, title: "Claim registration", type: "EPIC", capabilityId: capability.id, provenance: "AI_PROPOSAL" },
  });
  const feature = await prisma.workItem.create({
    data: { productId: product.id, parentId: epic.id, title: "Create a claim", type: "FEATURE", capabilityId: capability.id, provenance: "AI_PROPOSAL" },
  });
  const story = await prisma.workItem.create({
    data: { productId: product.id, parentId: feature.id, title: "Customer creates a claim", type: "STORY", capabilityId: capability.id, provenance: "AI_PROPOSAL" },
  });
  const criterion = await prisma.acceptanceCriterion.create({
    data: { workItemId: story.id, description: "Given a policy number and incident date, when the customer submits, then a claim is created." },
  });
  const nfr = await prisma.nonFunctionalRequirement.create({
    data: {
      productId: product.id,
      category: "AUDITABILITY",
      title: "Claims retain an audit trail",
      description: "Sample non-functional requirement taken from R-06. It is not approved.",
      status: "PROPOSED",
      source: "AI_PROPOSAL",
    },
  });
  await prisma.productDefinition.create({
    data: {
      productId: product.id,
      status: "IN_PROGRESS",
      seededDemo: true,
      reviewSummary: "Sample definition drafted from the supplied requirements. It is not approved. The conflict and the missing threshold are still open.",
    },
  });
  await prisma.requirementTraceLink.create({
    data: {
      productId: product.id,
      sourceRequirementId: byId["R-01"]!,
      targetKind: "PRODUCT_CAPABILITY",
      targetId: capability.id,
      provenance: "HUMAN_CONFIRMED",
      createdBy: "A person",
    },
  });
  await prisma.requirementTraceLink.create({
    data: {
      productId: product.id,
      sourceRequirementId: byId["R-01"]!,
      targetKind: "WORK_ITEM",
      targetId: story.id,
      provenance: "HUMAN_CONFIRMED",
      createdBy: "A person",
    },
  });
  await prisma.requirementTraceLink.create({
    data: {
      productId: product.id,
      sourceRequirementId: byId["R-01"]!,
      targetKind: "ACCEPTANCE_CRITERION",
      targetId: criterion.id,
      provenance: "AI_PROPOSED",
      createdBy: "Requirements analysis",
    },
  });
  await prisma.requirementTraceLink.create({
    data: {
      productId: product.id,
      sourceRequirementId: byId["R-06"]!,
      targetKind: "NFR",
      targetId: nfr.id,
      provenance: "AI_PROPOSED",
      createdBy: "Requirements analysis",
    },
  });

  await prisma.activity.create({
    data: {
      productId: product.id,
      type: "PRODUCT_CREATED",
      description: "Sample. Existing claims requirements were added. They were not treated as an approved product definition.",
      actor: "Sample",
    },
  });
  return product.id;
}
