import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function daysAgo(days: number, hours = 10) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hours, 15, 0, 0);
  return date;
}

async function main() {
  await prisma.codeChangeApproval.deleteMany();
  await prisma.codingDiff.deleteMany();
  await prisma.codingRevision.deleteMany();
  await prisma.codingSelfReview.deleteMany();
  await prisma.codingToolEvent.deleteMany();
  await prisma.codingEvidence.deleteMany();
  await prisma.codingEscalation.deleteMany();
  await prisma.codingExecutionPlan.deleteMany();
  await prisma.codingExecutionContract.deleteMany();
  await prisma.repositoryWorkspace.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.governanceFindingLink.deleteMany();
  await prisma.governanceEvidence.deleteMany();
  await prisma.governanceQuestion.deleteMany();
  await prisma.threat.deleteMany();
  await prisma.codingRiskAssessment.deleteMany();
  await prisma.codingPolicy.deleteMany();
  await prisma.governanceFinding.deleteMany();
  await prisma.engineeringGovernanceReview.deleteMany();
  await prisma.governanceProposal.deleteMany();
  await prisma.implementationTaskDependency.deleteMany();
  await prisma.implementationTaskComponent.deleteMany();
  await prisma.implementationTask.deleteMany();
  await prisma.implementationPlan.deleteMany();
  await prisma.nfrCoverage.deleteMany();
  await prisma.componentTrace.deleteMany();
  await prisma.architectureRelationship.deleteMany();
  await prisma.architectureQuestion.deleteMany();
  await prisma.securityFinding.deleteMany();
  await prisma.dataEntity.deleteMany();
  await prisma.integrationDesign.deleteMany();
  await prisma.technologyChoice.deleteMany();
  await prisma.architectureDecisionRecord.deleteMany();
  await prisma.architectureComponent.deleteMany();
  await prisma.solutionArchitecture.deleteMany();
  await prisma.architectureProposal.deleteMany();
  await prisma.codebaseContext.deleteMany();
  await prisma.assumption.deleteMany();
  await prisma.discoveryMessage.deleteMany();
  await prisma.productBrief.deleteMany();
  await prisma.discoverySession.deleteMany();
  await prisma.requirementQuestion.deleteMany();
  await prisma.requirementAssumption.deleteMany();
  await prisma.workItemDependency.deleteMany();
  await prisma.acceptanceCriterion.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.definitionProposal.deleteMany();
  await prisma.workItem.updateMany({ data: { parentId: null, capabilityId: null, sliceId: null } });
  await prisma.workItem.deleteMany();
  await prisma.productCapability.deleteMany();
  await prisma.productOutcome.deleteMany();
  await prisma.productSlice.deleteMany();
  await prisma.nonFunctionalRequirement.deleteMany();
  await prisma.productDefinition.deleteMany();
  await prisma.product.deleteMany();

  const product = await prisma.product.create({
    data: {
      name: "Claims Management Platform",
      description:
        "A digital claims workspace for handlers, operations teams, and customers.",
      vision:
        "Create a modern digital claims experience that reduces processing time and improves customer visibility.",
      problemStatement:
        "Claims processing relies on fragmented systems, manual handoffs and limited real-time visibility.",
      targetUsers:
        "Claims handlers, operations teams and insurance customers.",
      status: "ACTIVE",
      currentStage: "DEFINE",
      createdAt: daysAgo(21, 9),
      updatedAt: daysAgo(1, 16),
    },
  });

  const epic = await prisma.workItem.create({
    data: {
      productId: product.id,
      title: "Digital Claims Experience",
      description:
        "Establish a digital-first claims journey from first notice of loss through a shared view of progress.",
      type: "EPIC",
      status: "IN_PROGRESS",
      stage: "DEFINE",
      priority: "HIGH",
      createdAt: daysAgo(18, 11),
      updatedAt: daysAgo(2, 15),
    },
  });

  const createClaim = await prisma.workItem.create({
    data: {
      productId: product.id,
      parentId: epic.id,
      title: "Create Claim",
      description:
        "Allow a customer or handler to open a claim with the information required to start processing.",
      type: "FEATURE",
      status: "IN_PROGRESS",
      stage: "DEFINE",
      priority: "HIGH",
      createdAt: daysAgo(16, 11),
      updatedAt: daysAgo(2, 11),
    },
  });

  const trackClaim = await prisma.workItem.create({
    data: {
      productId: product.id,
      parentId: epic.id,
      title: "Track Claim",
      description:
        "Give customers and operations a shared view of claim status, milestones, and outstanding actions.",
      type: "FEATURE",
      status: "READY",
      stage: "DEFINE",
      priority: "MEDIUM",
      createdAt: daysAgo(16, 14),
      updatedAt: daysAgo(4, 14),
    },
  });

  const story = await prisma.workItem.create({
    data: {
      productId: product.id,
      parentId: createClaim.id,
      title:
        "As a customer I want to submit a new claim online so that I can begin the claims process without contacting the call centre.",
      description:
        "The customer starts a claim from the portal, supplies the incident and policy details, and receives a reference they can use to follow progress.",
      type: "STORY",
      status: "REVIEW",
      stage: "DEFINE",
      priority: "HIGH",
      persona: "policyholder",
      userNeed: "submit a claim online",
      userValue: "begin the claims process without calling the contact centre",
      priorityAssigned: true,
      dependenciesIdentified: true,
      assumptionsNoted: true,
      provenance: "HUMAN_CREATED",
      createdAt: daysAgo(14, 10),
      updatedAt: daysAgo(1, 9),
    },
  });

  const task = await prisma.workItem.create({
    data: {
      productId: product.id,
      parentId: story.id,
      title: "Define the claim intake data model",
      description:
        "Agree the policy, incident, contact, and attachment fields required before a claim can be accepted.",
      type: "TASK",
      status: "IN_PROGRESS",
      stage: "DEFINE",
      priority: "MEDIUM",
      createdAt: daysAgo(12, 13),
      updatedAt: daysAgo(1, 13),
    },
  });

  const defect = await prisma.workItem.create({
    data: {
      productId: product.id,
      parentId: story.id,
      title: "Claim reference disappears after a validation error",
      description:
        "When server-side validation fails, the draft reference is lost and the customer cannot resume the claim they started.",
      type: "DEFECT",
      status: "BLOCKED",
      stage: "DEFINE",
      priority: "HIGH",
      createdAt: daysAgo(3, 15),
      updatedAt: daysAgo(1, 15),
    },
  });

  await prisma.acceptanceCriterion.createMany({
    data: [
      {
        workItemId: story.id,
        description:
          "The customer can open a new claim from the portal without contacting the call centre.",
        status: "PENDING",
        createdAt: daysAgo(13, 10),
      },
      {
        workItemId: story.id,
        description:
          "Policy number, incident date, and contact details are validated before the claim is accepted.",
        status: "PASSED",
        createdAt: daysAgo(13, 10),
      },
      {
        workItemId: story.id,
        description:
          "A claim reference is shown immediately after a successful submission.",
        status: "FAILED",
        createdAt: daysAgo(13, 11),
      },
    ],
  });

  await prisma.workItemDependency.createMany({
    data: [
      { workItemId: trackClaim.id, dependsOnId: createClaim.id, createdAt: daysAgo(15) },
      { workItemId: story.id, dependsOnId: task.id, createdAt: daysAgo(11) },
    ],
  });

  await prisma.decision.createMany({
    data: [
      {
        productId: product.id,
        title: "Primary channel for first notice of loss",
        description:
          "Choose the channel customers will use to start a claim.",
        decision:
          "New claims will be submitted through the customer portal as the primary channel.",
        reason:
          "Call centre volume is the main driver of cost and delay, and customers currently have no real-time view of their claim.",
        decisionMaker: "Product owner",
        createdAt: daysAgo(17, 15),
      },
      {
        productId: product.id,
        workItemId: story.id,
        title: "Authentication for first notice of loss",
        description:
          "Decide whether a customer must sign in before starting a claim.",
        decision:
          "A customer may start a claim with a policy number and incident details. Full account authentication is required only before settlement updates are shown.",
        reason:
          "Requiring sign-in before first notice would push people back to the call centre, which this product is meant to avoid.",
        decisionMaker: "Product owner",
        createdAt: daysAgo(9, 11),
      },
    ],
  });

  await prisma.approval.createMany({
    data: [
      {
        productId: product.id,
        approvalType: "STAGE_GATE",
        status: "APPROVED",
        requestedAt: daysAgo(19, 9),
        resolvedAt: daysAgo(18, 16),
        approvedBy: "A. Okonkwo",
        comments:
          "Problem statement and target users were confirmed with operations. Explore can close.",
      },
      {
        productId: product.id,
        workItemId: story.id,
        approvalType: "REQUIREMENTS",
        status: "PENDING",
        requestedAt: daysAgo(2, 11),
        comments:
          "Awaiting confirmation that the failed acceptance criterion is in scope for the first release.",
      },
      {
        productId: product.id,
        workItemId: story.id,
        approvalType: "SECURITY",
        status: "REJECTED",
        requestedAt: daysAgo(7, 10),
        resolvedAt: daysAgo(6, 16),
        approvedBy: "Claims operations lead",
        comments:
          "Skipping handler review for high-value claims would remove a required control.",
      },
    ],
  });

  await prisma.activity.createMany({
    data: [
      {
        productId: product.id,
        type: "PRODUCT_CREATED",
        description: 'Created product "Claims Management Platform".',
        actor: "Product owner",
        createdAt: daysAgo(21, 9),
      },
      {
        productId: product.id,
        workItemId: epic.id,
        type: "WORK_ITEM_CREATED",
        description: 'Created epic "Digital Claims Experience".',
        actor: "Product owner",
        createdAt: daysAgo(18, 11),
      },
      {
        productId: product.id,
        type: "APPROVAL_REQUESTED",
        description:
          "Requested stage gate approval. Confirm the problem and target users before leaving Explore.",
        actor: "Product owner",
        createdAt: daysAgo(19, 9),
      },
      {
        productId: product.id,
        type: "APPROVAL_APPROVED",
        description: "Approved stage gate request.",
        actor: "A. Okonkwo",
        createdAt: daysAgo(18, 16),
      },
      {
        productId: product.id,
        type: "PRODUCT_UPDATED",
        description: "Updated stage to Define.",
        actor: "Product owner",
        createdAt: daysAgo(18, 17),
      },
      {
        productId: product.id,
        type: "DECISION_RECORDED",
        description: 'Recorded decision "Primary channel for first notice of loss".',
        actor: "Product owner",
        createdAt: daysAgo(17, 15),
      },
      {
        productId: product.id,
        workItemId: createClaim.id,
        type: "WORK_ITEM_CREATED",
        description: 'Created feature "Create Claim".',
        actor: "Product owner",
        createdAt: daysAgo(16, 11),
      },
      {
        productId: product.id,
        workItemId: trackClaim.id,
        type: "WORK_ITEM_CREATED",
        description: 'Created feature "Track Claim".',
        actor: "Product owner",
        createdAt: daysAgo(16, 14),
      },
      {
        productId: product.id,
        workItemId: trackClaim.id,
        type: "DEPENDENCY_ADDED",
        description: 'Added a dependency on "Create Claim".',
        actor: "Product owner",
        createdAt: daysAgo(15, 10),
      },
      {
        productId: product.id,
        workItemId: story.id,
        type: "WORK_ITEM_CREATED",
        description:
          'Created story "As a customer I want to submit a new claim online so that I can begin the claims process without contacting the call centre.".',
        actor: "Product owner",
        createdAt: daysAgo(14, 10),
      },
      {
        productId: product.id,
        workItemId: story.id,
        type: "ACCEPTANCE_CRITERION_ADDED",
        description:
          'Added acceptance criterion: "The customer can open a new claim from the portal without contacting the call centre.".',
        actor: "Product owner",
        createdAt: daysAgo(13, 10),
      },
      {
        productId: product.id,
        workItemId: story.id,
        type: "ACCEPTANCE_CRITERION_ADDED",
        description:
          'Added acceptance criterion: "Policy number, incident date, and contact details are validated before the claim is accepted.".',
        actor: "Product owner",
        createdAt: daysAgo(13, 10),
      },
      {
        productId: product.id,
        workItemId: story.id,
        type: "ACCEPTANCE_CRITERION_ADDED",
        description:
          'Added acceptance criterion: "A claim reference is shown immediately after a successful submission.".',
        actor: "Product owner",
        createdAt: daysAgo(13, 11),
      },
      {
        productId: product.id,
        workItemId: task.id,
        type: "WORK_ITEM_CREATED",
        description: 'Created task "Define the claim intake data model".',
        actor: "Business analyst",
        createdAt: daysAgo(12, 13),
      },
      {
        productId: product.id,
        workItemId: story.id,
        type: "DEPENDENCY_ADDED",
        description: 'Added a dependency on "Define the claim intake data model".',
        actor: "Business analyst",
        createdAt: daysAgo(11, 9),
      },
      {
        productId: product.id,
        workItemId: story.id,
        type: "DECISION_RECORDED",
        description: 'Recorded decision "Authentication for first notice of loss".',
        actor: "Product owner",
        createdAt: daysAgo(9, 11),
      },
      {
        productId: product.id,
        workItemId: story.id,
        type: "APPROVAL_REQUESTED",
        description:
          "Requested security approval. Proposal to skip handler review on first notice of loss.",
        actor: "Product owner",
        createdAt: daysAgo(7, 10),
      },
      {
        productId: product.id,
        workItemId: story.id,
        type: "APPROVAL_REJECTED",
        description: "Rejected security request.",
        actor: "Claims operations lead",
        createdAt: daysAgo(6, 16),
      },
      {
        productId: product.id,
        workItemId: story.id,
        type: "ACCEPTANCE_CRITERION_UPDATED",
        description: "Marked an acceptance criterion as failed.",
        actor: "QA lead",
        createdAt: daysAgo(3, 14),
      },
      {
        productId: product.id,
        workItemId: defect.id,
        type: "WORK_ITEM_CREATED",
        description:
          'Created defect "Claim reference disappears after a validation error".',
        actor: "QA lead",
        createdAt: daysAgo(3, 15),
      },
      {
        productId: product.id,
        workItemId: defect.id,
        type: "WORK_ITEM_UPDATED",
        description: "Updated status from Draft to Blocked.",
        actor: "QA lead",
        createdAt: daysAgo(2, 9),
      },
      {
        productId: product.id,
        workItemId: story.id,
        type: "APPROVAL_REQUESTED",
        description:
          "Requested requirements approval. Awaiting confirmation that the failed acceptance criterion is in scope for the first release.",
        actor: "Product owner",
        createdAt: daysAgo(2, 11),
      },
      {
        productId: product.id,
        workItemId: story.id,
        type: "WORK_ITEM_UPDATED",
        description: "Updated status from In progress to Review.",
        actor: "Product owner",
        createdAt: daysAgo(1, 9),
      },
    ],
  });

  const briefId = await seedDiscoveryDemo(product.id);
  await seedDefinitionDemo({
    productId: product.id,
    briefId,
    epicId: epic.id,
    createClaimId: createClaim.id,
    trackClaimId: trackClaim.id,
    storyId: story.id,
  });

  console.log(`Seeded ${product.name} (${product.id}).`);
}

