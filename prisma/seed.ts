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

  await prisma.nonFunctionalRequirement.createMany({
    data: [
      {
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
      {
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
    ],
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
