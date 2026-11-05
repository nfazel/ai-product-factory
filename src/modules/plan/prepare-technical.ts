import "server-only";

import { db } from "@/lib/db";
import { AIFailure } from "@/modules/ai/failures";
import { recordActivity } from "@/modules/activity/service";
import {
  acceptEntireArchitectureProposal,
  commitArchitecture,
  commitImplementationPlan,
  generateArchitecture,
  generateImplementationPlan,
  markArchitectureReady,
  markPlanReady,
} from "@/modules/architecture/service";
import { findOpenProposal } from "@/modules/architecture/repository";
import { findOpenGovernanceProposal, latestGovernanceReview } from "@/modules/governance/repository";
import {
  acceptEntireGovernanceProposal,
  commitGovernanceReview,
  generateGovernanceReview,
  markGovernanceReady,
} from "@/modules/governance/service";
import { codebaseCaptured } from "@/modules/architecture/development-context";
import { DomainError } from "@/modules/shared/errors";

/**
 * Drafts the technical chain ahead of approval: the design, the delivery plan, the engineering review and the coding rules. Each
 * step is the same service call its button makes, with drafting relaxed so a part can be drafted from the drafted part before it.
 * Everything stops at "ready for review". Nothing here approves anything; the approval checks before coding are untouched.
 */
export type TechnicalOutcome = { status: "DRAFTED" } | { status: "NEEDS_YOU"; step: string; reason: string };

type Action =
  | "generate-architecture" | "accept-architecture" | "mark-architecture-ready"
  | "generate-plan" | "accept-plan" | "mark-plan-ready"
  | "generate-review" | "accept-review" | "mark-review-ready";
type Next = { kind: Action } | { kind: "done" } | { kind: "needs-you"; step: string; reason: string };

const MAX_RETRIES = 2;
const MAX_TURNS = 20;
const AHEAD = { draftAhead: true } as const;

/**
 * What the design still needs to know about where the product is built. A new application needs nothing. An existing one needs its
 * codebase described, or the design would be drafted without it. Returns the reason drafting must wait, or null.
 */
export async function developmentContextGap(productId: string): Promise<string | null> {
  const product = await db.product.findUnique({ where: { id: productId }, select: { developmentContext: true } });
  if (product?.developmentContext === "GREENFIELD") return null;
  if (product?.developmentContext !== "EXISTING_SYSTEM") return "Say whether this is a new application or builds on an existing one. The design depends on it.";
  const context = await db.codebaseContext.findUnique({ where: { productId } });
  return codebaseCaptured(context) ? null : "This builds on an existing application. Describe that codebase so the design starts from it.";
}

export async function nextTechnicalAction(productId: string): Promise<Next> {
  const features = (await db.productOutcome.count({ where: { productId } })) > 0 && (await db.workItem.count({ where: { productId, type: "FEATURE" } })) > 0;
  if (!features) return { kind: "needs-you", step: "features", reason: "The features need to be drafted before the design can be." };

  const architecture = await db.solutionArchitecture.findFirst({ where: { productId }, orderBy: { version: "desc" }, select: { status: true } });
  if (!architecture) {
    const gap = await developmentContextGap(productId);
    if (gap) return { kind: "needs-you", step: "context", reason: gap };
    if (await findOpenProposal(productId, "ARCHITECTURE")) return { kind: "accept-architecture" };
    return { kind: "generate-architecture" };
  }
  if (architecture.status === "DRAFT") return { kind: "mark-architecture-ready" };

  const plan = await db.implementationPlan.findFirst({ where: { productId }, orderBy: { version: "desc" }, select: { status: true } });
  if (!plan) {
    if (await findOpenProposal(productId, "IMPLEMENTATION_PLAN")) return { kind: "accept-plan" };
    return { kind: "generate-plan" };
  }
  if (plan.status === "DRAFT") return { kind: "mark-plan-ready" };

  const review = await latestGovernanceReview(productId);
  if (!review) {
    if (await findOpenGovernanceProposal(productId)) return { kind: "accept-review" };
    return { kind: "generate-review" };
  }
  if (review.status === "DRAFT") return { kind: "mark-review-ready" };
  return { kind: "done" };
}

export async function prepareTechnical(productId: string): Promise<TechnicalOutcome> {
  const attempts = new Map<string, number>();
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const next = await nextTechnicalAction(productId);
    if (next.kind === "done") return { status: "DRAFTED" };
    if (next.kind === "needs-you") return { status: "NEEDS_YOU", step: next.step, reason: next.reason };
    try {
      await perform(productId, next.kind);
      attempts.delete(next.kind);
    } catch (error) {
      const used = (attempts.get(next.kind) ?? 0) + 1;
      attempts.set(next.kind, used);
      if (error instanceof AIFailure && used <= MAX_RETRIES) continue;
      const reason = error instanceof DomainError ? error.message : "Something went wrong. Nothing was changed by that step.";
      if (!(error instanceof DomainError)) console.error(error);
      return { status: "NEEDS_YOU", step: next.kind, reason: error instanceof AIFailure ? `${reason} It was tried ${used} times.` : reason };
    }
  }
  return { status: "NEEDS_YOU", step: "run", reason: "Drafting the technical plan did not finish within its step limit." };
}

async function note(productId: string, what: string) {
  await recordActivity({
    productId,
    type: "ARCHITECTURE_COMMITTED",
    description: `The Plan run committed the ${what} as a draft and marked it ready for review. Nothing is approved.`,
    actor: "Plan run",
  });
}

async function perform(productId: string, action: Action) {
  switch (action) {
    case "generate-architecture":
      await generateArchitecture(productId, AHEAD);
      return;
    case "accept-architecture": {
      const proposal = await findOpenProposal(productId, "ARCHITECTURE");
      if (!proposal) return;
      await acceptEntireArchitectureProposal(productId, proposal.id);
      await commitArchitecture(productId, proposal.id, AHEAD);
      return;
    }
    case "mark-architecture-ready":
      await markArchitectureReady(productId);
      await note(productId, "design");
      return;
    case "generate-plan":
      await generateImplementationPlan(productId, AHEAD);
      return;
    case "accept-plan": {
      const proposal = await findOpenProposal(productId, "IMPLEMENTATION_PLAN");
      if (!proposal) return;
      await acceptEntireArchitectureProposal(productId, proposal.id);
      await commitImplementationPlan(productId, proposal.id, AHEAD);
      return;
    }
    case "mark-plan-ready":
      await markPlanReady(productId, AHEAD);
      await note(productId, "delivery plan");
      return;
    case "generate-review":
      await generateGovernanceReview(productId, AHEAD);
      return;
    case "accept-review": {
      const proposal = await findOpenGovernanceProposal(productId);
      if (!proposal) return;
      await acceptEntireGovernanceProposal(productId, proposal.id);
      await commitGovernanceReview(productId, proposal.id, AHEAD);
      return;
    }
    case "mark-review-ready":
      await markGovernanceReady(productId);
      await note(productId, "engineering review and coding rules");
      return;
  }
}
