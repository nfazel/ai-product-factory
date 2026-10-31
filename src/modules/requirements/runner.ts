import "server-only";

import {assertDefinitionCandidateRequest,runDefinitionCandidate} from "./candidate";
import { aiRunEvidence } from "@/modules/ai/evidence";
import { getAIProvider, isAIConfigured } from "@/modules/ai/provider";
import { definitionEntryBlockers } from "@/modules/requirements/gates";
import {
  REQUIREMENTS_SYSTEM_PROMPT,
  requirementsMessages,
} from "@/modules/requirements/prompt";
import {
  findOpenProposal,
  listRecentRequirementRuns,
  saveReviewSummary,
} from "@/modules/requirements/repository";
import {
  requirementsResponseSchema,
} from "@/modules/requirements/schema";
import { listDecisions } from "@/modules/decision/service";
import { db } from "@/lib/db";
import { definitionIntakeLines } from "@/modules/intake/service";
import { DomainError } from "@/modules/shared/errors";
import type { AgentRunner } from "@/modules/agent/types";

const refusal =
  "The requirements agent returned a response that did not match the required definition structure. Nothing was written to the product definition. You can retry.";

export const requirementsRunner: AgentRunner = {
  agentType: "REQUIREMENTS",
  isConfigured() {
    return isAIConfigured();
  },
  async assertCanRun(request) {
    if(request.input.mode!=="review") await assertDefinitionCandidateRequest(request.productId,request.input);
  },
  async execute(request) {
    if(request.input.mode!=="review") return runDefinitionCandidate(request.productId,request.input);
    const gate = await definitionEntryBlockers(request.productId);
    if (gate.reasons.length > 0 || !gate.brief) {
      throw new DomainError(gate.reasons.join(" "));
    }

    const mode = "review" as const;
    const section = undefined;
    const open = await findOpenProposal(request.productId);

    const [decisions, runs, workItems, outcomes, capabilities, assumptions, intake] =
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
        definitionIntakeLines(request.productId),
      ]);

    const brief = gate.brief;
    const texts = (items: { text: string }[]) => items.map((item) => item.text);
    const provider = await getAIProvider();
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
        confirmedRequirements: intake.confirmed,
        rejectedRequirements: intake.rejected,
        intakeWarnings: intake.warnings,
        currentProposalSummary: open?.summary,
      }),
      responseSchema: requirementsResponseSchema,
      schemaName: "product_definition",
      purpose: "the Product Definition",
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
          ...aiRunEvidence(result),
          approved: false,
        },
        estimatedCost: null,
      };
    }

    throw new DomainError("Unsupported commentary operation.");
  },
};
