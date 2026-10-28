import { describe, expect, it } from "vitest";

import { validateExistingOffer } from "@/modules/coding/validate-existing";

describe("validateExistingOffer", () => {
  const ready = {
    workspaceStatus: "FAILED",
    planStatus: "APPROVED",
    workspacePathExists: true,
    stale: false,
    planIncomplete: false,
    busy: false,
  };

  it("offers validation for a failed workspace with an approved plan and restored path", () => {
    expect(validateExistingOffer(ready)).toBe(true);
  });

  it("refuses when the workspace is not failed and does not need a check refresh", () => {
    expect(validateExistingOffer({ ...ready, workspaceStatus: "READY_FOR_REVIEW" })).toBe(false);
    expect(validateExistingOffer({ ...ready, workspaceStatus: "ACTIVE" })).toBe(false);
  });

  it("offers validation on ready-for-review when checks need refresh after a scope-only plan revision", () => {
    expect(validateExistingOffer({
      ...ready,
      workspaceStatus: "READY_FOR_REVIEW",
      checksNeedRefresh: true,
    })).toBe(true);
  });

  it("refuses when the path is missing, the plan is incomplete, or the contract is stale", () => {
    expect(validateExistingOffer({ ...ready, workspacePathExists: false })).toBe(false);
    expect(validateExistingOffer({ ...ready, planIncomplete: true })).toBe(false);
    expect(validateExistingOffer({ ...ready, stale: true })).toBe(false);
    expect(validateExistingOffer({ ...ready, planStatus: "PROPOSED" })).toBe(false);
    expect(validateExistingOffer({
      ...ready,
      workspaceStatus: "READY_FOR_REVIEW",
      checksNeedRefresh: true,
      planStatus: "PROPOSED",
    })).toBe(false);
  });
});
