import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { setAIProviderForTests, type AIProvider } from "@/modules/ai/provider";
import {
  acceptReleaseRisk,
  approveDeploymentPlan,
  approveRelease,
  completeDeploymentCheck,
  confirmLearningProposal,
  createLearningRecord,
  createReleaseCandidate,
  createReleaseIssue,
  getLearnView,
  getShipView,
  markOutcomeAchieved,
  recordAssumptionFeedback,
  recordDeployment,
  recordOutcomeObservation,
  recordRollback,
  resolveReleaseIssue,
  reviewRelease,
  saveDeploymentPlan,
  stageMoveBlockers,
} from "@/modules/release/service";

const products: string[] = [];
const sha = "a".repeat(40);

async function fixture() {
  const product = await db.product.create({
    data: {
      name: `Release ${crypto.randomUUID()}`,
      description: "Temporary",
      vision: "Submit a claim.",
      problemStatement: "Paper claims.",
      targetUsers: "Customers",
      status: "ACTIVE",
      currentStage: "PROVE",
    },
  });
  products.push(product.id);
  const slice = await db.productSlice.create({ data: { productId: product.id, name: "Submit a simple claim", status: "APPROVED" } });
  const outcome = await db.productOutcome.create({
    data: {
      productId: product.id,
      title: "Reduce customer effort when submitting a claim",
      successMeasure: "Percentage of eligible claims submitted digitally.",
      targetValue: "Increase",
      status: "CONFIRMED",
    },
  });
  const capability = await db.productCapability.create({ data: { productId: product.id, outcomeId: outcome.id, name: "Submit a claim", status: "CONFIRMED" } });
  const story = await db.workItem.create({
    data: { productId: product.id, title: "As a policyholder I want to submit a claim online", type: "STORY", stage: "PROVE", capabilityId: capability.id, sliceId: slice.id },
  });
  const criterion = await db.acceptanceCriterion.create({ data: { workItemId: story.id, description: "Customer receives a claim reference." } });
  const architecture = await db.solutionArchitecture.create({
    data: { productId: product.id, productSliceId: slice.id, version: 1, status: "APPROVED", summary: "A modular monolith." },
  });
  const plan = await db.implementationPlan.create({
    data: { productId: product.id, productSliceId: slice.id, solutionArchitectureId: architecture.id, version: 1, status: "APPROVED" },
  });
  const review = await db.engineeringGovernanceReview.create({
    data: { productId: product.id, solutionArchitectureId: architecture.id, implementationPlanId: plan.id, version: 1, status: "APPROVED", overallAssessment: "PASS" },
  });
  await db.codingPolicy.create({ data: { productId: product.id, reviewId: review.id, allowedPaths: ["src/**"], requiredChecks: ["unit tests"] } });
  await db.approval.create({ data: { productId: product.id, approvalType: "ENGINEERING_GOVERNANCE", status: "APPROVED", approvedBy: "Local user" } });
  await db.approval.create({ data: { productId: product.id, approvalType: "CODING_POLICY", status: "APPROVED", approvedBy: "Local user" } });
  await db.approval.create({ data: { productId: product.id, approvalType: "PRODUCT_DEFINITION", status: "APPROVED", approvedBy: "Local user" } });
  const task = await db.implementationTask.create({
    data: { implementationPlanId: plan.id, workItemId: story.id, title: "Implement claim submission", status: "COMPLETED" },
  });
  const repository = await db.repository.create({
    data: { productId: product.id, name: "claims", provider: "LOCAL", localPath: "/tmp/release-fixture", defaultBranch: "main", status: "CONFIGURED" },
  });
  const workspace = await db.repositoryWorkspace.create({
    data: { repositoryId: repository.id, productId: product.id, implementationTaskId: task.id, workspacePath: "/tmp/release-fixture", branchName: "main", baseCommit: sha, headCommit: sha, status: "COMPLETED" },
  });
  const published = await db.publishedChange.create({
    data: { productId: product.id, implementationTaskId: task.id, repositoryId: repository.id, workspaceId: workspace.id, localBranch: "main", remoteBranch: "main", localCommitSha: sha, remoteCommitSha: sha, status: "PUBLISHED" },
  });
  const pull = await db.pullRequestRecord.create({
    data: {
      productId: product.id,
      repositoryId: repository.id,
      publishedChangeId: published.id,
      number: 12,
      state: "MERGED",
      headSha: sha,
      mergeCommitSha: "b".repeat(40),
      mergedBy: "A human reviewer",
      mergedAt: new Date(),
      protection: { requiredChecks: ["build"] },
    },
  });
  await db.pullRequestCheck.create({
    data: { pullRequestRecordId: pull.id, providerCheckId: "build-1", name: "build", status: "COMPLETED", conclusion: "SUCCESS", source: "GITHUB" },
  });
  const codeApproval = await db.approval.create({ data: { productId: product.id, approvalType: "CODE_CHANGE", status: "APPROVED", approvedBy: "Local user" } });
  await db.codeChangeApproval.create({
    data: { productId: product.id, approvalId: codeApproval.id, implementationTaskId: task.id, workspaceId: workspace.id, baseCommit: sha, headCommit: sha, diffHash: "diff" },
  });
  const session = await db.verificationSession.create({
    data: { productId: product.id, implementationTaskId: task.id, commitSha: sha, status: "PASSED", overallVerdict: "PASS" },
  });
  await db.verificationCoverage.create({
    data: { sessionId: session.id, acceptanceCriterionId: criterion.id, status: "VERIFIED", rationale: "The reference was returned." },
  });
  const verificationApproval = await db.approval.create({ data: { productId: product.id, approvalType: "VERIFICATION", status: "APPROVED", approvedBy: "Local user" } });
  await db.verificationApproval.create({
    data: { productId: product.id, approvalId: verificationApproval.id, sessionId: session.id, implementationTaskId: task.id, commitSha: sha, evidenceFingerprint: "fingerprint" },
  });
  await db.integratedVerificationSession.create({
    data: { productId: product.id, productSliceId: slice.id, status: "BLOCKED", overallVerdict: "INCONCLUSIVE", evidenceGaps: ["End-to-end behaviour was not executed."] },
  });
  const assumption = await db.requirementAssumption.create({ data: { productId: product.id, description: "Customers will submit the notice themselves." } });
  return { product, task, pull, session, outcome, assumption, criterion };
}

