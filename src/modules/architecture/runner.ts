import "server-only";

import { ARCHITECTURE_SECTIONS, type ArchitectureSection } from "@/domain/constants";
import { aiRunEvidence } from "@/modules/ai/evidence";
import { getAIProvider, isAIConfigured } from "@/modules/ai/provider";
import { loadArchitectureContext } from "@/modules/architecture/context";
import { architectureEntryBlockers, planEntryBlockers } from "@/modules/architecture/gates";
import { mergeRegeneratedSection } from "@/modules/architecture/proposal";
import {
  findOpenProposal,
  insertProposal,
  saveProposalPayload,
} from "@/modules/architecture/repository";
import { ARCHITECTURE_SYSTEM_PROMPT, architectureMessages } from "@/modules/architecture/prompt";
import {
  architectureResponseSchema,
  toStoredArchitecture,
} from "@/modules/architecture/schema";
import { assertArchitectureGraph } from "@/modules/architecture/validate";
import type { AgentRunner } from "@/modules/agent/types";
import { DomainError } from "@/modules/shared/errors";

const refusal =
  "The Architecture Agent returned a response that did not match the required structure. Nothing was written. You can retry.";

function asSection(value: unknown): ArchitectureSection | undefined {
  return ARCHITECTURE_SECTIONS.find((section) => section === value);
}

export const architectureRunner: AgentRunner = {
  agentType: "ARCHITECTURE",
  isConfigured() {
    return isAIConfigured();
  },
  async execute(request) {
    const mode =
      request.input.mode === "regenerate" ||
      request.input.mode === "review" ||
      request.input.mode === "plan"
        ? request.input.mode
        : "generate";
    const gate =
      mode === "plan"
        ? await planEntryBlockers(request.productId)
        : await architectureEntryBlockers(request.productId);
    if (gate.reasons.length > 0) {
      throw new DomainError(gate.reasons.join(" "));
    }

    const kind = mode === "plan" ? "IMPLEMENTATION_PLAN" : "ARCHITECTURE";
    const open = await findOpenProposal(request.productId, kind);
    const section = asSection(request.input.section);
    if (mode === "regenerate" && !open) {
      throw new DomainError("There is no open proposal to regenerate.");
    }
    if (mode === "regenerate" && !section) {
      throw new DomainError("Choose a section to regenerate.");
    }

    const context = await loadArchitectureContext(request.productId);
    const provider = await getAIProvider();
    const result = await provider.generate({
      systemPrompt: ARCHITECTURE_SYSTEM_PROMPT,
      messages: architectureMessages({
        mode,
        section,
        featureTitle:
          typeof request.input.featureTitle === "string" ? request.input.featureTitle : "",
        productName: gate.product.name,
        stage: gate.product.currentStage,
        context,
      }),
      responseSchema: architectureResponseSchema,
      schemaName: "solution_architecture",
      temperature: 0.2,
    });

    const parsed = architectureResponseSchema.safeParse(result.data);
    if (!parsed.success) throw new DomainError(refusal);

    const refs = {
      nfrIds: new Set(context.nonFunctionalRequirements.map((item) => item.id)),
      capabilityIds: new Set(context.capabilities.map((item) => item.id)),
      workItemIds: new Set(context.workItems.map((item) => item.id)),
    };
    assertArchitectureGraph(parsed.data, refs);

    if (mode === "review") {
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

    const stored =
      mode === "regenerate" && open
        ? mergeRegeneratedSection(
            open.payload,
            parsed.data,
            section ?? "summary",
            typeof request.input.featureTitle === "string" ? request.input.featureTitle : "",
          )
        : toStoredArchitecture(parsed.data);
    if (mode === "regenerate" && open) {
      await saveProposalPayload(open.id, stored);
    } else {
      await insertProposal({
        productId: request.productId,
        kind,
        agentRunId: null,
        summary: stored.assistantSummary,
        payload: stored,
      });
    }

    return {
      output: {
        mode,
        summary: stored.assistantSummary,
        ...aiRunEvidence(result),
        approved: false,
      },
      estimatedCost: null,
    };
  },
};