function note(
  text: string,
  origin: "AI_PROPOSAL" | "HUMAN_CONFIRMED" | "UNRESOLVED",
) {
  return { id: crypto.randomUUID(), text, origin };
}

async function seedDiscoveryDemo(productId: string) {
  const startedAt = daysAgo(12, 11);
  const session = await prisma.discoverySession.create({
    data: {
      productId,
      status: "READY_FOR_REVIEW",
      seededDemo: true,
      initialIdea:
        "Give customers and handlers one digital place to open a claim and see what happens next.",
      optionalContext:
        "Demo context. Claims still move through email, phone notes, and a separate policy system.",
      knownConstraints:
        "Demo constraint. The first release must work with the existing policy system and cannot store card payments.",
      knownUsers: "Claims handlers, operations leads, and insurance customers.",
      desiredOutcome:
        "Reduce the time from first notice of loss to a claim that a handler can actually work.",
      startedAt,
      createdAt: startedAt,
      updatedAt: daysAgo(2, 15),
    },
  });

  await prisma.discoveryMessage.createMany({
    data: [
      {
        sessionId: session.id,
        role: "SYSTEM",
        content:
          "Demo data. This discovery transcript was prepared for the Claims Management Platform sample. It was not generated by a live model.",
        createdAt: startedAt,
      },
      {
        sessionId: session.id,
        role: "USER",
        content: [
          "Initial product idea",
          "Give customers and handlers one digital place to open a claim and see what happens next.",
          "",
          "Optional context",
          "Claims still move through email, phone notes, and a separate policy system.",
          "",
          "Known constraints",
          "The first release must work with the existing policy system and cannot store card payments.",
          "",
          "Known users",
          "Claims handlers, operations leads, and insurance customers.",
          "",
          "Desired business outcome",
          "Reduce the time from first notice of loss to a claim that a handler can actually work.",
        ].join("\n"),
        createdAt: new Date(startedAt.getTime() + 60_000),
      },
      {
        sessionId: session.id,
        role: "ASSISTANT",
        content: [
          "The problem looks operational before it looks like a channel decision. Handlers rebuild the claim from fragments, and customers cannot see progress. A native mobile application is an assumption, not a fact: nothing yet shows that the job to be done requires anything beyond a responsive web journey.",
          "",
          "I am treating the policy-system constraint and the ban on storing card payments as given. I am not treating 'customers will abandon the call centre' as a fact.",
          "",
          "Questions to resolve",
          "1. Which delay hurts more today: opening the claim, or seeing what happens after it is opened?",
          "2. What would a handler need on screen before they trust a customer-submitted first notice?",
          "3. Which claim types must stay with the call centre for the first release?",
        ].join("\n"),
        createdAt: daysAgo(12, 12),
      },
      {
        sessionId: session.id,
        role: "USER",
        content:
          "Opening is the sharper delay. Handlers need the policy number, incident date, loss type, and a contact method before they will pick the claim up. Complex injury claims stay with the call centre.",
        createdAt: daysAgo(8, 10),
      },
      {
        sessionId: session.id,
        role: "ASSISTANT",
        content: [
          "That separates an initial motor and property notice from complex injury. The brief can now say what 'done' means for a first release, and what is explicitly out.",
          "",
          "The largest unvalidated assumption is that customers will complete first notice without calling. A high-impact assumption should stay visible until someone checks it.",
          "",
          "Questions to resolve",
          "1. What share of new notices should be completed without handler assistance before this is worth continuing?",
          "2. Is a same-day handler acknowledgement a customer outcome or an internal operations target?",
        ].join("\n"),
        createdAt: daysAgo(8, 11),
      },
    ],
  });

  const brief = await prisma.productBrief.create({
    data: {
      productId,
      sessionId: session.id,
      version: 1,
      status: "READY_FOR_REVIEW",
      problemStatement:
        "Claims handlers rebuild each new claim from email, phone notes, and a separate policy system, so customers wait without a reliable view of progress.",
      productVision:
        "A customer can open a straightforward claim and both the customer and the handler can see that it has entered the working queue.",
      valueProposition:
        "Customers start a claim without waiting on the call centre, and handlers receive a complete enough notice to begin work.",
      fieldOrigins: {
        problemStatement: "HUMAN_CONFIRMED",
        productVision: "AI_PROPOSAL",
        valueProposition: "AI_PROPOSAL",
      },
      targetUsers: [
        note("Claims handlers who pick up a new notice", "HUMAN_CONFIRMED"),
        note("Insurance customers reporting a straightforward loss", "AI_PROPOSAL"),
        note("Operations leads watching intake volume", "AI_PROPOSAL"),
      ],
      userNeeds: [
        note("Handlers need a policy number, incident date, loss type, and contact method before they trust the notice.", "HUMAN_CONFIRMED"),
        note("Customers need to know the claim was received and what happens next.", "AI_PROPOSAL"),
      ],
      desiredOutcomes: [
        note("A straightforward first notice reaches a handler without a phone call.", "AI_PROPOSAL"),
        note("Customers can see that the claim has entered the working queue.", "AI_PROPOSAL"),
      ],
      inScope: [
        note("Online first notice for straightforward motor and property claims.", "AI_PROPOSAL"),
        note("A shared status that shows the notice was received.", "AI_PROPOSAL"),
      ],
      outOfScope: [
        note("Complex injury claims, which stay with the call centre.", "HUMAN_CONFIRMED"),
        note("Card payments and a native mobile application.", "AI_PROPOSAL"),
      ],
      constraints: [
        note("Must work with the existing policy system.", "HUMAN_CONFIRMED"),
        note("Must not store card payments.", "HUMAN_CONFIRMED"),
      ],
      risks: [
        note("Handlers may reject customer-submitted notices that do not match the way they work today.", "AI_PROPOSAL"),
        note("A channel decision made too early could hide the real intake problem.", "AI_PROPOSAL"),
      ],
      successMeasures: [
        note("70% of straightforward new notices are submitted without handler assistance.", "AI_PROPOSAL"),
        note("A handler can see policy number, incident date, loss type, and a contact method on every accepted notice.", "HUMAN_CONFIRMED"),
      ],
      openQuestions: [
        note("Is same-day handler acknowledgement a customer outcome or an internal target?", "UNRESOLVED"),
      ],
      problemClarity: "HIGH",
      userClarity: "HIGH",
      outcomeClarity: "MEDIUM",
      scopeClarity: "MEDIUM",
      riskClarity: "LOW",
      readyForReview: true,
      readinessReason:
        "Demo assessment. Problem, users, and the first-release boundary are clear enough for a person to review. Risk clarity is still low because customer adoption is unvalidated. This recommendation was not produced by a live model.",
      createdAt: daysAgo(8, 11),
      updatedAt: daysAgo(2, 15),
    },
  });

  await prisma.assumption.createMany({
    data: [
      {
        briefId: brief.id,
        description:
          "Customers will complete first notice of loss online without calling the contact centre.",
        impact: "HIGH",
        confidence: "LOW",
        status: "UNVALIDATED",
        origin: "AI_PROPOSAL",
      },
      {
        briefId: brief.id,
        description:
          "Handlers already share one claim file once a notice is accepted.",
        impact: "MEDIUM",
        confidence: "MEDIUM",
        status: "VALIDATED",
        origin: "HUMAN_CONFIRMED",
      },
      {
        briefId: brief.id,
        description:
          "A native mobile application is required for first notice of loss.",
        impact: "HIGH",
        confidence: "LOW",
        status: "INVALIDATED",
        origin: "HUMAN_CONFIRMED",
      },
    ],
  });

  await prisma.activity.createMany({
    data: [
      {
        productId,
        type: "DISCOVERY_STARTED",
        description:
          "Demo data. Started a sample discovery session for the Claims Management Platform. Not a live model run.",
        actor: "Demo seed",
        createdAt: startedAt,
      },
      {
        productId,
        type: "DISCOVERY_READY_FOR_REVIEW",
        description:
          "Demo data. Marked the sample product brief ready for review. Not a live model recommendation.",
        actor: "Demo seed",
        createdAt: daysAgo(2, 15),
      },
    ],
  });

  return brief.id;
}

