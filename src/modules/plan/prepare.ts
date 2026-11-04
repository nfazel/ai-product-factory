import "server-only";

import { db } from "@/lib/db";
import { AIFailure } from "@/modules/ai/failures";
import { recordActivity } from "@/modules/activity/service";
import { findCurrentBrief } from "@/modules/discovery/repository";
import { moveDiscoveryToDefine } from "@/modules/discovery/service";
import { findProductRow } from "@/modules/product/repository";
import { findOpenProposal } from "@/modules/requirements/repository";
import { selectDefinitionCandidate } from "@/modules/requirements/candidate-selection";
import { acceptEntireProposal, commitProductDefinition, generateProductDefinition } from "@/modules/requirements/service";
import { DomainError } from "@/modules/shared/errors";

/**
 * After the brief is approved, drafts the features without anyone pressing the buttons in between: moves the product on, asks the
 * Requirements Agent for a definition, and commits its proposal as a draft. Nothing is confirmed or approved here. The outcomes,
 * capabilities and first slice stay drafts for the person to review on the Plan page. Each step is the same service call its
 * button makes, so every rule and refusal is unchanged, and it looks at the real state again after each step so it can be stopped
 * and started again anywhere.
 */
export type PrepareOutcome = { status: "DRAFTED" } | { status: "NEEDS_YOU"; step: string; reason: string };

type Action = "move-to-define" | "generate-definition" | "select-candidate" | "accept-proposal" | "commit-proposal";
type Next = { kind: Action } | { kind: "done" } | { kind: "needs-you"; step: string; reason: string };

const MAX_RETRIES = 2;
const MAX_TURNS = 12;

export async function nextPrepareAction(productId: string): Promise<Next> {
  const product = await findProductRow(productId);
  if (!product) return { kind: "needs-you", step: "product", reason: "The product was not found." };
  const brief = await findCurrentBrief(productId);
  if (!brief || brief.status !== "APPROVED") return { kind: "needs-you", step: "brief", reason: "Approve the product brief first. The features are drafted from it." };

  // Anything already on the backlog means the features are drafted, whether by this run or by hand.
  const drafted = (await db.productOutcome.count({ where: { productId } })) + (await db.workItem.count({ where: { productId } })) > 0;
  if (drafted) return { kind: "done" };

  if (product.currentStage === "EXPLORE") return { kind: "move-to-define" };
  if (product.currentStage !== "DEFINE") return { kind: "needs-you", step: "stage", reason: `The product is in ${product.currentStage}, so its features cannot be drafted from here.` };
  if (await findOpenProposal(productId)) return { kind: "accept-proposal" };
  // The Requirements Agent publishes an immutable candidate. Selecting it makes a reviewable proposal. A definition may be generated
  // once from a clean start, so an existing candidate is never asked for again.
  const candidate = await db.planningPublication.findFirst({ where: { productId, purpose: "DEFINITION_PROPOSAL" }, orderBy: { createdAt: "desc" }, select: { id: true, selection: { select: { id: true } } } });
  if (candidate && !candidate.selection) return { kind: "select-candidate" };
  if (candidate) return { kind: "done" };
  return { kind: "generate-definition" };
}

export async function prepareFeatures(productId: string): Promise<PrepareOutcome> {
  const attempts = new Map<string, number>();
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const next = await nextPrepareAction(productId);
    if (next.kind === "done") return { status: "DRAFTED" };
    if (next.kind === "needs-you") return { status: "NEEDS_YOU", step: next.step, reason: next.reason };
    // Accepting and committing the proposal are one step as far as the retry limit goes.
    const key = next.kind === "commit-proposal" ? "accept-proposal" : next.kind;
    try {
      await perform(productId, next.kind);
      attempts.delete(key);
    } catch (error) {
      const used = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, used);
      if (error instanceof AIFailure && used <= MAX_RETRIES) continue;
      const reason = error instanceof DomainError ? error.message : "Something went wrong. Nothing was changed by that step.";
      if (!(error instanceof DomainError)) console.error(error);
      return { status: "NEEDS_YOU", step: next.kind, reason: error instanceof AIFailure ? `${reason} It was tried ${used} times.` : reason };
    }
  }
  return { status: "NEEDS_YOU", step: "run", reason: "Drafting the features did not finish within its step limit." };
}

async function perform(productId: string, action: Action) {
  switch (action) {
    case "move-to-define":
      await moveDiscoveryToDefine(productId);
      return;
    case "generate-definition":
      await generateProductDefinition(productId);
      return;
    case "select-candidate": {
      const candidate = await db.planningPublication.findFirst({ where: { productId, purpose: "DEFINITION_PROPOSAL", selection: null }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (!candidate) return;
      // The run selects the candidate it just generated, as a draft. It is recorded as the run, never as a person.
      await selectDefinitionCandidate({ productId, publicationId: candidate.id, selector: { name: "Plan run", kind: "PLAN_RUN" } });
      return;
    }
    case "accept-proposal":
    case "commit-proposal": {
      const proposal = await findOpenProposal(productId);
      if (!proposal) return;
      await acceptEntireProposal(productId, proposal.id);
      await commitProductDefinition(productId, proposal.id);
      // The two calls above are worded as a person's review. Say what actually happened.
      await recordActivity({
        productId,
        type: "DEFINITION_COMMITTED",
        description: "The Plan run committed the Requirements Agent's proposal as a draft. Nothing is confirmed or approved; a person reviews the outcomes, capabilities and first slice.",
        actor: "Plan run",
      });
      return;
    }
  }
}
