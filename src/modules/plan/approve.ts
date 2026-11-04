import "server-only";

import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";
import { approveImplementationPlan, approveSolutionArchitecture, getCodingReadiness } from "@/modules/architecture/service";
import { findCurrentBrief } from "@/modules/discovery/repository";
import { codingRiskStillBlocks } from "@/modules/governance/coding-risk-decision";
import { approveCodingPolicy, approveGovernanceReview } from "@/modules/governance/service";
import { latestGovernanceReview } from "@/modules/governance/repository";
import {
  approveFirstSlice,
  approveProductDefinition,
  confirmNonFunctional,
  confirmProductCapability,
  confirmProductOutcome,
  moveDefinitionToBuild,
} from "@/modules/requirements/service";
import { DomainError } from "@/modules/shared/errors";

/**
 * Approving the whole plan is one decision by the person who has read the page. It records the approvals the later stages rely on,
 * in order, each through the same function its own button calls, so every existing check still applies at that moment. They are
 * the person's approvals: they read the combined content and signed it. Nothing is delegated and the AI approves nothing.
 *
 * The approvals live in different modules, so they cannot share one transaction. Every step skips what is already approved and
 * the plan only counts as approved once coding is ready, so pressing again after a stop carries on from where it was.
 */
export type PlanBlocker = { section: "brief" | "features" | "architecture" | "work" | "rules"; reason: string };

const READY = ["READY_FOR_REVIEW", "APPROVED"];

/** Everything that can be known to stop the approval before anything is recorded, by section. Reads only. */
export async function planApprovalBlockers(productId: string): Promise<PlanBlocker[]> {
  const blockers: PlanBlocker[] = [];
  const brief = await findCurrentBrief(productId);
  if (brief?.status !== "APPROVED") blockers.push({ section: "brief", reason: "The brief is not approved yet." });
  const [outcomes, slice, architecture, plan, review] = await Promise.all([
    db.productOutcome.count({ where: { productId, status: { not: "RETIRED" } } }),
    db.productSlice.findFirst({ where: { productId }, select: { id: true } }),
    db.solutionArchitecture.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" }, select: { status: true } }),
    db.implementationPlan.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" }, select: { status: true, _count: { select: { tasks: true } } } }),
    latestGovernanceReview(productId),
  ]);
  if (outcomes === 0) blockers.push({ section: "features", reason: "There are no outcomes yet." });
  if (!slice) blockers.push({ section: "features", reason: "There is no first slice yet." });
  if (!architecture || !READY.includes(architecture.status)) blockers.push({ section: "architecture", reason: "The design is not drafted and ready yet." });
  if (!plan || !READY.includes(plan.status) || plan._count.tasks === 0) blockers.push({ section: "work", reason: "The work is not drafted and ready yet." });
  if (!review || !READY.includes(review.status) || !review.policy) blockers.push({ section: "rules", reason: "The review and coding rules are not drafted and ready yet." });
  if (review) {
    const full = await db.engineeringGovernanceReview.findUnique({ where: { id: review.id }, include: { findings: true, questions: true, codingRisks: true } });
    if (full?.findings.some((finding) => finding.severity === "CRITICAL" && finding.status === "OPEN")) blockers.push({ section: "rules", reason: "A critical finding in the review is still open." });
    if (full?.findings.some((finding) => finding.severity === "HIGH" && finding.dueBeforeCoding && finding.status === "OPEN")) blockers.push({ section: "rules", reason: "A high finding that must be settled before coding is still open." });
    if (full?.questions.some((question) => question.blocking && question.status === "OPEN")) blockers.push({ section: "rules", reason: "A question that blocks coding is still unanswered." });
    if (full?.codingRisks.some((risk) => codingRiskStillBlocks(risk))) blockers.push({ section: "work", reason: "A task is marked prohibited and is still open." });
  }
  return blockers;
}

export type PlanApproval = { bundleId: string; planId: string; recorded: string[] };