async function seedDefinitionDemo(input: {
  productId: string;
  briefId: string;
  epicId: string;
  createClaimId: string;
  trackClaimId: string;
  storyId: string;
}) {
  const createdAt = daysAgo(2, 12);
  await prisma.productDefinition.create({
    data: {
      productId: input.productId,
      status: "IN_PROGRESS",
      seededDemo: true,
      reviewSummary:
        "Demo data. This definition was prepared so the Define workspace can be reviewed. It was not produced by a Requirements Agent run.",
      createdAt,
      updatedAt: daysAgo(1, 11),
    },
  });

  const effort = await prisma.productOutcome.create({
    data: {
      productId: input.productId,
      title: "Reduce customer effort when opening a straightforward claim",
      description:
        "A policyholder can start a simple motor or property claim without calling the contact centre.",
      successMeasure:
        "Share of straightforward new notices submitted without handler assistance.",
      targetValue: "",
      status: "PROPOSED",
      sourceBriefId: input.briefId,
      origin: "AI_PROPOSAL",
      createdAt,
      updatedAt: createdAt,
    },
  });

  const contacts = await prisma.productOutcome.create({
    data: {
      productId: input.productId,
      title: "Reduce customer contacts requesting claim status",
      description:
        "Customers can see that a submitted claim was received, so they do not need to call for a receipt.",
      successMeasure: "Fewer status calls in the first day after a digital notice.",
      targetValue: "",
      status: "PROPOSED",
      sourceBriefId: input.briefId,
      origin: "AI_PROPOSAL",
      createdAt,
      updatedAt: createdAt,
    },
  });

  const submission = await prisma.productCapability.create({
    data: {
      productId: input.productId,
      outcomeId: effort.id,
      name: "Digital Claim Submission",
      description:
        "Lets a policyholder submit the policy number, incident date, loss type, and a contact method.",
      status: "PROPOSED",
      priority: "HIGH",
      origin: "AI_PROPOSAL",
      createdAt,
      updatedAt: createdAt,
    },
  });

  const tracking = await prisma.productCapability.create({
    data: {
      productId: input.productId,
      outcomeId: contacts.id,
      name: "Claim Status Tracking",
      description: "Lets a customer see that the notice entered the working queue.",
      status: "PROPOSED",
      priority: "MEDIUM",
      origin: "AI_PROPOSAL",
      createdAt,
      updatedAt: createdAt,
    },
  });

  const slice = await prisma.productSlice.create({
    data: {
      productId: input.productId,
      name: "Submit a simple claim and receive confirmation",
      description:
        "A customer can submit a straightforward claim and see a claim reference that confirms it was received.",
      rationale:
        "This is the smallest journey that serves a real customer, tests whether people will finish first notice online, and can be demonstrated end to end.",
      status: "PROPOSED",
      origin: "AI_PROPOSAL",
      createdAt,
      updatedAt: createdAt,
    },
  });

  await prisma.workItem.update({
    where: { id: input.epicId },
    data: { capabilityId: submission.id, priorityAssigned: true, provenance: "HUMAN_CREATED" },
  });
  await prisma.workItem.update({
    where: { id: input.createClaimId },
    data: {
      capabilityId: submission.id,
      sliceId: slice.id,
      priorityAssigned: true,
      provenance: "HUMAN_CREATED",
    },
  });
  await prisma.workItem.update({
    where: { id: input.trackClaimId },
    data: { capabilityId: tracking.id, priorityAssigned: true, provenance: "HUMAN_CREATED" },
  });
  await prisma.workItem.update({
    where: { id: input.storyId },
    data: { capabilityId: submission.id, sliceId: slice.id },
  });

  const accessibility = await prisma.nonFunctionalRequirement.create({
    data: {
      productId: input.productId,
      category: "ACCESSIBILITY",
      title: "Online first notice can be completed with a keyboard and a screen reader",
      description:
        "A customer who does not use a pointer can enter the mandatory notice fields and submit.",
      measure: "Confirm the accessibility standard with the team. No numeric target is invented here.",
      status: "PROPOSED",
      source: "AI_PROPOSAL",
      createdAt,
      updatedAt: createdAt,
    },
  });
  const security = await prisma.nonFunctionalRequirement.create({
    data: {
      productId: input.productId,
      category: "SECURITY",
      title: "A notice must not expose another customer's policy details",
      description:
        "Searching or submitting with a policy number shows only the data that customer is allowed to see.",
      measure: "Exact session and authentication rules remain an open question.",
      status: "PROPOSED",
      source: "AI_PROPOSAL",
      createdAt,
      updatedAt: createdAt,
    },
  });
  await seedArchitectureDemo({
    productId: input.productId,
    sliceId: slice.id,
    capabilityId: submission.id,
    storyId: input.storyId,
    accessibilityId: accessibility.id,
    securityId: security.id,
    createdAt,
  });

  await prisma.requirementQuestion.create({
    data: {
      productId: input.productId,
      workItemId: input.storyId,
      question:
        "What share of straightforward notices must be completed without handler assistance before this slice is worth continuing?",
      reason:
        "The brief names a 70% illustration, and nobody has confirmed that number as the decision threshold.",
      impact: "HIGH",
      status: "OPEN",
      createdAt,
    },
  });

  const pending = {
    reviewStatus: "PENDING",
    edited: false,
    committedId: null,
    replacesId: null,
  };
  await prisma.definitionProposal.create({
    data: {
      productId: input.productId,
      status: "OPEN",
      seededDemo: true,
      summary:
        "Demo proposal for evidence upload. It was not produced by a Requirements Agent run. Accept or reject it before anything reaches the backlog.",
      createdAt,
      updatedAt: createdAt,
      payload: {
        assistantSummary:
          "Demo proposal. A customer may need to attach one photograph so the handler does not call back for the same damage. This was not generated by a live model.",
        outcomes: [
          {
            tempId: "outcome-1",
            title: "Reduce repeat contacts about missing damage evidence",
            description: "Handlers receive enough visual evidence with the first notice to avoid an immediate callback.",
            successMeasure: "Fewer same-day callbacks that exist only to ask for a photograph.",
            targetValue: "",
            ...pending,
          },
        ],
        capabilities: [
          {
            tempId: "capability-1",
            outcomeTempId: "outcome-1",
            name: "Evidence Upload",
            description: "Lets a customer attach a photograph of the damage while submitting a straightforward claim.",
            priority: "MEDIUM",
            ...pending,
          },
        ],
        epics: [
          {
            tempId: "epic-1",
            capabilityTempId: "capability-1",
            title: "Evidence with the first notice",
            description: "The first notice can carry the evidence a handler needs before they trust it.",
            priority: "MEDIUM",
            ...pending,
          },
        ],
        features: [
          {
            tempId: "feature-1",
            epicTempId: "epic-1",
            title: "Attach a photograph",
            description: "A customer can add one photograph before submitting a straightforward claim.",
            priority: "MEDIUM",
            inFirstSlice: false,
            ...pending,
          },
        ],
        stories: [
          {
            tempId: "story-1",
            featureTempId: "feature-1",
            title: "As a policyholder I want to attach a photograph so that a handler can see the damage without calling me back.",
            description: "The photograph is optional for the first submission and is stored with the notice.",
            persona: "policyholder",
            need: "attach a photograph of the damage",
            value: "a handler can see the damage without an immediate callback",
            priority: "MEDIUM",
            inFirstSlice: false,
            ...pending,
          },
        ],
        acceptanceCriteria: [
          {
            tempId: "ac-1",
            storyTempId: "story-1",
            description:
              "GIVEN a customer has entered the mandatory claim information WHEN they attach one photograph and submit THEN the notice is created and the photograph is available to the handler with the claim reference.",
            ...pending,
          },
        ],
        nfrs: [],
        firstSlice: null,
        assumptions: [
          {
            tempId: "assumption-1",
            description: "Customers have a photograph available at the moment they open the claim.",
            impact: "MEDIUM",
            confidence: "LOW",
            storyTempId: "story-1",
            ...pending,
          },
        ],
        dependencies: [],
        questions: [
          {
            tempId: "question-1",
            storyTempId: "",
            question: "Is a photograph required before submission, or only encouraged?",
            reason: "The brief does not say whether missing evidence blocks the notice.",
            impact: "MEDIUM",
            ...pending,
          },
        ],
        readinessAssessment: {
          summary: "Demo assessment only. Not a live model judgement.",
          notes: ["Do not treat this proposal as an agent run."],
        },
      },
    },
  });

  await prisma.activity.create({
    data: {
      productId: input.productId,
      type: "DEFINITION_GENERATED",
      description:
        "Demo data. Prepared sample outcomes, capabilities, a first slice, and an open proposal. Not a Requirements Agent run.",
      actor: "Demo seed",
      createdAt,
    },
  });
}

