import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import { updateArchitectureSummary, updateImplementationTask } from "@/modules/architecture/service";
import { GOVERNANCE_SYSTEM_PROMPT } from "@/modules/governance/prompt";
import { persistCommittedGovernance } from "@/modules/governance/repository";
import { toStoredGovernance } from "@/modules/governance/schema";
import {
  acceptEntireGovernanceProposal,
  approveCodingPolicy,
  approveGovernanceReview,
  assessCodingReadiness,
  commitGovernanceReview,
  generateGovernanceReview,
  markGovernanceReady,
  overrideCodingRisk,
  updateCodingPolicy,
  updateGovernanceFinding,
} from "@/modules/governance/service";
import { governanceFixture } from "@/modules/governance/testing";
import { assertEvidenceIsNotFabricated } from "@/modules/governance/validate";

const createdProducts: string[] = [];
const originalKey = process.env.OPENAI_API_KEY;

function mockProvider(data: unknown, error?: Error): AIProvider {
  return {
    async generate<T>() {
      if (error) throw error;
      return { data: data as T, usage: { inputTokens: 10, outputTokens: 12 }, model: "mock" };
    },
  };
}

async function tempProduct(stage: "EXPLORE" | "DEFINE" | "BUILD" = "BUILD") {
  const product = await db.product.create({
    data: {
      name: `Governance test ${crypto.randomUUID()}`,
      description: "Temporary product.",
      vision: "Temporary vision",
      problemStatement: "Temporary problem",
      targetUsers: "Testers",
      status: "ACTIVE",
      currentStage: stage,
    },
  });
  createdProducts.push(product.id);
  return product;
}

async function approvedUpstream(productId: string) {
  const session = await db.discoverySession.create({
    data: { productId, status: "APPROVED" },
  });
  await db.productBrief.create({
    data: {
      productId,
      sessionId: session.id,
      version: 1,
      status: "APPROVED",
      problemStatement: "Customers cannot submit a straightforward claim online.",
      productVision: "A customer can submit a simple claim.",
      valueProposition: "The first notice does not need the call centre.",
    },
  });
  await db.productDefinition.create({ data: { productId, status: "APPROVED" } });
  await db.approval.create({
    data: {
      productId,
      approvalType: "PRODUCT_DEFINITION",
      status: "APPROVED",
      approvedBy: "Local user",
      resolvedAt: new Date(),
    },
  });
  const slice = await db.productSlice.create({
    data: { productId, name: "Submit a simple claim", status: "APPROVED" },
  });
  const story = await db.workItem.create({
    data: {
      productId,
      title: "Submit a straightforward claim",
      description: "The customer submits a notice.",
      type: "STORY",
      stage: "BUILD",
      sliceId: slice.id,
    },
  });
  const nfr = await db.nonFunctionalRequirement.create({
    data: {
      productId,
      category: "SECURITY",
      title: "A customer must not see another customer's notice",
      status: "CONFIRMED",
    },
  });
  return { slice, story, nfr };
}

async function approvedArchitectureAndPlan(productId: string, sliceId: string) {
  const architecture = await db.solutionArchitecture.create({
    data: {
      productId,
      productSliceId: sliceId,
      version: 1,
      status: "APPROVED",
      summary: "A modular monolith for the first claim slice.",
      rationale: "One journey does not need extra services.",
    },
  });
  await db.approval.create({
    data: {
      productId,
      approvalType: "SOLUTION_ARCHITECTURE",
      status: "APPROVED",
      approvedBy: "Local user",
      resolvedAt: new Date(),
    },
  });
  const component = await db.architectureComponent.create({
    data: {
      solutionArchitectureId: architecture.id,
      name: "Claims API",
      type: "API",
      responsibilities: "Accept a valid notice.",
    },
  });
  const adr = await db.architectureDecisionRecord.create({
    data: {
      productId,
      solutionArchitectureId: architecture.id,
      title: "Use a modular monolith",
      decision: "Keep the first slice in one application.",
      status: "ACCEPTED",
    },
  });
  const plan = await db.implementationPlan.create({
    data: {
      productId,
      productSliceId: sliceId,
      solutionArchitectureId: architecture.id,
      version: 1,
      status: "APPROVED",
      summary: "Submit the claim as one vertical slice.",
    },
  });
  await db.approval.create({
    data: {
      productId,
      approvalType: "IMPLEMENTATION_PLAN",
      status: "APPROVED",
      approvedBy: "Local user",
      resolvedAt: new Date(),
    },
  });
  const task = await db.implementationTask.create({
    data: {
      implementationPlanId: plan.id,
      title: "Expose the claim submission endpoint",
      objective: "Accept a notice and return a reference.",
      verticalSlice: "Submit simple claim",
      validation: "A valid notice returns a reference.",
    },
  });
  return { architecture, component, adr, plan, task };
}