export async function approvePlan(productId: string): Promise<PlanApproval> {
  const blockers = await planApprovalBlockers(productId);
  if (blockers.length > 0) throw new DomainError(`The plan cannot be approved yet. ${blockers.map((blocker) => blocker.reason).join(" ")} Nothing was approved.`);

  const bundleId = crypto.randomUUID();
  const recorded: string[] = [];
  const step = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      const why = error instanceof DomainError ? error.message : "Something went wrong.";
      if (!(error instanceof DomainError)) console.error(error);
      const so_far = recorded.length > 0 ? ` Already recorded: ${recorded.join(", ")}.` : "";
      throw new DomainError(`Stopped at "${label}": ${why}${so_far} Nothing else was approved. Press approve again to carry on from here.`);
    }
    recorded.push(label);
    await recordActivity({ productId, type: "WHOLE_PLAN_APPROVED", description: `Approved ${label} as part of plan approval ${bundleId}.` });
  };

  const definition = await db.productDefinition.findUnique({ where: { productId } });
  const definitionApproved = definition?.status === "APPROVED" && Boolean(await db.approval.findFirst({ where: { productId, approvalType: "PRODUCT_DEFINITION", status: "APPROVED" } }));
  if (!definitionApproved) {
    await step("the features and first slice", async () => {
      for (const outcome of await db.productOutcome.findMany({ where: { productId, status: "PROPOSED" }, select: { id: true } })) await confirmProductOutcome(productId, outcome.id);
      for (const capability of await db.productCapability.findMany({ where: { productId, status: "PROPOSED" }, select: { id: true } })) await confirmProductCapability(productId, capability.id);
      for (const nfr of await db.nonFunctionalRequirement.findMany({ where: { productId, status: "PROPOSED" }, select: { id: true } })) await confirmNonFunctional(productId, nfr.id);
      if (!(await db.productSlice.findFirst({ where: { productId, status: { in: ["APPROVED", "IN_PROGRESS", "COMPLETED"] } } }))) {
        const slice = await db.productSlice.findFirst({ where: { productId }, orderBy: { createdAt: "asc" }, select: { id: true } });
        if (slice) await approveFirstSlice(productId, slice.id);
      }
      await approveProductDefinition(productId);
    });
  }
  if ((await db.product.findUniqueOrThrow({ where: { id: productId }, select: { currentStage: true } })).currentStage === "DEFINE") {
    await step("the move to building", () => moveDefinitionToBuild(productId));
  }

  const architecture = await db.solutionArchitecture.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" }, select: { status: true } });
  if (architecture?.status === "READY_FOR_REVIEW") await step("the design", () => approveSolutionArchitecture(productId));
  const plan = await db.implementationPlan.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" }, select: { status: true } });
  if (plan?.status === "READY_FOR_REVIEW") await step("the work", () => approveImplementationPlan(productId));
  const review = await latestGovernanceReview(productId);
  if (review?.status === "READY_FOR_REVIEW") await step("the engineering review", () => approveGovernanceReview(productId));
  const policyApproved = await db.approval.findFirst({ where: { productId, approvalType: "CODING_POLICY", status: "APPROVED" } });
  const reviewNow = await latestGovernanceReview(productId);
  if (reviewNow?.policy && (!policyApproved || reviewNow.policy.reapprovalRequired)) await step("the coding rules", () => approveCodingPolicy(productId));

  const readiness = await getCodingReadiness(productId);
  if (!readiness.ready) {
    throw new DomainError(`Everything was approved, but coding is still blocked: ${readiness.blockers.join(" ")} Recorded: ${recorded.join(", ") || "nothing new"}.`);
  }
  const approved = await db.implementationPlan.findFirstOrThrow({ where: { productId, status: "APPROVED" }, orderBy: { version: "desc" }, select: { id: true } });
  await recordActivity({ productId, type: "WHOLE_PLAN_APPROVED", description: `The plan was approved in one step (${bundleId}). Recorded now: ${recorded.join(", ") || "nothing, it was already approved"}.` });
  return { bundleId, planId: approved.id, recorded };
}
