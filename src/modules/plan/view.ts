import "server-only";

import { db } from "@/lib/db";
import { draftState, sectionState, type ApprovalFact, type DraftState, type SectionState } from "@/modules/plan/presentation";
import { preparationState } from "@/modules/plan/prepare-runner";

export type PlanSection = { key: string; title: string; state: SectionState; approvedBy: string | null; detailsHref: string; detailsLabel: string };

export type PlanView = {
  productId: string;
  draft: { state: DraftState; reason: string };
  sections: PlanSection[];
  brief: { problem: string; vision: string; value: string; users: string } | null;
  outcomes: { title: string; measure: string }[];
  features: { id: string; title: string; stories: { id: string; title: string; criteria: string[] }[] }[];
  architecture: { summary: string; style: string; components: string[] } | null;
  tasks: { id: string; title: string; risk: string | null }[];
  rules: { allowed: string[]; restricted: string[]; checks: string[]; maxFiles: number | null } | null;
  openPoints: { kind: "Question" | "Assumption"; text: string; why: string }[];
};

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/** Cheap reads only: the Build page is already heavy, and this page should open at once. */
export async function getPlanView(productId: string): Promise<PlanView | null> {
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, targetUsers: true } });
  if (!product) return null;

  const latestApproval = async (approvalType: string): Promise<ApprovalFact> => {
    const row = await db.approval.findFirst({ where: { productId, approvalType }, orderBy: { requestedAt: "desc" }, select: { status: true, approvedBy: true, resolvedAt: true } });
    return row;
  };

  const [brief, outcomes, items, architecture, plan, policy, questions, assumptions, approvals] = await Promise.all([
    db.productBrief.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } }),
    db.productOutcome.findMany({ where: { productId }, orderBy: { createdAt: "asc" }, select: { title: true, successMeasure: true } }),
    db.workItem.findMany({ where: { productId, type: { in: ["FEATURE", "STORY"] } }, orderBy: { createdAt: "asc" }, include: { acceptanceCriteria: { orderBy: { id: "asc" } } } }),
    db.solutionArchitecture.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" }, include: { components: { select: { name: true } } } }),
    db.implementationPlan.findFirst({ where: { productId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" }, include: { tasks: { orderBy: { id: "asc" }, select: { id: true, title: true } } } }),
    db.codingPolicy.findFirst({ where: { productId }, orderBy: { createdAt: "desc" } }),
    db.requirementQuestion.findMany({ where: { productId, status: "OPEN" }, orderBy: { createdAt: "asc" }, select: { question: true, reason: true } }),
    db.requirementAssumption.findMany({ where: { productId, status: "UNVALIDATED" }, orderBy: { createdAt: "asc" }, select: { description: true, impact: true } }),
    Promise.all(["PRODUCT_DISCOVERY", "PRODUCT_DEFINITION", "SOLUTION_ARCHITECTURE", "IMPLEMENTATION_PLAN", "CODING_POLICY"].map(async (type) => [type, await latestApproval(type)] as const)),
  ]);
  const approval = new Map(approvals);

  const risks = plan ? await db.codingRiskAssessment.findMany({ where: { implementationTaskId: { in: plan.tasks.map((task) => task.id) } }, orderBy: { createdAt: "desc" }, select: { implementationTaskId: true, riskLevel: true } }) : [];
  const riskOf = (taskId: string) => risks.find((risk) => risk.implementationTaskId === taskId)?.riskLevel ?? null;

  const features = items.filter((item) => item.type === "FEATURE").map((feature) => ({
    id: feature.id,
    title: feature.title,
    stories: items.filter((item) => item.type === "STORY" && item.parentId === feature.id).map((story) => ({ id: story.id, title: story.title, criteria: story.acceptanceCriteria.map((criterion) => criterion.description) })),
  }));

  const section = (key: string, title: string, exists: boolean, type: string, detailsHref: string, detailsLabel: string): PlanSection => {
    const fact = approval.get(type) ?? null;
    return { key, title, state: sectionState({ exists, approval: fact }), approvedBy: fact?.status === "APPROVED" ? fact.approvedBy : null, detailsHref, detailsLabel };
  };
  const base = `/products/${productId}`;
  const prepared = preparationState(productId);
  const candidate = (await db.planningPublication.count({ where: { productId, purpose: "DEFINITION_PROPOSAL" } })) > 0;
  const failure = prepared.last?.status === "NEEDS_YOU" ? prepared.last.reason : "";
  return {
    productId,
    draft: {
      state: draftState({ briefStatus: brief?.status ?? null, briefReadyForReview: Boolean(brief?.readyForReview), drafted: outcomes.length > 0 || items.length > 0, candidate, running: prepared.running, failure }),
      reason: failure,
    },
    sections: [
      section("brief", "What this is", Boolean(brief), "PRODUCT_DISCOVERY", `${base}/discovery`, "Open the brief"),
      section("features", "What it will do", features.length > 0, "PRODUCT_DEFINITION", `${base}/definition`, "Open the definition"),
      section("architecture", "How it will be built", Boolean(architecture), "SOLUTION_ARCHITECTURE", `${base}/design`, "Open the design"),
      section("work", "The work", Boolean(plan && plan.tasks.length > 0), "IMPLEMENTATION_PLAN", `${base}/build#delivery-plan`, "Open the delivery plan"),
      section("rules", "The rules", Boolean(policy), "CODING_POLICY", `${base}/build#engineering-review`, "Open the coding rules"),
    ],
    brief: brief ? { problem: brief.problemStatement, vision: brief.productVision, value: brief.valueProposition, users: product.targetUsers } : null,
    outcomes: outcomes.map((outcome) => ({ title: outcome.title, measure: outcome.successMeasure })),
    features,
    architecture: architecture ? { summary: architecture.summary, style: architecture.architectureStyle, components: architecture.components.map((component) => component.name) } : null,
    tasks: plan ? plan.tasks.map((task) => ({ id: task.id, title: task.title, risk: riskOf(task.id) })) : [],
    rules: policy ? { allowed: strings(policy.allowedPaths), restricted: strings(policy.restrictedPaths), checks: strings(policy.requiredChecks), maxFiles: policy.maxFilesPerTask } : null,
    openPoints: [
      ...questions.map((item) => ({ kind: "Question" as const, text: item.question, why: item.reason })),
      ...assumptions.map((item) => ({ kind: "Assumption" as const, text: item.description, why: `Not yet checked. Impact if wrong: ${item.impact.toLowerCase()}.` })),
    ],
  };
}
