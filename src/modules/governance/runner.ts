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

    const loaded = await loadGovernanceContext(request.productId);
    const provider = await getAIProvider();
    const result = await provider.generate({
      systemPrompt: GOVERNANCE_SYSTEM_PROMPT,
      messages: governanceMessages({
        mode,
        section,
        taskId,
        productName: gate.product.name,
        context: loaded.context,
      }),
      responseSchema: governanceResponseSchema,
      schemaName: "engineering_governance_review",
      temperature: 0.2,
    });

    const parsed = governanceResponseSchema.safeParse(result.data);
    if (!parsed.success) throw new DomainError(refusal);
    assertGovernanceGraph(parsed.data, loaded.refs, {
      requireAllTasks: mode === "generate" || section === "plan",
    });
    if (section === "task" && taskId && !parsed.data.codingRiskAssessments.some((item) => item.taskId === taskId)) {
      throw new DomainError(`The re-review must include implementation task ${taskId}.`);
    }

    const stored =
      mode === "regenerate" && open && section
        ? mergeGovernanceSection(open.payload, parsed.data, section, taskId)
        : toStoredGovernance(parsed.data);

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
