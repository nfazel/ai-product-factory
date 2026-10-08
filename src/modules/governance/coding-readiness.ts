import "server-only";

import { db } from "@/lib/db";
import { findCurrentBrief } from "@/modules/discovery/repository";
import { DomainError } from "@/modules/shared/errors";

export type CodingReadiness = {
  ready: boolean;
  label: "CODING READY" | "NOT READY";
  briefApproved: boolean;
  definitionApproved: boolean;
  sliceApproved: boolean;
  architectureApproved: boolean;
  planApproved: boolean;
  governanceApproved: boolean;
  policyApproved: boolean;
  governanceReviewRequired: boolean;
  governanceReviewReason: string;
  governanceReviewFlaggedAt: string | null;
  policyReapprovalRequired: boolean;
  policyReapprovalReason: string;
  policyReapprovalFlaggedAt: string | null;
  blockers: string[];
};

export async function assessCodingReadiness(productId: string): Promise<CodingReadiness> {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new DomainError("Product not found.", "NOT_FOUND");

  const [brief, definition, definitionApproval, slice, architecture, architectureApproval, plan, planApproval, review, governanceApproval, policyApproval] =
    await Promise.all([
      findCurrentBrief(productId),
      db.productDefinition.findUnique({ where: { productId } }),
      db.approval.findFirst({
        where: { productId, approvalType: "PRODUCT_DEFINITION", status: "APPROVED" },
      }),
      db.productSlice.findFirst({
        where: { productId, status: "APPROVED" },
        orderBy: { createdAt: "asc" },
      }),
      db.solutionArchitecture.findFirst({
        where: { productId, status: "APPROVED" },
        orderBy: { version: "desc" },
      }),
      db.approval.findFirst({
        where: { productId, approvalType: "SOLUTION_ARCHITECTURE", status: "APPROVED" },
      }),
      db.implementationPlan.findFirst({
        where: { productId, status: "APPROVED" },
        orderBy: { version: "desc" },
      }),
      db.approval.findFirst({
        where: { productId, approvalType: "IMPLEMENTATION_PLAN", status: "APPROVED" },
      }),
      db.engineeringGovernanceReview.findFirst({
        where: { productId, status: { not: "SUPERSEDED" } },
        orderBy: { version: "desc" },
        include: { findings: true, questions: true, codingRisks: true, policy: true },
      }),
      db.approval.findFirst({
        where: { productId, approvalType: "ENGINEERING_GOVERNANCE", status: "APPROVED" },
      }),
      db.approval.findFirst({
        where: { productId, approvalType: "CODING_POLICY", status: "APPROVED" },
      }),
    ]);

  const briefApproved = brief?.status === "APPROVED";
  const definitionApproved = definition?.status === "APPROVED" && Boolean(definitionApproval);
  const sliceApproved = Boolean(slice);
  const architectureApproved = Boolean(architecture && architectureApproval);
  const planApproved = Boolean(plan && planApproval);
  const reviewApproved =
    review?.status === "APPROVED" && Boolean(governanceApproval) && !review.reviewRequired;
  const policy = review?.policy ?? null;
  const policyApproved = Boolean(policyApproval) && !policy?.reapprovalRequired;

  const blockers: string[] = [];
  if (product.currentStage !== "BUILD") {
    blockers.push(
      `The product is in ${product.currentStage}. Coding readiness applies during BUILD.`,
    );
  }
  if (!briefApproved) blockers.push("An approved Product Brief is required.");
  if (!definitionApproved) blockers.push("An approved Product Definition is required.");
  if (!sliceApproved) blockers.push("An approved First Product Slice is required.");
  if (!architectureApproved) blockers.push("An approved Solution Architecture is required.");
  if (!planApproved) blockers.push("An approved Implementation Plan is required.");

  if (review?.reviewRequired) {
    blockers.push(
      `GOVERNANCE REVIEW REQUIRED. ${review.reviewReason}`.trim(),
    );
  } else if (!reviewApproved) {
    blockers.push("Engineering Governance is not approved.");
  }

  if (policy?.reapprovalRequired) {
    blockers.push(`CODING POLICY REAPPROVAL REQUIRED. ${policy.reapprovalReason}`.trim());
  } else if (!policyApproved) {
    blockers.push("Coding Policy is not approved.");
  }

  if (review) {
    if (review.findings.some((finding) => finding.severity === "CRITICAL" && finding.status === "OPEN")) {
      blockers.push("A CRITICAL governance finding is open.");
    }
    if (
      review.findings.some(
        (finding) =>
          finding.severity === "HIGH" && finding.dueBeforeCoding && finding.status === "OPEN",
      )
    ) {
      blockers.push("A HIGH governance finding is due before coding and is still open.");
    }
    if (
      review.codingRisks.some((risk) => {
        const level = risk.overrideRiskLevel ?? risk.riskLevel;
        return level === "PROHIBITED" && risk.overriddenBy.trim().length === 0;
      })
    ) {
      blockers.push("A PROHIBITED coding task has no human resolution.");
    }
    if (review.questions.some((question) => question.blocking && question.status === "OPEN")) {
      blockers.push("A blocking governance question is open.");
    }
  }

  const ready = blockers.length === 0;
  return {
    ready,
    label: ready ? "CODING READY" : "NOT READY",
    briefApproved,
    definitionApproved,
    sliceApproved,
    architectureApproved,
    planApproved,
    governanceApproved: reviewApproved,
    policyApproved,
    governanceReviewRequired: Boolean(review?.reviewRequired),
    governanceReviewReason: review?.reviewReason ?? "",
    governanceReviewFlaggedAt: review?.reviewFlaggedAt?.toISOString() ?? null,
    policyReapprovalRequired: Boolean(policy?.reapprovalRequired),
    policyReapprovalReason: policy?.reapprovalReason ?? "",
    policyReapprovalFlaggedAt: policy?.reapprovalFlaggedAt?.toISOString() ?? null,
    blockers,
  };
}
