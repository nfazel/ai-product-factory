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
import { presentForModel, translateArchitectureReferences } from "@/modules/traceability/references";
import { generateResolved } from "@/modules/traceability/repair";
import { assignMissingReferenceCodes, citedFromContext } from "@/modules/traceability/store";

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

    await assignMissingReferenceCodes(request.productId);
    const context = await loadArchitectureContext(request.productId);
    const records = citedFromContext({
      nfrs: context.nonFunctionalRequirements,
      workItems: context.workItems,
      assumptions: context.assumptions,
      capabilities: context.capabilities,
      components: context.approvedArchitecture?.components ?? [],
      decisions: context.approvedArchitecture?.decisions ?? [],
      tasks: [],
    });
    const provider = await getAIProvider();
    const messages = architectureMessages({
      mode,
      section,
      featureTitle:
        typeof request.input.featureTitle === "string" ? request.input.featureTitle : "",
      productName: gate.product.name,
      stage: gate.product.currentStage,
      context: presentForModel(context, records),
    });
    const purpose =
      mode === "plan"
        ? "Generate Delivery Plan"
        : mode === "regenerate"
          ? "Regenerate Design"
          : mode === "review"
            ? "Review Design"
            : "Generate Design";
    const result = await generateResolved(
      provider,
      {
        systemPrompt: ARCHITECTURE_SYSTEM_PROMPT,
        messages,
        responseSchema: architectureResponseSchema,
        schemaName: "solution_architecture",
        purpose,
        temperature: 0.2,
      },
      (data) => translateArchitectureReferences(data, records),
      refusal,
    );

    const refs = {
      nfrIds: new Set(context.nonFunctionalRequirements.map((item) => item.id)),
      capabilityIds: new Set(context.capabilities.map((item) => item.id)),
      workItemIds: new Set(context.workItems.map((item) => item.id)),
    };
    assertArchitectureGraph(result.data, refs);

    if (mode === "review") {
      return {
        output: {
          mode,
          summary: result.data.assistantSummary,
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
            result.data,
            section ?? "summary",
            typeof request.input.featureTitle === "string" ? request.input.featureTitle : "",
          )
        : toStoredArchitecture(result.data);
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
