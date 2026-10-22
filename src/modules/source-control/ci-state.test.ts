import { describe, expect, it } from "vitest";

import { decideCiState, type CiCheck, type CiObservation } from "@/modules/source-control/ci-state";
import { decidePullRequestReadiness } from "@/modules/source-control/readiness";

const none: CiObservation = {
  protection: { access: "readable", value: null },
  checks: { access: "readable", value: [] },
  statuses: { access: "readable", value: [] },
  workflows: { access: "readable", value: 0 },
};

const head = "a".repeat(40);

function readiness(ci: { state: "PASSED" | "FAILED" | "PENDING" | "NOT_CONFIGURED" | "UNKNOWN"; detail: string; requirement: "REQUIRED" | "EXCEPTION" }) {
  return decidePullRequestReadiness({
    state: "OPEN",
    headSha: head,
    approvalCommit: head,
    approvalCurrent: true,
    verificationCommit: head,
    verificationApproved: true,
    verificationStale: false,
    checks: [],
    requiredChecks: [],
    ci,
    mergeability: "CLEAN",
    reviews: [{ reviewer: "Ada", state: "APPROVED", submittedAt: new Date(), commitSha: head }],
    minimumHumanApprovals: 1,
    protectionApprovals: 0,
    governanceCurrent: true,
    policyCurrent: true,
    blockingDefect: false,
  });
}