async function readyProduct(stage: "DEFINE" | "BUILD" = "BUILD") {
  const product = await tempProduct(stage);
  const upstream = await approvedUpstream(product.id);
  const design = await approvedArchitectureAndPlan(product.id, upstream.slice.id);
  return { product, ...upstream, ...design };
}

afterEach(async () => {
  setAIProviderForTests(null);
  process.env.OPENAI_API_KEY = originalKey;
  while (createdProducts.length > 0) {
    const id = createdProducts.pop();
    if (!id) continue;
    await db.product.delete({ where: { id } }).catch(() => undefined);
  }
});

describe("governance entry", () => {
  it("does not run outside BUILD and does not create an agent run", async () => {
    const setup = await readyProduct("DEFINE");
    setAIProviderForTests(
      mockProvider(
        governanceFixture({
          componentId: setup.component.id,
          adrId: setup.adr.id,
          taskIds: [setup.task.id],
          nfrId: setup.nfr.id,
          workItemId: setup.story.id,
        }),
      ),
    );
    await expect(generateGovernanceReview(setup.product.id)).rejects.toThrow(/only runs during BUILD/i);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("requires an approved architecture", async () => {
    const product = await tempProduct("BUILD");
    await approvedUpstream(product.id);
    setAIProviderForTests(mockProvider({}));
    await expect(generateGovernanceReview(product.id)).rejects.toThrow(/approved Solution Architecture/i);
    expect(await db.agentRun.count({ where: { productId: product.id } })).toBe(0);
  });

  it("requires an approved implementation plan", async () => {
    const product = await tempProduct("BUILD");
    const upstream = await approvedUpstream(product.id);
    const architecture = await db.solutionArchitecture.create({
      data: {
        productId: product.id,
        productSliceId: upstream.slice.id,
        version: 1,
        status: "APPROVED",
        summary: "Approved architecture without a plan.",
      },
    });
    await db.approval.create({
      data: {
        productId: product.id,
        approvalType: "SOLUTION_ARCHITECTURE",
        status: "APPROVED",
        approvedBy: "Local user",
        resolvedAt: new Date(),
      },
    });
    expect(architecture.id).toBeTruthy();
    setAIProviderForTests(mockProvider({}));
    await expect(generateGovernanceReview(product.id)).rejects.toThrow(/approved Implementation Plan/i);
    expect(await db.agentRun.count({ where: { productId: product.id } })).toBe(0);
  });

  it("refuses when the provider is not configured and records no run", async () => {
    const setup = await readyProduct();
    delete process.env.OPENAI_API_KEY;
    setAIProviderForTests(null);
    await expect(generateGovernanceReview(setup.product.id)).rejects.toThrow(/not configured/i);
    expect(await db.agentRun.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("records a failed agent run when the provider fails and writes no review", async () => {
    const setup = await readyProduct();
    setAIProviderForTests(mockProvider({}, new Error("model unavailable")));
    await expect(generateGovernanceReview(setup.product.id)).rejects.toThrow(/model unavailable/i);
    const run = await db.agentRun.findFirst({ where: { productId: setup.product.id } });
    expect(run?.status).toBe("FAILED");
    expect(await db.engineeringGovernanceReview.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("rejects a malformed response without a partial review", async () => {
    const setup = await readyProduct();
    setAIProviderForTests(mockProvider({ assistantSummary: "too small" }));
    await expect(generateGovernanceReview(setup.product.id)).rejects.toThrow(/did not match/i);
    expect(await db.governanceProposal.count({ where: { productId: setup.product.id } })).toBe(0);
    expect(await db.engineeringGovernanceReview.count({ where: { productId: setup.product.id } })).toBe(0);
  });

  it("rejects unknown references and does not store a proposal", async () => {
    const setup = await readyProduct();
    const fixture = governanceFixture({
      componentId: "missing-component",
      adrId: setup.adr.id,
      taskIds: [setup.task.id],
      nfrId: setup.nfr.id,
      workItemId: setup.story.id,
    });
    setAIProviderForTests(mockProvider(fixture));
    await expect(generateGovernanceReview(setup.product.id)).rejects.toThrow(/Unknown architecture component/i);
    expect(await db.governanceProposal.count({ where: { productId: setup.product.id } })).toBe(0);
  });
});

describe("governance commit and approvals", () => {
  it("rolls back a review when a reference is invalid", async () => {
    const setup = await readyProduct();
    const stored = toStoredGovernance(
      governanceFixture({
        componentId: "missing-component",
        adrId: setup.adr.id,
        taskIds: [setup.task.id],
        nfrId: setup.nfr.id,
        workItemId: setup.story.id,
      }),
    );
    stored.findings[0].reviewStatus = "ACCEPTED";
    await expect(
      persistCommittedGovernance({
        productId: setup.product.id,
        solutionArchitectureId: setup.architecture.id,
        implementationPlanId: setup.plan.id,
        section: "FULL",
        payload: stored,
      }),
    ).rejects.toThrow(/Unknown architecture component/i);
    expect(await db.engineeringGovernanceReview.count({ where: { productId: setup.product.id } })).toBe(0);
    expect(await db.governanceFinding.count({ where: { review: { productId: setup.product.id } } })).toBe(0);
  });

  it("commits a draft that the agent cannot approve", async () => {
    const setup = await readyProduct();
    const fixture = governanceFixture({
      componentId: setup.component.id,
      adrId: setup.adr.id,
      taskIds: [setup.task.id],
      nfrId: setup.nfr.id,
      workItemId: setup.story.id,
    });
    setAIProviderForTests(mockProvider(fixture));
    await generateGovernanceReview(setup.product.id);
    const proposal = await db.governanceProposal.findFirst({
      where: { productId: setup.product.id, status: "OPEN" },
    });
    if (!proposal) throw new Error("expected a proposal");
    await acceptEntireGovernanceProposal(setup.product.id, proposal.id);
    const review = await commitGovernanceReview(setup.product.id, proposal.id);
    expect(review.status).toBe("DRAFT");
    expect(review.overallAssessment).toBe("PASS_WITH_ACTIONS");
    await expect(
      approveGovernanceReview(setup.product.id, {
        actorName: "Security & Engineering Governance Agent",
      }),
    ).rejects.toThrow(/cannot approve a governance review/i);
    await expect(
      approveCodingPolicy(setup.product.id, {
        actorName: "Security & Engineering Governance Agent",
      }),
    ).rejects.toThrow(/cannot approve a coding policy/i);
    expect(
      await db.approval.count({
        where: {
          productId: setup.product.id,
          approvalType: { in: ["ENGINEERING_GOVERNANCE", "CODING_POLICY"] },
          status: "APPROVED",
        },
      }),
    ).toBe(0);
  });
});

describe("coding readiness blockers", () => {
  async function approvedReview(options?: {
    assessment?: "PASS" | "PASS_WITH_ACTIONS" | "BLOCKED";
    finding?: { severity: "MEDIUM" | "HIGH" | "CRITICAL"; dueBeforeCoding?: boolean };
    extraFinding?: { severity: "HIGH"; dueBeforeCoding: boolean };
    blockingQuestion?: boolean;
    prohibited?: boolean;
  }) {
    const setup = await readyProduct();
    const review = await db.engineeringGovernanceReview.create({
      data: {
        productId: setup.product.id,
        solutionArchitectureId: setup.architecture.id,
        implementationPlanId: setup.plan.id,
        version: 1,
        status: "APPROVED",
        overallAssessment: options?.assessment ?? "PASS",
        summary: "Review text for the readiness rule.",
        securityAssessment: "Security was reviewed for the claims API and the customer notice.",
        privacyAssessment: "Privacy was reviewed. GDPR applicability requires confirmation.",
        engineeringAssessment: "The modular monolith is proportionate to the first slice and was reviewed.",
        implementationPlanAssessment: "The plan stays on one vertical slice and was reviewed for task size.",
        dependencyReview: "AI REVIEW. No scanner has run.",
      },
    });
    await db.approval.create({
      data: {
        productId: setup.product.id,
        approvalType: "ENGINEERING_GOVERNANCE",
        status: "APPROVED",
        approvedBy: "Local user",
        resolvedAt: new Date(),
      },
    });
    await db.codingPolicy.create({
      data: {
        productId: setup.product.id,
        reviewId: review.id,
        allowedPaths: ["src/claims/**"],
        prohibitedActions: ["Commit secrets"],
        requiredChecks: ["unit tests"],
        requireTests: true,
        requireHumanReview: true,
      },
    });
    await db.approval.create({
      data: {
        productId: setup.product.id,
        approvalType: "CODING_POLICY",
        status: "APPROVED",
        approvedBy: "Local user",
        resolvedAt: new Date(),
      },
    });
    if (options?.finding) {
      await db.governanceFinding.create({
        data: {
          reviewId: review.id,
          category: "SECURITY",
          severity: options.finding.severity,
          title: "Material finding",
          description: "A finding used to test the blocker.",
          evidence: "The API boundary.",
          recommendation: "Fix it.",
          status: "OPEN",
          dueBeforeCoding: options.finding.dueBeforeCoding ?? false,
        },
      });
    }
    if (options?.extraFinding) {
      await db.governanceFinding.create({
        data: {
          reviewId: review.id,
          category: "SECURITY",
          severity: options.extraFinding.severity,
          title: "High finding that is not due before coding",
          description: "This high finding can be handled during implementation.",
          evidence: "The plan.",
          recommendation: "Address it in the task.",
          status: "OPEN",
          dueBeforeCoding: options.extraFinding.dueBeforeCoding,
        },
      });
    }
    if (options?.blockingQuestion) {
      await db.governanceQuestion.create({
        data: {
          reviewId: review.id,
          question: "Which identity provider will be used?",
          reason: "Authentication cannot be guessed.",
          blocking: true,
          status: "OPEN",
        },
      });
    }
    const risk = await db.codingRiskAssessment.create({
      data: {
        reviewId: review.id,
        implementationTaskId: setup.task.id,
        riskLevel: options?.prohibited ? "PROHIBITED" : "LOW",
        reason: options?.prohibited ? "Production credential migration." : "A small change.",
        recommendedExecutionMode: options?.prohibited ? "HUMAN_ONLY" : "AUTONOMOUS",
        requiredHumanReview: Boolean(options?.prohibited),
      },
    });
    return { setup, review, risk };
  }

  it("blocks on a critical finding even when the model says pass", async () => {
    const { setup } = await approvedReview({
      assessment: "PASS",
      finding: { severity: "CRITICAL" },
    });
    const coding = await assessCodingReadiness(setup.product.id);
    expect(coding.ready).toBe(false);
    expect(coding.label).toBe("NOT READY");
    expect(coding.blockers.join(" ")).toMatch(/CRITICAL governance finding/);
  });

  it("blocks on a high finding that is due before coding", async () => {
    const { setup } = await approvedReview({
      finding: { severity: "HIGH", dueBeforeCoding: true },
    });
    const coding = await assessCodingReadiness(setup.product.id);
    expect(coding.blockers.join(" ")).toMatch(/due before coding/);
    expect(coding.ready).toBe(false);
  });

  it("does not block on a medium finding or a high finding that is not due before coding", async () => {
    const { setup } = await approvedReview({
      finding: { severity: "MEDIUM" },
      extraFinding: { severity: "HIGH", dueBeforeCoding: false },
    });
    const coding = await assessCodingReadiness(setup.product.id);
    expect(coding.ready).toBe(true);
    expect(coding.label).toBe("CODING READY");
  });

  it("blocks on an open blocking question", async () => {
    const { setup } = await approvedReview({ blockingQuestion: true });
    const coding = await assessCodingReadiness(setup.product.id);
    expect(coding.blockers.join(" ")).toMatch(/blocking governance question/);
  });

  it("blocks a prohibited task until a person records a rationale", async () => {
    const { setup, risk } = await approvedReview({ prohibited: true });
    expect((await assessCodingReadiness(setup.product.id)).blockers.join(" ")).toMatch(/PROHIBITED/);
    await expect(
      overrideCodingRisk({
        productId: setup.product.id,
        assessmentId: risk.id,
        riskLevel: "MEDIUM",
        executionMode: "SUPERVISED",
        rationale: "   ",
      }),
    ).rejects.toThrow(/rationale is required/i);
    await overrideCodingRisk({
      productId: setup.product.id,
      assessmentId: risk.id,
      riskLevel: "MEDIUM",
      executionMode: "SUPERVISED",
      rationale: "A person will review the customer-data change.",
    });
    const activity = await db.activity.findFirst({
      where: { productId: setup.product.id, type: "CODING_RISK_OVERRIDDEN" },
    });
    expect(activity?.description).toMatch(/Local user/);
    expect(activity?.description).toMatch(/person will review/);
    expect((await assessCodingReadiness(setup.product.id)).ready).toBe(true);
  });

  it("requires a rationale before a critical risk is accepted", async () => {
    const { setup, review } = await approvedReview({
      finding: { severity: "CRITICAL" },
    });
    const finding = await db.governanceFinding.findFirst({ where: { reviewId: review.id } });
    if (!finding) throw new Error("expected a finding");
    await expect(
      updateGovernanceFinding({
        productId: setup.product.id,
        findingId: finding.id,
        status: "RISK_ACCEPTED",
        rationale: " ",
      }),
    ).rejects.toThrow(/rationale is required/i);
    await updateGovernanceFinding({
      productId: setup.product.id,
      findingId: finding.id,
      status: "RISK_ACCEPTED",
      rationale: "The slice will not store evidence until the control exists.",
    });
    const saved = await db.governanceFinding.findUnique({ where: { id: finding.id } });
    expect(saved?.status).toBe("RISK_ACCEPTED");
    const activity = await db.activity.findFirst({
      where: { productId: setup.product.id, type: "FINDING_UPDATED" },
    });
    expect(activity?.description).toMatch(/slice will not store evidence/);
    expect((await assessCodingReadiness(setup.product.id)).blockers.join(" ")).not.toMatch(/CRITICAL/);
  });

  it("requires coding policy approval and governance approval", async () => {
    const setup = await readyProduct();
    const coding = await assessCodingReadiness(setup.product.id);
    expect(coding.ready).toBe(false);
    expect(coding.blockers.join(" ")).toMatch(/Engineering Governance is not approved/);
    expect(coding.blockers.join(" ")).toMatch(/Coding Policy is not approved/);
  });

  it("flags governance review when architecture or the plan changes and keeps the approval", async () => {
    const { setup } = await approvedReview();
    await updateArchitectureSummary({
      productId: setup.product.id,
      summary: "Edited after governance approval.",
      rationale: "A person changed the summary.",
      architectureStyle: "Modular monolith",
    });
    const review = await db.engineeringGovernanceReview.findFirst({
      where: { productId: setup.product.id },
    });
    expect(review?.reviewRequired).toBe(true);
    expect(review?.reviewReason).toMatch(/GOVERNANCE REVIEW REQUIRED/);
    expect(review?.reviewFlaggedAt).toBeTruthy();
    const approval = await db.approval.findFirst({
      where: { productId: setup.product.id, approvalType: "ENGINEERING_GOVERNANCE", status: "APPROVED" },
    });
    expect(approval).toBeTruthy();
    expect((await assessCodingReadiness(setup.product.id)).blockers.join(" ")).toMatch(
      /GOVERNANCE REVIEW REQUIRED/,
    );

    await db.engineeringGovernanceReview.update({
      where: { id: review!.id },
      data: { reviewRequired: false, reviewReason: "", reviewFlaggedAt: null },
    });
    await updateImplementationTask({
      productId: setup.product.id,
      taskId: setup.task.id,
      title: "Expose the claim submission endpoint",
      objective: "Changed after governance approval.",
      validation: "A valid notice returns a reference.",
      guidance: "Stay inside the slice.",
    });
    const afterPlan = await db.engineeringGovernanceReview.findFirst({
      where: { id: review!.id },
    });
    expect(afterPlan?.reviewRequired).toBe(true);
    expect(afterPlan?.reviewReason).toMatch(/implementation plan/i);
  });

  it("requires coding policy reapproval after an edit and keeps the approval", async () => {
    const { setup, review } = await approvedReview();
    const policy = await db.codingPolicy.findFirst({ where: { reviewId: review.id } });
    if (!policy) throw new Error("expected a policy");
    await updateCodingPolicy({
      productId: setup.product.id,
      policyId: policy.id,
      allowedPaths: ["src/claims/**", "src/app/claims/**"],
      restrictedPaths: [],
      prohibitedActions: ["Commit secrets"],
      requiredChecks: ["unit tests"],
      maxFilesPerTask: 4,
      requireTests: true,
      requireHumanReview: true,
    });
    const saved = await db.codingPolicy.findUnique({ where: { id: policy.id } });
    expect(saved?.reapprovalRequired).toBe(true);
    expect(saved?.reapprovalReason).toMatch(/CODING POLICY REAPPROVAL REQUIRED/);
    expect(saved?.reapprovalFlaggedAt).toBeTruthy();
    expect(
      await db.approval.findFirst({
        where: { productId: setup.product.id, approvalType: "CODING_POLICY", status: "APPROVED" },
      }),
    ).toBeTruthy();
    expect((await assessCodingReadiness(setup.product.id)).blockers.join(" ")).toMatch(
      /CODING POLICY REAPPROVAL REQUIRED/,
    );
  });
});

describe("governance evidence and prompt", () => {
  it("includes the independent reviewer instruction", () => {
    expect(GOVERNANCE_SYSTEM_PROMPT).toContain("You are an independent technical reviewer.");
    expect(GOVERNANCE_SYSTEM_PROMPT).toContain("You did not create the architecture you are reviewing.");
    expect(GOVERNANCE_SYSTEM_PROMPT).toContain(
      "Do not mark something safe merely because the Architecture Agent proposed it.",
    );
  });

  it("refuses evidence that claims tool verification", () => {
    expect(() =>
      assertEvidenceIsNotFabricated({
        type: "AI_ANALYSIS",
        source: "AI_REVIEW",
        result: "TOOL VERIFIED",
        description: "A scanner was not run.",
      }),
    ).toThrow(/tool verification/i);
    expect(() =>
      assertEvidenceIsNotFabricated({
        type: "DEPENDENCY_SCAN",
        source: "scanner",
        result: "clean",
        description: "No scanner recorded this.",
      }),
    ).toThrow(/tool verification/i);
  });

  it("can approve governance only after a person marks it ready", async () => {
    const setup = await readyProduct();
    const fixture = governanceFixture({
      componentId: setup.component.id,
      adrId: setup.adr.id,
      taskIds: [setup.task.id],
      nfrId: setup.nfr.id,
      workItemId: setup.story.id,
    });
    setAIProviderForTests(mockProvider(fixture));
    await generateGovernanceReview(setup.product.id);
    const proposal = await db.governanceProposal.findFirst({ where: { productId: setup.product.id, status: "OPEN" } });
    if (!proposal) throw new Error("expected a proposal");
    await acceptEntireGovernanceProposal(setup.product.id, proposal.id);
    await commitGovernanceReview(setup.product.id, proposal.id);
    await expect(approveGovernanceReview(setup.product.id)).rejects.toThrow(/ready for review/i);
    await markGovernanceReady(setup.product.id);
    await approveGovernanceReview(setup.product.id);
    const review = await db.engineeringGovernanceReview.findFirst({ where: { productId: setup.product.id } });
    expect(review?.status).toBe("APPROVED");
    const approval = await db.approval.findFirst({
      where: { productId: setup.product.id, approvalType: "ENGINEERING_GOVERNANCE", status: "APPROVED" },
    });
    expect(approval?.approvedBy).toBe("Local user");
  });
});