async function seedArchitectureDemo(input: {
  productId: string;
  sliceId: string;
  capabilityId: string;
  storyId: string;
  accessibilityId: string;
  securityId: string;
  createdAt: Date;
}) {
  await prisma.codebaseContext.create({
    data: {
      productId: input.productId,
      repositoryName: "claims-demo",
      systemKind: "GREENFIELD",
      languages: ["TypeScript"],
      frameworks: ["Next.js"],
      databaseTechnologies: ["PostgreSQL"],
      architectureSummary:
        "Demo context. There is no existing claims codebase connected. GitHub integration is not configured.",
      keyComponents: ["Customer notice", "Claim record"],
      constraints: "Do not invent a second identity system for the sample.",
      source: "DEMO",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });

  const architecture = await prisma.solutionArchitecture.create({
    data: {
      productId: input.productId,
      productSliceId: input.sliceId,
      version: 1,
      status: "DRAFT",
      systemKind: "GREENFIELD",
      architectureStyle: "Modular monolith",
      summary:
        "Demo architecture. A customer web application submits a straightforward claim through a claims API and claims service into a claims database. A notification service can confirm receipt, and an identity provider is assumed but not chosen.",
      rationale:
        "The first slice is one customer journey. A modular monolith is enough. This record was seeded for the sample and was not produced by an Architecture Agent run.",
      frontendApproach: "A customer web application for the notice and the confirmation.",
      backendApproach: "A claims API in front of a claims service.",
      dataApproach: "A claims database holds the notice and its reference.",
      integrationApproach: "Identity is an open question. Notification is inside the same application for the first slice.",
      securityApproach: "Initial assessment only. The customer must not see another customer's notice.",
      deploymentApproach: "One application deployment for the first slice.",
      observabilityApproach: "Log submission success and failure with the claim reference.",
      seededDemo: true,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });

  const web = await prisma.architectureComponent.create({
    data: {
      solutionArchitectureId: architecture.id,
      name: "Customer Web Application",
      type: "USER_INTERFACE",
      description: "The customer enters a straightforward claim and sees the confirmation.",
      responsibilities: "Collect the notice and show the claim reference.",
      technology: "Web application",
      rationale: "The approved slice is a customer journey.",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  const api = await prisma.architectureComponent.create({
    data: {
      solutionArchitectureId: architecture.id,
      name: "Claims API",
      type: "API",
      description: "Application boundary for submitting a claim.",
      responsibilities: "Accept a valid notice and return a claim reference.",
      technology: "HTTP API",
      rationale: "The screen needs a stable boundary.",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  const service = await prisma.architectureComponent.create({
    data: {
      solutionArchitectureId: architecture.id,
      name: "Claims Service",
      type: "SERVICE",
      description: "Creates the claim and keeps the submission rules.",
      responsibilities: "Validate the notice and store it.",
      technology: "Application service",
      rationale: "Rules should not live only in the screen.",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  const database = await prisma.architectureComponent.create({
    data: {
      solutionArchitectureId: architecture.id,
      name: "Claims Database",
      type: "DATABASE",
      description: "Stores the claim notice.",
      responsibilities: "Persist the claim and its reference.",
      technology: "PostgreSQL",
      rationale: "The notice is structured relational data.",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  const notification = await prisma.architectureComponent.create({
    data: {
      solutionArchitectureId: architecture.id,
      name: "Notification Service",
      type: "SERVICE",
      description: "Tells the customer that the notice was received.",
      responsibilities: "Send the claim reference after a successful submission.",
      technology: "In-process notification",
      rationale: "Confirmation is part of the first slice.",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  const identity = await prisma.architectureComponent.create({
    data: {
      solutionArchitectureId: architecture.id,
      name: "Identity Provider",
      type: "IDENTITY",
      description: "The provider that will identify the customer. It is not chosen.",
      responsibilities: "Authenticate the customer before showing another person's data.",
      technology: "Not chosen",
      rationale: "Authentication changes the design, so it stays a question.",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });

  await prisma.architectureRelationship.createMany({
    data: [
      {
        solutionArchitectureId: architecture.id,
        sourceComponentId: web.id,
        targetComponentId: api.id,
        relationshipType: "CALLS",
        description: "The screen submits the notice.",
      },
      {
        solutionArchitectureId: architecture.id,
        sourceComponentId: api.id,
        targetComponentId: service.id,
        relationshipType: "CALLS",
        description: "The API delegates to the claims service.",
      },
      {
        solutionArchitectureId: architecture.id,
        sourceComponentId: service.id,
        targetComponentId: database.id,
        relationshipType: "WRITES_TO",
        description: "The service stores the claim.",
      },
      {
        solutionArchitectureId: architecture.id,
        sourceComponentId: service.id,
        targetComponentId: notification.id,
        relationshipType: "CALLS",
        description: "The service asks for a receipt notification.",
      },
      {
        solutionArchitectureId: architecture.id,
        sourceComponentId: web.id,
        targetComponentId: identity.id,
        relationshipType: "AUTHENTICATES_WITH",
        description: "The screen will authenticate once a provider is chosen.",
      },
    ],
  });

  const monolith = await prisma.architectureDecisionRecord.create({
    data: {
      productId: input.productId,
      solutionArchitectureId: architecture.id,
      title: "Use a modular monolith for the first claim slice",
      context: "The first slice is one customer journey.",
      decision: "Keep the web application, API, and claims service in one deployable application.",
      rationale: "Complexity must be justified. Several services would not help this slice.",
      alternatives: "A separate frontend deployment and a separate claims service.",
      consequences: "The service boundary can be split later if the product earns that cost.",
      status: "PROPOSED",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  await prisma.architectureDecisionRecord.create({
    data: {
      productId: input.productId,
      solutionArchitectureId: architecture.id,
      title: "Use PostgreSQL as the primary data store",
      context: "The notice is a structured claim record.",
      decision: "Store claims in PostgreSQL.",
      rationale: "The sample factory already runs on PostgreSQL and the notice fits rows.",
      alternatives: "A document database.",
      consequences: "Unusual attachments can wait until a later slice.",
      status: "PROPOSED",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });

  await prisma.technologyChoice.create({
    data: {
      solutionArchitectureId: architecture.id,
      choice: "PostgreSQL",
      reason: "The claim notice is structured and does not need a second database for the first slice.",
      alternatives: "A document store.",
      tradeoffs: "Relational constraints help the notice and are less flexible for arbitrary evidence.",
      relevantConstraint: "Keep the first slice operable without a new operational platform.",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  await prisma.dataEntity.create({
    data: {
      solutionArchitectureId: architecture.id,
      name: "Claim",
      description: "The straightforward notice and its confirmation reference.",
      owner: "Claims service",
      classification: "CONFIDENTIAL",
      retention: "Retention period is not confirmed.",
      relationships: "A claim has one submitting customer and one reference.",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  await prisma.integrationDesign.create({
    data: {
      solutionArchitectureId: architecture.id,
      name: "Identity provider",
      purpose: "Identify the customer before showing claim data.",
      direction: "OUTBOUND",
      protocol: "Not chosen",
      authenticationAssumption: "The provider is an open architecture question.",
      dataExchanged: "A subject identifier.",
      failureConsiderations: "If identity is unavailable, another customer's data must not be shown.",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });

  const findings = [
    ["AUTHENTICATION", "DECISION_REQUIRED", "The identity provider is not chosen"],
    ["AUTHORISATION", "CONCERN", "A customer must not open another customer's notice"],
    ["SENSITIVE_DATA", "INFORMATION", "Policy numbers and contact details are confidential"],
    ["ENCRYPTION", "INFORMATION", "Protect the notice in transit and at rest"],
    ["SECRETS", "INFORMATION", "Keep database credentials off the customer screen"],
    ["AUDITABILITY", "INFORMATION", "Record that a notice was submitted"],
    ["PRIVACY", "CONCERN", "Confirm where customer data must be stored"],
  ] as const;
  for (const [area, classification, title] of findings) {
    await prisma.securityFinding.create({
      data: {
        solutionArchitectureId: architecture.id,
        area,
        classification,
        title,
        description:
          "Initial Architecture Security Assessment for the demo. This is not a full security review.",
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    });
  }

  await prisma.nfrCoverage.createMany({
    data: [
      {
        solutionArchitectureId: architecture.id,
        nfrId: input.accessibilityId,
        componentId: web.id,
        mechanism: "The customer web application is the surface that must work with a keyboard and a screen reader.",
      },
      {
        solutionArchitectureId: architecture.id,
        nfrId: input.securityId,
        componentId: api.id,
        adrId: monolith.id,
        mechanism: "The claims API scopes each notice to the authenticated customer.",
      },
    ],
  });
  await prisma.componentTrace.createMany({
    data: [
      { componentId: web.id, capabilityId: input.capabilityId, workItemId: input.storyId },
      { componentId: api.id, capabilityId: input.capabilityId, workItemId: input.storyId },
      { componentId: service.id, capabilityId: input.capabilityId, workItemId: input.storyId },
      { componentId: web.id, nfrId: input.accessibilityId },
      { componentId: api.id, nfrId: input.securityId, adrId: monolith.id },
    ],
  });
  await prisma.architectureQuestion.create({
    data: {
      productId: input.productId,
      solutionArchitectureId: architecture.id,
      question: "What identity provider must the product integrate with?",
      reason: "The answer changes authentication and the first integration.",
      impact: "HIGH",
      status: "OPEN",
      createdAt: input.createdAt,
    },
  });

  const plan = await prisma.implementationPlan.create({
    data: {
      productId: input.productId,
      productSliceId: input.sliceId,
      solutionArchitectureId: architecture.id,
      version: 1,
      status: "DRAFT",
      summary:
        "Demo plan for the first slice: submit a simple claim end to end. Not an Architecture Agent run.",
      seededDemo: true,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  const taskData = [
    ["Add the claim creation domain model", "Claims Service", service.id, [] as string[]],
    ["Implement the claim submission service", "Claims Service", service.id, [] as string[]],
    ["Expose the claim submission endpoint", "Claims API", api.id, [] as string[]],
    ["Create the claim submission screen", "Customer Web Application", web.id, [] as string[]],
    ["Verify the slice end to end", "Customer Web Application", web.id, [] as string[]],
  ];
  const createdTasks: string[] = [];
  for (const [index, task] of taskData.entries()) {
    const created = await prisma.implementationTask.create({
      data: {
        implementationPlanId: plan.id,
        workItemId: input.storyId,
        title: task[0] as string,
        description: "Demo task for the submit-simple-claim slice.",
        objective: task[0] as string,
        verticalSlice: "Submit simple claim",
        guidance: "Follow the approved story. Do not treat this seed as generated code.",
        validation: "Check the story acceptance criteria for this slice.",
        sequence: index + 1,
        parallelisable: false,
        dependenciesIdentified: true,
        status: "PROPOSED",
        complexity: "MEDIUM",
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    });
    createdTasks.push(created.id);
    await prisma.implementationTaskComponent.create({
      data: { taskId: created.id, componentId: task[2] as string },
    });
  }
  for (let index = 1; index < createdTasks.length; index += 1) {
    await prisma.implementationTaskDependency.create({
      data: { taskId: createdTasks[index], dependsOnId: createdTasks[index - 1] },
    });
  }

  await prisma.activity.create({
    data: {
      productId: input.productId,
      type: "ARCHITECTURE_GENERATED",
      description:
        "Demo data. Prepared a sample architecture, security assessment, and implementation plan. Not an Architecture Agent run.",
      actor: "Demo seed",
      createdAt: input.createdAt,
    },
  });

  await seedGovernanceDemo({
    productId: input.productId,
    architectureId: architecture.id,
    planId: plan.id,
    apiId: api.id,
    serviceId: service.id,
    notificationId: notification.id,
    securityNfrId: input.securityId,
    storyId: input.storyId,
    taskIds: createdTasks,
    createdAt: input.createdAt,
  });
}

async function seedGovernanceDemo(input: {
  productId: string;
  architectureId: string;
  planId: string;
  apiId: string;
  serviceId: string;
  notificationId: string;
  securityNfrId: string;
  storyId: string;
  taskIds: string[];
  createdAt: Date;
}) {
  const review = await prisma.engineeringGovernanceReview.create({
    data: {
      productId: input.productId,
      solutionArchitectureId: input.architectureId,
      implementationPlanId: input.planId,
      version: 1,
      status: "DRAFT",
      overallAssessment: "PASS_WITH_ACTIONS",
      summary:
        "Demo governance review. The first claim slice can be built with actions on file validation, logging, and notification failure. This is not an agent run and it is not approved.",
      assistantSummary:
        "Demo governance review prepared for the sample. Not a Security & Engineering Governance Agent run.",
      securityAssessment:
        "Authentication is still an open architecture question. The claims API must scope each notice to the customer who submitted it. Uploaded evidence and logs need explicit controls before coding treats them as safe. This is an AI-style review of the seeded design, not a penetration test.",
      privacyAssessment:
        "A claim notice can contain personal data about the customer and the incident. GDPR applicability requires confirmation. Retention for uploaded documents is not known, so that stays an open question rather than a compliance conclusion.",
      engineeringAssessment:
        "A modular monolith matches the first slice. The notification path needs a clearer failure behaviour. Observability should record success and failure without copying the notice body into logs. No extra runtime platform is justified for this slice.",
      implementationPlanAssessment:
        "The five tasks follow the customer journey rather than a backend, middleware, UI, then QA sequence. Each task has a validation note. The screen task is small enough for supervised or autonomous work. Authentication changes are not in this plan.",
      dependencyReview:
        "AI REVIEW. The sample names PostgreSQL and a web application. No vulnerability scanner has run, so this is not tool verified. Pin dependencies before production and do not add a high-privilege SDK for the first slice.",
      readinessNote: "Demo readiness is computed from the seeded findings. It is not a model score.",
      seededDemo: true,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });

  const fileFinding = await prisma.governanceFinding.create({
    data: {
      reviewId: review.id,
      category: "SECURITY",
      severity: "MEDIUM",
      title: "Uploaded claim evidence requires file-type and size validation.",
      description:
        "The first slice may accept a photo of damage. The API boundary does not yet say which types and sizes are allowed.",
      evidence: "The claims API accepts a notice. The seeded plan does not name an upload check.",
      recommendation: "Reject unexpected types and oversized files at the claims API before the object is stored.",
      status: "OPEN",
      dueBeforeCoding: false,
      owner: "Claims API",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  await prisma.governanceFindingLink.create({
    data: {
      findingId: fileFinding.id,
      componentId: input.apiId,
      nfrId: input.securityNfrId,
      workItemId: input.storyId,
      taskId: input.taskIds[2],
    },
  });

  const logFinding = await prisma.governanceFinding.create({
    data: {
      reviewId: review.id,
      category: "DATA",
      severity: "MEDIUM",
      title: "Sensitive claim information must not be written to application logs.",
      description:
        "A claim notice can include contact details and a description of damage. Writing that body to logs exposes it to anyone who can read the log stream.",
      evidence: "The observability approach logs submission success and failure with the claim reference.",
      recommendation: "Log the claim reference and the outcome. Do not log the notice body, document contents, or contact details.",
      status: "OPEN",
      dueBeforeCoding: false,
      owner: "Claims Service",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  await prisma.governanceFindingLink.create({
    data: {
      findingId: logFinding.id,
      componentId: input.serviceId,
      nfrId: input.securityNfrId,
      workItemId: input.storyId,
    },
  });

  const notificationFinding = await prisma.governanceFinding.create({
    data: {
      reviewId: review.id,
      category: "RELIABILITY",
      severity: "LOW",
      title: "Notification service failure handling needs clarification.",
      description:
        "The customer should still receive a claim reference if the notification cannot be sent. The plan does not say whether that failure is retried or only recorded.",
      evidence: "The notification service is a component of the first slice, and its failure behaviour is not stated on the task.",
      recommendation: "Record the failure and still return the claim reference. Do not block submission on notification delivery.",
      status: "OPEN",
      dueBeforeCoding: false,
      owner: "Notification Service",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  await prisma.governanceFindingLink.create({
    data: { findingId: notificationFinding.id, componentId: input.notificationId },
  });

  await prisma.threat.createMany({
    data: [
      {
        reviewId: review.id,
        title: "Unauthorised access to another customer's claim",
        description: "A customer who can guess or reuse a claim reference might read someone else's notice.",
        affectedComponentId: input.apiId,
        attackSurface: "Claims API read path",
        likelihood: "MEDIUM",
        impact: "HIGH",
        mitigation: "Scope every read and write to the authenticated customer.",
        status: "OPEN",
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
      {
        reviewId: review.id,
        title: "Malicious file upload",
        description: "An uploaded damage photo could be an unexpected type or an oversized payload.",
        affectedComponentId: input.apiId,
        attackSurface: "Claim evidence upload",
        likelihood: "MEDIUM",
        impact: "MEDIUM",
        mitigation: "Allow only the agreed types and sizes, and store the file outside the application process.",
        status: "OPEN",
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
      {
        reviewId: review.id,
        title: "Sensitive information appearing in application logs",
        description: "Support staff or a log vendor could see the notice body if it is written to the log line.",
        affectedComponentId: input.serviceId,
        attackSurface: "Application logs",
        likelihood: "MEDIUM",
        impact: "MEDIUM",
        mitigation: "Log the claim reference only.",
        status: "OPEN",
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
      {
        reviewId: review.id,
        title: "Compromised third-party API credentials",
        description: "A notification or identity credential in the application config could be reused if it is committed or logged.",
        affectedComponentId: input.notificationId,
        attackSurface: "Service credentials",
        likelihood: "LOW",
        impact: "HIGH",
        mitigation: "Keep credentials in the environment, not in source, and do not print them.",
        status: "OPEN",
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    ],
  });

  const riskLevels = [
    ["MEDIUM", "SUPERVISED", "The domain model stores a customer notice. A person should review the change."],
    ["MEDIUM", "SUPERVISED", "The submission service writes customer data. Keep a person in the loop."],
    ["MEDIUM", "SUPERVISED", "A new API endpoint accepts the notice. Review the boundary before it is merged."],
    ["LOW", "AUTONOMOUS", "The screen change has a clear acceptance check and does not decide access."],
    ["LOW", "SUPERVISED", "End-to-end verification can be drafted with supervision because it touches the whole slice."],
  ] as const;
  for (const [index, taskId] of input.taskIds.entries()) {
    const [riskLevel, mode, reason] = riskLevels[index];
    await prisma.codingRiskAssessment.create({
      data: {
        reviewId: review.id,
        implementationTaskId: taskId,
        riskLevel,
        recommendedExecutionMode: mode,
        reason,
        requiredHumanReview: mode !== "AUTONOMOUS",
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    });
  }

  await prisma.codingPolicy.create({
    data: {
      productId: input.productId,
      reviewId: review.id,
      allowedPaths: ["src/claims/**", "src/app/claims/**"],
      restrictedPaths: ["prisma/migrations/**", ".github/workflows/**"],
      prohibitedActions: [
        "Modify production credentials",
        "Disable security controls",
        "Force push",
        "Merge own pull request",
        "Delete production data",
        "Modify CI security controls without approval",
        "Commit secrets",
        "Bypass failing tests",
      ],
      requiredChecks: ["typecheck", "lint", "unit tests"],
      maxFilesPerTask: 8,
      requireTests: true,
      requireHumanReview: true,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });

  await prisma.governanceQuestion.create({
    data: {
      reviewId: review.id,
      question: "What retention policy applies to uploaded documents?",
      reason: "The notice may include a photo, and no retention period is confirmed.",
      impact: "MEDIUM",
      topic: "PRIVACY",
      blocking: true,
      status: "OPEN",
      createdAt: input.createdAt,
    },
  });
  await prisma.governanceEvidence.create({
    data: {
      reviewId: review.id,
      findingId: fileFinding.id,
      type: "AI_ANALYSIS",
      source: "AI_REVIEW",
      description: "Demo evidence for the file-validation finding. No scanner was run.",
      result: "AI REVIEW",
      createdAt: input.createdAt,
    },
  });
  await prisma.activity.create({
    data: {
      productId: input.productId,
      type: "GOVERNANCE_GENERATED",
      description:
        "Demo data. Prepared a sample governance review, threat model, coding risks, and coding policy. Not a Security & Engineering Governance Agent run.",
      actor: "Demo seed",
      createdAt: input.createdAt,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
