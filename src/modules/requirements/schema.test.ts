import { describe, expect, it } from "vitest";

import { mergeRegeneratedSection } from "@/modules/requirements/proposal";
import { requirementsResponseSchema, toStoredProposal } from "@/modules/requirements/schema";
import { requirementsFixture } from "@/modules/requirements/testing";
import { assertProposalReferences } from "@/modules/requirements/validate";

describe("requirements structured output", () => {
  it("accepts a progressive definition and rejects an unknown field", () => {
    expect(requirementsResponseSchema.safeParse(requirementsFixture()).success).toBe(true);
    const extra = { ...requirementsFixture(), currentStage: "BUILD" };
    expect(requirementsResponseSchema.safeParse(extra).success).toBe(false);
  });

  it("rejects more outcomes than progressive elaboration allows", () => {
    const tooMany = requirementsFixture({
      proposedOutcomes: Array.from({ length: 8 }, (_, index) => ({
        tempId: `outcome-${index + 1}`,
        title: `Outcome ${index + 1}`,
        description: "A result for a customer or the business.",
        successMeasure: "A measure someone can observe.",
        targetValue: "",
      })),
    });
    expect(requirementsResponseSchema.safeParse(tooMany).success).toBe(false);
  });

  it("rejects a capability that points at an outcome the response did not include", () => {
    const stored = toStoredProposal(
      requirementsFixture({
        proposedCapabilities: [
          {
            ...requirementsFixture().proposedCapabilities[0],
            outcomeTempId: "outcome-9",
          },
        ],
      }),
    );
    expect(() => assertProposalReferences(stored)).toThrow(/missing outcome/i);
  });

  it("keeps an edited feature when that section is regenerated", () => {
    const current = toStoredProposal(requirementsFixture());
    current.features[0].edited = true;
    current.features[0].title = "Human title";
    const incoming = requirementsFixture({
      proposedFeatures: [
        {
          ...requirementsFixture().proposedFeatures[0],
          tempId: "feature-2",
          title: "Replacement feature",
        },
      ],
    });
    const merged = mergeRegeneratedSection(current, incoming, "features");
    expect(merged.features.map((item) => item.title)).toEqual([
      "Human title",
      "Replacement feature",
    ]);
    expect(merged.outcomes).toHaveLength(current.outcomes.length);
  });
});
