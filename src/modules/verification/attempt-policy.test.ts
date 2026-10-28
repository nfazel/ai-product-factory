import { describe, expect, it } from "vitest";

import { attemptPolicy, attemptStateFor, type AttemptFacts, type AttemptPolicyInput } from "@/modules/verification/attempt-policy";

const ELIGIBLE: AttemptPolicyInput = {
  kind: "new",
  progress: "REVIEW",
  humanApproved: false,
  openAttempt: false,
  entryBlockers: [],
};

function policy(patch: Partial<AttemptPolicyInput>) {
  return attemptPolicy({ ...ELIGIBLE, ...patch });
}

describe("first attempt", () => {
  it("allows the first attempt when no attempt exists", () => {
    expect(policy({ kind: "first", progress: "NONE" })).toEqual({ allowed: true });
  });

  it("allows the first attempt when only demo data exists", () => {
    expect(policy({ kind: "first", progress: "DEMO" })).toEqual({ allowed: true });
  });

  it("refuses a second first attempt, and names the two correct actions", () => {
    const result = policy({ kind: "first", progress: "REVIEW" });
    expect(result).toMatchObject({ allowed: false, refusal: "PRIOR_ATTEMPT" });
    if (result.allowed) return;
    expect(result.reason).toMatch(/Start New Verification Attempt/);
    expect(result.reason).toMatch(/Retry Independent Verification/);
  });
});

describe("retry for technical failures", () => {
  it.each(["RETRYABLE", "STALE"] as const)("allows retry after %s", (progress) => {
    expect(policy({ kind: "retry", progress })).toEqual({ allowed: true });
  });

  it.each(["REVIEW", "AWAITING", "FAILED", "NONE", "DEMO"] as const)("refuses retry after %s", (progress) => {
    const result = policy({ kind: "retry", progress });
    expect(result).toMatchObject({ allowed: false, refusal: "NOT_RETRYABLE" });
  });
});

describe("new attempt after an inconclusive or unapproved result", () => {
  it("allows a new attempt after an INCONCLUSIVE result awaiting review", () => {
    expect(policy({ kind: "new", progress: "REVIEW" })).toEqual({ allowed: true });
  });

  it("allows a new attempt after a passing result that no person has approved", () => {
    expect(policy({ kind: "new", progress: "AWAITING" })).toEqual({ allowed: true });
  });

  it.each(["NONE", "DEMO", "RETRYABLE", "FAILED", "RUNNING", "INTERRUPTED", "APPROVED"] as const)(
    "refuses a new attempt after %s",
    (progress) => {
      const result = policy({ kind: "new", progress });
      expect(result).toMatchObject({ allowed: false, refusal: "NOT_NEW_ELIGIBLE" });
    },
  );
});

describe("refusals that apply to every kind", () => {
  it.each(["first", "retry", "new"] as const)("refuses %s while an attempt is active", (kind) => {
    const progress = kind === "retry" ? "RETRYABLE" : "REVIEW";
    expect(policy({ kind, progress, openAttempt: true })).toMatchObject({ allowed: false, refusal: "OPEN_ATTEMPT" });
  });

  it.each(["first", "retry", "new"] as const)("refuses %s once a person has approved the task", (kind) => {
    const progress = kind === "retry" ? "RETRYABLE" : kind === "first" ? "NONE" : "REVIEW";
    const result = policy({ kind, progress, humanApproved: true });
    expect(result).toMatchObject({ allowed: false, refusal: "APPROVED" });
    if (result.allowed) return;
    expect(result.reason).toMatch(/approval stands/);
  });

  it.each(["first", "retry", "new"] as const)("refuses %s when the implementation fails the entry gate", (kind) => {
    const progress = kind === "retry" ? "RETRYABLE" : kind === "first" ? "NONE" : "REVIEW";
    const result = policy({ kind, progress, entryBlockers: ["A human code approval is required before verification."] });
    expect(result).toMatchObject({ allowed: false, refusal: "INELIGIBLE" });
    if (result.allowed) return;
    expect(result.reason).toMatch(/code approval/);
  });

  it("refuses a stale approved snapshot through the entry gate reasons", () => {
    const result = policy({
      kind: "new",
      progress: "STALE",
      entryBlockers: ["Verification requires the approved commit SHA."],
    });
    expect(result).toMatchObject({ allowed: false, refusal: "INELIGIBLE" });
  });

  it("refuses a new attempt when the latest result was approved, even if its progress says awaiting review", () => {
    expect(policy({ kind: "new", progress: "REVIEW", humanApproved: true })).toMatchObject({
      allowed: false,
      refusal: "APPROVED",
    });
  });
});

describe("attemptStateFor", () => {
  const inconclusive: AttemptFacts = {
    demo: false,
    status: "BLOCKED",
    overallVerdict: "INCONCLUSIVE",
    failureClass: "VERIFICATION_EVIDENCE_INSUFFICIENT",
    stale: false,
    approvals: [],
  };

  it("reports no progress when the task has no attempt", () => {
    const state = attemptStateFor([], { interrupted: false });
    expect(state.latest).toBeNull();
    expect(state.progress).toBe("NONE");
    expect(state.humanApproved).toBe(false);
  });

  it("reads progress from the latest non-demo attempt, ignoring demo data", () => {
    const demo: AttemptFacts = { ...inconclusive, demo: true, overallVerdict: "PASS", status: "PASSED", failureClass: "" };
    const state = attemptStateFor([inconclusive, demo], { interrupted: false });
    expect(state.latest).toBe(inconclusive);
    expect(state.progress).toBe("REVIEW");
  });

  it("treats a current approval on any non-demo attempt as human approval", () => {
    const approved: AttemptFacts = {
      ...inconclusive,
      status: "PASSED",
      overallVerdict: "PASS",
      failureClass: "",
      approvals: [{ stale: false }],
    };
    const state = attemptStateFor([approved], { interrupted: false });
    expect(state.humanApproved).toBe(true);
    expect(state.progress).toBe("APPROVED");
  });

  it("does not count a stale approval as human approval", () => {
    const superseded: AttemptFacts = {
      ...inconclusive,
      status: "PASSED",
      overallVerdict: "PASS",
      failureClass: "",
      approvals: [{ stale: true }],
    };
    const state = attemptStateFor([superseded], { interrupted: false });
    expect(state.humanApproved).toBe(false);
    expect(state.progress).not.toBe("APPROVED");
  });
});
