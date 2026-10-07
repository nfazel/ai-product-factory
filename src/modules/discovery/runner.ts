import "server-only";

import { AGENT_CATALOG } from "@/domain/constants";
import { getAIProvider, isAIConfigured } from "@/modules/ai/provider";
import { applyDiscoveryTurn } from "@/modules/discovery/repository";
import {
  findCurrentBrief,
  findDiscoverySession,
  listDiscoveryMessages,
} from "@/modules/discovery/repository";
import {
  modelMessages,
  PRODUCT_DISCOVERY_SYSTEM_PROMPT,
} from "@/modules/discovery/prompt";
import { discoveryResponseSchema } from "@/modules/discovery/schema";
import { findProductRow } from "@/modules/product/repository";
import { recordActivity } from "@/modules/activity/service";
import { DomainError } from "@/modules/shared/errors";
import type { AgentRunner } from "@/modules/agent/types";

export const productDiscoveryRunner: AgentRunner = {
  agentType: "PRODUCT_DISCOVERY",
  isConfigured() {
    return isAIConfigured();
  },
  async execute(request) {
    const sessionId =
      typeof request.input.sessionId === "string" ? request.input.sessionId : "";
    if (!sessionId) throw new DomainError("Discovery session is missing.");

    const [session, product] = await Promise.all([
      findDiscoverySession(request.productId),
      findProductRow(request.productId),
    ]);
    if (!session || session.id !== sessionId) {
      throw new DomainError("Discovery session not found.", "NOT_FOUND");
    }
    if (!product) throw new DomainError("Product not found.", "NOT_FOUND");

    const [messages, brief] = await Promise.all([
      listDiscoveryMessages(session.id),
      findCurrentBrief(request.productId),
    ]);
    if (!brief) throw new DomainError("Product brief not found.", "NOT_FOUND");

    const provider = getAIProvider();
    const result = await provider.generate({
      systemPrompt: PRODUCT_DISCOVERY_SYSTEM_PROMPT,
      messages: modelMessages({
        productName: product.name,
        messages,
        brief,
      }),
      responseSchema: discoveryResponseSchema,
      schemaName: "product_discovery_turn",
      temperature: 0.3,
    });
    const parsed = discoveryResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new DomainError(
        "The discovery agent returned a response that did not match the required brief structure. The product brief was not changed. You can retry.",
      );
    }

    const applied = await applyDiscoveryTurn({
      sessionId: session.id,
      response: parsed.data,
    });
    const actor = AGENT_CATALOG.PRODUCT_DISCOVERY.name;
    await recordActivity({
      productId: request.productId,
      type: "DISCOVERY_BRIEF_UPDATED",
      description: `${actor} updated product brief v${applied.version}.`,
      actor,
    });
    if (applied.becameReady) {
      await recordActivity({
        productId: request.productId,
        type: "DISCOVERY_READY_FOR_REVIEW",
        description: "Discovery is ready for a person to review the product brief.",
        actor,
      });
    }

    return {
      output: {
        response: parsed.data,
        usage: result.usage,
        model: result.model,
        briefId: applied.briefId,
        briefVersion: applied.version,
        readyForReview: parsed.data.discoveryAssessment.readyForReview,
      },
      estimatedCost: null,
    };
  },
};
