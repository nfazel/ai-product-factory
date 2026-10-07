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
  await prisma.workItemDependency.deleteMany();
  await prisma.acceptanceCriterion.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.workItem.updateMany({ data: { parentId: null } });
  await prisma.workItem.deleteMany();
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

  console.log(`Seeded ${product.name} (${product.id}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
