import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  startCodingTask: vi.fn(),
  resumeCodingTask: vi.fn(),
  createCodingCommit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/coding/service", () => service);

import { afterCodeApproved, afterPlanApproved, afterTaskApproved } from "@/modules/coding/auto-advance";
import { DomainError } from "@/modules/shared/errors";

beforeEach(() => vi.resetAllMocks());

describe("auto-advance after a human decision", () => {
  it("drafts the plan after the task is approved, using the same service call as the button", async () => {
    service.startCodingTask.mockResolvedValue({});
    expect(await afterTaskApproved("p1", "t1")).toEqual({ ok: true });
    expect(service.startCodingTask).toHaveBeenCalledWith("p1", "t1");
  });

  it("starts coding after the plan is approved", async () => {
    service.resumeCodingTask.mockResolvedValue({});
    expect(await afterPlanApproved("p1", "w1")).toEqual({ ok: true });
    expect(service.resumeCodingTask).toHaveBeenCalledWith("p1", "w1");
  });

  it("records the snapshot after the code is approved and returns its commit", async () => {
    service.createCodingCommit.mockResolvedValue({ sha: "abc123" });
    expect(await afterCodeApproved("p1", "w1")).toEqual({ ok: true, sha: "abc123" });
  });

  it("reports why the next step stopped instead of throwing, so the decision stands", async () => {
    service.startCodingTask.mockRejectedValue(new DomainError("The model is temporarily unavailable."));
    expect(await afterTaskApproved("p1", "t1")).toEqual({ ok: false, reason: "The model is temporarily unavailable." });
    service.createCodingCommit.mockRejectedValue(new DomainError("Nothing to commit."));
    expect(await afterCodeApproved("p1", "w1")).toEqual({ ok: false, reason: "Nothing to commit." });
  });

  it("does not leak an unexpected error's text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    service.resumeCodingTask.mockRejectedValue(new Error("secret connection string"));
    const result = await afterPlanApproved("p1", "w1");
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