describe("CI state", () => {
  it("confirms that no CI is configured without calling that a pass", () => {
    const decision = decideCiState(none);
    expect(decision.state).toBe("NOT_CONFIGURED");
    expect(decision.state).not.toBe("PASSED");
    expect(readiness({ state: decision.state, detail: decision.detail, requirement: "REQUIRED" }).ready).toBe(false);
    expect(readiness({ state: decision.state, detail: decision.detail, requirement: "REQUIRED" }).reasons.join(" ")).toMatch(/not a pass/);
  });

  it("keeps a human exception from turning a missing CI result into a pass", () => {
    const decision = decideCiState(none);
    const allowed = readiness({ state: decision.state, detail: decision.detail, requirement: "EXCEPTION" });
    expect(decision.state).toBe("NOT_CONFIGURED");
    expect(allowed.ready).toBe(true);
    expect(allowed.reasons.join(" ")).not.toMatch(/PASSED/);
    const failed = readiness({ state: "FAILED", detail: "Required check build did not succeed.", requirement: "EXCEPTION" });
    expect(failed.ready).toBe(false);
    expect(failed.reasons.join(" ")).toMatch(/build/);
    expect(readiness({ state: "UNKNOWN", detail: "CI status is unknown.", requirement: "EXCEPTION" }).ready).toBe(false);
    expect(readiness({ state: "PENDING", detail: "A check is still running.", requirement: "EXCEPTION" }).ready).toBe(false);
  });

  it("passes only when every required check succeeded", () => {
    const decision = decideCiState({
      ...none,
      protection: { access: "readable", value: { requiredChecks: ["build", "lint"] } },
      checks: { access: "readable", value: [
        { name: "build", status: "COMPLETED", conclusion: "SUCCESS" },
        { name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
      ] },
    });
    expect(decision.state).toBe("PASSED");
  });

  it("fails when an applicable required check failed", () => {
    const decision = decideCiState({
      ...none,
      protection: { access: "readable", value: { requiredChecks: ["build"] } },
      checks: { access: "readable", value: [{ name: "build", status: "COMPLETED", conclusion: "FAILURE" }] },
    });
    expect(decision.state).toBe("FAILED");
    expect(decision.detail).toMatch(/build/);
  });

  it("stays pending while a required check is running or missing", () => {
    expect(decideCiState({
      ...none,
      protection: { access: "readable", value: { requiredChecks: ["build"] } },
      checks: { access: "readable", value: [{ name: "build", status: "IN_PROGRESS", conclusion: "UNKNOWN" }] },
    }).state).toBe("PENDING");
    expect(decideCiState({
      ...none,
      protection: { access: "readable", value: { requiredChecks: ["build"] } },
    }).state).toBe("PENDING");
  });

  it("stays unknown when requirements or results cannot be read", () => {
    expect(decideCiState({ ...none, workflows: { access: "unavailable" } }).state).toBe("UNKNOWN");
    expect(decideCiState({ ...none, checks: { access: "unavailable" } }).state).toBe("UNKNOWN");
    expect(decideCiState({
      ...none,
      protection: { access: "readable", value: { requiredChecks: [] } },
      workflows: { access: "readable", value: 1 },
    }).state).toBe("PENDING");
  });

  it("does not treat a protection 403 as proof that CI is absent", () => {
    const decision = decideCiState({
      ...none,
      protection: { access: "forbidden" },
    });
    expect(decision.state).toBe("UNKNOWN");
    expect(decision.detail).toMatch(/Administration read/);
    expect(decision.detail).toMatch(/not evidence that branch protection is absent/);
    expect(decision.state).not.toBe("NOT_CONFIGURED");
    expect(decision.state).not.toBe("PASSED");
  });

  it("uses a later success for the same check and ignores the earlier failure", () => {
    const checks = [
      attempt("FAILURE", "2026-10-21T15:17:00.000Z"),
      attempt("SUCCESS", "2026-10-22T09:46:47.000Z"),
    ];
    const observed = decideCiState({ ...none, headSha: commit, checks: { access: "readable", value: checks } });
    const required = decideCiState({
      ...none,
      headSha: commit,
      protection: { access: "readable", value: { requiredChecks: ["verify"] } },
      checks: { access: "readable", value: checks },
    });
    expect(observed.state).toBe("PASSED");
    expect(observed.detail).not.toMatch(/did not succeed/);
    expect(required.state).toBe("PASSED");
  });

  it("keeps a later failure ahead of an earlier success", () => {
    const checks = [
      attempt("SUCCESS", "2026-10-21T15:17:00.000Z"),
      attempt("FAILURE", "2026-10-22T09:46:47.000Z"),
    ];
    for (const conclusion of ["FAILURE", "CANCELLED", "TIMED_OUT"]) {
      const decision = decideCiState({
        ...none,
        headSha: commit,
        checks: { access: "readable", value: [attempt("SUCCESS", "2026-10-21T15:17:00.000Z"), attempt(conclusion, "2026-10-22T09:46:47.000Z")] },
      });
      expect(decision.state).toBe("FAILED");
      expect(decision.state).not.toBe("PASSED");
    }
    expect(decideCiState({ ...none, headSha: commit, checks: { access: "readable", value: checks } }).detail).toMatch(/verify/);
  });

  it("stays pending when the latest attempt has not finished", () => {
    const decision = decideCiState({
      ...none,
      headSha: commit,
      checks: {
        access: "readable",
        value: [
          attempt("SUCCESS", "2026-10-21T15:17:00.000Z"),
          attempt("UNKNOWN", "2026-10-22T09:46:21.000Z", { status: "IN_PROGRESS", completedAt: null }),
        ],
      },
    });
    expect(decision.state).toBe("PENDING");
    expect(decision.state).not.toBe("PASSED");
  });

  it("requires every distinct current check to succeed", () => {
    const passed = decideCiState({
      ...none,
      headSha: commit,
      protection: { access: "readable", value: { requiredChecks: ["build", "lint"] } },
      checks: {
        access: "readable",
        value: [
          attempt("FAILURE", "2026-10-21T15:17:00.000Z", { name: "build", workflow: ".github/workflows/build.yml" }),
          attempt("SUCCESS", "2026-10-22T09:46:47.000Z", { name: "build", workflow: ".github/workflows/build.yml" }),
          attempt("SUCCESS", "2026-10-22T09:46:47.000Z", { name: "lint", workflow: ".github/workflows/lint.yml" }),
        ],
      },
    });
    expect(passed.state).toBe("PASSED");
    const failed = decideCiState({
      ...none,
      headSha: commit,
      checks: {
        access: "readable",
        value: [
          attempt("SUCCESS", "2026-10-22T09:50:00.000Z", { workflow: ".github/workflows/ci.yml" }),
          attempt("FAILURE", "2026-10-22T09:46:47.000Z", { workflow: ".github/workflows/other.yml" }),
        ],
      },
    });
    expect(failed.state).toBe("FAILED");
    expect(failed.state).not.toBe("PASSED");
  });

  it("ignores checks recorded for a different commit", () => {
    const other = "b".repeat(40);
    const currentFailure = decideCiState({
      ...none,
      headSha: commit,
      checks: {
        access: "readable",
        value: [
          attempt("FAILURE", "2026-10-21T15:17:00.000Z"),
          attempt("SUCCESS", "2026-10-22T09:46:47.000Z", { headSha: other }),
        ],
      },
    });
    expect(currentFailure.state).toBe("FAILED");
    const currentSuccess = decideCiState({
      ...none,
      headSha: commit,
      checks: {
        access: "readable",
        value: [
          attempt("SUCCESS", "2026-10-22T09:46:47.000Z"),
          attempt("FAILURE", "2026-10-21T15:17:00.000Z", { headSha: other }),
        ],
      },
    });
    expect(currentSuccess.state).toBe("PASSED");
    const onlyOld = decideCiState({
      ...none,
      headSha: commit,
      workflows: { access: "readable", value: 1 },
      checks: { access: "readable", value: [attempt("SUCCESS", "2026-10-22T09:46:47.000Z", { headSha: other })] },
    });
    expect(onlyOld.state).toBe("PENDING");
    expect(onlyOld.state).not.toBe("PASSED");
  });

  it("uses the latest commit status and does not let it hide a current failed check", () => {
    const laterSuccess = decideCiState({
      ...none,
      headSha: commit,
      statuses: {
        access: "readable",
        value: [
          { context: "verify", state: "failure", updatedAt: "2026-10-21T15:17:00.000Z", headSha: commit },
          { context: "verify", state: "success", updatedAt: "2026-10-22T09:46:47.000Z", headSha: commit },
        ],
      },
    });
    expect(laterSuccess.state).toBe("PASSED");
    const laterFailure = decideCiState({
      ...none,
      headSha: commit,
      checks: { access: "readable", value: [attempt("SUCCESS", "2026-10-22T09:46:47.000Z")] },
      statuses: { access: "readable", value: [{ context: "verify", state: "failure", updatedAt: "2026-10-22T09:50:00.000Z", headSha: commit }] },
    });
    expect(laterFailure.state).toBe("FAILED");
    expect(laterFailure.state).not.toBe("PASSED");
  });
});

const commit = head;

function attempt(conclusion: string, at: string, extra: Partial<CiCheck> = {}) {
  return {
    name: "verify",
    status: "COMPLETED",
    conclusion,
    startedAt: at,
    completedAt: at,
    headSha: commit,
    app: "github-actions",
    workflow: ".github/workflows/ci.yml",
    ...extra,
  };
}