async function readyCandidate(productId: string) {
  const view = await createReleaseCandidate(productId, "0.1.0");
  const candidateId = view?.candidate?.id ?? "";
  await saveDeploymentPlan(productId, candidateId, {
    environment: "production",
    strategy: "MANUAL",
    summary: "A person deploys the approved build.",
    steps: "Publish the approved build",
    preChecks: "Change ticket open",
    postChecks: "Health check",
    rollbackTrigger: "Health check fails",
    rollbackSteps: "Restore the previous build",
    rollbackDataImplications: "No schema change",
    rollbackRole: "Release owner",
    rollbackVerification: "Health check passes on the previous build",
    rollbackUnavailable: false,
    rollbackAcknowledgement: "",
    plannedWindow: "Tuesday 10:00",
  });
  await approveDeploymentPlan(productId, candidateId);
  return candidateId;
}

afterEach(async () => {
  setAIProviderForTests(null);
  while (products.length > 0) {
    const id = products.pop();
    if (id) await db.product.delete({ where: { id } }).catch(() => undefined);
  }
});

describe("release governance", () => {
  it("refuses a candidate when verification, merge, or a blocking defect is missing", async () => {
    const missingVerification = await fixture();
    await db.verificationApproval.deleteMany({ where: { productId: missingVerification.product.id } });
    await expect(createReleaseCandidate(missingVerification.product.id, "0.1.0")).rejects.toThrow(/verification/);

    const unmerged = await fixture();
    await db.pullRequestRecord.update({ where: { id: unmerged.pull.id }, data: { state: "OPEN" } });
    await expect(createReleaseCandidate(unmerged.product.id, "0.1.0")).rejects.toThrow(/merged pull request/);

    const defect = await fixture();
    await db.workItem.create({ data: { productId: defect.product.id, title: "Claim reference missing", type: "DEFECT", priority: "CRITICAL", status: "READY" } });
    await expect(createReleaseCandidate(defect.product.id, "0.1.0")).rejects.toThrow(/CRITICAL defect/);
  });

  it("builds a versioned evidence pack without inventing CI success", async () => {
    const setup = await fixture();
    await db.pullRequestCheck.deleteMany({ where: { pullRequestRecordId: setup.pull.id } });
    const blocked = await getShipView(setup.product.id);
    expect(blocked?.entryBlockers.some((reason) => reason.includes("CI") || reason.includes("merged"))).toBe(false);
    await expect(createReleaseCandidate(setup.product.id, "0.1.0")).resolves.toBeTruthy();
    const view = await getShipView(setup.product.id);
    expect(view?.candidate?.version).toBe("0.1.0");
    expect(view?.candidate?.evidence.some((row) => row.type === "CI_RESULT" && row.result === "SUCCESS")).toBe(false);
    expect(view?.candidate?.evidence.some((row) => row.type === "CI_RESULT" && row.result === "MISSING")).toBe(true);
    expect(view?.candidate?.releaseNotes).toContain("0.1.0");
    expect(view?.candidate?.releaseNotes).toContain("Reduce customer effort when submitting a claim");
    expect(view?.candidate?.releaseNotes).toContain(setup.task.id);
    expect(view?.candidate?.readiness.total).toBe(9);
    await expect(createReleaseCandidate(setup.product.id, "0.1.0")).rejects.toThrow(/already exists/);
  });

  it("blocks release approval on critical risk, a blocking question, and a missing rollback", async () => {
    const setup = await fixture();
    const candidateId = await readyCandidate(setup.product.id);
    await db.workItem.create({ data: { productId: setup.product.id, title: "Duplicate payment", type: "DEFECT", priority: "CRITICAL", status: "READY" } });
    await expect(approveRelease(setup.product.id, candidateId)).rejects.toThrow(/Critical release risk/);
    await db.workItem.deleteMany({ where: { productId: setup.product.id, type: "DEFECT" } });
    const question = await db.releaseQuestion.create({
      data: { releaseCandidateId: candidateId, question: "Who is monitoring the release?", blocking: true },
    });
    await expect(approveRelease(setup.product.id, candidateId)).rejects.toThrow(/blocking release question/);
    await db.releaseQuestion.update({ where: { id: question.id }, data: { status: "ANSWERED", answer: "The release owner.", answeredBy: "Local user" } });
    await db.deploymentPlan.updateMany({ where: { releaseCandidateId: candidateId }, data: { rollbackTrigger: "", rollbackSteps: "", rollbackRole: "", rollbackVerification: "" } });
    await expect(approveRelease(setup.product.id, candidateId)).rejects.toThrow(/Rollback/);
  });

  it("keeps release approval human and stales it when the merged state changes", async () => {
    const setup = await fixture();
    const candidateId = await readyCandidate(setup.product.id);
    await expect(approveRelease(setup.product.id, candidateId, "Coding Agent")).rejects.toThrow(/person/);
    const approved = await approveRelease(setup.product.id, candidateId);
    expect(approved?.candidate?.status).toBe("APPROVED");
    expect(approved?.candidate?.approval?.stale).toBe(false);
    await db.pullRequestRecord.update({ where: { id: setup.pull.id }, data: { state: "CLOSED" } });
    const stale = await getShipView(setup.product.id);
    expect(stale?.candidate?.approval?.stale).toBe(true);
    expect(stale?.candidate?.approval?.staleReason).toContain("evidence changed");
    await expect(stageMoveBlockers(setup.product.id, "SHIP")).resolves.toEqual(["Ship stays closed until a person has approved a release candidate."]);
  });

  it("records a human deployment and withholds deployed until post-checks pass", async () => {
    const setup = await fixture();
    const candidateId = await readyCandidate(setup.product.id);
    await approveRelease(setup.product.id, candidateId);
    await expect(recordDeployment(setup.product.id, candidateId, {
      environment: "production",
      status: "SUCCEEDED",
      deployedVersion: "0.1.0",
      deployedCommitSha: sha,
      externalReference: "",
      notes: "",
    }, "Testing Agent")).rejects.toThrow(/person/);
    const recorded = await recordDeployment(setup.product.id, candidateId, {
      environment: "production",
      status: "SUCCEEDED",
      deployedVersion: "0.1.0",
      deployedCommitSha: sha,
      externalReference: "change-104",
      notes: "Deployed by the release owner.",
    });
    expect(recorded?.candidate?.status).not.toBe("DEPLOYED");
    expect(recorded?.candidate?.deployments[0]?.status).toBe("SUCCEEDED");
    const check = recorded?.candidate?.plan?.checks.find((item) => item.name === "Health check");
    expect(check).toBeTruthy();
    await expect(completeDeploymentCheck(setup.product.id, check?.id ?? "", "WAIVED", "")).rejects.toThrow(/rationale/);
    const deployed = await completeDeploymentCheck(setup.product.id, check?.id ?? "", "PASSED", "");
    expect(deployed?.candidate?.status).toBe("DEPLOYED");
    expect(deployed?.candidate?.releaseOutcome?.deploymentSuccessful).toBe(true);
    const outcome = await db.productOutcome.findUnique({ where: { id: setup.outcome.id } });
    expect(outcome?.status).toBe("CONFIRMED");
    await expect(stageMoveBlockers(setup.product.id, "LEARN")).resolves.toEqual([]);
    const learned = await getLearnView(setup.product.id);
    expect(learned?.readyToLearn.ready).toBe(true);
  });

  it("keeps a failed deployment when rollback is recorded", async () => {
    const setup = await fixture();
    const candidateId = await readyCandidate(setup.product.id);
    await approveRelease(setup.product.id, candidateId);
    await recordDeployment(setup.product.id, candidateId, {
      environment: "production",
      status: "FAILED",
      deployedVersion: "0.1.0",
      deployedCommitSha: "",
      externalReference: "pipeline-9",
      notes: "The health check failed.",
    });
    const rolled = await recordRollback(setup.product.id, candidateId, "Restored the previous build after the health check failed.");
    expect(rolled?.candidate?.status).toBe("FAILED");
    expect(rolled?.candidate?.deployments.map((record) => record.status).sort()).toEqual(["FAILED", "ROLLED_BACK"]);
    expect(rolled?.readyToLearn.ready).toBe(false);
  });

  it("blocks Learn while a critical release issue is open", async () => {
    const setup = await fixture();
    const candidateId = await readyCandidate(setup.product.id);
    await approveRelease(setup.product.id, candidateId);
    await recordDeployment(setup.product.id, candidateId, {
      environment: "production",
      status: "SUCCEEDED",
      deployedVersion: "0.1.0",
      deployedCommitSha: sha,
      externalReference: "change-105",
      notes: "Deployed by the release owner.",
    });
    const issue = await createReleaseIssue(setup.product.id, candidateId, { severity: "CRITICAL", category: "FUNCTIONAL", description: "Customers cannot submit a claim." });
    const check = issue?.candidate?.plan?.checks.find((item) => item.name === "Health check");
    const blocked = await completeDeploymentCheck(setup.product.id, check?.id ?? "", "PASSED", "");
    expect(blocked?.candidate?.status).not.toBe("DEPLOYED");
    const stored = blocked?.candidate?.issues[0];
    const cleared = await resolveReleaseIssue(setup.product.id, stored?.id ?? "", "RESOLVED");
    expect(cleared?.candidate?.status).toBe("DEPLOYED");
  });

  it("records observations and learning without approving new scope or achieving an outcome", async () => {
    const setup = await fixture();
    await expect(markOutcomeAchieved(setup.product.id, setup.outcome.id, "Customers now submit claims digitally.", "Coding Agent")).rejects.toThrow(/person/);
    await recordOutcomeObservation(setup.product.id, {
      outcomeId: setup.outcome.id,
      measure: "Percentage of eligible claims submitted digitally.",
      value: "DEMO / SAMPLE",
      unit: "%",
      source: "HUMAN",
      notes: "Sample only.",
    });
    const unchanged = await db.productOutcome.findUnique({ where: { id: setup.outcome.id } });
    expect(unchanged?.status).toBe("CONFIRMED");
    await expect(recordAssumptionFeedback(setup.product.id, setup.assumption.id, "REQUIREMENT", "VALIDATED", "Interviews after release.", "Architecture Agent")).rejects.toThrow(/person/);
    await recordAssumptionFeedback(setup.product.id, setup.assumption.id, "REQUIREMENT", "VALIDATED", "Interviews after release showed customers submitted the notice.");
    const assumption = await db.requirementAssumption.findUnique({ where: { id: setup.assumption.id } });
    expect(assumption?.status).toBe("VALIDATED");
    const learned = await createLearningRecord(setup.product.id, {
      outcomeId: setup.outcome.id,
      observation: "Digital submission is being used by a small group.",
      interpretation: "We need another slice before calling the outcome achieved.",
      decision: "ITERATE",
      proposalKind: "REQUIREMENT",
      proposalTitle: "Show claim status after submission",
      proposalDescription: "A follow-up story.",
    });
    const proposal = learned?.records[0]?.proposals[0];
    expect(proposal?.status).toBe("PROPOSED");
    await confirmLearningProposal(setup.product.id, proposal?.id ?? "");
    const story = await db.workItem.findFirst({ where: { productId: setup.product.id, title: "Show claim status after submission" } });
    expect(story?.status).toBe("DRAFT");
    expect(story?.status).not.toBe("DONE");
  });

  it("does not let a model narrative approve the release", async () => {
    const setup = await fixture();
    const candidateId = await readyCandidate(setup.product.id);
    const provider: AIProvider = {
      async generate() {
        return {
          data: { summary: "Approve this release now.", missingEvidence: [], operationalConcerns: [], rollbackConcerns: [], conditions: [] } as never,
          usage: { inputTokens: 1, outputTokens: 1 },
          model: "test",
        };
      },
    };
    setAIProviderForTests(provider);
    const reviewed = await reviewRelease(setup.product.id, candidateId);
    expect(reviewed?.candidate?.status).not.toBe("APPROVED");
    expect(reviewed?.candidate?.risk?.narrative).toContain("Approve this release now.");
    const runs = await db.agentRun.count({ where: { productId: setup.product.id } });
    expect(runs).toBe(0);
  });

  it("accepts a high risk only with a human rationale", async () => {
    const setup = await fixture();
    const candidateId = await readyCandidate(setup.product.id);
    await db.workItem.create({ data: { productId: setup.product.id, title: "Slow submission", type: "DEFECT", priority: "HIGH", status: "READY" } });
    const viewed = await getShipView(setup.product.id);
    const factor = viewed?.candidate?.risk?.factors.find((item) => item.description === "A high defect is open.");
    expect(factor?.blocking).toBe(true);
    await expect(acceptReleaseRisk(setup.product.id, factor?.id ?? "", "short")).rejects.toThrow(/rationale/);
    await acceptReleaseRisk(setup.product.id, factor?.id ?? "", "The release owner accepts the slow path for this window.");
    const accepted = await getShipView(setup.product.id);
    expect(accepted?.candidate?.risk?.factors.find((item) => item.id === factor?.id)?.status).toBe("ACCEPTED");
    expect(candidateId).toBeTruthy();
  });
});
