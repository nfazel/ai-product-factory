import { describe, expect, it } from "vitest";

import {
  applyAssumptionStatus,
  applyHumanEdit,
  countSufficientClarity,
  mergeDiscoveryResponse,
  readinessSummary,
} from "@/modules/discovery/merge";
import { discoveryFixture } from "@/modules/discovery/testing";
import type { ProductBriefRecord } from "@/modules/discovery/types";
import { EMPTY_FIELD_ORIGINS } from "@/modules/discovery/types";

function brief(overrides: Partial<ProductBriefRecord> = {}): ProductBriefRecord {
  return {
    id: "brief-1",
    productId: "product-1",
    sessionId: "session-1",
    version: 1,
    problemStatement: "",
    productVision: "",
    valueProposition: "",
    fieldOrigins: { ...EMPTY_FIELD_ORIGINS },
    targetUsers: [],
    userNeeds: [],
    desiredOutcomes: [],
    inScope: [],
    outOfScope: [],
    constraints: [],
    risks: [],
    successMeasures: [],
    openQuestions: [],
    assumptions: [],
    problemClarity: "LOW",
    userClarity: "LOW",
    outcomeClarity: "LOW",
    scopeClarity: "LOW",
    riskClarity: "LOW",
    readyForReview: false,
    readinessReason: "",
    status: "DRAFT",
    fromRequirements: false,
    ...overrides,
  };
}

describe("product brief merge", () => {
  it("applies proposed text and keeps human-confirmed prose", () => {
    const current = applyHumanEdit(
      brief({ problemStatement: "Old proposal", fieldOrigins: { ...EMPTY_FIELD_ORIGINS, problemStatement: "AI_PROPOSAL" } }),
      "problemStatement",
      "Handlers lose the claim story.",
    );
    const merged = mergeDiscoveryResponse(
      current,
      discoveryFixture({
        briefUpdates: {
          ...discoveryFixture().briefUpdates,
          problemStatement: "The agent tried to replace the confirmed problem.",
          productVision: "Customers can see the claim enter the queue.",
        },
      }),
    );

    expect(merged.problemStatement).toBe("Handlers lose the claim story.");
    expect(merged.fieldOrigins.problemStatement).toBe("HUMAN_CONFIRMED");
    expect(merged.productVision).toBe("Customers can see the claim enter the queue.");
    expect(merged.fieldOrigins.productVision).toBe("AI_PROPOSAL");
    expect(merged.status).not.toBe("APPROVED");
  });

  it("does not overwrite a validated assumption", () => {
    const current = brief({
      assumptions: [
        {
          id: "a1",
          briefId: "brief-1",
          description: "Customers will file online without help.",
          impact: "HIGH",
          confidence: "LOW",
          status: "VALIDATED",
          origin: "HUMAN_CONFIRMED",
        },
      ],
    });
    const merged = mergeDiscoveryResponse(
      current,
      discoveryFixture({
        briefUpdates: {
          ...discoveryFixture().briefUpdates,
          assumptions: [
            {
              description: "Customers will file online without help.",
              impact: "LOW",
              confidence: "HIGH",
            },
          ],
        },
      }),
    );
    expect(merged.assumptions[0]).toMatchObject({
      status: "VALIDATED",
      impact: "HIGH",
      confidence: "LOW",
      origin: "HUMAN_CONFIRMED",
    });
  });

  it("keeps confirmed list items when the agent proposes a replacement list", () => {
    const current = brief({
      targetUsers: [
        { id: "u1", text: "Claims handlers", origin: "HUMAN_CONFIRMED" },
        { id: "u2", text: "Temporary proposal", origin: "AI_PROPOSAL" },
      ],
    });
    const merged = mergeDiscoveryResponse(
      current,
      discoveryFixture({
        briefUpdates: {
          ...discoveryFixture().briefUpdates,
          targetUsers: ["Operations leads"],
        },
      }),
    );
    expect(merged.targetUsers.map((item) => item.text)).toEqual([
      "Claims handlers",
      "Operations leads",
    ]);
    expect(merged.targetUsers[0]?.origin).toBe("HUMAN_CONFIRMED");
  });

  it("changes assumption status only through an explicit human update", () => {
    const current = brief({
      assumptions: [
        {
          id: "a1",
          briefId: "brief-1",
          description: "A native mobile app is required.",
          impact: "HIGH",
          confidence: "LOW",
          status: "UNVALIDATED",
          origin: "AI_PROPOSAL",
        },
      ],
    });
    const updated = applyAssumptionStatus(current, "a1", "INVALIDATED");
    expect(updated?.assumptions[0]).toMatchObject({
      status: "INVALIDATED",
      origin: "HUMAN_CONFIRMED",
    });
    expect(updated?.status).toBe("DRAFT");
  });

  it("describes readiness without a percentage", () => {
    expect(countSufficientClarity(["HIGH", "MEDIUM", "LOW", "LOW", "HIGH"])).toBe(3);
    expect(readinessSummary(3)).toBe("3 of 5 areas sufficiently understood.");
  });
});
