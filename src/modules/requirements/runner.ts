import "server-only";

import { AGENT_CATALOG } from "@/domain/constants";
import { getAIProvider, isAIConfigured } from "@/modules/ai/provider";
import { definitionEntryBlockers } from "@/modules/requirements/gates";
import {
  REQUIREMENTS_SYSTEM_PROMPT,
  requirementsMessages,
} from "@/modules/requirements/prompt";
import { mergeRegeneratedSection } from "@/modules/requirements/proposal";
import {
  findOpenProposal,
  insertProposal,
  listRecentRequirementRuns,
  saveProposalPayload,
  saveReviewSummary,
} from "@/modules/requirements/repository";
import {
  requirementsResponseSchema,
  toStoredProposal,
} from "@/modules/requirements/schema";
import { assertProposalReferences } from "@/modules/requirements/validate";
import { listDecisions } from "@/modules/decision/service";
import { db } from "@/lib/db";
import { DomainError } from "@/modules/shared/errors";
import type { AgentRunner } from "@/modules/agent/types";
import type { DefinitionSection } from "@/domain/constants";

const refusal =
  "The requirements agent returned a response that did not match the required definition structure. Nothing was written to the product definition. You can retry.";

export const requirementsRunner: AgentRunner = {
  agentType: "REQUIREMENTS",
  isConfigured() {
    return isAIConfigured();
  },
  async execute(request) {
    const gate = await definitionEntryBlockers(request.productId);
    if (gate.reasons.length > 0 || !gate.brief) {
      throw new DomainError(gate.reasons.join(" "));
    }

    const mode =
      request.input.mode === "regenerate" || request.input.mode === "review"
        ? request.input.mode
        : "generate";
    const section =
      typeof request.input.section === "string" ? request.input.section : undefined;
    const open = await findOpenProposal(request.productId);
    if (mode === "regenerate" && !open) {
      throw new DomainError("There is no open proposal to regenerate.");
    }

    const [decisions, runs, workItems, outcomes, capabilities, assumptions] =
      await Promise.all([
        listDecisions({ productId: request.productId }),
        listRecentRequirementRuns(request.productId),
        db.workItem.findMany({
          where: { productId: request.productId },
          select: { type: true, title: true, provenance: true, humanLocked: true },
        }),
        db.productOutcome.findMany({
          where: { productId: request.productId },
          select: { title: true, status: true, humanLocked: true },
        }),
        db.productCapability.findMany({
          where: { productId: request.productId },
          select: { name: true, status: true, humanLocked: true },
        }),
        db.requirementAssumption.findMany({
          where: { productId: request.productId },
          select: { description: true, impact: true, status: true, origin: true },
        }),
      ]);

    const brief = gate.brief;
    const texts = (items: { text: string }[]) => items.map((item) => item.text);
    const provider = getAIProvider();
    const result = await provider.generate({
      systemPrompt: REQUIREMENTS_SYSTEM_PROMPT,
      messages: requirementsMessages({
        productName: gate.product.name,
        stage: gate.product.currentStage,
        brief: {
          version: brief.version,
          status: brief.status,
          problemStatement: brief.problemStatement,
          productVision: brief.productVision,
          valueProposition: brief.valueProposition,
          targetUsers: texts(brief.targetUsers),
          userNeeds: texts(brief.userNeeds),
          desiredOutcomes: texts(brief.desiredOutcomes),
          inScope: texts(brief.inScope),
          outOfScope: texts(brief.outOfScope),
          constraints: texts(brief.constraints),
          risks: texts(brief.risks),
          successMeasures: texts(brief.successMeasures),
          openQuestions: texts(brief.openQuestions),
        },
        assumptions: [
          ...brief.assumptions.map((item) => ({
            description: item.description,
            impact: item.impact,
            status: item.status,
            origin: item.origin,
          })),
          ...assumptions,
        ],
        decisions: decisions.map((item) => ({
          title: item.title,
          decision: item.decision,
          reason: item.reason,
        })),
        workItems,
        outcomes,
        capabilities,
        previousRuns: runs.map((run) => ({
          status: run.status,
          summary:
            run.output &&
            typeof run.output === "object" &&
            run.output !== null &&
            "summary" in run.output &&
            typeof run.output.summary === "string"
              ? run.output.summary
              : run.status,
        })),
        mode,
        section,
        currentProposalSummary: open?.summary,
      }),
      responseSchema: requirementsResponseSchema,
      schemaName: "product_definition",
      temperature: 0.2,
    });

    const parsed = requirementsResponseSchema.safeParse(result.data);
    if (!parsed.success) throw new DomainError(refusal);

    if (mode === "review") {
      await saveReviewSummary(request.productId, parsed.data.assistantSummary);
      return {
        output: {
          mode,
          summary: parsed.data.assistantSummary,
          usage: result.usage,
          model: result.model,
          approved: false,
        },
        estimatedCost: null,
      };
    }

    const stored =
      mode === "regenerate" && open
        ? mergeRegeneratedSection(open.payload, parsed.data, section as DefinitionSection)
        : toStoredProposal(parsed.data);

    try {
      assertProposalReferences(stored);
    } catch (error) {
      if (error instanceof DomainError) {
        throw new DomainError(`${error.message} The product definition was not changed.`);
      }
      throw error;
    }

    const proposal =
      mode === "regenerate" && open
        ? await saveProposalPayload(open.id, stored, open.status === "PARTIALLY_COMMITTED" ? "PARTIALLY_COMMITTED" : "OPEN")
        : await insertProposal({
            productId: request.productId,
            summary: stored.assistantSummary,
            payload: stored,
          });

    return {
      output: {
        mode,
        proposalId: proposal.id,
        summary: stored.assistantSummary,
        usage: result.usage,
        model: result.model,
        actor: AGENT_CATALOG.REQUIREMENTS.name,
        approved: false,
      },
      estimatedCost: null,
    };
  },
};
