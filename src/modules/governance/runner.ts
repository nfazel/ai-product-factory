import "server-only";

import { GOVERNANCE_SECTIONS, type GovernanceSection } from "@/domain/constants";
import { aiRunEvidence } from "@/modules/ai/evidence";
import { getAIProvider, isAIConfigured } from "@/modules/ai/provider";
import type { AgentRunner } from "@/modules/agent/types";
import { loadGovernanceContext } from "@/modules/governance/context";
import { governanceEntryBlockers } from "@/modules/governance/gates";
import { mergeGovernanceSection } from "@/modules/governance/proposal";
import { GOVERNANCE_SYSTEM_PROMPT, governanceMessages } from "@/modules/governance/prompt";
import {
  findOpenGovernanceProposal,
  insertGovernanceProposal,
  saveGovernanceProposal,
} from "@/modules/governance/repository";
import { governanceResponseSchema, toStoredGovernance } from "@/modules/governance/schema";
import { assertGovernanceGraph } from "@/modules/governance/validate";
import { DomainError } from "@/modules/shared/errors";
import { presentForModel, translateGovernanceReferences } from "@/modules/traceability/references";
import { generateResolved } from "@/modules/traceability/repair";
import { assignMissingReferenceCodes, citedFromContext, findStaleDesignReferences } from "@/modules/traceability/store";

const refusal =
  "The Security & Engineering Governance Agent returned a response that did not match the required structure. Nothing was written. You can retry.";

const SECTION_TO_PROPOSAL = {
  security: "SECURITY",
  privacy: "PRIVACY",
  plan: "PLAN",
  architecture: "ARCHITECTURE",
  task: "TASK",
} as const;

function asSection(value: unknown): GovernanceSection | undefined {
  return GOVERNANCE_SECTIONS.find((section) => section === value);
}

async function refuseUnlessReady(productId: string) {
  const gate = await governanceEntryBlockers(productId);
  if (gate.reasons.length > 0) throw new DomainError(gate.reasons.join(" "));
  return gate;
}

export const governanceRunner: AgentRunner = {
  agentType: "SECURITY",
  isConfigured() {
    return isAIConfigured();
  },
  async assertCanRun(request) {
    await refuseUnlessReady(request.productId);
  },
  async execute(request) {
    const mode = request.input.mode === "regenerate" ? "regenerate" : "generate";
    const gate = await refuseUnlessReady(request.productId);
    const section = asSection(request.input.section);
    const taskId = typeof request.input.taskId === "string" ? request.input.taskId : "";
    const open = await findOpenGovernanceProposal(request.productId);
    if (mode === "regenerate" && !section) {
      throw new DomainError("Choose a governance section to re-review.");
    }

    await assignMissingReferenceCodes(request.productId);
    const stale = await findStaleDesignReferences(request.productId);
    if (stale) throw new DomainError(stale);
    const loaded = await loadGovernanceContext(request.productId);
    const records = citedFromContext({
      nfrs: loaded.context.nonFunctionalRequirements.map((item) => ({
        id: item.id,
        referenceCode: item.referenceCode,
        title: item.title,
      })),
      workItems: loaded.context.workItems.map((item) => ({
        id: item.id,
        referenceCode: item.referenceCode,
        title: item.title,
      })),
      assumptions: loaded.context.assumptions.map((item) => ({
        id: item.id,
        referenceCode: item.referenceCode,
        description: item.description,
      })),
      capabilities: [],
      components: loaded.context.architecture?.components.map((item) => ({
        id: item.id,
        referenceCode: item.referenceCode,
        name: item.name,
      })) ?? [],
      decisions: loaded.context.architecture?.decisions.map((item) => ({
        id: item.id,
        referenceCode: item.referenceCode,
        title: item.title,
      })) ?? [],
      tasks: loaded.context.implementationPlan?.tasks.map((item) => ({
        id: item.id,
        referenceCode: item.referenceCode,
        title: item.title,
      })) ?? [],
    });
    const provider = await getAIProvider();
    const result = await generateResolved(
      provider,
      {
        systemPrompt: GOVERNANCE_SYSTEM_PROMPT,
        messages: governanceMessages({
          mode,
          section,
          taskId,
          productName: gate.product.name,
          context: presentForModel(loaded.context, records),
        }),
        responseSchema: governanceResponseSchema,
        schemaName: "engineering_governance_review",
        purpose: "Governance Review",
        temperature: 0.2,
      },
      (data) => translateGovernanceReferences(data, records),
      refusal,
    );
    assertGovernanceGraph(result.data, loaded.refs, {
      requireAllTasks: mode === "generate" || section === "plan",
    });
    if (section === "task" && taskId && !result.data.codingRiskAssessments.some((item) => item.taskId === taskId)) {
      throw new DomainError(`The re-review must include implementation task ${taskId}.`);
    }

    const stored =
      mode === "regenerate" && open && section
        ? mergeGovernanceSection(open.payload, result.data, section, taskId)
        : toStoredGovernance(result.data);

    if (mode === "regenerate" && open && section) {
      await saveGovernanceProposal(open.id, stored);
    } else if (mode === "regenerate" && section) {
      await insertGovernanceProposal({
        productId: request.productId,
        section: SECTION_TO_PROPOSAL[section],
        taskRef: taskId,
        summary: stored.assistantSummary,
        payload: stored,
      });
    } else {
      await insertGovernanceProposal({
        productId: request.productId,
        section: "FULL",
        summary: stored.assistantSummary,
        payload: stored,
      });
    }

    return {
      output: {
        mode,
        section: section ?? "full",
        summary: stored.assistantSummary,
        overallAssessment: stored.overallAssessment,
        ...aiRunEvidence(result),
        approved: false,
      },
      estimatedCost: null,
    };
  },
};

export { SECTION_TO_PROPOSAL };
